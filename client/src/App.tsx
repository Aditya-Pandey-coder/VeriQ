import { useState, useEffect, useRef } from "react";
import PaymentFlow from "./components/PaymentFlow";
import AskVeriQ from "./components/AskVeriQ";
import FraudExplainer from "./components/FraudExplainer";
import { clearDemoHistory, deleteDemoTransaction, getDemoHistory, subscribeToDemoHistory, updateDemoTransaction } from "./transactionStore";

// ─── Types ────────────────────────────────────────────────────────────────────
type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeType?: "fraud" | "warn" | "accent" | "neutral";
  group?: string;
};

type AlertItem = {
  id: string;
  title: string;
  sub: string;
  time: string;
  type: "fraud" | "warn" | "safe";
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  shield: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L13.5 4V8C13.5 11 11.2 13.8 8 14.5C4.8 13.8 2.5 11 2.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  grid: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  activity: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polyline points="1,8 4,8 6,3 8,13 10,6 12,8 15,8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  zap: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9.5 1.5L4 9H8L6.5 14.5L13 7H9L9.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  layers: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L14 5L8 8.5L2 5L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M2 8L8 11.5L14 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M2 11L8 14.5L14 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="10" width="3" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="6.5" y="7" width="3" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="11" y="4" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  search: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  bell: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5C5.5 1.5 4 3.5 4 6V10L2.5 11.5H13.5L12 10V6C12 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6.5 11.5C6.5 12.3 7.2 13 8 13C8.8 13 9.5 12.3 9.5 11.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.7 3.3L11.6 4.4M4.4 11.6L3.3 12.7M12.7 12.7L11.6 11.6M4.4 4.4L3.3 3.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4.5 6L7 8L4.5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.5 10H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  network: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="2.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="13.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="2.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="13.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M6.2 6.8L3.8 5.1M9.8 6.8L12.2 5.1M6.2 9.2L3.8 10.9M9.8 9.2L12.2 10.9" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  user: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 14C2 11.2 4.7 9 8 9C11.3 9 14 11.2 14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  chevronRight: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  dot: (
    <svg width="6" height="6" viewBox="0 0 6 6">
      <circle cx="3" cy="3" r="3" fill="currentColor"/>
    </svg>
  ),
  lock: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 7V5C5 3.3 6.3 2 8 2C9.7 2 11 3.3 11 5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="8" cy="10.5" r="1" fill="currentColor"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  menu: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  arrowUp: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 8V2M2 5L5 2L8 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  arrowDown: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 2V8M2 5L5 8L8 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─── Nav Config ───────────────────────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  { id: "payment", label: "Demo Payment", icon: Icon.zap, badge: "TRY", badgeType: "accent", group: "DEMO" },
  { id: "askvq", label: "Ask VeriQ", icon: Icon.search, badge: "AI", badgeType: "accent", group: "DEMO" },
  { id: "history", label: "Transaction History", icon: Icon.layers, badge: 12483, badgeType: "neutral", group: "MONITOR" },
  { id: "alerts", label: "Fraud Alerts", icon: Icon.zap, badge: 3, badgeType: "fraud", group: "ANALYSIS" },
];

// ─── Current public safety alerts ─────────────────────────────────────────────
const ALERT_POOL: AlertItem[] = [
  { id: "a1", title: "CERT-In: fake e-Challan APK campaign", sub: "OTP theft and unauthorised transactions", time: "17 Mar 2026", type: "fraud" },
  { id: "a2", title: "RBI: APP fraud and impersonation risk", sub: "Bogus call centres, deepfakes, mule networks", time: "9 Apr 2026", type: "warn" },
  { id: "a3", title: "NPCI: review pending collect requests", sub: "Never share your UPI PIN with support callers", time: "Official guidance", type: "safe" },
];

// ─── Stat data ────────────────────────────────────────────────────────────────
const STATS = [
  { label: "Fraud Blocked",   value: "247",    delta: "+18", up: false, color: "#FF3355", type: "fraud" as const },
  { label: "Under Review",    value: "83",     delta: "+5",  up: false, color: "#F5A623", type: "warn" as const },
  { label: "Verified Safe",   value: "12,491", delta: "+841",up: true,  color: "#00C27A", type: "safe" as const },
  { label: "Detection Rate",  value: "98.4%",  delta: "+0.2%", up: true, color: "#00D4FF", type: "accent" as const },
  { label: "Avg. Resp Time",  value: "1.2s",   delta: "-0.3s", up: true, color: "#A78BFA", type: "review" as const },
  { label: "Total Today",     value: "12,821", delta: "+864",up: true,  color: "#7D8FA8", type: "neutral" as const },
];

const RECENT_TXN = [
  { id: "TXN-8F3A2C", amt: "₹1,24,000", upi: "9xxxx1234@paytm",   time: "14:33:07", risk: 96, status: "fraud" },
  { id: "TXN-2B91DE", amt: "₹1,200",    upi: "rahulk@okaxis",      time: "14:31:44", risk: 9,  status: "safe" },
  { id: "TXN-C4F7A1", amt: "₹15,000",   upi: "loanapp@upi",        time: "14:30:22", risk: 67, status: "review" },
  { id: "TXN-9E2D8B", amt: "₹3,500",    upi: "vendor2@ybl",        time: "14:28:55", risk: 44, status: "warn" },
  { id: "TXN-5A7C3F", amt: "₹800",      upi: "priya.s@okicici",    time: "14:27:10", risk: 6,  status: "safe" },
  { id: "TXN-A1B2C3", amt: "₹48,500",   upi: "quickloan99@upi",    time: "14:25:03", risk: 91, status: "fraud" },
  { id: "TXN-D4E5F6", amt: "₹220",      upi: "zomato@icici",       time: "14:23:41", risk: 3,  status: "safe" },
];

// ─── Micro sparkline ──────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const W = 80, H = 24;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * H;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
      <polyline points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity="0.08" strokeWidth="0"/>
    </svg>
  );
}

// ─── Live ticker ──────────────────────────────────────────────────────────────
function LiveTicker({ active }: { active: boolean }) {
  if (!active) return null;
  const msgs = [
    "TXN-8F3A → BLOCKED · ₹1,24,000",
    "UPI 9xxxx1234@paytm → FLAGGED",
    "AI Model v2.4 · Confidence 97.3%",
    "Pattern: Velocity Surge · +340%",
    "Network: 4 linked accounts",
    "Geo anomaly: Rajasthan ↔ Singapore",
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % msgs.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", maxWidth: 320 }}>
      <span className="pulse-fraud" style={{ flexShrink: 0 }} />
      <span className="text-mono-sm text-fraud" style={{ whiteSpace: "nowrap", animation: "none" }}>
        {msgs[idx]}
      </span>
    </div>
  );
}

// ─── Mini live counter ────────────────────────────────────────────────────────
function LiveCounter({ count }: { count: number }) {
  if (!count) return null;
  return <span className="text-mono-sm text-accent">{count.toLocaleString()}</span>;
}

// ─── Alert bell panel ─────────────────────────────────────────────────────────
function AlertPanel({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0,
      width: 360, background: "#111520",
      border: "1px solid #1C2235", borderRadius: 8,
      boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      zIndex: 200,
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1C2235", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="text-display-sm text-primary">Alerts</span>
          <span className="badge badge-fraud">3</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#3E4D62", padding: 4 }}>{Icon.close}</button>
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {ALERT_POOL.map((a, i) => (
          <div key={a.id} style={{
            padding: "12px 16px",
            borderBottom: i < ALERT_POOL.length - 1 ? "1px solid #1C2235" : "none",
            display: "flex", gap: 12, alignItems: "flex-start",
            cursor: "pointer", transition: "background 0.12s",
            background: a.type === "fraud" ? "rgba(255,51,85,0.03)" : "transparent",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            onMouseLeave={e => (e.currentTarget.style.background = a.type === "fraud" ? "rgba(255,51,85,0.03)" : "transparent")}
          >
            <div style={{
              width: 6, height: 6, borderRadius: "50%", marginTop: 6, flexShrink: 0,
              background: a.type === "fraud" ? "#FF3355" : a.type === "warn" ? "#F5A623" : "#00C27A",
              boxShadow: a.type === "fraud" ? "0 0 6px #FF3355" : "none",
            }} />
            <div style={{ flex: 1 }}>
              <div className="text-body-sm text-primary" style={{ fontWeight: 500 }}>{a.title}</div>
              <div className="text-mono-sm text-muted" style={{ marginTop: 2 }}>{a.sub}</div>
            </div>
            <div className="text-body-xs text-muted" style={{ flexShrink: 0, marginTop: 2 }}>{a.time}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1C2235", textAlign: "center" }}>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%" }}>View all alerts</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeNav, setActiveNav] = useState("payment");
  const [showAlerts, setShowAlerts] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 900);
  const [searchVal, setSearchVal] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("veriq-theme") === "light" ? "light" : "dark");
  const [demoHistory, setDemoHistory] = useState(getDemoHistory);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeToDemoHistory(() => setDemoHistory(getDemoHistory())), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("veriq-theme", theme);
  }, [theme]);

  // Close alert panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (alertRef.current && !alertRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navGroups = ["DEMO", "MONITOR", "ANALYSIS"];

  return (
    <div className={`veriq-shell ${theme === "light" ? "veriq-light" : ""}`} data-theme={theme} style={{ display: "flex", height: "100vh", background: "#07090E", overflow: "hidden", position: "relative" }}>
      <div className="noise-overlay" />
      <div className="scanline-effect" />

      {/* ─── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className={`veriq-sidebar ${sidebarOpen ? "is-open" : "is-closed"}`} style={{
        width: sidebarOpen ? 232 : 0,
        minWidth: sidebarOpen ? 232 : 0,
        background: "#0A0C14",
        borderRight: "1px solid #1C2235",
        display: "flex", flexDirection: "column",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
        zIndex: 100, flexShrink: 0,
        position: "relative",
      }}>
        {/* Sidebar gradient accent */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 200,
          background: "radial-gradient(ellipse at 20% 0%, rgba(0,212,255,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ padding: "0 16px", height: 56, display: "flex", alignItems: "center", borderBottom: "1px solid #1C2235", gap: 10, flexShrink: 0 }}>
          <img
            src="/veriq-circle-mark-transparent.png"
            alt="VERIQ"
            width={36}
            height={36}
            style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 0 9px rgba(0,212,255,0.28))" }}
          />
          <div>
            <div className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#00D4FF", letterSpacing: 2, lineHeight: 1 }}>VERIQ</div>
            <div className="text-label-sm" style={{ color: "#3E4D62", fontSize: 9, letterSpacing: 1.5 }}>FRAUD INTELLIGENCE</div>
          </div>
        </div>

        {/* System status strip */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #1C2235", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pulse-safe" />
          <span className="text-mono-sm text-safe">All systems operational</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
          {navGroups.map(group => {
            const items = NAV_ITEMS.filter(n => n.group === group);
            return (
              <div key={group} style={{ marginBottom: 4 }}>
                <div style={{ padding: "10px 16px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-label-sm" style={{ color: "#253047", fontSize: 9, letterSpacing: 1.8 }}>{group}</span>
                  <div style={{ flex: 1, height: 1, background: "#1C2235" }} />
                </div>
                {items.map(item => {
                  const active = activeNav === item.id;
                  return (
                    <button key={item.id} className={`veriq-nav-item${active ? " is-active" : ""}`} onClick={() => setActiveNav(item.id)} style={{
                      width: "100%", background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 16px",
                      borderRadius: 0,
                      color: active ? "#E4EAF4" : "#4A5A72",
                      transition: "all 0.12s",
                      position: "relative",
                      textAlign: "left",
                    }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#7D8FA8"; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#4A5A72"; }}
                    >
                      {/* Active indicator */}
                      {active && (
                        <div style={{
                          position: "absolute", left: 0, top: 4, bottom: 4, width: 2,
                          background: "#00D4FF", borderRadius: "0 2px 2px 0",
                          boxShadow: "0 0 8px rgba(0,212,255,0.6)",
                        }} />
                      )}
                      <div style={{
                        background: active ? "rgba(0,212,255,0.1)" : "transparent",
                        padding: 6, borderRadius: 4, display: "flex",
                        color: active ? "#00D4FF" : "inherit",
                        transition: "all 0.12s",
                      }}>
                        {item.icon}
                      </div>
                      <span className="font-display" style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.3, flex: 1, color: "inherit" }}>
                        {item.label}
                      </span>
                      {((item.id === "history" ? demoHistory.length || undefined : item.badge) !== undefined) && (
                        <span style={{
                          background: item.badgeType === "fraud" ? "rgba(255,51,85,0.15)"
                            : item.badgeType === "warn" ? "rgba(245,166,35,0.12)"
                            : item.badgeType === "accent" ? "rgba(0,212,255,0.12)"
                            : "rgba(125,143,168,0.1)",
                          color: item.badgeType === "fraud" ? "#FF3355"
                            : item.badgeType === "warn" ? "#F5A623"
                            : item.badgeType === "accent" ? "#00D4FF"
                            : "#4A5A72",
                          border: `1px solid ${item.badgeType === "fraud" ? "rgba(255,51,85,0.25)" : item.badgeType === "accent" ? "rgba(0,212,255,0.2)" : "rgba(125,143,168,0.15)"}`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: 0.5,
                        }}>
                          {item.id === "history" ? demoHistory.length : item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1C2235" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #253047, #161B28)",
              border: "1px solid #253047", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#7D8FA8",
            }}>
              {Icon.user}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div className="text-body-sm text-primary" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Analyst — SOC L2</div>
              <div className="text-mono-sm text-muted">ID: VERIQ-07</div>
            </div>
            <div style={{ color: "#3E4D62" }}>{Icon.lock}</div>
          </div>
        </div>
      </aside>

      {/* ─── MAIN AREA ────────────────────────────────────────────────────── */}
      <div className="veriq-main-area" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* ─── TOPBAR ───────────────────────────────────────────────────── */}
        <header className="veriq-topbar" style={{
          height: 56, flexShrink: 0,
          background: "#0A0C14",
          borderBottom: "1px solid #1C2235",
          display: "flex", alignItems: "center",
          padding: "0 20px", gap: 16,
        }}>
          {/* Hamburger */}
          <button onClick={() => setSidebarOpen(s => !s)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#4A5A72", padding: 6, borderRadius: 4, display: "flex",
            transition: "color 0.12s",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "#E4EAF4")}
            onMouseLeave={e => (e.currentTarget.style.color = "#4A5A72")}
          >
            {Icon.menu}
          </button>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="text-mono-sm" style={{ color: "#3E4D62" }}>VERIQ</span>
            <span style={{ color: "#1C2235" }}>{Icon.chevronRight}</span>
            <span className="font-display" style={{ fontSize: 14, fontWeight: 600, color: "#E4EAF4", letterSpacing: 0.3 }}>
              {NAV_ITEMS.find(n => n.id === activeNav)?.label ?? "Dashboard"}
            </span>
          </div>

          {/* Live ticker */}
          <div className="veriq-live-ticker" style={{
            flex: 1, display: "flex", alignItems: "center",
            background: "rgba(255,51,85,0.05)",
            border: "1px solid rgba(255,51,85,0.15)",
            borderRadius: 4, padding: "5px 12px",
            maxWidth: 400, overflow: "hidden",
          }}>
            <LiveTicker active={demoHistory.length > 0} />
          </div>

          <div style={{ flex: 1 }} />

          {/* Transaction counter */}
          <div className="veriq-counter" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="text-label-sm text-muted">TXN TODAY</span>
            <LiveCounter count={demoHistory.length} />
          </div>

          {/* Search */}
          <div className="veriq-search" style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#3E4D62", pointerEvents: "none" }}>
              {Icon.search}
            </div>
            <input
              className="input"
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              placeholder="Search TXN / UPI ID..."
              style={{ width: 220, paddingLeft: 32, fontSize: 13, height: 34 }}
            />
          </div>

          {/* Alerts */}
          <div style={{ position: "relative" }} ref={alertRef}>
            <button onClick={() => setShowAlerts(v => !v)} style={{
              background: showAlerts ? "rgba(255,51,85,0.1)" : "none",
              border: showAlerts ? "1px solid rgba(255,51,85,0.3)" : "1px solid transparent",
              cursor: "pointer", color: "#7D8FA8",
              padding: 8, borderRadius: 6, display: "flex",
              position: "relative", transition: "all 0.12s",
            }}>
              {Icon.bell}
              {/* Unread dot */}
              <div style={{
                position: "absolute", top: 6, right: 6,
                width: 7, height: 7, borderRadius: "50%",
                background: "#FF3355",
                boxShadow: "0 0 6px rgba(255,51,85,0.8)",
                border: "1.5px solid #0A0C14",
              }} />
            </button>
            {showAlerts && <AlertPanel onClose={() => setShowAlerts(false)} />}
          </div>

          {/* Theme toggle */}
          <button className="veriq-theme-toggle" onClick={() => setTheme(current => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-pressed={theme === "light"} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} style={{
            background: "rgba(0,212,255,0.05)", border: "1px solid #1C2235", color: "#7D8FA8",
            borderRadius: 5, padding: "7px 9px", cursor: "pointer", fontFamily: "Rajdhani, sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
          }}>{theme === "dark" ? "Light" : "Dark"}</button>

          {/* User avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #253047, #161B28)",
            border: "1px solid #253047", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#7D8FA8",
          }}>
            {Icon.user}
          </div>
        </header>

        {/* ─── PAGE CONTENT ─────────────────────────────────────────────── */}
        <main className="veriq-page-content" style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: (activeNav === "live" || activeNav === "alerts" || activeNav === "payment" || activeNav === "askvq") ? 0 : "24px 28px",
          display: "flex", flexDirection: "column",
        }}>
          {activeNav === "payment" ? <PaymentFlow /> :
           activeNav === "askvq" ? <AskVeriQ /> :
           activeNav === "history" ? <DashboardView /> :
           activeNav === "alerts" ? <FraudExplainer /> :
           <PaymentFlow />}
        </main>

      </div>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
function DashboardView() {
  const [demoHistory, setDemoHistory] = useState(getDemoHistory);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => subscribeToDemoHistory(() => setDemoHistory(getDemoHistory())), []);
  const current = demoHistory[0];

  function quickAction(kind: "block" | "review" | "audit") {
    if (!current) return;
    if (kind === "block") {
      updateDemoTransaction(current.id, { status: "fraud", decision: "BLOCKED" });
      setActionMessage("Current demo transaction blocked and marked for review.");
    } else if (kind === "review") {
      updateDemoTransaction(current.id, { status: "review", decision: "REVIEW" });
      setActionMessage("Current demo transaction queued for analyst review.");
    } else {
      setShowAudit(true);
      setActionMessage(`Audit trail opened for ${current.id}.`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="text-label-sm text-accent" style={{ marginBottom: 6 }}>DEMO SESSION</div>
          <h1 className="text-display-lg text-primary">Transaction History</h1>
          <p className="text-body-sm text-secondary" style={{ marginTop: 5 }}>
            Only payments you run in Demo Payment appear here. No seeded transactions, graphs, or fake activity.
          </p>
        </div>
        <span className="badge badge-neutral">{demoHistory.length ? `${demoHistory.length} DEMO EVENT${demoHistory.length === 1 ? "" : "S"}` : "EMPTY SESSION"}</span>
      </div>

      {!current ? (
        <div className="card" style={{ minHeight: 330, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 40 }}>
          <div style={{ maxWidth: 440 }}>
            <div style={{ width: 52, height: 52, margin: "0 auto 16px", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>{Icon.layers}</div>
            <div className="text-display-sm text-primary">Your demo history is empty</div>
            <p className="text-body-sm text-secondary" style={{ marginTop: 8 }}>Run a payment from Demo Payment. Its risk result and final action will appear here automatically.</p>
            <div className="text-body-xs text-muted" style={{ marginTop: 14 }}>No fake charts or background transactions are loaded.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #1C2235", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div><span className="text-display-sm text-primary">Your Demo Transactions</span><div className="text-body-xs text-muted" style={{ marginTop: 3 }}>Saved locally from Demo Payment</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className={`badge badge-${current.status === "fraud" ? "fraud" : current.status === "safe" ? "safe" : "review"}`}>{current.decision}</span><button className="btn btn-ghost btn-sm" onClick={() => { clearDemoHistory(); setActionMessage("Demo transaction history cleared."); }}>Clear History</button></div>
            </div>
            <table className="vq-table"><thead><tr><th>TXN ID</th><th>Amount</th><th>Receiver UPI</th><th>Time</th><th>Risk Score</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{demoHistory.map(tx => {
                const riskColor = tx.risk > 70 ? "#FF3355" : tx.risk > 40 ? "#F5A623" : "#00C27A";
                return <tr key={tx.id}>
                  <td><span className="text-mono-sm text-accent">{tx.id}</span></td>
                  <td><span className="text-mono-md text-primary">₹{tx.amount.toLocaleString("en-IN")}</span></td>
                  <td><span className="text-mono-sm text-secondary">{tx.upi}</span></td>
                  <td><span className="text-mono-sm text-muted">{tx.time}</span></td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="risk-bar-track" style={{ width: 70 }}><div className="risk-bar-fill" style={{ width: `${tx.risk}%`, background: riskColor }} /></div><span className="text-mono-sm" style={{ color: riskColor }}>{tx.risk}</span></div></td>
                  <td><span className={`badge badge-${tx.status === "fraud" ? "fraud" : tx.status === "safe" ? "safe" : "review"}`}>{tx.decision}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => { deleteDemoTransaction(tx.id); setActionMessage(`${tx.id} removed from history.`); }}>Delete</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(230px, .9fr)", gap: 12 }}>
            <div className="card" style={{ padding: 18, background: "linear-gradient(145deg, rgba(12,18,31,.98), rgba(7,10,18,.98))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}><div><div className="text-label-sm text-accent">RISK TELEMETRY</div><div className="text-body-xs text-muted" style={{ marginTop: 4 }}>Saved demo payments · newest to oldest</div></div><span className="badge badge-neutral">LIVE LOCAL DATA</span></div>
              <svg viewBox="0 0 520 150" preserveAspectRatio="none" style={{ width: "100%", height: 150, marginTop: 16, overflow: "visible" }} role="img" aria-label="Risk score trend chart">
                {[25, 50, 75, 100].map(y => <line key={y} x1="0" x2="520" y1={145 - y} y2={145 - y} stroke="rgba(125,143,168,.13)" strokeDasharray="3 7" />)}
                <defs><linearGradient id="riskGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#00D4FF" stopOpacity=".30" /><stop offset="1" stopColor="#00D4FF" stopOpacity="0" /></linearGradient></defs>
                {(() => { const points = demoHistory.slice().reverse().map((tx, i, arr) => `${arr.length === 1 ? 260 : (i / (arr.length - 1)) * 500 + 10},${145 - tx.risk}`); const line = points.join(" "); return <><polyline points={`10,145 ${line} 510,145`} fill="url(#riskGlow)" stroke="none" /><polyline points={line} fill="none" stroke="#00D4FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(0,212,255,.8))" }} />{demoHistory.slice().reverse().map((tx, i, arr) => { const x = arr.length === 1 ? 260 : (i / (arr.length - 1)) * 500 + 10; const y = 145 - tx.risk; return <circle key={tx.id} cx={x} cy={y} r="4" fill="#07101A" stroke={tx.risk > 70 ? "#FF3355" : tx.risk > 40 ? "#F5A623" : "#00C27A"} strokeWidth="2" />; })}</>; })()}
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="text-body-xs text-muted">LOW</span><span className="text-body-xs text-muted">HIGH</span></div>
            </div>
            <div className="card history-radar-card" style={{ padding: 18, background: "linear-gradient(145deg, rgba(12,18,31,.98), rgba(7,10,18,.98))" }}>
              <div className="text-label-sm text-accent">DECISION RADAR</div><div className="text-body-xs text-muted" style={{ marginTop: 4 }}>Outcome mix for this demo session</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18 }}><div style={{ width: 112, height: 112, borderRadius: "50%", background: `conic-gradient(#00C27A 0deg ${demoHistory.filter(tx => tx.decision === "APPROVED").length / demoHistory.length * 360}deg, #F5A623 ${demoHistory.filter(tx => tx.decision === "APPROVED").length / demoHistory.length * 360}deg ${(demoHistory.filter(tx => tx.decision !== "BLOCKED").length / demoHistory.length) * 360}deg, #FF3355 ${(demoHistory.filter(tx => tx.decision !== "BLOCKED").length / demoHistory.length) * 360}deg 360deg)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(0,212,255,.12)" }}><div className="history-radar-core" style={{ width: 78, height: 78, borderRadius: "50%", background: "#0B111D", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><span className="text-display-md text-primary">{demoHistory.length}</span><span className="text-label-sm text-muted">EVENTS</span></div></div><div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{[["APPROVED","#00C27A"],["REVIEW","#F5A623"],["BLOCKED","#FF3355"]].map(([label,color]) => <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} /><span className="text-body-xs text-secondary">{label}</span><span className="text-mono-sm text-primary">{demoHistory.filter(tx => tx.decision === label).length}</span></div>)}</div></div>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div className="text-label-sm text-muted" style={{ marginBottom: 10 }}>QUICK ACTIONS · {current.id}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-danger" onClick={() => quickAction("block")}>{Icon.zap} Block Current Transaction</button>
              <button className="btn btn-warn" onClick={() => quickAction("review")}>{Icon.activity} Send to Review</button>
              <button className="btn btn-ghost" onClick={() => quickAction("audit")}>{Icon.terminal} Open Audit Log</button>
            </div>
            {actionMessage && <div className="text-body-xs text-secondary" style={{ marginTop: 12 }}>{actionMessage}</div>}
          </div>
          {showAudit && <div className="card" style={{ padding: 18, borderLeft: "2px solid #00D4FF", background: "linear-gradient(135deg, rgba(0,212,255,.06), rgba(12,18,31,.98))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div className="text-label-sm text-accent">AUDIT LOG · {current.id}</div><button className="btn btn-ghost btn-sm" onClick={() => setShowAudit(false)}>Close</button></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>{[
              ["PAYMENT_CAPTURED", `₹${current.amount.toLocaleString("en-IN")} → ${current.upi}`],
              ["RISK_ASSESSMENT", `${current.risk}/100 · ${current.decision}`],
              ["PERSISTENCE", "Saved to local demo history"],
              ["LAST_ACTION", current.decision === "BLOCKED" ? "Transaction blocked" : current.decision === "REVIEW" ? "Queued for analyst review" : "Payment approved"],
            ].map(([event, detail]) => <div key={event} style={{ display: "flex", gap: 14, padding: "9px 0", borderBottom: "1px solid rgba(28,34,53,.7)" }}><span className="text-mono-sm text-accent" style={{ minWidth: 150 }}>{event}</span><span className="text-body-xs text-secondary">{detail}</span></div>)}</div>
          </div>}
        </>
      )}
    </div>
  );
}
