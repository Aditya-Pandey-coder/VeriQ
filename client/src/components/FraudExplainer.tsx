import { useState } from "react";

type Alert = { source: string; date: string; title: string; summary: string; url: string; tone: "critical" | "high" | "medium" };
const ALERTS: Alert[] = [
  { source: "CERT-In · Government of India", date: "17 Mar 2026", title: "Fake e-Challan APK campaign", summary: "Fraudulent RTO messages push malicious APKs that request SMS, phone, VPN, and background permissions, enabling OTP theft and unauthorised transactions.", url: "https://www.cert-in.org.in/s2cMainServlet?pageid=PUBADV01&CACODE=CICA-2026-3492", tone: "critical" },
  { source: "Reserve Bank of India", date: "9 Apr 2026", title: "RBI flags APP fraud and impersonation", summary: "RBI highlights social engineering, deepfake impersonation, bogus call centres, and mule-account networks around instant payments including UPI.", url: "https://www.rbi.org.in/Scripts/PublicationsView.aspx?id=23810", tone: "high" },
  { source: "The Hindu · Coimbatore", date: "2 Mar 2026", title: "Police warn about UPI spoofing", summary: "A reported case involved a fraudulent app used to deceive merchants, reinforcing the need to verify payment status in the merchant’s own bank app.", url: "https://www.thehindu.com/news/cities/Coimbatore/merchants-public-warned-of-upi-spoofing-after-college-students-caught-in-act-in-coimbatore/article70696299.ece", tone: "high" },
  { source: "NPCI official guidance", date: "Current", title: "Protect your UPI PIN and collect requests", summary: "NPCI says the UPI PIN authorises transactions and support will never ask for it. Review pending collect requests and block illicit senders.", url: "https://www.npci.org.in/fraud-awareness", tone: "medium" },
];

const HANDLES = [
  { handle: "govt.refund@upi", tag: "Fake government refund", risk: "Impersonation" },
  { handle: "helpdesk.sbi@upi", tag: "Fake KYC / bank helpdesk", risk: "Vishing" },
  { handle: "quickloan99@upi", tag: "Fake loan processing fee", risk: "Advance fee" },
  { handle: "unknown2024@paytm", tag: "Unknown payee pattern", risk: "Unverified" },
];
const PATTERNS = [
  ["Impersonation", "Bank / government / refund pressure", "#FF3355"],
  ["Remote access", "APK, screen-share, OTP or PIN theft", "#F5A623"],
  ["Mule routing", "Fast splits across linked accounts", "#A78BFA"],
  ["Advance fee", "Loan, prize, refund or KYC payment demand", "#00D4FF"],
] as const;

export default function FraudExplainer() {
  const [selected, setSelected] = useState(0);
  const alert = ALERTS[selected];
  return <div style={{ flex: 1, overflowY: "auto", padding: "28px", display: "flex", flexDirection: "column", gap: 22 }}>
    <div><div className="text-label-sm text-accent">INDIA FRAUD INTELLIGENCE · LIVE READING ROOM</div><h1 className="text-display-lg text-primary" style={{ marginTop: 5 }}>Fraud Alerts</h1><p className="text-body-sm text-secondary" style={{ marginTop: 6, maxWidth: 800 }}>Track current India-focused reporting, inspect scam-style UPI patterns, and learn the signals before you pay.</p></div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, .85fr)", gap: 16, alignItems: "start" }}>
      <section className="card" style={{ padding: 18 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div className="text-label-sm text-accent">ONGOING INDIA NEWS</div><span className="badge badge-fraud">{ALERTS.length} BRIEFS</span></div><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{ALERTS.map((item, index) => <button key={item.title} onClick={() => setSelected(index)} style={{ textAlign: "left", border: `1px solid ${index === selected ? "rgba(0,212,255,.45)" : "#1C2235"}`, background: index === selected ? "rgba(0,212,255,.06)" : "rgba(255,255,255,.015)", borderRadius: 8, padding: "14px 15px", color: "inherit", cursor: "pointer", transition: "all .18s" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span className={`badge badge-${item.tone === "critical" ? "fraud" : item.tone === "high" ? "warn" : "review"}`}>{item.tone}</span><span className="text-body-xs text-muted">{item.date}</span></div><div className="text-body-sm text-primary" style={{ fontWeight: 600, marginTop: 9 }}>{item.title}</div><div className="text-body-xs text-muted" style={{ marginTop: 5 }}>{item.source}</div></button>)}</div></section>
      <section className="card" style={{ padding: 20, background: "linear-gradient(145deg, rgba(14,22,37,.98), rgba(7,10,18,.98))" }}><div className="text-label-sm text-accent">SELECTED INTELLIGENCE</div><div className="text-display-sm text-primary" style={{ marginTop: 12 }}>{alert.title}</div><div className="text-body-xs text-muted" style={{ marginTop: 5 }}>{alert.source} · {alert.date}</div><p className="text-body-sm text-secondary" style={{ marginTop: 15, lineHeight: 1.7 }}>{alert.summary}</p><a href={alert.url} target="_blank" rel="noreferrer" className="text-body-xs text-accent" style={{ display: "inline-block", marginTop: 16 }}>Open source report ↗</a><div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #1C2235" }}><div className="text-label-sm text-muted">WHAT TO DO</div><div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{["Do not share UPI PIN or OTP", "Verify the recipient inside your bank app", "Report financial fraud at 1930 quickly"].map((tip, i) => <div key={tip} className="text-body-xs text-secondary"><span className="text-accent">0{i + 1}</span> · {tip}</div>)}</div></div></section>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <section className="card" style={{ padding: 20 }}><div className="text-label-sm text-accent">SCAM-STYLE UPI HANDLES</div><div className="text-body-xs text-muted" style={{ marginTop: 5 }}>Illustrative names used to train detection patterns—not a verified blacklist.</div><div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 15 }}>{HANDLES.map(item => <div key={item.handle} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "11px 12px", borderRadius: 7, background: "rgba(255,51,85,.045)", border: "1px solid rgba(255,51,85,.15)" }}><div><div className="text-mono-sm text-fraud">{item.handle}</div><div className="text-body-xs text-muted" style={{ marginTop: 3 }}>{item.tag}</div></div><span className="badge badge-fraud">{item.risk}</span></div>)}</div></section>
      <section className="card" style={{ padding: 20 }}><div className="text-label-sm text-accent">SCAM VECTOR RADAR</div><div className="text-body-xs text-muted" style={{ marginTop: 5 }}>Relative signal emphasis from the researched alerts above.</div><div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 18 }}>{PATTERNS.map(([label, detail, color], i) => <div key={label}><div style={{ display: "flex", justifyContent: "space-between" }}><span className="text-body-sm text-primary">{label}</span><span className="text-mono-sm" style={{ color }}>0{i + 1}</span></div><div className="text-body-xs text-secondary" style={{ margin: "4px 0 7px" }}>{detail}</div><div className="risk-bar-track" style={{ background: "rgba(125,143,168,.08)" }}><div className="risk-bar-fill" style={{ width: `${[92,78,66,58][i]}%`, background: `linear-gradient(90deg, ${color}, transparent)` }} /></div></div>)}</div></section>
    </div>
    <div className="text-body-xs text-muted">Safety note: a UPI handle alone does not prove fraud. Verify the full context and report suspected financial fraud through official channels.</div>
  </div>;
}
