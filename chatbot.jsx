import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are a helpful Indian Government Schemes Assistant. When a user mentions their age (or you can ask for it), provide relevant government schemes they are eligible for based on their age.

Structure your response as JSON with this format:
{
  "message": "Brief friendly intro text",
  "schemes": [
    {
      "name": "Scheme Name",
      "ministry": "Ministry Name",
      "benefit": "Short benefit description",
      "eligibility": "Age/criteria",
      "tag": "Education|Health|Finance|Agriculture|Employment|Pension|Housing|Women|Youth|Senior"
    }
  ],
  "followUp": "A follow-up question or suggestion"
}

Age groups and relevant schemes:
- 0-5: Integrated Child Development Services (ICDS), PM POSHAN, Janani Suraksha Yojana
- 6-14: PM POSHAN (Mid-Day Meal), Sarva Shiksha Abhiyan, Beti Bachao Beti Padhao
- 15-25: PM Kaushal Vikas Yojana, National Scholarship Portal, Pradhan Mantri Yuva Yojana, PMJAY (Ayushman Bharat), Startup India (18+)
- 26-40: PM Mudra Yojana, PMAY (Housing), Jan Dhan Yojana, PM Fasal Bima (farmers), Skill India
- 41-60: PMJAY Ayushman Bharat, PM Mudra, NPS (National Pension System), Atal Pension Yojana
- 60+: Indira Gandhi National Old Age Pension, Senior Citizen Savings Scheme, Vayoshreshtha Samman, PMJAY

Always respond ONLY with valid JSON, no markdown, no extra text.`;

const TAG_COLORS = {
  Education: { bg: "#1a3a5c", accent: "#4fc3f7", icon: "🎓" },
  Health: { bg: "#1a3a2a", accent: "#69f0ae", icon: "🏥" },
  Finance: { bg: "#2a2a1a", accent: "#ffd740", icon: "💰" },
  Agriculture: { bg: "#1a3a1a", accent: "#b2ff59", icon: "🌾" },
  Employment: { bg: "#2a1a3a", accent: "#ea80fc", icon: "💼" },
  Pension: { bg: "#3a1a1a", accent: "#ff8a65", icon: "🧓" },
  Housing: { bg: "#1a2a3a", accent: "#40c4ff", icon: "🏠" },
  Women: { bg: "#3a1a2a", accent: "#f48fb1", icon: "👩" },
  Youth: { bg: "#1a3a3a", accent: "#64ffda", icon: "⚡" },
  Senior: { bg: "#2a1a1a", accent: "#ffcc02", icon: "🌅" },
};

function SchemeCard({ scheme }) {
  const colors = TAG_COLORS[scheme.tag] || TAG_COLORS["Finance"];
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${colors.bg} 0%, #0d1117 100%)`,
        border: `1px solid ${colors.accent}22`,
        borderLeft: `3px solid ${colors.accent}`,
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "10px",
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: "default",
        animation: "cardSlide 0.4s ease forwards",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateX(4px)";
        e.currentTarget.style.boxShadow = `0 4px 20px ${colors.accent}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateX(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "22px", lineHeight: 1 }}>{colors.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ color: colors.accent, fontWeight: 700, fontSize: "14px", fontFamily: "'Sora', sans-serif" }}>
              {scheme.name}
            </span>
            <span style={{
              background: `${colors.accent}18`,
              color: colors.accent,
              fontSize: "10px",
              padding: "2px 8px",
              borderRadius: "20px",
              fontFamily: "'Sora', sans-serif",
              letterSpacing: "0.5px",
            }}>
              {scheme.tag}
            </span>
          </div>
          <div style={{ color: "#8892a0", fontSize: "11px", marginTop: "3px", fontFamily: "'Inter', sans-serif" }}>
            {scheme.ministry}
          </div>
          <div style={{ color: "#c9d1d9", fontSize: "13px", marginTop: "6px", lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
            {scheme.benefit}
          </div>
          <div style={{ color: "#8892a0", fontSize: "11px", marginTop: "5px", fontFamily: "'Inter', sans-serif" }}>
            <span style={{ color: colors.accent, marginRight: "4px" }}>✓</span>
            {scheme.eligibility}
          </div>
        </div>
      </div>
    </div>
  );
}

function BotMessage({ msg }) {
  const [parsed, setParsed] = useState(null);
  const [raw, setRaw] = useState("");

  useEffect(() => {
    try {
      const data = JSON.parse(msg.text);
      setParsed(data);
    } catch {
      setRaw(msg.text);
    }
  }, [msg.text]);

  if (!parsed && !raw) return null;

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "18px", animation: "fadeUp 0.35s ease" }}>
      <div style={{
        width: "34px", height: "34px", borderRadius: "50%",
        background: "linear-gradient(135deg, #0f4c7a, #1a7fc1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "16px", flexShrink: 0, boxShadow: "0 0 12px #1a7fc144",
      }}>🇮🇳</div>
      <div style={{ flex: 1 }}>
        {parsed ? (
          <>
            <div style={{
              background: "#161b22",
              border: "1px solid #21262d",
              borderRadius: "12px 12px 12px 2px",
              padding: "14px 16px",
              color: "#c9d1d9",
              fontFamily: "'Inter', sans-serif",
              fontSize: "14px",
              lineHeight: 1.6,
              marginBottom: "10px",
            }}>
              {parsed.message}
            </div>
            {parsed.schemes?.map((s, i) => <SchemeCard key={i} scheme={s} />)}
            {parsed.followUp && (
              <div style={{
                background: "#0d1117",
                border: "1px dashed #30363d",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#8892a0",
                fontFamily: "'Inter', sans-serif",
                fontSize: "13px",
                marginTop: "8px",
                fontStyle: "italic",
              }}>
                💬 {parsed.followUp}
              </div>
            )}
          </>
        ) : (
          <div style={{
            background: "#161b22",
            border: "1px solid #21262d",
            borderRadius: "12px 12px 12px 2px",
            padding: "14px 16px",
            color: "#c9d1d9",
            fontFamily: "'Inter', sans-serif",
            fontSize: "14px",
            lineHeight: 1.6,
          }}>
            {raw}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "18px", animation: "fadeUp 0.3s ease" }}>
      <div style={{
        background: "linear-gradient(135deg, #0f4c7a, #1a7fc1)",
        borderRadius: "12px 12px 2px 12px",
        padding: "12px 16px",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
        fontSize: "14px",
        maxWidth: "70%",
        lineHeight: 1.5,
        boxShadow: "0 4px 15px #1a7fc122",
      }}>
        {text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "18px" }}>
      <div style={{
        width: "34px", height: "34px", borderRadius: "50%",
        background: "linear-gradient(135deg, #0f4c7a, #1a7fc1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "16px", flexShrink: 0,
      }}>🇮🇳</div>
      <div style={{
        background: "#161b22",
        border: "1px solid #21262d",
        borderRadius: "12px 12px 12px 2px",
        padding: "14px 20px",
        display: "flex", gap: "5px", alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: "#4fc3f7",
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  { label: "Child (5+ yrs)", text: "I am 5 years old, what schemes are available?" },
  { label: "Student (18+ yrs)", text: "I am 18 years old, what schemes am I eligible for?" },
  { label: "Adult (35+ yrs)", text: "I am 35 years old, show me relevant schemes" },
  { label: "Senior (65+ yrs)", text: "I am 65 years old, what government benefits can I get?" },
];

export default function App() {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: JSON.stringify({
        message: "Namaste! 🙏 I'm your Indian Government Schemes Assistant. I can help you discover schemes you're eligible for based on your age.",
        schemes: [],
        followUp: "Please tell me your age or ask about schemes for a specific age group!",
      }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setLoading(true);

    const history = messages.map((m) => ({
      role: m.role === "bot" ? "assistant" : "user",
      content: m.text,
    }));
    history.push({ role: "user", content: userText });

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: history,
        }),
      });
      const data = await res.json();
      const reply = data.content?.map((c) => c.text || "").join("") || "Sorry, I couldn't fetch schemes right now.";
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: JSON.stringify({ message: "Something went wrong. Please try again.", schemes: [], followUp: null }) }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=Inter:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1117; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #21262d; border-radius: 4px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cardSlide { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        textarea:focus { outline: none; }
        textarea { resize: none; }
      `}</style>
      <div style={{
        minHeight: "100vh",
        background: "#0d1117",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', sans-serif",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(90deg, #0d1117 0%, #0f2030 50%, #0d1117 100%)",
          borderBottom: "1px solid #21262d",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "50%",
            background: "linear-gradient(135deg, #0f4c7a, #1a7fc1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", boxShadow: "0 0 20px #1a7fc133",
          }}>🇮🇳</div>
          <div>
            <div style={{ color: "#e6edf3", fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "16px" }}>
              Yojana Mitra
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#69f0ae", animation: "pulse 2s infinite" }} />
              <span style={{ color: "#8892a0", fontSize: "12px" }}>Government Schemes Assistant</span>
            </div>
          </div>
          <div style={{ marginLeft: "auto", background: "#161b22", border: "1px solid #21262d", borderRadius: "20px", padding: "4px 14px", color: "#8892a0", fontSize: "11px", fontFamily: "'Sora', sans-serif" }}>
            🏛️ India Gov
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", maxWidth: "760px", width: "100%", margin: "0 auto" }}>
          {messages.map((m, i) =>
            m.role === "bot"
              ? <BotMessage key={i} msg={m} />
              : <UserMessage key={i} text={m.text} />
          )}
          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Quick Prompts */}
        <div style={{ maxWidth: "760px", width: "100%", margin: "0 auto", padding: "0 20px 10px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {QUICK_PROMPTS.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q.text)} disabled={loading}
                style={{
                  background: "#161b22", border: "1px solid #21262d",
                  borderRadius: "20px", padding: "6px 14px",
                  color: "#8892a0", fontSize: "12px", cursor: "pointer",
                  fontFamily: "'Sora', sans-serif", transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.target.style.borderColor = "#4fc3f7"; e.target.style.color = "#4fc3f7"; }}
                onMouseLeave={(e) => { e.target.style.borderColor = "#21262d"; e.target.style.color = "#8892a0"; }}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div style={{ background: "#0d1117", borderTop: "1px solid #21262d", padding: "16px 20px", maxWidth: "760px", width: "100%", margin: "0 auto" }}>
          <div style={{
            display: "flex", gap: "10px", alignItems: "flex-end",
            background: "#161b22", border: "1px solid #21262d",
            borderRadius: "14px", padding: "12px 14px",
            transition: "border-color 0.2s",
          }}
            onFocusCapture={(e) => e.currentTarget.style.borderColor = "#1a7fc1"}
            onBlurCapture={(e) => e.currentTarget.style.borderColor = "#21262d"}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Tell me your age to discover eligible schemes..."
              rows={1}
              disabled={loading}
              style={{
                flex: 1, background: "transparent", border: "none",
                color: "#c9d1d9", fontFamily: "'Inter', sans-serif",
                fontSize: "14px", lineHeight: 1.5, maxHeight: "120px",
                overflowY: "auto",
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                width: "36px", height: "36px", borderRadius: "10px",
                background: input.trim() && !loading ? "linear-gradient(135deg, #0f4c7a, #1a7fc1)" : "#21262d",
                border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s", flexShrink: 0,
                boxShadow: input.trim() && !loading ? "0 4px 12px #1a7fc133" : "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={input.trim() && !loading ? "#fff" : "#484f58"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div style={{ textAlign: "center", color: "#484f58", fontSize: "11px", marginTop: "8px" }}>
            Powered by Anthropic Claude · Government of India Schemes Data
          </div>
        </div>
      </div>
    </>
  );
}