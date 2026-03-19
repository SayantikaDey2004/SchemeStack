import json
import re
from pathlib import Path

from flask import Blueprint, request, jsonify

schemes_bp = Blueprint("schemes", __name__)

BASE_DIR = Path(__file__).resolve().parents[1]
SCHEMES_DIR = BASE_DIR / "central_schemes"


def _parse_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().lower()
    if not text or text in {"not specified", "varies by category", "none", "null"}:
        return None

    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return None

    num = float(match.group(0))
    if "crore" in text:
        num *= 10000000
    elif "lakh" in text:
        num *= 100000

    return num


def _load_all_schemes():
    if not SCHEMES_DIR.exists():
        return []

    all_schemes = []
    for file_path in SCHEMES_DIR.glob("*.json"):
        if file_path.name == "index.json":
            continue

        try:
            with file_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            schemes = data.get("schemes", [])
            if isinstance(schemes, list):
                all_schemes.extend(schemes)
        except (OSError, json.JSONDecodeError):
            continue

    return all_schemes


def filter_schemes(age, income):
    schemes = _load_all_schemes()
    matched = []

    for scheme in schemes:
        min_age = _parse_number(scheme.get("min_age"))
        max_age = _parse_number(scheme.get("max_age"))
        income_limit = _parse_number(scheme.get("income_limit"))

        age_ok = (min_age is None or age >= min_age) and (max_age is None or age <= max_age)
        income_ok = income_limit is None or income <= income_limit

        if age_ok and income_ok:
            matched.append(
                {
                    "id": scheme.get("id"),
                    "name": scheme.get("name"),
                    "category": scheme.get("category"),
                    "nodal_ministry": scheme.get("nodal_ministry"),
                    "min_age": scheme.get("min_age"),
                    "max_age": scheme.get("max_age"),
                    "income_limit": scheme.get("income_limit"),
                    "detail_url": scheme.get("detail_url"),
                }
            )

    return matched

@schemes_bp.route("/get-schemes", methods=["POST"])
def get_schemes():
    data = request.json or {}

    try:
        age = int(data.get("age", 0))
        income = int(data.get("income", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid input"}), 400

    result = filter_schemes(age, income)

    return jsonify(result)