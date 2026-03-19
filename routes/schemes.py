import json
import os
import re
from functools import lru_cache
from pathlib import Path
from urllib import error, request

from flask import Blueprint, jsonify, request as flask_request


schemes_bp = Blueprint("schemes", __name__)

ROOT_DIR = Path(__file__).resolve().parents[1]
SCHEMES_DIR = ROOT_DIR / "central_schemes"


def _load_env_vars() -> dict:
    env_path = ROOT_DIR / ".env"
    data = {}
    if not env_path.exists():
        return data

    for line in env_path.read_text(encoding="utf-8").splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned.startswith("#") or "=" not in cleaned:
            continue
        key, value = cleaned.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


ENV = _load_env_vars()


@lru_cache(maxsize=1)
def _load_all_schemes() -> list:
    all_schemes = []
    if not SCHEMES_DIR.exists():
        return all_schemes

    for path in sorted(SCHEMES_DIR.glob("*.json")):
        if path.name == "index.json":
            continue

        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue

        category = payload.get("category", "Unknown") if isinstance(payload, dict) else "Unknown"
        schemes = payload.get("schemes", []) if isinstance(payload, dict) else []

        for scheme in schemes:
            if not isinstance(scheme, dict):
                continue
            item = dict(scheme)
            item.setdefault("category", category)
            all_schemes.append(item)

    return all_schemes


def _parse_age_value(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip().lower()
    if not text or text in {"not specified", "na", "n/a", "none"}:
        return None

    match = re.search(r"(\d{1,3}(?:\.\d+)?)", text)
    if not match:
        return None
    return int(float(match.group(1)))


def _parse_rupee_value(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().lower().replace(",", "")
    if not text or text in {"not specified", "na", "n/a", "none", "varies by category"}:
        return None

    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None

    amount = float(match.group(1))
    if "crore" in text:
        amount *= 10000000
    elif "lakh" in text or "lac" in text:
        amount *= 100000
    elif "thousand" in text:
        amount *= 1000
    return amount


def _extract_income_from_text(text):
    if not text:
        return None
    lowered = text.lower()

    lakh_match = re.search(r"(\d+(?:\.\d+)?)\s*lakh", lowered)
    if lakh_match:
        return float(lakh_match.group(1)) * 100000

    crore_match = re.search(r"(\d+(?:\.\d+)?)\s*crore", lowered)
    if crore_match:
        return float(crore_match.group(1)) * 10000000

    income_hint = re.search(r"(?:income|salary|earning|earnings).*?(\d{4,12})", lowered)
    if income_hint:
        return float(income_hint.group(1))

    rs_hint = re.search(r"(?:rs|inr|₹)\s*(\d{4,12})", lowered)
    if rs_hint:
        return float(rs_hint.group(1))

    return None


def _extract_age_from_text(text):
    if not text:
        return None
    lowered = text.lower()

    age_hint = re.search(r"(?:age|aged|years?|yrs?|year old)\D{0,8}(\d{1,3})", lowered)
    if age_hint:
        age = int(age_hint.group(1))
        if 0 < age <= 120:
            return age

    numbers = re.findall(r"\b(\d{1,3})\b", lowered)
    for num in numbers:
        age = int(num)
        if 0 < age <= 120:
            return age
    return None


def _is_greeting_or_smalltalk(text):
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return True

    greeting_patterns = [
        r"^(hi|hello|hey|namaste|hii+|heyy+)$",
        r"^(good\s+morning|good\s+afternoon|good\s+evening)$",
        r"^(how\s+are\s+you|what'?s\s+up|yo)$",
    ]

    return any(re.match(pattern, cleaned) for pattern in greeting_patterns)


def _has_scheme_intent(text):
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return False

    intent_keywords = {
        "scheme",
        "schemes",
        "yojana",
        "benefit",
        "benefits",
        "eligibility",
        "eligible",
        "subsidy",
        "grant",
        "loan",
        "scholarship",
        "pension",
        "apply",
        "application",
        "welfare",
        "government",
    }
    return any(word in cleaned for word in intent_keywords)


def _is_random_or_non_actionable(text):
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return True

    # Typical conversational fillers/acks that should not trigger random schemes.
    filler_patterns = [
        r"^(ok|okay|hmm|hmmm|huh|thanks|thank you|cool|nice|fine|alright|k)$",
        r"^(what is your name|who are you|how are you|what can you do)$",
        r"^(tell me something|random|anything)$",
    ]
    if any(re.match(pattern, cleaned) for pattern in filler_patterns):
        return True

    # Very short text without scheme intent is likely non-actionable.
    words = re.findall(r"[a-zA-Z]+", cleaned)
    if len(words) <= 2 and not _has_scheme_intent(cleaned):
        return True

    # If no age/income cues and no scheme intent, treat as random.
    has_numeric_or_profile_cue = bool(re.search(r"\d|age|income|salary|earning", cleaned))
    if not has_numeric_or_profile_cue and not _has_scheme_intent(cleaned):
        return True

    return False


def _scheme_text_blob(scheme):
    tags = scheme.get("tags", [])
    if isinstance(tags, list):
        tags = " ".join(str(t) for t in tags)
    return (
        f"{scheme.get('name', '')} "
        f"{scheme.get('description', '')} "
        f"{scheme.get('category', '')} "
        f"{scheme.get('scheme_for', '')} "
        f"{tags}"
    ).lower()


def _age_group_rules(group):
    rules = {
        "child": {
            "positive": {
                "child",
                "children",
                "school",
                "student",
                "anganwadi",
                "nutrition",
                "early intervention",
                "pre-matric",
                "hostel",
                "girl child",
            },
            "negative": {
                "old age",
                "senior",
                "elderly",
                "pension",
                "self employment",
                "entrepreneur",
                "startup",
            },
        },
        "youth": {
            "positive": {
                "student",
                "college",
                "scholarship",
                "skill",
                "apprentice",
                "training",
                "employment",
                "startup",
                "exam",
                "intern",
            },
            "negative": {
                "old age",
                "senior",
                "elderly",
                "retirement",
                "widow pension",
            },
        },
        "adult": {
            "positive": {
                "employment",
                "business",
                "entrepreneur",
                "loan",
                "housing",
                "farmer",
                "livelihood",
                "insurance",
                "self employment",
            },
            "negative": {
                "old age",
                "senior",
                "elderly",
                "retirement",
            },
        },
        "middle": {
            "positive": {
                "health",
                "insurance",
                "welfare",
                "farmer",
                "livelihood",
                "employment",
                "loan",
            },
            "negative": {
                "pre-matric",
                "school",
                "child",
                "old age",
                "elderly",
            },
        },
        "senior": {
            "positive": {
                "old age",
                "senior",
                "elderly",
                "pension",
                "care",
                "geriatric",
                "assistance",
                "vayoshri",
            },
            "negative": {
                "pre-matric",
                "school",
                "student",
                "apprentice",
                "intern",
            },
        },
    }
    return rules.get(group, {"positive": set(), "negative": set()})


def _is_age_plausible_without_explicit_bounds(scheme, age):
    if age is None:
        return True

    group = _age_group(age)
    rules = _age_group_rules(group)
    text = _scheme_text_blob(scheme)

    positive_hits = sum(1 for kw in rules["positive"] if kw in text)
    negative_hits = sum(1 for kw in rules["negative"] if kw in text)

    # Strong negatives should block recommendation for unspecified-age schemes.
    if negative_hits >= 2:
        return False
    if positive_hits == 0 and negative_hits >= 1:
        return False

    # Special hard exclusions for very young users.
    if age <= 14 and any(kw in text for kw in {"loan", "credit", "entrepreneur", "startup"}):
        return False

    return True


def filter_schemes(age=None, income=None):
    items = _load_all_schemes()
    results = []

    age_value = _parse_age_value(age)
    income_value = _parse_rupee_value(income)

    for scheme in items:
        min_age = _parse_age_value(scheme.get("min_age"))
        max_age = _parse_age_value(scheme.get("max_age"))
        income_limit = _parse_rupee_value(scheme.get("income_limit"))

        age_ok = True
        if age_value is not None:
            if min_age is not None and age_value < min_age:
                age_ok = False
            if max_age is not None and age_value > max_age:
                age_ok = False

            # If age bounds are missing, infer plausibility from scheme intent.
            if min_age is None and max_age is None and not _is_age_plausible_without_explicit_bounds(scheme, age_value):
                age_ok = False

        income_ok = True
        if income_value is not None and income_limit is not None and income_value > income_limit:
            income_ok = False

        if age_ok and income_ok:
            results.append(scheme)

    return results


def _age_group(age):
    if age is None:
        return "unknown"
    if age <= 14:
        return "child"
    if age <= 25:
        return "youth"
    if age <= 40:
        return "adult"
    if age <= 59:
        return "middle"
    return "senior"


def _age_keywords(group):
    mapping = {
        "child": {
            "child",
            "children",
            "school",
            "student",
            "scholarship",
            "nutrition",
            "anganwadi",
            "icds",
            "girl",
        },
        "youth": {
            "youth",
            "student",
            "college",
            "scholarship",
            "skill",
            "training",
            "startup",
            "employment",
            "apprentice",
        },
        "adult": {
            "loan",
            "entrepreneur",
            "business",
            "housing",
            "farmer",
            "self employment",
            "livelihood",
            "insurance",
            "credit",
        },
        "middle": {
            "health",
            "insurance",
            "livelihood",
            "farmer",
            "loan",
            "welfare",
            "employment",
        },
        "senior": {
            "senior",
            "old age",
            "elderly",
            "pension",
            "health",
            "assistance",
            "care",
        },
    }
    return mapping.get(group, set())


def _score_scheme(scheme, age=None, income=None, user_query=""):
    score = 0

    min_age = _parse_age_value(scheme.get("min_age"))
    max_age = _parse_age_value(scheme.get("max_age"))
    income_limit = _parse_rupee_value(scheme.get("income_limit"))

    age_group = _age_group(age)
    keywords = _age_keywords(age_group)
    text = (
        f"{scheme.get('name', '')} "
        f"{scheme.get('description', '')} "
        f"{scheme.get('category', '')} "
        f"{scheme.get('tags', '')}"
    ).lower()

    if age is not None:
        if min_age is not None or max_age is not None:
            score += 20
        if min_age is not None and age >= min_age:
            score += 8
        if max_age is not None and age <= max_age:
            score += 8

    if income is not None and income_limit is not None:
        score += 10

    scheme_for = str(scheme.get("scheme_for", "")).lower()
    if scheme_for == "individual":
        score += 18
    elif scheme_for:
        score -= 6

    priority = scheme.get("priority")
    if isinstance(priority, int):
        score += max(0, 6 - priority)

    for kw in keywords:
        if kw in text:
            score += 4

    for token in re.findall(r"[a-zA-Z]{4,}", (user_query or "").lower()):
        if token in text:
            score += 3

    return score


def recommend_schemes(age=None, income=None, user_query="", limit=80):
    matched = filter_schemes(age=age, income=income)
    ranked = sorted(
        matched,
        key=lambda s: _score_scheme(s, age=age, income=income, user_query=user_query),
        reverse=True,
    )

    deduped = []
    seen = set()
    for scheme in ranked:
        key = scheme.get("id") or str(scheme.get("name", "")).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(scheme)
        if len(deduped) >= limit:
            break

    return matched, deduped


def _tag_from_scheme(scheme):
    category = str(scheme.get("category", "")).lower()
    text = f"{scheme.get('name', '')} {scheme.get('description', '')} {category}".lower()

    if "education" in category or "scholar" in text:
        return "Education"
    if "health" in category or "medical" in text or "hospital" in text:
        return "Health"
    if "agri" in category or "farmer" in text:
        return "Agriculture"
    if "employment" in category or "skill" in category or "job" in text:
        return "Employment"
    if "housing" in category or "shelter" in category or "home" in text:
        return "Housing"
    if "women" in category or "girl" in text:
        return "Women"
    if "senior" in text or "old age" in text or "pension" in text:
        return "Senior"
    if "pension" in category:
        return "Pension"
    return "Finance"


def _make_scheme_cards(schemes, max_items=8):
    cards = []
    for scheme in schemes[:max_items]:
        cards.append(
            {
                "name": scheme.get("name", "Unknown Scheme"),
                "ministry": scheme.get("nodal_ministry", "Not specified"),
                "benefit": scheme.get("category", "Government benefit"),
                "eligibility": (
                    f"Age: {scheme.get('min_age', 'Not specified')} - {scheme.get('max_age', 'Not specified')}; "
                    f"Income: {scheme.get('income_limit', 'Not specified')}"
                ),
                "tag": _tag_from_scheme(scheme),
            }
        )
    return cards


def _safe_json_from_text(text):
    raw = (text or "").strip()
    if not raw:
        return None

    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()

    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    candidate = raw[start : end + 1]
    try:
        return json.loads(candidate)
    except Exception:
        return None


def _call_gemini(prompt):
    api_key = ENV.get("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing in .env")

    base_url = (
        ENV.get("GEMINI_API_BASE")
        or os.getenv("GEMINI_API_BASE")
        or "https://generativelanguage.googleapis.com/v1beta"
    ).rstrip("/")
    model = ENV.get("GEMINI_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash"
    url = f"{base_url}/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1200},
    }
    body = json.dumps(payload).encode("utf-8")

    req = request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Gemini API error {exc.code}: {detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"Gemini request failed: {exc}") from exc

    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    output = "".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
    if not output:
        raise RuntimeError("Gemini returned empty text")
    return output


def generate_ai_reply(user_query, age, income, filtered_schemes, total_count=None):
    cards = _make_scheme_cards(filtered_schemes, max_items=8)
    shown_count = len(filtered_schemes)
    matched_count = total_count if isinstance(total_count, int) else shown_count

    default_message = (
        f"I found {matched_count} matching schemes and shortlisted the most relevant ones for you."
        if filtered_schemes
        else "I could not find a direct match in the current filtered set."
    )
    default_followup = (
        "Share your annual income for better filtering."
        if income is None
        else "Ask for category-wise recommendations if needed."
    )

    ai_message = default_message
    ai_followup = default_followup

    prompt = (
        "You are SchemeStack assistant. Write short friendly chatbot text for Indian government schemes. "
        "Return plain text with exactly two lines in this format: "
        "MESSAGE: <one short line>\nFOLLOWUP: <one short line>. "
        f"User query: {user_query or ''}. Age: {age}. Income: {income}. "
        f"Matched scheme count: {matched_count}. Showing top: {shown_count}."
    )

    try:
        ai_text = _call_gemini(prompt)
        message_match = re.search(r"MESSAGE\s*:\s*(.+)", ai_text, flags=re.IGNORECASE)
        followup_match = re.search(r"FOLLOWUP\s*:\s*(.+)", ai_text, flags=re.IGNORECASE)
        if message_match:
            ai_message = message_match.group(1).strip()
        if followup_match:
            ai_followup = followup_match.group(1).strip()
    except Exception:
        pass

    return {
        "message": ai_message,
        "ageLabel": f"Age {age} Years" if age is not None else "Age Not Specified",
        "ageGroup": "Adult",
        "schemes": cards,
        "followUp": ai_followup,
    }


@schemes_bp.route("/get-schemes", methods=["POST"])
def get_schemes():
    data = flask_request.json or {}
    age = data.get("age")
    income = data.get("income")

    matched = filter_schemes(age=age, income=income)
    return jsonify(matched)


@schemes_bp.route("/chat", methods=["POST"])
def chat():
    data = flask_request.json or {}

    user_query = data.get("message", "")
    age = data.get("age")
    income = data.get("income")

    if age is None:
        age = _extract_age_from_text(user_query)
    if income is None:
        income = _extract_income_from_text(user_query)

    # For greetings or random/non-actionable messages without profile details,
    # respond with guidance instead of returning arbitrary schemes.
    if age is None and income is None and (
        _is_greeting_or_smalltalk(user_query) or _is_random_or_non_actionable(user_query)
    ):
        reply_json = {
            "message": "Namaste! I can help you find the best government schemes.",
            "ageLabel": "Age Not Specified",
            "ageGroup": "Unknown",
            "schemes": [],
            "followUp": "Please share your age and, if possible, annual income. Example: 'I am 24 years old, income 3 lakh'.",
        }
        return jsonify(
            {
                "reply": json.dumps(reply_json, ensure_ascii=False),
                "reply_json": reply_json,
                "matched_count": 0,
                "schemes": [],
            }
        )

    matched_all, matched_ranked = recommend_schemes(age=age, income=income, user_query=user_query, limit=80)
    reply_json = generate_ai_reply(user_query, age, income, matched_ranked, total_count=len(matched_all))

    return jsonify(
        {
            "reply": json.dumps(reply_json, ensure_ascii=False),
            "reply_json": reply_json,
            "matched_count": len(matched_all),
            "schemes": matched_ranked[:20],
        }
    )
