import { useState, useRef, useEffect, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

function isPrivateNetworkHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;

  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

const DEFAULT_API_BASE_URL =
  typeof window !== "undefined"
    ? isPrivateNetworkHost(window.location.hostname)
      ? `http://${window.location.hostname}:8000`
      : "/api"
    : "/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;

const FALLBACK_STATES = [
  { value: "delhi", label: "Delhi" },
  { value: "maharashtra", label: "Maharashtra" },
  { value: "west bengal", label: "West Bengal" },
];

function getApiBaseCandidates() {
  if (typeof window === "undefined") {
    return [API_BASE_URL];
  }

  if (import.meta.env.VITE_API_BASE_URL) {
    return [import.meta.env.VITE_API_BASE_URL];
  }

  const candidates = ["/api"];
  const { protocol, hostname, port } = window.location;

  // In local Vite dev, /api proxy is most reliable; direct backend URL is fallback.
  if (port === "5173") {
    candidates.push(`http://${hostname}:8000`);
  } else if (protocol === "http:" && isPrivateNetworkHost(hostname)) {
    candidates.push(`http://${hostname}:8000`);
  }

  candidates.push(API_BASE_URL);
  return [...new Set(candidates.filter(Boolean))];
}

async function requestChat(payload, signal) {
  const apiBases = getApiBaseCandidates();
  const errors = [];

  for (const baseUrl of apiBases) {
    const endpoint = `${baseUrl}/chat`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.text();
        errors.push(`${endpoint} -> ${res.status}${detail ? ` ${detail}` : ""}`);
        continue;
      }

      const data = await res.json();
      return { data, endpoint };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      errors.push(`${endpoint} -> ${error?.message || "Network error"}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function requestStates() {
  const apiBases = getApiBaseCandidates();

  for (const baseUrl of apiBases) {
    try {
      const res = await fetch(`${baseUrl}/states`);
      if (!res.ok) continue;

      const data = await res.json();
      const list = Array.isArray(data?.states) ? data.states : [];
      const normalized = list
        .filter((item) => item && typeof item.value === "string" && typeof item.label === "string")
        .map((item) => ({ value: item.value, label: item.label }));

      if (normalized.length) {
        return normalized;
      }
    } catch {
      // Ignore and try next API base.
    }
  }

  return FALLBACK_STATES;
}

function parseAgeFromText(text) {
  const lowered = (text || "").toLowerCase();
  const patterns = [
    /\bage\s*(?:is|:)?\s*(\d{1,3})\b/i,
    /\baged\s*(\d{1,3})\b/i,
    /\b(?:i am|i'm|im)\s+(\d{1,3})(?:\s*(?:years?|yrs?)\s*(?:old)?)?\b/i,
    /\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b/i,
  ];

  for (const pattern of patterns) {
    const match = lowered.match(pattern);
    if (!match) continue;
    const age = parseInt(match[1], 10);
    if (age > 0 && age <= 120) {
      return age;
    }
  }
  return null;
}

function parseIncomeFromText(text) {
  const lowered = (text || "").toLowerCase();
  const lakhIncome = lowered.match(/(\d+(?:\.\d+)?)\s*lakh/i);
  if (lakhIncome) {
    return Math.round(parseFloat(lakhIncome[1]) * 100000);
  }

  const plainIncome = lowered.match(/(?:income|salary|earning|earnings)\D{0,20}(\d{4,12})/i);
  if (plainIncome) {
    return parseInt(plainIncome[1], 10);
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════ */
const TAG = {
  Education:   { glow: "#f97316", light: "#fff7ed", dark: "#7c2d12", icon: "🎓", grad: ["#f97316","#ea580c"] },
  Health:      { glow: "#10b981", light: "#ecfdf5", dark: "#064e3b", icon: "🏥", grad: ["#10b981","#059669"] },
  Finance:     { glow: "#f59e0b", light: "#fffbeb", dark: "#78350f", icon: "💰", grad: ["#f59e0b","#d97706"] },
  Agriculture: { glow: "#84cc16", light: "#f7fee7", dark: "#365314", icon: "🌾", grad: ["#84cc16","#65a30d"] },
  Employment:  { glow: "#8b5cf6", light: "#f5f3ff", dark: "#4c1d95", icon: "💼", grad: ["#8b5cf6","#7c3aed"] },
  Pension:     { glow: "#ef4444", light: "#fef2f2", dark: "#7f1d1d", icon: "🧓", grad: ["#ef4444","#dc2626"] },
  Housing:     { glow: "#06b6d4", light: "#ecfeff", dark: "#164e63", icon: "🏠", grad: ["#06b6d4","#0891b2"] },
  Women:       { glow: "#ec4899", light: "#fdf2f8", dark: "#831843", icon: "👩", grad: ["#ec4899","#db2777"] },
  Youth:       { glow: "#14b8a6", light: "#f0fdfa", dark: "#134e4a", icon: "⚡", grad: ["#14b8a6","#0d9488"] },
  Senior:      { glow: "#eab308", light: "#fefce8", dark: "#713f12", icon: "🌅", grad: ["#eab308","#ca8a04"] },
};

const QUICK = [
  { label: "Child (5+ yrs)",    text: "I am 5 years old, what schemes are available?" },
  { label: "Student (18+ yrs)", text: "I am 18 years old, what schemes am I eligible for?" },
  { label: "Adult (35+ yrs)",   text: "I am 35 years old, show me relevant schemes" },
  { label: "Senior (65+ yrs)",  text: "I am 65 years old, what government benefits can I get?" },
];

const INITIAL_BOT_TEXT = JSON.stringify({
  message: "Namaste! 🙏 I'm Citizen Seva — your personal guide to Indian Government Schemes. Share your age and I'll map out all schemes you're eligible for in an interactive flow diagram.",
  schemes: [],
  followUp: "Try clicking a quick prompt below, or type your age!",
});

/* ═══════════════════════════════════════════════════════════
   RADIAL GRAPH BUILDER
═══════════════════════════════════════════════════════════ */
function buildRadialGraph(schemes, ageLabel) {
  const nodes = [], edges = [];
  const cx = 0, cy = 0;

  nodes.push({
    id: "root",
    type: "rootNode",
    position: { x: cx - 90, y: cy - 55 },
    data: { label: ageLabel || "Eligible Schemes" },
    draggable: true,
  });

  const count = schemes.length;
  const radius = count <= 4 ? 280 : count <= 6 ? 320 : 370;

  schemes.forEach((s, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const x = cx + radius * Math.cos(angle) - 110;
    const y = cy + radius * Math.sin(angle) - 70;
    const t = TAG[s.tag] || TAG.Finance;

    nodes.push({
      id: `s${i}`,
      type: "schemeNode",
      position: { x, y },
      data: { ...s, colors: t },
      draggable: true,
    });

    edges.push({
      id: `e${i}`,
      source: "root",
      target: `s${i}`,
      animated: true,
      style: { stroke: t.glow, strokeWidth: 1.8, opacity: 0.55 },
      markerEnd: { type: MarkerType.ArrowClosed, color: t.glow, width: 14, height: 14 },
    });
  });

  return { nodes, edges };
}

/* ═══════════════════════════════════════════════════════════
   CUSTOM NODES
═══════════════════════════════════════════════════════════ */
function RootNode({ data }) {
  return (
    <>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0 }} />
      <div style={{
        width: 180, height: 110,
        background: "linear-gradient(135deg,#FF9933 0%,#ffffff 50%,#138808 100%)",
        borderRadius: 20,
        padding: 3,
        boxShadow: "0 0 40px rgba(255,153,51,0.5), 0 0 80px rgba(19,136,8,0.3)",
        animation: "rootPulse 3s ease-in-out infinite",
      }}>
        <div style={{
          width: "100%", height: "100%",
          background: "#0a0f1e",
          borderRadius: 17,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
        }}>
          <div style={{ fontSize: 28 }}>🇮🇳</div>
          <div style={{
            color: "#fff", fontFamily: "'Cinzel',serif",
            fontWeight: 700, fontSize: 11, letterSpacing: 1,
            textAlign: "center", lineHeight: 1.3,
          }}>
            {data.label}
          </div>
          <div style={{
            fontSize: 9, color: "#FF9933", fontFamily: "'DM Sans',sans-serif",
            letterSpacing: 2, textTransform: "uppercase",
          }}>Eligible Schemes</div>
        </div>
      </div>
    </>
  );
}

function SchemeNode({ data }) {
  const c = data.colors || TAG.Finance;
  return (
    <>
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right}  style={{ opacity: 0 }} />
      <div style={{
        width: 220,
        background: "#0d1425",
        border: `1px solid ${c.glow}44`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: `0 0 20px ${c.glow}22, inset 0 1px 0 ${c.glow}33`,
        transition: "box-shadow 0.3s, transform 0.3s",
        cursor: "grab",
      }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = `0 0 35px ${c.glow}55, inset 0 1px 0 ${c.glow}66`;
          e.currentTarget.style.transform = "scale(1.03)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = `0 0 20px ${c.glow}22, inset 0 1px 0 ${c.glow}33`;
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {/* Gradient top bar */}
        <div style={{
          height: 4,
          background: `linear-gradient(90deg, ${c.grad[0]}, ${c.grad[1]})`,
        }} />

        <div style={{ padding: "11px 13px 13px" }}>
          {/* Tag pill + icon */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `linear-gradient(135deg,${c.grad[0]},${c.grad[1]})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0,
              boxShadow: `0 4px 10px ${c.glow}44`,
            }}>
              {c.icon}
            </div>
            <div>
              <div style={{
                color: "#fff", fontFamily: "'DM Sans',sans-serif",
                fontWeight: 700, fontSize: 12, lineHeight: 1.2,
              }}>{data.name}</div>
              <div style={{
                display: "inline-block",
                background: `${c.glow}22`,
                color: c.glow, fontSize: 9,
                padding: "1px 6px", borderRadius: 20,
                fontFamily: "'DM Sans',sans-serif", marginTop: 2,
                letterSpacing: 0.5,
              }}>{data.tag}</div>
            </div>
          </div>

          {/* Ministry */}
          <div style={{
            color: "#64748b", fontSize: 10,
            fontFamily: "'DM Sans',sans-serif", marginBottom: 6,
          }}>{data.ministry}</div>

          {/* Benefit */}
          <div style={{
            color: "#94a3b8", fontSize: 11,
            fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5,
            marginBottom: 7,
          }}>{data.benefit}</div>

          {/* Eligibility */}
          <div style={{
            background: `${c.glow}11`,
            border: `1px solid ${c.glow}22`,
            borderRadius: 6, padding: "4px 8px",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ color: c.glow, fontSize: 10 }}>✓</span>
            <span style={{ color: "#64748b", fontSize: 10, fontFamily: "'DM Sans',sans-serif" }}>
              {data.eligibility}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

const NODE_TYPES = { rootNode: RootNode, schemeNode: SchemeNode };

/* ═══════════════════════════════════════════════════════════
   FLOW CANVAS
═══════════════════════════════════════════════════════════ */
function SchemeFlow({ schemes, ageLabel, isMobile = false }) {
  const { nodes: n0, edges: e0 } = buildRadialGraph(schemes, ageLabel);
  const [nodes, , onNodesChange] = useNodesState(n0);
  const [edges, , onEdgesChange] = useEdgesState(e0);

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView fitViewOptions={{ padding: isMobile ? 0.28 : 0.18 }}
      style={{ background: "transparent" }}
      proOptions={{ hideAttribution: true }}
      minZoom={isMobile ? 0.2 : 0.3} maxZoom={1.8}
    >
      <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={22} size={1.2} />
      <Controls showInteractive={false} style={{
        background: "#0d1425", border: "1px solid #1e293b",
        borderRadius: 10, overflow: "hidden",
      }} />
      {!isMobile && (
        <MiniMap
          style={{ background: "#0d1425", border: "1px solid #1e293b", borderRadius: 10 }}
          maskColor="#0a0f1e99"
          nodeColor={n => n.type === "rootNode" ? "#FF9933" : (TAG[n.data?.tag]?.glow || "#94a3b8")}
        />
      )}
    </ReactFlow>
  );
}

/* ═══════════════════════════════════════════════════════════
   CHAT BUBBLES
═══════════════════════════════════════════════════════════ */
function BotBubble({ msg, onFlowReady }) {
  useEffect(() => {
    try {
      const d = JSON.parse(msg.text);
      if (d.schemes?.length) onFlowReady?.(d);
    } catch {
      // Ignore parse errors here; fall back to raw text rendering.
    }
  }, [msg.text, onFlowReady]);

  let parsed = null;
  let raw = "";
  try {
    parsed = JSON.parse(msg.text);
  } catch {
    raw = msg.text;
  }

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16, animation: "slideIn 0.35s cubic-bezier(.22,1,.36,1)" }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg,#FF9933,#138808)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, boxShadow: "0 0 14px rgba(255,153,51,0.4)",
      }}>🇮🇳</div>
      <div style={{ flex: 1 }}>
        <div style={{
          background: "rgba(13,20,37,0.9)",
          border: "1px solid #1e293b",
          borderRadius: "0 14px 14px 14px",
          padding: "10px 14px",
          color: "#cbd5e1",
          fontFamily: "'DM Sans',sans-serif",
          fontSize: 13, lineHeight: 1.65,
          backdropFilter: "blur(10px)",
        }}>
          {parsed?.message || raw}
        </div>
        {parsed?.followUp && (
          <div style={{
            marginTop: 8, padding: "8px 12px",
            background: "rgba(255,153,51,0.06)",
            border: "1px dashed rgba(255,153,51,0.25)",
            borderRadius: 8,
            color: "#94a3b8", fontSize: 12,
            fontFamily: "'DM Sans',sans-serif", fontStyle: "italic",
          }}>
            💡 {parsed.followUp}
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, animation: "slideIn 0.3s cubic-bezier(.22,1,.36,1)" }}>
      <div style={{
        background: "linear-gradient(135deg,#FF9933,#e07b00)",
        borderRadius: "14px 0 14px 14px",
        padding: "10px 14px",
        color: "#fff", fontFamily: "'DM Sans',sans-serif",
        fontSize: 13, maxWidth: "80%", lineHeight: 1.55,
        boxShadow: "0 4px 18px rgba(255,153,51,0.3)",
      }}>
        {text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg,#FF9933,#138808)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
      }}>🇮🇳</div>
      <div style={{
        background: "rgba(13,20,37,0.9)", border: "1px solid #1e293b",
        borderRadius: "0 14px 14px 14px", padding: "14px 18px",
        display: "flex", gap: 5, alignItems: "center",
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%", background: "#FF9933",
            animation: `dotBounce 1.3s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [messages, setMessages] = useState([{
    role: "bot",
    text: INITIAL_BOT_TEXT,
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [flowData, setFlowData] = useState(null);
  const [schemeScope, setSchemeScope] = useState("all");
  const [selectedState, setSelectedState] = useState("all");
  const [availableStates, setAvailableStates] = useState(FALLBACK_STATES);
  const [mobilePane, setMobilePane] = useState("chat");
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const requestSeqRef = useRef(0);
  const abortRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 900px)").matches;
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleFlowReady = useCallback((data) => {
    setFlowData(data);
  }, []);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const handleChange = (event) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobilePane("chat");
  }, [isMobile]);

  const isStateRequiredButMissing = schemeScope === "state" && selectedState === "all";

  useEffect(() => {
    let mounted = true;

    requestStates().then((states) => {
      if (mounted && states.length) {
        setAvailableStates(states);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const clearChat = useCallback(() => {
    requestSeqRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setInput("");
    setFlowData(null);
    setMessages([{ role: "bot", text: INITIAL_BOT_TEXT }]);
    inputRef.current?.focus();
  }, []);

  const send = async (text) => {
    const t = (text || input).trim();
    if (!t) return;

    if (isStateRequiredButMissing) {
      setMessages((p) => [
        ...p,
        {
          role: "bot",
          text: JSON.stringify({
            message: "Please select a state first to view State Schemes.",
            schemes: [],
            followUp: "Choose a state from the Select State dropdown, then send your query again.",
          }),
        },
      ]);
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    setFlowData(null);
    setMessages(p => [...p, { role: "user", text: t }]);
    setLoading(true);

    try {
      const age = parseAgeFromText(t);
      const income = parseIncomeFromText(t);

      const { data } = await requestChat(
        {
          message: t,
          age,
          income,
          scheme_scope: schemeScope,
          state: selectedState === "all" ? null : selectedState,
        },
        controller.signal,
      );

      let payload = data.reply_json;
      if (!payload && typeof data.reply === "string") {
        try {
          payload = JSON.parse(data.reply);
        } catch {
          payload = null;
        }
      }

      if (!payload) {
        payload = {
          message: `Found ${data.matched_count || 0} eligible scheme(s).`,
          ageLabel: age ? `Age ${age} Years` : "Age Not Specified",
          ageGroup: "Adult",
          schemes: (data.schemes || []).slice(0, 8).map((s) => ({
            name: s.name,
            ministry: s.nodal_ministry,
            benefit: s.category,
            eligibility: `Age: ${s.min_age} - ${s.max_age}; Income: ${s.income_limit}`,
            tag: "Finance",
          })),
          followUp: "Share annual income for more specific results.",
        };
      }

      if (requestSeqRef.current !== requestId) return;
      setMessages(p => [...p, { role: "bot", text: JSON.stringify(payload) }]);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      if (requestSeqRef.current !== requestId) return;
      console.error("Error:", error);
      const errMsg = String(error?.message || "Unknown error");
      setMessages(p => [...p, {
        role: "bot",
        text: JSON.stringify({ 
          message: "Unable to fetch AI response. Please verify backend is running and accessible.", 
          schemes: [], 
          followUp: errMsg.length > 160 ? `${errMsg.slice(0, 157)}...` : errMsg,
        }),
      }]);
    } finally {
      if (requestSeqRef.current === requestId) {
        setLoading(false);
        inputRef.current?.focus();
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050a14; font-family: 'DM Sans', sans-serif; overflow-x: hidden; overflow-y: auto; }

        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }

        @keyframes slideIn    { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dotBounce  { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-6px);opacity:1} }
        @keyframes rootPulse  { 0%,100%{box-shadow:0 0 40px rgba(255,153,51,0.5),0 0 80px rgba(19,136,8,0.3)} 50%{box-shadow:0 0 60px rgba(255,153,51,0.7),0 0 100px rgba(19,136,8,0.5)} }
        @keyframes shimmer    { from{background-position:200% center} to{background-position:-200% center} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }

        textarea:focus { outline: none; }
        textarea { resize: none; }

        .react-flow__controls { box-shadow: none !important; }
        .react-flow__controls button {
          background: #0d1425 !important;
          border: 1px solid #1e293b !important;
          color: #64748b !important;
          width: 28px !important; height: 28px !important;
        }
        .react-flow__controls button:hover { background: #1e293b !important; }
        .react-flow__controls svg { fill: #64748b !important; }
        .react-flow__minimap { border-radius: 10px !important; }

        .quick-btn {
          background: rgba(255,153,51,0.07);
          border: 1px solid rgba(255,153,51,0.2);
          border-radius: 20px; padding: 5px 13px;
          color: #94a3b8; font-size: 11px;
          cursor: pointer; font-family: 'DM Sans',sans-serif;
          font-weight: 500; transition: all 0.2s; white-space: nowrap;
        }
        .quick-btn:hover {
          background: rgba(255,153,51,0.15);
          border-color: #FF9933; color: #FF9933;
          transform: translateY(-1px);
        }
        .quick-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

        .clear-btn {
          background: transparent;
          border: 1px solid #334155;
          border-radius: 12px;
          color: #94a3b8;
          font-size: 10px;
          font-family: 'DM Sans',sans-serif;
          padding: 4px 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .clear-btn:hover:not(:disabled) {
          border-color: #f97316;
          color: #f97316;
        }
        .clear-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .send-btn { transition: all 0.2s; }
        .send-btn:hover:not(:disabled) { transform: scale(1.08); }
      `}</style>

      <div style={{
        display: "flex",
        flexDirection: "column",
        height: isMobile ? "100dvh" : "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#050a14",
      }}>

        {isMobile && (
          <div style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid #0f1f35",
            background: "#060d1a",
          }}>
            <button
              onClick={() => setMobilePane("chat")}
              style={{
                flex: 1,
                border: mobilePane === "chat" ? "1px solid #f97316" : "1px solid #1e293b",
                background: mobilePane === "chat" ? "rgba(249,115,22,0.14)" : "#0d1425",
                color: mobilePane === "chat" ? "#fed7aa" : "#94a3b8",
                borderRadius: 999,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              Chat
            </button>
            <button
              onClick={() => setMobilePane("map")}
              style={{
                flex: 1,
                border: mobilePane === "map" ? "1px solid #f97316" : "1px solid #1e293b",
                background: mobilePane === "map" ? "rgba(249,115,22,0.14)" : "#0d1425",
                color: mobilePane === "map" ? "#fed7aa" : "#94a3b8",
                borderRadius: 999,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              Flow Map
            </button>
          </div>
        )}

        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          flex: 1,
          minHeight: 0,
        }}>

        {/* ══ LEFT: Chat Panel ══════════════════════════════════════ */}
        <div style={{
          width: isMobile ? "100%" : 360,
          height: "100%",
          flexShrink: 0,
          display: isMobile && mobilePane !== "chat" ? "none" : "flex",
          flexDirection: "column",
          background: "#080e1d",
          borderRight: isMobile ? "none" : "1px solid #0f1f35",
          position: "relative", zIndex: 2,
        }}>
          {/* Subtle top gradient line */}
          <div style={{
            height: 2,
            background: "linear-gradient(90deg,#FF9933,#ffffff44,#138808)",
          }} />

          {/* Header */}
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #0f1f35" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: "linear-gradient(135deg,#FF9933,#e07b00)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, boxShadow: "0 0 18px rgba(255,153,51,0.45)",
              }}>🇮🇳</div>
              <div>
                <div style={{
                  color: "#f1f5f9", fontFamily: "'Cinzel',serif",
                  fontWeight: 700, fontSize: 15, letterSpacing: 0.5,
                }}>Citizen Seva</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#10b981",
                    animation: "rootPulse 2s infinite",
                  }} />
                  <span style={{ color: "#475569", fontSize: 11 }}>Government Schemes Assistant</span>
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
            {messages.map((m, i) =>
              m.role === "bot"
                ? <BotBubble key={i} msg={m} onFlowReady={handleFlowReady} />
                : <UserBubble key={i} text={m.text} />
            )}
            {loading && <TypingDots />}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div style={{ padding: "8px 16px", borderTop: "1px solid #0f1f35" }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#334155", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Scheme Type
              </div>
              <select
                value={schemeScope}
                disabled={loading}
                onChange={e => setSchemeScope(e.target.value)}
                style={{
                  width: "100%",
                  background: "#0d1425",
                  color: "#cbd5e1",
                  border: "1px solid #1e293b",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 12,
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <option value="all">All Schemes</option>
                <option value="central">Central Schemes</option>
                <option value="state">State Schemes</option>
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 10,
                color: "#334155",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
              }}>
                Select State
              </div>
              <select
                value={selectedState}
                disabled={loading}
                onChange={e => {
                  const nextState = e.target.value;
                  setSelectedState(nextState);
                  if (nextState !== "all") {
                    setSchemeScope("state");
                  }
                }}
                style={{
                  width: "100%",
                  background: "#0d1425",
                  color: "#cbd5e1",
                  border: "1px solid #1e293b",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 12,
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <option value="all">All States</option>
                {availableStates.map((state) => (
                  <option key={state.value} value={state.value}>{state.label}</option>
                ))}
              </select>
              {isStateRequiredButMissing && (
                <div style={{
                  marginTop: 6,
                  color: "#fb923c",
                  fontSize: 11,
                  fontFamily: "'DM Sans',sans-serif",
                }}>
                  State is required when Scheme Type is set to State Schemes.
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ fontSize: 10, color: "#334155", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                Quick Age Groups
              </div>
              <button className="clear-btn" onClick={clearChat} disabled={loading && messages.length <= 1}>
                Clear Chat
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK.map((q, i) => (
                <button key={i} className="quick-btn" onClick={() => send(q.text)} disabled={loading || isStateRequiredButMissing}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #0f1f35" }}>
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-end",
              background: "#0d1425",
              border: "1px solid #1e293b",
              borderRadius: 12, padding: "10px 12px",
            }}
              onFocusCapture={e => e.currentTarget.style.borderColor = "#FF9933aa"}
              onBlurCapture={e  => e.currentTarget.style.borderColor = "#1e293b"}
            >
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                disabled={loading}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Enter your age…"
                style={{
                  flex: 1, background: "transparent", border: "none",
                  color: "#e2e8f0", fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13, lineHeight: 1.5, maxHeight: 100, overflowY: "auto",
                }}
              />
              <button className="send-btn"
                onClick={() => send()}
                disabled={loading || !input.trim() || isStateRequiredButMissing}
                style={{
                  width: 34, height: 34, borderRadius: 9, border: "none",
                  background: input.trim() && !loading && !isStateRequiredButMissing
                    ? "linear-gradient(135deg,#FF9933,#e07b00)"
                    : "#1e293b",
                  cursor: input.trim() && !loading && !isStateRequiredButMissing ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: input.trim() && !loading && !isStateRequiredButMissing ? "0 4px 14px rgba(255,153,51,0.4)" : "none",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                    stroke={input.trim() && !loading && !isStateRequiredButMissing ? "#fff" : "#334155"}
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div style={{ textAlign: "center", color: "#1e293b", fontSize: 10, marginTop: 8, fontFamily: "'DM Sans',sans-serif" }}>
              Powered by Citizen Seva
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Flow Canvas ════════════════════════════════════ */}
        <div style={{
          display: isMobile && mobilePane !== "map" ? "none" : "block",
          flex: 1,
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Decorative ambient glows */}
          <div style={{
            position: "absolute", top: -100, right: -100,
            width: 400, height: 400, borderRadius: "50%",
            background: "radial-gradient(circle,rgba(255,153,51,0.07) 0%,transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -100, left: -100,
            width: 400, height: 400, borderRadius: "50%",
            background: "radial-gradient(circle,rgba(19,136,8,0.07) 0%,transparent 70%)",
            pointerEvents: "none",
          }} />

          {flowData?.schemes?.length > 0 ? (
            <div style={{ width: "100%", height: "100%", animation: "fadeIn 0.5s ease" }}>
              <SchemeFlow schemes={flowData.schemes} ageLabel={flowData.ageLabel} isMobile={isMobile} />
            </div>
          ) : (
            /* Empty state */
            <div style={{
              width: "100%", height: "100%",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 20,
            }}>
              {/* Decorative rings */}
              <div style={{ position: "relative", width: 160, height: 160 }}>
                {[160, 120, 80].map((s, i) => (
                  <div key={i} style={{
                    position: "absolute",
                    top: "50%", left: "50%",
                    transform: "translate(-50%,-50%)",
                    width: s, height: s, borderRadius: "50%",
                    border: `1px solid rgba(255,153,51,${0.06 + i * 0.06})`,
                    animation: `rootPulse ${3 + i}s ease-in-out ${i * 0.5}s infinite`,
                  }} />
                ))}
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)",
                  fontSize: 48,
                }}>🏛️</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  color: "#334155", fontFamily: "'Cinzel',serif",
                  fontSize: 15, letterSpacing: 1, marginBottom: 8,
                }}>CITIZEN SEVA FLOW MAP</div>
                <div style={{ color: "#1e293b", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                  Enter your age in the chat to visualize eligible schemes
                </div>
              </div>
              {/* Dotted grid hint */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14,
                marginTop: 10, opacity: 0.3,
              }}>
                {Array.from({ length: 15 }).map((_, i) => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: i % 3 === 0 ? "#FF9933" : i % 3 === 1 ? "#fff" : "#138808",
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Watermark */}
          {!isMobile && (
            <div style={{
              position: "absolute", bottom: 16, right: 16,
              color: "#0f1f35", fontSize: 10,
              fontFamily: "'DM Sans',sans-serif", letterSpacing: 1,
              userSelect: "none",
            }}>
              🇮🇳 GOVERNMENT OF INDIA · Citizen Seva
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
