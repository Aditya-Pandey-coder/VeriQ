import { useState, useEffect, useRef, useCallback } from "react";
import {
  getDemoHistory,
  subscribeToDemoHistory,
  type DemoTransaction,
} from "../transactionStore";

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "user" | "ai";
type MsgStatus = "typing" | "done";

interface Message {
  id: string;
  role: Role;
  text: string;
  status: MsgStatus;
  signals?: Signal[];
  timestamp: string;
}

interface Signal {
  label: string;
  value: string;
  severity: "high" | "medium" | "low" | "safe";
}

interface Suggestion {
  icon: string;
  label: string;
  query: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowIST() {
  return (
    new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) + " IST"
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Live backend explanation adapter ─────────────────────────────────────────
const EXPLAIN_API_URL = import.meta.env.VITE_VERIQ_RISK_API_URL
  ? import.meta.env.VITE_VERIQ_RISK_API_URL.replace(
      "/risk/check",
      "/risk/explain"
    )
  : "https://veriq-backend-56ex.onrender.com/api/v1/risk/explain";

type ExplainResponse = { transaction_id?: string; answer?: string };

function explainUnavailable(transaction?: DemoTransaction | null): {
  reply: string;
  signals?: Signal[];
} {
  return {
    reply: transaction?.backendTransactionId
      ? "**Live explanation unavailable**\n\nThe risk explanation service did not respond. No local knowledge-base answer is being substituted. Re-open the payment after the backend is available, or verify the recipient independently before acting."
      : "**Run a live payment assessment first**\n\nAsk VeriQ now uses the backend explanation service and will not invent a recipient-specific answer. Complete a demo payment so this assistant receives a backend transaction ID, then ask about that transaction.",
    signals: [
      {
        label: "Evidence",
        value: transaction?.backendTransactionId
          ? "BACKEND UNAVAILABLE"
          : "NO LIVE TRANSACTION",
        severity: "medium",
      },
    ],
  };
}

async function getBackendReply(
  query: string,
  transaction: DemoTransaction | null
): Promise<{ reply: string; signals?: Signal[] }> {
  if (!transaction?.backendTransactionId)
    return explainUnavailable(transaction);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `${EXPLAIN_API_URL}/${encodeURIComponent(transaction.backendTransactionId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query.trim() }),
        signal: controller.signal,
      }
    );
    if (!response.ok) return explainUnavailable(transaction);
    const data = (await response.json()) as ExplainResponse;
    if (!data.answer?.trim()) return explainUnavailable(transaction);
    return {
      reply: data.answer,
      signals: [
        {
          label: "Transaction",
          value: data.transaction_id || transaction.backendTransactionId,
          severity: "low",
        },
        {
          label: "Source",
          value: "LIVE BACKEND EXPLANATION",
          severity: "safe",
        },
        {
          label: "UPI",
          value: transaction.upi,
          severity: transaction.status === "fraud" ? "high" : "low",
        },
      ],
    };
  } catch {
    return explainUnavailable(transaction);
  } finally {
    window.clearTimeout(timeout);
  }
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
const SUGGESTIONS: Suggestion[] = [
  {
    icon: "⚡",
    label: "Is this UPI safe?",
    query: "Is loanapp99@upi safe to pay?",
  },
  {
    icon: "🛡",
    label: "OTP fraud warning",
    query: "Someone asked me to share my OTP",
  },
  {
    icon: "🏛",
    label: "Govt impersonation",
    query: "A caller claiming to be from Income Tax asked me to pay via UPI",
  },
  {
    icon: "🎯",
    label: "How VeriQ detects fraud",
    query: "How does VeriQ detect fraud?",
  },
  {
    icon: "🎰",
    label: "Lottery scam signs",
    query: "I received a message saying I won a prize lottery",
  },
  {
    icon: "📋",
    label: "Report cybercrime",
    query: "How do I report a UPI fraud?",
  },
];

// ─── Markdown-lite renderer ───────────────────────────────────────────────────
function MdText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {lines.map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return (
            <div
              key={i}
              className="text-body-sm"
              style={{
                color: "#E4EAF4",
                fontWeight: 700,
                marginTop: i > 0 ? 8 : 0,
              }}
            >
              {line.slice(2, -2)}
            </div>
          );
        }
        if (line.startsWith("- ")) {
          const inner = line
            .slice(2)
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
          return (
            <div
              key={i}
              style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
            >
              <span
                style={{
                  color: "#00D4FF",
                  flexShrink: 0,
                  marginTop: 2,
                  fontSize: 10,
                }}
              >
                ▸
              </span>
              <span
                className="text-body-sm text-secondary"
                dangerouslySetInnerHTML={{ __html: inner }}
              />
            </div>
          );
        }
        if (line === "") return <div key={i} style={{ height: 4 }} />;
        const parsed = line.replace(
          /\*\*(.*?)\*\*/g,
          "<strong style='color:#E4EAF4'>$1</strong>"
        );
        return (
          <span
            key={i}
            className="text-body-sm text-secondary"
            style={{ lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: parsed }}
          />
        );
      })}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
        padding: "4px 0",
      }}
    >
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#00D4FF",
            animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Signal pills row ─────────────────────────────────────────────────────────
function SignalPills({ signals }: { signals: Signal[] }) {
  const col = (s: Signal["severity"]) =>
    s === "high"
      ? {
          bg: "rgba(255,51,85,0.1)",
          border: "rgba(255,51,85,0.25)",
          text: "#FF3355",
        }
      : s === "medium"
        ? {
            bg: "rgba(245,166,35,0.1)",
            border: "rgba(245,166,35,0.25)",
            text: "#F5A623",
          }
        : s === "safe"
          ? {
              bg: "rgba(0,194,122,0.08)",
              border: "rgba(0,194,122,0.2)",
              text: "#00C27A",
            }
          : {
              bg: "rgba(0,212,255,0.06)",
              border: "rgba(0,212,255,0.15)",
              text: "#00D4FF",
            };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
      {signals.map((s, i) => {
        const c = col(s.severity);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: "4px 8px",
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 4,
            }}
          >
            <span className="text-label-sm" style={{ color: "#7D8FA8" }}>
              {s.label}
            </span>
            <div style={{ width: 1, height: 10, background: "#1C2235" }} />
            <span
              className="text-mono-sm"
              style={{ color: c.text, fontWeight: 600 }}
            >
              {s.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 10,
        alignItems: "flex-start",
        animation: "slideUp 0.25s ease both",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isUser
            ? "linear-gradient(135deg, #253047, #161B28)"
            : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))",
          border: isUser
            ? "1px solid #253047"
            : "1px solid rgba(0,212,255,0.2)",
          boxShadow: isUser ? "none" : "0 0 12px rgba(0,212,255,0.1)",
        }}
      >
        {isUser ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle
              cx="7"
              cy="4.5"
              r="2.5"
              stroke="#7D8FA8"
              strokeWidth="1.1"
            />
            <path
              d="M2 13C2 10.2 4.2 8 7 8C9.8 8 12 10.2 12 13"
              stroke="#7D8FA8"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1L11.5 3.5V7C11.5 9.5 9.6 11.8 7 12.5C4.4 11.8 2.5 9.5 2.5 7V3.5L7 1Z"
              stroke="#00D4FF"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <path
              d="M4.5 7L6 8.5L9.5 5"
              stroke="#00D4FF"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "70%",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            padding: isUser ? "10px 14px" : "14px 16px",
            background: isUser
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,212,255,0.04)",
            border: isUser
              ? "1px solid rgba(255,255,255,0.06)"
              : "1px solid rgba(0,212,255,0.1)",
            borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
            backdropFilter: "blur(4px)",
          }}
        >
          {msg.status === "typing" ? (
            <TypingDots />
          ) : isUser ? (
            <span className="text-body-sm text-primary">{msg.text}</span>
          ) : (
            <MdText text={msg.text} />
          )}
          {msg.signals && msg.status === "done" && (
            <SignalPills signals={msg.signals} />
          )}
        </div>
        <span
          className="text-body-xs text-muted"
          style={{
            paddingLeft: isUser ? 0 : 4,
            paddingRight: isUser ? 4 : 0,
            textAlign: isUser ? "right" : "left",
          }}
        >
          {msg.timestamp}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AskVeriQ() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "ai",
      status: "done",
      timestamp: nowIST(),
      text: `**VeriQ AI — Fraud Intelligence Assistant**

I'm your real-time UPI fraud analyst. I can:

- Analyze any UPI ID or transaction for red flags
- Explain exactly why a transaction was flagged
- Walk you through any fraud pattern in plain language
- Guide you on how to report cybercrime in India

Ask me anything, or pick a topic below to get started.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [currentDemo, setCurrentDemo] = useState<DemoTransaction | null>(
    () => getDemoHistory()[0] || null
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(
    () =>
      subscribeToDemoHistory(() => setCurrentDemo(getDemoHistory()[0] || null)),
    []
  );

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || isThinking) return;
      setInput("");

      const userMsg: Message = {
        id: uid(),
        role: "user",
        status: "done",
        timestamp: nowIST(),
        text: text.trim(),
      };
      const thinkingMsg: Message = {
        id: uid(),
        role: "ai",
        status: "typing",
        timestamp: nowIST(),
        text: "",
      };

      setMessages(prev => [...prev, userMsg, thinkingMsg]);
      setIsThinking(true);

      void getBackendReply(text, currentDemo).then(({ reply, signals }) => {
        const aiMsg: Message = {
          id: uid(),
          role: "ai",
          status: "done",
          timestamp: nowIST(),
          text: reply,
          signals,
        };
        setMessages(prev => [...prev.slice(0, -1), aiMsg]);
        setIsThinking(false);
      });
    },
    [currentDemo, isThinking]
  );

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const hasSuggestions = messages.length <= 1;

  return (
    <div
      className="ask-veriq-shell"
      style={{
        flex: 1,
        display: "flex",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ── Ambient glow ── */}
      <div
        style={{
          position: "absolute",
          top: -80,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 300,
          background:
            "radial-gradient(ellipse, rgba(0,212,255,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Header bar ── */}
        <div
          className="ask-veriq-header"
          style={{
            padding: "14px 24px",
            borderBottom: "1px solid #1C2235",
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "rgba(10,12,20,0.8)",
            backdropFilter: "blur(8px)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background:
                "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))",
              border: "1px solid rgba(0,212,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 16px rgba(0,212,255,0.12)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 1.5L14.5 4.5V9C14.5 12.3 12.1 15.3 9 16.2C5.9 15.3 3.5 12.3 3.5 9V4.5L9 1.5Z"
                stroke="#00D4FF"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M6 9L8 11L12 7"
                stroke="#00D4FF"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="font-display"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#E4EAF4",
                  letterSpacing: 0.5,
                }}
              >
                Ask VeriQ
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 7px",
                  background: "rgba(0,212,255,0.06)",
                  border: "1px solid rgba(0,212,255,0.15)",
                  borderRadius: 3,
                }}
              >
                <span className="pulse-safe" style={{ width: 5, height: 5 }} />
                <span
                  className="text-mono-sm text-accent"
                  style={{ fontSize: 9, letterSpacing: 1 }}
                >
                  AI ONLINE
                </span>
              </div>
            </div>
            <div className="text-body-xs text-muted" style={{ marginTop: 1 }}>
              Real-time fraud intelligence · Powered by VeriQ Neural Engine v2.4
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            {[
              { label: "Model", value: "VQ-NE 2.4" },
              { label: "Latency", value: "< 300ms" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "right" }}>
                <div
                  className="text-mono-sm text-accent"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {s.value}
                </div>
                <div className="text-label-sm text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Messages ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {/* Suggestions — shown only on fresh load */}
          {hasSuggestions && (
            <div style={{ animation: "fadeIn 0.4s ease 0.3s both" }}>
              <div
                className="text-label-sm text-muted"
                style={{ marginBottom: 10, letterSpacing: 1 }}
              >
                QUICK START
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="ask-veriq-suggestion"
                    onClick={() => send(s.query)}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid #1C2235",
                      borderRadius: 8,
                      padding: "12px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(0,212,255,0.04)";
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "rgba(0,212,255,0.2)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.02)";
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "#1C2235";
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>
                      {s.icon}
                    </span>
                    <span
                      className="text-body-sm"
                      style={{ color: "#7D8FA8", lineHeight: 1.4 }}
                    >
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input bar ── */}
        <div
          className="ask-veriq-input-bar"
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #1C2235",
            background: "rgba(10,12,20,0.9)",
            backdropFilter: "blur(8px)",
            flexShrink: 0,
          }}
        >
          {/* Context chips */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            {[
              "Analyze UPI ID",
              "Explain flag",
              "Report steps",
              "Safe payment check",
            ].map(chip => (
              <button
                key={chip}
                onClick={() => {
                  setInput(chip + ": ");
                  inputRef.current?.focus();
                }}
                style={{
                  padding: "3px 10px",
                  background: "rgba(0,212,255,0.04)",
                  border: "1px solid rgba(0,212,255,0.12)",
                  borderRadius: 20,
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "rgba(0,212,255,0.3)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "rgba(0,212,255,0.12)";
                }}
              >
                <span className="text-body-xs text-accent">{chip}</span>
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              background: "#0C0F18",
              border: "1px solid #1C2235",
              borderRadius: 10,
              padding: "10px 12px",
              transition: "border-color 0.15s",
            }}
            onFocusCapture={e => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "rgba(0,212,255,0.25)";
            }}
            onBlurCapture={e => {
              (e.currentTarget as HTMLElement).style.borderColor = "#1C2235";
            }}
          >
            <div style={{ color: "#3E4D62", flexShrink: 0, paddingBottom: 2 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle
                  cx="6.5"
                  cy="6.5"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M9.5 9.5L12.5 12.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKey}
              placeholder="Ask about any UPI ID, fraud type, or transaction…"
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                color: "#E4EAF4",
                lineHeight: 1.6,
                minHeight: 22,
                maxHeight: 120,
                overflow: "auto",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || isThinking}
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                background:
                  input.trim() && !isThinking
                    ? "#00D4FF"
                    : "rgba(0,212,255,0.08)",
                border: `1px solid ${input.trim() && !isThinking ? "transparent" : "rgba(0,212,255,0.12)"}`,
                cursor: input.trim() && !isThinking ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                flexShrink: 0,
                boxShadow:
                  input.trim() && !isThinking
                    ? "0 0 12px rgba(0,212,255,0.3)"
                    : "none",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 12L12 7L2 2V6L9 7L2 8V12Z"
                  fill={
                    input.trim() && !isThinking
                      ? "#07090E"
                      : "rgba(0,212,255,0.3)"
                  }
                />
              </svg>
            </button>
          </div>
          <div
            className="text-body-xs text-muted"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            Press <span className="text-mono-sm text-accent">Enter</span> to
            send · <span className="text-mono-sm text-accent">Shift+Enter</span>{" "}
            for new line · Responses are AI-simulated for demo
          </div>
        </div>
      </div>
    </div>
  );
}
