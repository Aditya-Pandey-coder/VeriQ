import { useState, useEffect, useCallback, useRef } from "react";
import { appendDemoTransaction } from "../transactionStore";

type Stage = "input" | "scanning" | "result" | "verify" | "cancel" | "continue";

interface Signal {
  title: string;
  message: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  contribution: number;
  code?: string;
  source?: string;
  evidenceStatus?: string;
  confidence?: number;
  isSynthetic?: boolean;
}
interface RiskResult {
  score: number;
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  decision: "ALLOW" | "STEP_UP" | "HOLD" | "BLOCK" | "UNKNOWN";
  signals: Signal[];
  explanation: string;
  backendTransactionId?: string;
  evidenceMode?: "SYNTHETIC_DEMO" | "LIVE_ENRICHED" | "UNAVAILABLE";
  evidenceQuality?: string;
  evidenceNote?: string;
  qualification?: string;
  sourcesChecked?: string[];
  amountContext?: {
    amountInr?: number;
    outsideRange?: boolean;
    percentileForUser?: number;
    multipleOfRecipientMedian?: number | null;
    sampleSize?: number;
    evidenceStatus?: string;
  };
  recipientContext?: {
    verifiedName?: string | null;
    vpaStatus?: string;
    displayNameStatus?: string;
    handleStatus?: string;
    handleProvesIdentity?: boolean;
    evidenceStatus?: string;
  };
  verificationSession?: {
    verificationRequired?: boolean;
    requiredActions?: string[];
    coolingOffRequired?: boolean;
    coolingOffSeconds?: number;
    sessionExpiry?: string;
    testPaymentAllowed?: boolean;
  } | null;
}

// ─── Demo presets ───────────────────────────────────────────────────────────────
// Presets only fill the form. The backend owns identity, amount, time, history,
// reputation, velocity, and final risk decisions.
const DEMOS = [
  {
    upi: "quickloan99@upi",
    label: "Quick Loan Co.",
    defaultAmount: "48,500",
    risk: "HIGH" as const,
    featured: true,
  },
  {
    upi: "unknown2024@paytm",
    label: "Unknown Payee",
    defaultAmount: "12,000",
    risk: "MEDIUM" as const,
    featured: false,
  },
  {
    upi: "swiggy@icici",
    label: "Swiggy · ICICI Bank",
    defaultAmount: "320",
    risk: "SAFE" as const,
    featured: false,
  },
];

const PAYMENT_PURPOSES = [
  ["purchase", "Purchase or service"],
  ["bill", "Bill or subscription"],
  ["transfer", "Rent or personal transfer"],
  ["refund", "Refund"],
  ["kyc", "KYC or account issue"],
  ["loan", "Loan or investment"],
  ["job", "Job or task"],
  ["government", "Government or legal payment"],
  ["other", "Other"],
  ["unsure", "I’m not sure"],
] as const;

const PURPOSE_GUIDANCE: Record<string, string> = {
  refund:
    "You should not have to pay money to receive a refund. Verify through the company’s official app or website.",
  kyc: "Do not use a link or phone number sent by the requester. Contact your bank through its official app.",
  loan: "Advance processing fees are a common scam pattern. Verify the lender independently before paying.",
  job: "Be cautious of deposits or activation fees for jobs and task platforms.",
  government:
    "Do not make an urgent police, tax, court, or customs payment based only on a message or call.",
  unsure:
    "If you are unsure why you are paying, pause and verify the recipient independently before continuing.",
};

// Only used when the backend is unavailable. It intentionally does not claim
// recipient reputation, complaint counts, identity, or a nominal amount range.
function offlineSafetyFallback(upi: string, amountText: string): RiskResult {
  const amount = Number(amountText.replace(/[^0-9.]/g, "")) || 0;
  const extreme = amount >= 50000;
  return {
    score: extreme ? 90 : 50,
    level: extreme ? "CRITICAL" : "MEDIUM",
    decision: "UNKNOWN",
    explanation: extreme
      ? "The live risk service is unavailable and this amount is unusually large. Do not confirm until the recipient and amount are independently verified."
      : "The live risk service is unavailable. Verify the recipient and amount before confirming.",
    evidenceMode: "UNAVAILABLE",
    evidenceNote:
      "RISK ASSESSMENT UNAVAILABLE. This is a conservative client-side fail-safe, not a fraud verdict. VeriQ cannot confirm this payment is safe while the backend is unavailable.",
    signals: [
      {
        title: extreme
          ? "Extreme amount requires verification"
          : "Live assessment unavailable",
        message: extreme
          ? `₹${amount.toLocaleString("en-IN")} needs backend verification for ${upi}.`
          : "This screen is a fail-safe, not a recipient reputation result.",
        severity: extreme ? "HIGH" : "MEDIUM",
        contribution: extreme ? 40 : 0,
      },
    ],
  };
}

// IST timestamp
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

const RISK_API_URL =
  import.meta.env.VITE_VERIQ_RISK_API_URL ||
  "https://veriq-backend-56ex.onrender.com/api/v1/risk/check";
const VERIQ_USER_ID = import.meta.env.VITE_VERIQ_USER_ID || "user_001";

type ApiRiskResponse = {
  transaction_id: string;
  risk_score: number;
  risk_level: string;
  decision?: "ALLOW" | "STEP_UP" | "HOLD" | "BLOCK" | string;
  recommended_action?: string;
  signals?: Array<{
    code?: string;
    severity?: string;
    contribution?: number;
    title: string;
    message: string;
    source?: string;
    evidence_status?: string;
    confidence?: number;
    is_synthetic?: boolean;
  }>;
  explanation?: string;
  model_version?: string;
  assessed_at?: string;
  qualification?: string;
  evidence_quality?: string;
  sources_checked?: string[];
  can_continue?: boolean;
  requires_confirmation?: boolean;
  cooling_off_seconds?: number;
  recipient?: {
    verified_name?: string | null;
    vpa_status?: string;
    display_name_status?: string;
    handle_status?: string;
    handle_proves_identity?: boolean;
    evidence_status?: string;
  };
  amount_context?: {
    amount_inr?: number;
    outside_range?: boolean;
    percentile_for_user?: number;
    multiple_of_recipient_median?: number | null;
    sample_size?: number;
    evidence_status?: string;
  };
  verification_session?: {
    verification_required?: boolean;
    required_actions?: string[];
    cooling_off_required?: boolean;
    cooling_off_seconds?: number;
    session_expiry?: string;
    test_payment_allowed?: boolean;
  } | null;
};

async function requestRiskCheck(
  upi: string,
  amount: string,
  note = "",
  purpose = ""
): Promise<RiskResult | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  const clientTimestamp = new Date().toISOString();
  try {
    const response = await fetch(RISK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: VERIQ_USER_ID,
        recipient: upi,
        amount: Number(amount.replace(/[^0-9.]/g, "")) || 0,
        currency: "INR",
        channel: "UPI",
        note: `${note.trim() || "User-entered payment"}${purpose ? ` | purpose=${purpose}` : ""}`,
        timestamp: clientTimestamp,
        device_changed: false,
        client_context: {
          session_id: `veriq-${VERIQ_USER_ID}`,
          device_id: "veriq-web-demo",
          app_version: "frontend-live-backend",
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as ApiRiskResponse;
    if (!data || typeof data.risk_score !== "number" || !data.risk_level)
      return null;
    const normalizedLevel = data.risk_level.toUpperCase();
    const level =
      normalizedLevel === "CRITICAL"
        ? "CRITICAL"
        : normalizedLevel === "HIGH"
          ? "HIGH"
          : normalizedLevel === "MEDIUM"
            ? "MEDIUM"
            : "LOW";
    const evidenceQuality = data.evidence_quality || "UNAVAILABLE";
    const evidenceMode =
      evidenceQuality === "SYNTHETIC_DEMO"
        ? "SYNTHETIC_DEMO"
        : evidenceQuality === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : "LIVE_ENRICHED";
    const syntheticPrefix =
      evidenceMode === "SYNTHETIC_DEMO" ? "Synthetic demo fixture: " : "";
    return {
      score: Math.min(100, Math.max(0, Math.round(data.risk_score))),
      level,
      decision:
        data.decision === "ALLOW" ||
        data.decision === "STEP_UP" ||
        data.decision === "HOLD" ||
        data.decision === "BLOCK"
          ? data.decision
          : "UNKNOWN",
      backendTransactionId: data.transaction_id,
      explanation:
        data.explanation ||
        "VeriQ completed the risk assessment for this payment.",
      evidenceMode,
      evidenceQuality,
      qualification: data.qualification,
      sourcesChecked: data.sources_checked,
      evidenceNote:
        data.qualification ||
        (evidenceMode === "SYNTHETIC_DEMO"
          ? "Synthetic demo profile: these signals demonstrate the scoring pipeline and are not a claim about a real person, device, or recipient."
          : "Signals returned by the connected backend using its available authorized enrichment sources."),
      signals: (data.signals || []).map(signal => ({
        title:
          evidenceMode === "SYNTHETIC_DEMO"
            ? `Demo · ${signal.title}`
            : signal.title,
        message: `${syntheticPrefix}${signal.message}`,
        severity:
          signal.severity?.toUpperCase() === "HIGH"
            ? "HIGH"
            : signal.severity?.toUpperCase() === "MEDIUM"
              ? "MEDIUM"
              : "LOW",
        contribution:
          typeof signal.contribution === "number" ? signal.contribution : 0,
        code: signal.code,
        source: signal.source,
        evidenceStatus: signal.evidence_status,
        confidence: signal.confidence,
        isSynthetic: signal.is_synthetic,
      })),
      amountContext: data.amount_context && {
        amountInr: data.amount_context.amount_inr,
        outsideRange: data.amount_context.outside_range,
        percentileForUser: data.amount_context.percentile_for_user,
        multipleOfRecipientMedian:
          data.amount_context.multiple_of_recipient_median,
        sampleSize: data.amount_context.sample_size,
        evidenceStatus: data.amount_context.evidence_status,
      },
      recipientContext: data.recipient && {
        verifiedName: data.recipient.verified_name,
        vpaStatus: data.recipient.vpa_status,
        displayNameStatus: data.recipient.display_name_status,
        handleStatus: data.recipient.handle_status,
        handleProvesIdentity: data.recipient.handle_proves_identity,
        evidenceStatus: data.recipient.evidence_status,
      },
      verificationSession: data.verification_session && {
        verificationRequired: data.verification_session.verification_required,
        requiredActions: data.verification_session.required_actions,
        coolingOffRequired: data.verification_session.cooling_off_required,
        coolingOffSeconds: data.verification_session.cooling_off_seconds,
        sessionExpiry: data.verification_session.session_expiry,
        testPaymentAllowed: data.verification_session.test_payment_allowed,
      },
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function postRiskEvent(
  transactionId: string | undefined,
  eventType: "ACKNOWLEDGED" | "CONTINUED" | "CANCELLED"
) {
  if (!transactionId) return;
  try {
    await fetch(RISK_API_URL.replace("/risk/check", "/risk/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: transactionId,
        event_type: eventType,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    /* event logging must never block the safety flow */
  }
}

async function createIncident(
  transactionId: string | undefined,
  statement: string
) {
  if (!transactionId) return null;
  try {
    const response = await fetch(
      RISK_API_URL.replace("/risk/check", "/incidents"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: transactionId,
          incident_type: "SCAM_SUSPECTED",
          statement,
        }),
      }
    );
    return response.ok
      ? ((await response.json()) as { incident_id?: string; status?: string })
      : null;
  } catch {
    return null;
  }
}

const SCAN_STEPS = [
  "Checking UPI ID reputation…",
  "Analyzing transaction context…",
  "Scanning behavioral signals…",
  "Querying complaint registry…",
  "Running AI risk model…",
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const riskColor = (level: string) =>
  level === "CRITICAL" || level === "HIGH"
    ? "#FF3355"
    : level === "MEDIUM"
      ? "#F5A623"
      : "#00C27A";

const riskBg = (level: string) =>
  level === "CRITICAL" || level === "HIGH"
    ? "rgba(255,51,85,0.08)"
    : level === "MEDIUM"
      ? "rgba(245,166,35,0.08)"
      : "rgba(0,194,122,0.08)";

const isHighRisk = (result: RiskResult) =>
  result.level === "CRITICAL" ||
  result.level === "HIGH" ||
  result.decision === "BLOCK";
const decisionLabel = (result: RiskResult) =>
  result.level === "CRITICAL"
    ? `CRITICAL / ${result.decision}`
    : result.level === "HIGH"
      ? `${result.level} / ${result.decision}`
      : result.level === "MEDIUM"
        ? "MEDIUM RISK"
        : evidenceLabel(result);

function evidenceLabel(result: RiskResult) {
  if (result.evidenceMode === "SYNTHETIC_DEMO") return "SYNTHETIC DEMO RESULT";
  if (result.evidenceMode === "UNAVAILABLE") return "INSUFFICIENT EVIDENCE";
  if (result.level === "CRITICAL") return "CRITICAL / BLOCK";
  if (result.level === "HIGH") return "STRONG SUSPICION";
  if (result.level === "MEDIUM") return "REVIEW NEEDED";
  return "NO KNOWN WARNING";
}

function nextAction(result: RiskResult) {
  if (result.evidenceMode === "UNAVAILABLE")
    return "Pause. Do not confirm until the live risk assessment is available or you independently verify the recipient.";
  if (result.decision === "BLOCK" || result.level === "CRITICAL")
    return "Do not pay. Verify the recipient through an independent official channel.";
  if (result.level === "HIGH")
    return "Pause and verify the recipient and payment purpose before continuing.";
  if (result.level === "MEDIUM")
    return "Review the evidence, re-confirm the payment reason, and verify the recipient before proceeding.";
  return "No matching warning was found in the sources checked. This does not prove the recipient is legitimate.";
}

function useCountUp(target: number, active: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now() + 400;
    const dur = 1100;
    function tick(now: number) {
      if (now < start) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min((now - start) / dur, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return v;
}

// ─── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({
  score,
  level,
  animate,
}: {
  score: number;
  level: string;
  animate: boolean;
}) {
  const displayed = useCountUp(score, animate);
  const color = riskColor(
    level === "HIGH" && displayed < 70
      ? "MEDIUM"
      : displayed >= 70
        ? "HIGH"
        : displayed >= 40
          ? "MEDIUM"
          : "LOW"
  );
  // The ring is intentionally inset: every stroke remains inside this 140px canvas.
  const S = 140,
    cx = 70,
    cy = 70,
    R = 48;
  const circumference = 2 * Math.PI * R;
  const trackArc = circumference * 0.75;
  const valueArc = (trackArc * Math.min(Math.max(displayed, 0), 100)) / 100;

  return (
    <div
      style={{
        position: "relative",
        width: S,
        height: S,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <svg
        width={S}
        height={S}
        viewBox={`0 0 ${S} ${S}`}
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke="#1C2235"
          strokeWidth="6"
          strokeDasharray={`${trackArc} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-135,${cx},${cy})`}
        />
        {displayed > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="12"
            opacity="0.15"
            strokeDasharray={`${valueArc} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-135,${cx},${cy})`}
          />
        )}
        {displayed > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={`${valueArc} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-135,${cx},${cy})`}
            style={{ transition: "stroke 0.3s" }}
          />
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 10,
        }}
      >
        <div
          className="font-display"
          style={{
            fontSize: 36,
            fontWeight: 700,
            color,
            lineHeight: 1,
            transition: "color 0.3s",
          }}
        >
          {displayed}
        </div>
        <div className="text-label-sm text-muted" style={{ marginTop: 2 }}>
          RISK SCORE
        </div>
      </div>
    </div>
  );
}

// ─── Stage: Input ──────────────────────────────────────────────────────────────
function StageInput({
  onPay,
}: {
  onPay: (upi: string, amount: string, note: string, purpose: string) => void;
}) {
  const [upi, setUpi] = useState("");
  const [amount, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [purpose, setPurpose] = useState("");
  const [focused, setFoc] = useState("");
  const canPay = upi.trim() && amount.trim();

  function selectDemo(d: (typeof DEMOS)[0]) {
    setUpi(d.upi);
    setAmt(d.defaultAmount);
  }

  const fieldStyle = (f: string) => ({
    width: "100%",
    padding: "13px 16px",
    background: "#0C0F18",
    border: `1px solid ${focused === f ? "rgba(0,212,255,0.4)" : "#1C2235"}`,
    borderRadius: 6,
    color: "#E4EAF4",
    fontFamily: "Inter, sans-serif",
    fontSize: 15,
    outline: "none",
    boxShadow: focused === f ? "0 0 0 3px rgba(0,212,255,0.07)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  });

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "18px 32px 32px",
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Headline */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            className="text-label-sm text-accent"
            style={{ marginBottom: 8 }}
          >
            UPI PAYMENT
          </div>
          <div className="text-display-md text-primary">Send Money</div>
          <div className="text-body-sm text-secondary" style={{ marginTop: 6 }}>
            VeriQ checks for fraud before you confirm.
          </div>
        </div>

        {/* Demo picks */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div className="text-label-sm text-muted">QUICK DEMO</div>
            <div className="text-label-sm text-accent" style={{ fontSize: 9 }}>
              ONE-CLICK PRESETS
            </div>
          </div>
          {DEMOS.map(d => (
            <button
              key={d.upi}
              className={`quick-demo-option${upi === d.upi ? " is-selected" : ""}`}
              aria-label={`Use ${d.label} demo scenario`}
              title={`Use ${d.label} demo scenario`}
              onClick={() => selectDemo(d)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                background: upi === d.upi ? riskBg(d.risk) : "#0C0F18",
                border: `1px solid ${upi === d.upi ? riskColor(d.risk) + "40" : "#1C2235"}`,
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div
                  className="text-body-sm text-primary"
                  style={{ fontWeight: 500 }}
                >
                  {d.label}
                </div>
                <div className="text-mono-sm text-muted">{d.upi}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {d.featured && (
                  <span
                    className="badge badge-review"
                    style={{ fontSize: 8, padding: "2px 5px" }}
                  >
                    BEST DEMO
                  </span>
                )}
                <span
                  className={`badge badge-${d.risk === "HIGH" ? "fraud" : d.risk === "MEDIUM" ? "warn" : "safe"}`}
                >
                  {d.risk}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Fields */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div>
            <label
              className="text-label-sm text-muted"
              style={{ display: "block", marginBottom: 6 }}
            >
              To
            </label>
            <input
              style={fieldStyle("upi")}
              value={upi}
              onChange={e => setUpi(e.target.value)}
              onFocus={() => setFoc("upi")}
              onBlur={() => setFoc("")}
              placeholder="UPI ID or phone@bank"
            />
          </div>
          <div>
            <label
              className="text-label-sm text-muted"
              style={{ display: "block", marginBottom: 6 }}
            >
              Amount (₹)
            </label>
            <input
              style={fieldStyle("amt")}
              value={amount}
              onChange={e => setAmt(e.target.value)}
              onFocus={() => setFoc("amt")}
              onBlur={() => setFoc("")}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
          <div>
            <label
              className="text-label-sm text-muted"
              style={{ display: "block", marginBottom: 6 }}
            >
              Note{" "}
              <span
                style={{
                  color: "#7D8FA8",
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                (optional)
              </span>
            </label>
            <input
              style={fieldStyle("note")}
              value={note}
              onChange={e => setNote(e.target.value)}
              onFocus={() => setFoc("note")}
              onBlur={() => setFoc("")}
              placeholder="What is this payment for?"
              maxLength={80}
            />
          </div>
          <div>
            <label
              className="text-label-sm text-muted"
              style={{ display: "block", marginBottom: 6 }}
            >
              Why are you paying?
            </label>
            <select
              className="payment-purpose-select"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              aria-label="Why are you paying?"
            >
              <option value="">Select a purpose (optional)</option>
              {PAYMENT_PURPOSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="purpose-privacy-note">
              Only share the payment reason you are comfortable sending for risk
              screening. Do not paste private chats, OTPs, or PINs.
            </div>
          </div>
        </div>

        {purpose && PURPOSE_GUIDANCE[purpose] && (
          <div className="purpose-guidance" role="note">
            <strong>Before you pay</strong>
            <span>{PURPOSE_GUIDANCE[purpose]}</span>
          </div>
        )}

        {/* PAY */}
        <button
          onClick={() => {
            onPay(upi, amount, note, purpose);
          }}
          disabled={!canPay}
          style={{
            width: "100%",
            padding: "15px",
            background: canPay ? "#00D4FF" : "#111520",
            border: `1px solid ${canPay ? "#00D4FF" : "#1C2235"}`,
            borderRadius: 6,
            cursor: canPay ? "pointer" : "not-allowed",
            fontFamily: "Rajdhani, sans-serif",
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: 2,
            textTransform: "uppercase" as const,
            color: canPay ? "#07090E" : "#3E4D62",
            boxShadow: canPay ? "0 0 24px rgba(0,212,255,0.22)" : "none",
            transition: "all 0.2s",
          }}
        >
          Pay
        </button>

        <div
          className="text-body-xs text-muted"
          style={{ textAlign: "center", marginTop: 10, lineHeight: 1.6 }}
        >
          Prototype — no real money moves. In production, payment and device
          data should be processed only with consent and appropriate safeguards.
        </div>
      </div>
    </div>
  );
}

// ─── Stage: Scanning ───────────────────────────────────────────────────────────
function StageScanning({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let s = 0;
    const iv = setInterval(() => {
      s++;
      setStep(s);
      if (s >= SCAN_STEPS.length) {
        clearInterval(iv);
        setTimeout(() => onDoneRef.current(), 500);
      }
    }, 340);
    return () => clearInterval(iv);
  }, []); // stable — uses ref internally

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        padding: 32,
      }}
    >
      {/* Radar */}
      <div style={{ position: "relative", width: 120, height: 120 }}>
        {[120, 88, 56].map((s, i) => (
          <div
            key={s}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: s,
              height: s,
              borderRadius: "50%",
              border: `1px solid rgba(0,212,255,${0.08 + i * 0.06})`,
              transform: "translate(-50%,-50%)",
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 60,
            height: 60,
            borderRadius: "50% 0 0 50%",
            background:
              "conic-gradient(from 0deg, transparent, rgba(0,212,255,0.16) 65deg, transparent)",
            transformOrigin: "0 0",
            animation: "radar-sweep 1.1s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#00D4FF",
            boxShadow: "0 0 14px rgba(0,212,255,0.9)",
          }}
        />
      </div>

      {/* Steps */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          width: "100%",
          maxWidth: 340,
        }}
      >
        {SCAN_STEPS.map((s, i) => {
          const done = i < step - 1;
          const active = i === step - 1;
          return (
            <div
              key={i}
              className={active ? "scan-step-active" : ""}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                borderRadius: 6,
                background: active ? "rgba(0,212,255,0.05)" : "transparent",
                border: `1px solid ${active ? "rgba(0,212,255,0.18)" : "transparent"}`,
                opacity: i >= step ? 0.3 : 1,
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: done
                    ? "#00C27A"
                    : active
                      ? "transparent"
                      : "#1C2235",
                  border: `1.5px solid ${done ? "#00C27A" : active ? "#00D4FF" : "#253047"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done && (
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <path
                      d="M1.5 4L3 5.5L6.5 2"
                      stroke="#07090E"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span
                className="text-body-sm"
                style={{
                  color: active ? "#E4EAF4" : done ? "#7D8FA8" : "#3E4D62",
                  transition: "color 0.2s",
                }}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stage: Result ─────────────────────────────────────────────────────────────
function StageResult({
  result,
  upi,
  amount,
  onVerify,
  onCancel,
  onContinue,
  onAcknowledge,
}: {
  result: RiskResult;
  upi: string;
  amount: string;
  onVerify: () => void;
  onCancel: () => void;
  onContinue: () => void;
  onAcknowledge: () => void;
}) {
  const [signalsShown, setSignalsShown] = useState(0);
  const [explainShown, setExplainShown] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [continueAcknowledged, setContinueAcknowledged] = useState(false);
  const color = riskColor(result.level);

  useEffect(() => {
    result.signals.forEach((_, i) =>
      setTimeout(() => setSignalsShown(i + 1), 1600 + i * 260)
    );
    setTimeout(
      () => setExplainShown(true),
      1600 + result.signals.length * 260 + 100
    );
  }, [result]);

  return (
    /* Single scrollable column — ring is in the normal flow, never clipped by a parent */
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* ── Hero band ── */}
      <div
        className="veriq-decision-hero"
        style={{
          background: riskBg(result.level),
          borderBottom: `1px solid ${color}25`,
          padding: "28px 32px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 28,
          alignItems: "start",
        }}
      >
        {/* Score ring — in normal flow, scrolls with content */}
        <ScoreRing score={result.score} level={result.level} animate />

        {/* Title + meta */}
        <div>
          {isHighRisk(result) && (
            <div className="risk-stop-banner" role="alert">
              <strong>
                {result.level === "CRITICAL" || result.decision === "BLOCK"
                  ? "CRITICAL / BLOCK — do not pay this recipient."
                  : "Do not pay this recipient yet."}
              </strong>
              <span>
                VeriQ found multiple warning signals. Cancel and verify the
                recipient before sending money.
              </span>
            </div>
          )}
          <div
            className={`badge badge-${isHighRisk(result) ? "fraud" : result.level === "MEDIUM" ? "warn" : "safe"}`}
            style={{
              marginBottom: 10,
              fontSize: 11,
              padding: "4px 10px",
              display: "inline-flex",
            }}
          >
            {decisionLabel(result)}
          </div>
          <div className="text-display-md text-primary">
            {isHighRisk(result)
              ? "Payment stopped."
              : result.level === "MEDIUM"
                ? "Worth checking."
                : "Looks good."}
          </div>
          <div className="text-body-sm text-secondary" style={{ marginTop: 6 }}>
            ₹{amount} → {upi}
          </div>
          {explainShown && (
            <div
              className="text-body-sm text-secondary"
              style={{
                marginTop: 10,
                lineHeight: 1.65,
                maxWidth: 420,
                animation: "fadeIn 0.4s ease",
              }}
            >
              {result.explanation}
            </div>
          )}
          {result.evidenceNote && (
            <div
              className="evidence-disclosure"
              style={{ marginTop: 10, maxWidth: 420 }}
            >
              <strong>
                {result.evidenceMode === "SYNTHETIC_DEMO"
                  ? "DEMO EVIDENCE"
                  : result.evidenceMode === "LIVE_ENRICHED"
                    ? "LIVE BACKEND EVIDENCE"
                    : "OFFLINE SAFETY MODE"}
              </strong>
              <span>{result.evidenceNote}</span>
            </div>
          )}
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: "10px 12px",
              background:
                isHighRisk(result) || result.evidenceMode === "UNAVAILABLE"
                  ? "rgba(255,51,85,0.07)"
                  : "rgba(0,212,255,0.05)",
              border: `1px solid ${isHighRisk(result) || result.evidenceMode === "UNAVAILABLE" ? "rgba(255,51,85,0.25)" : "rgba(0,212,255,0.18)"}`,
              borderRadius: 6,
              maxWidth: 420,
            }}
          >
            <div
              className="text-label-sm text-muted"
              style={{ marginBottom: 4 }}
            >
              WHAT TO DO NOW
            </div>
            <div
              className="text-body-sm text-primary"
              style={{ lineHeight: 1.55 }}
            >
              {nextAction(result)}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 180,
          }}
        >
          {result.level !== "LOW" ? (
            <button
              className="btn btn-primary"
              onClick={onVerify}
              style={{ justifyContent: "center" }}
            >
              Verify Recipient
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={onContinue}
              style={{
                justifyContent: "center",
                background: "#00C27A",
                borderColor: "#00C27A",
              }}
            >
              Proceed
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => setAskOpen(v => !v)}
            style={{ justifyContent: "center" }}
          >
            {askOpen ? "Close" : "Ask VeriQ"}
          </button>
          <button
            className={
              isHighRisk(result) ? "btn btn-danger" : "btn btn-ghost btn-sm"
            }
            onClick={onCancel}
            style={{
              justifyContent: "center",
              fontWeight: isHighRisk(result) ? 700 : 400,
            }}
          >
            {isHighRisk(result) ? "Cancel & stay protected" : "Cancel payment"}
          </button>
          {isHighRisk(result) && (
            <>
              <label className="risk-continue-check">
                <input
                  type="checkbox"
                  checked={continueAcknowledged}
                  onChange={e => {
                    setContinueAcknowledged(e.target.checked);
                    if (e.target.checked) onAcknowledge();
                  }}
                />
                <span>
                  I understand the warnings and still want to continue.
                </span>
              </label>
              <button
                onClick={() => continueAcknowledged && onContinue()}
                disabled={!continueAcknowledged}
                className="risk-continue-button"
              >
                Continue anyway
              </button>
            </>
          )}
        </div>
      </div>

      {/* Ask VeriQ */}
      {askOpen && <AskPanel onClose={() => setAskOpen(false)} />}

      <TrustWorkspace result={result} />

      {/* Evidence */}
      <div style={{ padding: "20px 32px" }}>
        <div className="text-label-sm text-muted" style={{ marginBottom: 12 }}>
          {result.signals.length} SIGNALS DETECTED
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {result.signals.map((sig, i) => {
            const c = riskColor(sig.severity);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "12px 16px",
                  background: `${c}07`,
                  border: `1px solid ${c}20`,
                  borderLeft: `3px solid ${c}`,
                  borderRadius: "0 6px 6px 0",
                  opacity: i < signalsShown ? 1 : 0,
                  transform: i < signalsShown ? "none" : "translateX(-10px)",
                  transition: "opacity 0.3s ease, transform 0.3s ease",
                }}
              >
                {sig.contribution > 0 && (
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: `${c}15`,
                      border: `1px solid ${c}35`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      alignSelf: "center",
                    }}
                  >
                    <span
                      className="font-display"
                      style={{ fontSize: 12, fontWeight: 700, color: c }}
                    >
                      +{sig.contribution}
                    </span>
                  </div>
                )}
                <div>
                  <div
                    className="text-body-sm text-primary"
                    style={{ fontWeight: 500, marginBottom: 3 }}
                  >
                    {sig.title}
                  </div>
                  <div className="text-body-sm text-secondary">
                    {sig.message}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Ask VeriQ panel ───────────────────────────────────────────────────────────
const QA: [string, string][] = [
  [
    "Why is this flagged?",
    "Multiple independent signals point the same way — new recipient, unusually high amount, and a cluster of recent complaints. No single signal is conclusive, but together they match known scam patterns.",
  ],
  [
    "Is my money safe?",
    "Yes, for now. Nothing has moved. VeriQ intercepted this before your PIN was entered. Your money stays safe as long as you don't confirm.",
  ],
  [
    "What should I do?",
    "If you didn't initiate this payment yourself, cancel immediately. If someone told you to pay — a 'bank officer', a 'lottery', a 'loan company' — stop and call your bank's official number directly.",
  ],
];

function AskPanel({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div
      style={{
        borderTop: "1px solid #1C2235",
        borderBottom: "1px solid #1C2235",
        background: "#0A0C14",
        padding: "16px 32px",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span className="text-display-sm text-accent">Ask VeriQ</span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#3E4D62",
            padding: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 2L10 10M10 2L2 10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}
      >
        {QA.map(([q], i) => (
          <button
            key={i}
            onClick={() => setActive(a => (a === i ? null : i))}
            style={{
              background: active === i ? "rgba(0,212,255,0.1)" : "transparent",
              border: `1px solid ${active === i ? "rgba(0,212,255,0.35)" : "#1C2235"}`,
              borderRadius: 20,
              padding: "5px 12px",
              color: active === i ? "#00D4FF" : "#7D8FA8",
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {q}
          </button>
        ))}
      </div>
      {active !== null && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(0,212,255,0.04)",
            border: "1px solid rgba(0,212,255,0.12)",
            borderRadius: 6,
            animation: "fadeIn 0.18s ease",
          }}
        >
          <div
            className="text-body-sm text-secondary"
            style={{ lineHeight: 1.7 }}
          >
            {QA[active][1]}
          </div>
        </div>
      )}
    </div>
  );
}

function TrustWorkspace({ result }: { result: RiskResult }) {
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealSaved, setAppealSaved] = useState(false);
  const source =
    result.evidenceMode === "SYNTHETIC_DEMO"
      ? "Synthetic demo fixture"
      : result.evidenceMode === "LIVE_ENRICHED"
        ? "Connected backend"
        : "Unavailable risk service";
  const status = evidenceLabel(result);
  return (
    <section
      className="trust-workspace"
      aria-labelledby="trust-workspace-title"
    >
      <div className="trust-heading">
        <div>
          <div
            id="trust-workspace-title"
            className="text-display-sm text-primary"
          >
            Trust &amp; Evidence
          </div>
          <div className="text-body-xs text-secondary">
            Understand what VeriQ knows, what it cannot prove, and what happens
            next.
          </div>
        </div>
        <span className="evidence-pill">{status}</span>
      </div>
      <div className="trust-grid">
        <div className="trust-item">
          <span>Signal source</span>
          <strong>{source}</strong>
        </div>
        <div className="trust-item">
          <span>What this result means</span>
          <strong>
            {result.level === "HIGH"
              ? "Strong suspicion — not a legal finding"
              : result.level === "LOW"
                ? "No matching warning found in checked sources"
                : "Review recommended"}
          </strong>
        </div>
        <div className="trust-item">
          <span>Backend decision</span>
          <strong>
            {result.decision} · {result.evidenceQuality || "UNAVAILABLE"}
          </strong>
        </div>
        <div className="trust-item">
          <span>Amount context</span>
          <strong>
            {result.amountContext?.outsideRange
              ? "Outside the returned range"
              : "Not outside returned range"}{" "}
            · sample size {result.amountContext?.sampleSize ?? "unknown"}
          </strong>
        </div>
        <div className="trust-item">
          <span>Recipient identity</span>
          <strong>
            {result.recipientContext?.verifiedName ||
              result.recipientContext?.displayNameStatus ||
              "Not returned by provider"}
          </strong>
        </div>
        <div className="trust-item">
          <span>Verification session</span>
          <strong>
            {result.verificationSession?.verificationRequired
              ? `${result.verificationSession.coolingOffSeconds ?? 0}s cooling-off required`
              : "Not required by backend"}
          </strong>
        </div>
        <div className="trust-item">
          <span>What VeriQ can do</span>
          <strong>
            Warn, require confirmation, guide verification, and preserve a demo
            audit trail
          </strong>
        </div>
        <div className="trust-item">
          <span>What VeriQ cannot claim here</span>
          <strong>
            It cannot freeze funds, reverse a payment, or prove identity without
            an authorized integration
          </strong>
        </div>
      </div>
      <div className="trust-qualification">
        {result.evidenceMode === "UNAVAILABLE"
          ? "The backend was unavailable. This is a conservative fallback and not a recipient reputation result."
          : result.evidenceMode === "SYNTHETIC_DEMO"
            ? "Synthetic demo result: these signals are for demonstrating the pipeline and are not verified facts about a real recipient."
            : "No matching warning is not proof that a recipient is legitimate. Verify the recipient and payment purpose independently."}
      </div>
      <div className="trust-actions">
        <button
          className="recovery-action"
          onClick={() => setAppealOpen(v => !v)}
        >
          {appealOpen ? "Close review form" : "Appeal or explain this result"}
        </button>
        <span className="privacy-microcopy">
          Signals are shown with their available provenance. Do not share PINs,
          OTPs, or private chats.
        </span>
      </div>
      {appealOpen && (
        <div className="trust-appeal">
          <label className="text-label-sm text-muted">
            WHY MIGHT THIS BE A FALSE POSITIVE?
          </label>
          <textarea
            value={appealText}
            onChange={e => setAppealText(e.target.value)}
            placeholder="Add context for a future backend review (optional)."
            maxLength={500}
          />
          <button
            className="btn btn-ghost btn-sm"
            disabled={!appealText.trim()}
            onClick={() => setAppealSaved(true)}
          >
            {appealSaved ? "Review note saved locally" : "Save review note"}
          </button>
          {appealSaved && (
            <span className="text-body-xs text-secondary">
              Production submission will be connected after the backend review
              endpoint exists.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Stage: Verify (Step 8) ────────────────────────────────────────────────────
type VerifyCheck = {
  question: string;
  yes: string;
  no: string;
  yesRisk: "ok" | "warn" | "stop";
  noRisk: "ok" | "warn" | "stop";
};
const VERIFY_CHECKS: VerifyCheck[] = [
  {
    question: "Did you search for this recipient yourself?",
    yes: "Good. You initiated the contact.",
    no: "Someone else gave you this UPI ID — that's a common scam step.",
    yesRisk: "ok",
    noRisk: "stop",
  },
  {
    question: "Have you spoken to this person via a known contact?",
    yes: "Recognized contact — lower risk.",
    no: "No verified contact means you can't confirm who this really is.",
    yesRisk: "ok",
    noRisk: "warn",
  },
  {
    question: "Were you promised something in return for this payment?",
    yes: "Payments for prizes, loans, or jobs are almost always scams.",
    no: "No promise of return — normal payment pattern.",
    yesRisk: "stop",
    noRisk: "ok",
  },
  {
    question: "Is this amount what you'd normally send in one go?",
    yes: "Amount is consistent with your intent.",
    no: "Unusual amount for you — pause and confirm.",
    yesRisk: "ok",
    noRisk: "warn",
  },
];

function CheckItem({
  check,
  idx,
  answer,
  onAnswer,
}: {
  check: VerifyCheck;
  idx: number;
  answer: "yes" | "no" | null;
  onAnswer: (v: "yes" | "no") => void;
}) {
  const feedback =
    answer === "yes"
      ? { text: check.yes, risk: check.yesRisk }
      : answer === "no"
        ? { text: check.no, risk: check.noRisk }
        : null;
  const feedbackColor =
    feedback?.risk === "stop"
      ? "#FF3355"
      : feedback?.risk === "warn"
        ? "#F5A623"
        : "#00C27A";

  return (
    <div
      style={{
        padding: "14px 16px",
        background: "#0C0F18",
        border: `1px solid ${answer ? (feedback?.risk === "stop" ? "rgba(255,51,85,0.25)" : feedback?.risk === "warn" ? "rgba(245,166,35,0.2)" : "rgba(0,194,122,0.2)") : "#1C2235"}`,
        borderRadius: 6,
        transition: "border-color 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: answer ? 10 : 0,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#161B28",
            border: "1px solid #253047",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <span
            className="text-mono-sm"
            style={{ fontSize: 9, color: "#3E4D62" }}
          >
            {idx + 1}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <div
            className="text-body-sm text-primary"
            style={{ fontWeight: 500, marginBottom: 10 }}
          >
            {check.question}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onAnswer("yes")}
              style={{
                padding: "5px 14px",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: 0.3,
                textTransform: "uppercase" as const,
                background:
                  answer === "yes" ? "rgba(0,212,255,0.1)" : "transparent",
                border: `1px solid ${answer === "yes" ? "rgba(0,212,255,0.35)" : "#1C2235"}`,
                color: answer === "yes" ? "#00D4FF" : "#7D8FA8",
                transition: "all 0.12s",
              }}
            >
              Yes
            </button>
            <button
              onClick={() => onAnswer("no")}
              style={{
                padding: "5px 14px",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "Rajdhani, sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: 0.3,
                textTransform: "uppercase" as const,
                background:
                  answer === "no" ? "rgba(0,212,255,0.1)" : "transparent",
                border: `1px solid ${answer === "no" ? "rgba(0,212,255,0.35)" : "#1C2235"}`,
                color: answer === "no" ? "#00D4FF" : "#7D8FA8",
                transition: "all 0.12s",
              }}
            >
              No
            </button>
          </div>
        </div>
      </div>
      {feedback && (
        <div
          style={{
            marginLeft: 30,
            padding: "8px 12px",
            background: `${feedbackColor}09`,
            border: `1px solid ${feedbackColor}25`,
            borderRadius: 4,
            animation: "fadeIn 0.18s ease",
          }}
        >
          <div className="text-body-sm" style={{ color: feedbackColor }}>
            {feedback.text}
          </div>
        </div>
      )}
    </div>
  );
}

function StageVerify({
  upi,
  amount,
  result,
  onBack,
  onCancel,
  onContinue,
}: {
  upi: string;
  amount: string;
  result: RiskResult;
  onBack: () => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, "yes" | "no">>({});
  const [verificationSteps, setVerificationSteps] = useState<
    Record<string, boolean>
  >({});
  const answered = Object.keys(answers).length;
  const stopFlags = VERIFY_CHECKS.filter((c, i) => {
    const a = answers[i];
    return a === "yes"
      ? c.yesRisk === "stop"
      : a === "no"
        ? c.noRisk === "stop"
        : false;
  }).length;
  const warnFlags = VERIFY_CHECKS.filter((c, i) => {
    const a = answers[i];
    return a === "yes"
      ? c.yesRisk === "warn"
      : a === "no"
        ? c.noRisk === "warn"
        : false;
  }).length;
  const allDone = answered >= VERIFY_CHECKS.length;
  const overallSafe = stopFlags === 0 && warnFlags <= 1;
  const userVerificationDone = ["reenter", "official", "reason"].every(
    step => verificationSteps[step]
  );

  const facts = [
    { label: "UPI ID", value: upi, flag: false },
    { label: "Amount", value: `₹${amount}`, flag: false },
    { label: "Assessment", value: result.level, flag: result.level === "HIGH" },
    {
      label: "Signals",
      value: `${result.signals.length} returned`,
      flag: result.signals.some(signal => signal.severity === "HIGH"),
    },
  ];

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Left: facts */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid #1C2235",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 20px 14px",
            borderBottom: "1px solid #1C2235",
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#7D8FA8",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 14,
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M8 2L3 6L8 10"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to risk result
          </button>
          <div className="text-display-sm text-primary">Recipient Intel</div>
          <div className="text-body-xs text-secondary" style={{ marginTop: 4 }}>
            What VeriQ knows about this UPI ID
          </div>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {facts.map(f => (
            <div
              key={f.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid rgba(28,34,53,0.5)",
              }}
            >
              <span className="text-label-sm text-muted">{f.label}</span>
              <span
                className="text-mono-sm"
                style={{
                  color: f.flag ? "#FF3355" : "#7D8FA8",
                  textAlign: "right",
                  maxWidth: 130,
                }}
              >
                {f.value}
              </span>
            </div>
          ))}
          <div
            style={{
              marginTop: 8,
              padding: "10px 12px",
              background: "rgba(0,212,255,0.04)",
              border: "1px solid rgba(0,212,255,0.12)",
              borderRadius: 5,
            }}
          >
            <div
              className="text-body-xs text-muted"
              style={{ lineHeight: 1.65 }}
            >
              Recipient intelligence, beneficiary verification, and reputation
              data will appear here when returned by the authorized backend
              service.
            </div>
          </div>
        </div>
      </div>

      {/* Right: checklist */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            borderBottom: "1px solid #1C2235",
            flexShrink: 0,
          }}
        >
          <div className="text-display-sm text-primary">
            Verify before paying
          </div>
          <div className="text-body-xs text-secondary" style={{ marginTop: 4 }}>
            Complete the safe checks before deciding. No identity verification
            is available until the authorized backend responds.
          </div>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div className="verification-status-card">
            <strong>RECIPIENT VERIFICATION: UNAVAILABLE</strong>
            <span>
              We cannot confirm the network-returned recipient name in this
              prototype. A known bank suffix is not proof of identity.
            </span>
          </div>
          {[
            [
              "reenter",
              "Re-enter the recipient from your contacts or the official source",
            ],
            [
              "official",
              "Use the organization’s official website or bank card—not a number sent by the requester",
            ],
            [
              "reason",
              "Confirm again why you are paying and do not share your PIN, OTP, or screen",
            ],
          ].map(([id, label]) => (
            <label key={id} className="verification-step">
              <input
                type="checkbox"
                checked={Boolean(verificationSteps[id])}
                onChange={e =>
                  setVerificationSteps(prev => ({
                    ...prev,
                    [id]: e.target.checked,
                  }))
                }
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="verification-cooling-note">
            High-risk first-time payments should use a cooling-off period. The
            backend will provide the required wait time.
          </div>
          {VERIFY_CHECKS.map((c, i) => (
            <CheckItem
              key={i}
              check={c}
              idx={i}
              answer={answers[i] ?? null}
              onAnswer={v => setAnswers(prev => ({ ...prev, [i]: v }))}
            />
          ))}

          {/* Verdict */}
          {allDone && (
            <div
              style={{
                padding: "16px 18px",
                borderRadius: 6,
                background: overallSafe
                  ? "rgba(0,194,122,0.06)"
                  : "rgba(255,51,85,0.07)",
                border: `1px solid ${overallSafe ? "rgba(0,194,122,0.25)" : "rgba(255,51,85,0.3)"}`,
                animation: "fadeIn 0.3s ease",
              }}
            >
              <div
                className="text-display-sm"
                style={{
                  color: overallSafe ? "#00C27A" : "#FF3355",
                  marginBottom: 6,
                }}
              >
                {overallSafe
                  ? "Checks passed — your call."
                  : "Multiple red flags found."}
              </div>
              <div className="text-body-sm text-secondary">
                {overallSafe
                  ? "No major red flags from your answers. If you're confident, you may proceed — but stay alert."
                  : `${stopFlags} critical flag${stopFlags !== 1 ? "s" : ""} detected. VeriQ strongly recommends cancelling.`}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #1C2235",
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            className="btn btn-danger"
            onClick={onCancel}
            style={{ flex: 1, justifyContent: "center" }}
          >
            Cancel & Report
          </button>
          {allDone && overallSafe && userVerificationDone && (
            <button
              className="btn btn-ghost"
              onClick={onContinue}
              style={{ flex: 1, justifyContent: "center" }}
            >
              Proceed
            </button>
          )}
          {allDone && !overallSafe && userVerificationDone && (
            <button
              onClick={onContinue}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#3E4D62",
                fontSize: 11,
                fontFamily: "Inter, sans-serif",
                textDecoration: "underline",
                padding: "0 8px",
              }}
            >
              Override & continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stage: Cancel (Step 9) ────────────────────────────────────────────────────
const NEXT_STEPS = [
  {
    icon: "🔒",
    title: "Change your UPI PIN",
    body: "If you shared your PIN or OTP with anyone, change it immediately in your banking app.",
  },
  {
    icon: "📞",
    title: "Call your bank directly",
    body: "Use the number on the back of your card — not any number someone gave you.",
  },
  {
    icon: "🚨",
    title: "Report the fraud attempt",
    body: "File a complaint at cybercrime.gov.in or call 1930 (National Cyber Helpline).",
  },
];

function StageCancel({
  amount,
  upi,
  result,
  onReset,
  onComplete,
}: {
  amount: string;
  upi: string;
  result: RiskResult;
  onReset: () => void;
  onComplete: () => void;
}) {
  const [reported, setReported] = useState(false);
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  const time = nowIST();

  useEffect(() => {
    onComplete();
  }, [onComplete]);

  // Stagger entrance phases
  useEffect(() => {
    const ts = [100, 500, 900].map((d, i) =>
      setTimeout(() => setPhase((i + 1) as 1 | 2 | 3), d)
    );
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "32px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 500 }}>
        {/* Hero */}
        <div
          style={{
            textAlign: "center",
            padding: "32px 24px 28px",
            background: "rgba(0,194,122,0.05)",
            border: "1px solid rgba(0,194,122,0.2)",
            borderRadius: 10,
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "none" : "translateY(10px)",
            transition: "all 0.4s cubic-bezier(0.34,1.2,0.64,1)",
          }}
        >
          {/* Shield icon */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(0,194,122,0.12)",
              border: "2px solid #00C27A",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: "0 0 32px rgba(0,194,122,0.2)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 3L28 9V17C28 23.6 22.6 29.4 16 31C9.4 29.4 4 23.6 4 17V9L16 3Z"
                stroke="#00C27A"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M10 16L14 20L22 12"
                stroke="#00C27A"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            className="text-display-lg text-safe"
            style={{ marginBottom: 8 }}
          >
            Your money is safe.
          </div>
          <div
            className="text-body-md text-secondary"
            style={{ lineHeight: 1.65 }}
          >
            <span style={{ color: "#E4EAF4", fontWeight: 500 }}>₹{amount}</span>{" "}
            to{" "}
            <span className="text-mono-sm" style={{ color: "#7D8FA8" }}>
              {upi}
            </span>{" "}
            was cancelled before any funds moved.
          </div>
          <div className="text-mono-sm text-muted" style={{ marginTop: 10 }}>
            {time}
          </div>
        </div>

        {/* Timeline */}
        <div
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "none" : "translateY(8px)",
            transition: "all 0.4s ease 0.1s",
          }}
        >
          <div
            className="text-label-sm text-muted"
            style={{ marginBottom: 12 }}
          >
            WHAT HAPPENED
          </div>
          <div style={{ position: "relative", paddingLeft: 20 }}>
            <div
              style={{
                position: "absolute",
                left: 7,
                top: 8,
                bottom: 8,
                width: 1,
                background: "#1C2235",
              }}
            />
            {[
              {
                label: "Payment initiated",
                sub: "You entered recipient and amount",
                color: "#7D8FA8",
              },
              {
                label: "VeriQ scanned the transaction",
                sub: `${result.score} risk score · ${result.level}${result.decision === "BLOCK" ? " / BLOCK" : " alert"} triggered`,
                color:
                  result.level === "CRITICAL" || result.decision === "BLOCK"
                    ? "#FF3355"
                    : "#F5A623",
              },
              {
                label: "Risk result shown",
                sub: "Evidence presented, action requested",
                color: "#F5A623",
              },
              {
                label: "You cancelled",
                sub: "Smart decision — funds never moved",
                color: "#00C27A",
              },
            ].map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  paddingBottom: i < 3 ? 16 : 0,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 3,
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: e.color,
                    marginTop: 4,
                    boxShadow: i === 3 ? `0 0 8px ${e.color}` : "none",
                  }}
                />
                <div>
                  <div
                    className="text-body-sm text-primary"
                    style={{ fontWeight: i === 3 ? 500 : 400 }}
                  >
                    {e.label}
                  </div>
                  <div className="text-body-xs text-muted">{e.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next steps */}
        <div
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? "none" : "translateY(8px)",
            transition: "all 0.4s ease 0.2s",
          }}
        >
          <div
            className="text-label-sm text-muted"
            style={{ marginBottom: 12 }}
          >
            WHAT TO DO NOW
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {NEXT_STEPS.map((s, i) => (
              <div
                key={i}
                className="cancel-next-step"
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "12px 16px",
                  background: "#0C0F18",
                  border: "1px solid #1C2235",
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    lineHeight: 1,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {s.icon}
                </span>
                <div>
                  <div
                    className="text-body-sm text-primary"
                    style={{ fontWeight: 500, marginBottom: 3 }}
                  >
                    {s.title}
                  </div>
                  <div className="text-body-sm text-secondary">{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Report + Return */}
        <div
          style={{
            opacity: phase >= 3 ? 1 : 0,
            transform: phase >= 3 ? "none" : "translateY(6px)",
            transition: "all 0.4s ease 0.1s",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {!reported ? (
            <button
              className="btn btn-danger"
              onClick={() => setReported(true)}
              style={{ justifyContent: "center", width: "100%" }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="M6.5 1L11.5 4V7.5C11.5 9.9 9.3 11.9 6.5 12.5C3.7 11.9 1.5 9.9 1.5 7.5V4L6.5 1Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M6.5 5V7M6.5 9H6.51"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              Report this fraud attempt
            </button>
          ) : (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(255,51,85,0.06)",
                border: "1px solid rgba(255,51,85,0.2)",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                animation: "fadeIn 0.2s ease",
              }}
            >
              <div
                className="text-body-sm text-primary"
                style={{ fontWeight: 500 }}
              >
                Report submitted to VeriQ ✓
              </div>
              <div className="text-body-xs text-secondary">
                Reference: RPT-
                {Math.random().toString(36).substring(2, 8).toUpperCase()} · You
                can also file at cybercrime.gov.in or call 1930.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href="https://cybercrime.gov.in"
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1 }}
                >
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    cybercrime.gov.in ↗
                  </button>
                </a>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  Copy reference
                </button>
              </div>
            </div>
          )}
          <button
            className="btn btn-ghost"
            onClick={onReset}
            style={{ justifyContent: "center", width: "100%" }}
          >
            ← Back to payments
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stage: Continue (Step 10) ────────────────────────────────────────────────
const TXN_ID = () =>
  "TXN-" + Math.random().toString(36).substring(2, 10).toUpperCase();

type ContinuePhase = "warn" | "processing" | "done";

function StageContinue({
  amount,
  upi,
  level,
  result,
  onReset,
  onComplete,
}: {
  amount: string;
  upi: string;
  level: RiskResult["level"];
  result: RiskResult;
  onReset: () => void;
  onComplete: () => void;
}) {
  const blocked =
    level === "CRITICAL" || level === "HIGH" || result.decision === "BLOCK";
  const [phase, setPhase] = useState<ContinuePhase>(
    blocked ? "warn" : "processing"
  );
  const [checked, setChecked] = useState(false);
  const [txnId] = useState(TXN_ID);
  const [incidentId] = useState(
    () => "INC-" + Math.random().toString(36).substring(2, 9).toUpperCase()
  );
  const [incidentReported, setIncidentReported] = useState(false);
  const [incidentReference, setIncidentReference] = useState<string | null>(
    null
  );
  const [evidenceChecklist, setEvidenceChecklist] = useState<
    Record<string, boolean>
  >({});
  const [procStep, setProcStep] = useState(0);
  const color =
    level === "LOW" ? "#00C27A" : level === "MEDIUM" ? "#F5A623" : "#FF3355";
  const time = nowIST();

  // Processing animation once we enter that phase
  useEffect(() => {
    if (phase !== "processing") return;
    const steps = [
      "Authenticating…",
      "Routing payment…",
      "Confirming with bank…",
    ];
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setProcStep(i);
      if (i >= steps.length) {
        clearInterval(iv);
        setTimeout(() => setPhase("done"), 600);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase === "done") onComplete();
  }, [onComplete, phase]);

  /* ── Stop gate for HIGH and CRITICAL/BLOCK results ── */
  if (phase === "warn") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Risk reminder banner */}
          <div
            style={{
              padding: "18px 20px",
              background: "rgba(255,51,85,0.07)",
              border: "1px solid rgba(255,51,85,0.3)",
              borderRadius: 8,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: "rgba(255,51,85,0.12)",
                  border: "1px solid rgba(255,51,85,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 2.5L16 14.5H2L9 2.5Z"
                    stroke="#FF3355"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 8V10.5M9 12.5V13"
                    stroke="#FF3355"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div>
                <div
                  className="text-display-sm text-fraud"
                  style={{ marginBottom: 4 }}
                >
                  {level === "CRITICAL" || result.decision === "BLOCK"
                    ? "CRITICAL / BLOCK — payment stopped"
                    : "VeriQ flagged this as HIGH RISK"}
                </div>
                <div
                  className="text-body-sm text-secondary"
                  style={{ lineHeight: 1.65 }}
                >
                  Risk score:{" "}
                  <span style={{ color: "#FF3355", fontWeight: 500 }}>
                    {result.score} / 100
                  </span>{" "}
                  &nbsp;·&nbsp; Decision:{" "}
                  <span style={{ color: "#FF3355", fontWeight: 700 }}>
                    {result.decision}
                  </span>{" "}
                  &nbsp;·&nbsp; {result.signals.length} fraud signals detected.
                  {blocked
                    ? " The payment is stopped. Overriding this warning is only a prototype simulation."
                    : " In a real transaction, overriding this warning means the money could be unrecoverable."}
                </div>
              </div>
            </div>
          </div>

          {/* Top signals quick recap */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              className="text-label-sm text-muted"
              style={{ marginBottom: 4 }}
            >
              WHY VERIQ IS CONCERNED
            </div>
            {result.signals.slice(0, 3).map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "8px 12px",
                  background: "rgba(255,51,85,0.04)",
                  border: "1px solid rgba(255,51,85,0.12)",
                  borderLeft: "2px solid #FF3355",
                  borderRadius: "0 5px 5px 0",
                }}
              >
                <span
                  className="text-mono-sm text-fraud"
                  style={{ fontWeight: 600, flexShrink: 0 }}
                >
                  +{s.contribution}
                </span>
                <span className="text-body-sm text-secondary">{s.title}</span>
              </div>
            ))}
          </div>

          {/* Acknowledgement checkbox */}
          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              cursor: "pointer",
              padding: "12px 14px",
              background: "#0C0F18",
              border: `1px solid ${checked ? "rgba(255,51,85,0.35)" : "#1C2235"}`,
              borderRadius: 6,
              transition: "border-color 0.15s",
            }}
          >
            <div
              onClick={() => setChecked(v => !v)}
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                flexShrink: 0,
                marginTop: 1,
                background: checked ? "#FF3355" : "transparent",
                border: `1.5px solid ${checked ? "#FF3355" : "#253047"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                cursor: "pointer",
              }}
            >
              {checked && (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d="M2 5L4 7L8 3"
                    stroke="#fff"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span
              className="text-body-sm text-secondary"
              style={{ lineHeight: 1.6 }}
            >
              I understand VeriQ has returned{" "}
              {level === "CRITICAL" || result.decision === "BLOCK"
                ? "CRITICAL / BLOCK"
                : "a high-risk warning"}
              . I am choosing to continue only as a prototype simulation. No
              real money moves.
            </span>
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-ghost"
              onClick={onReset}
              style={{ flex: 1, justifyContent: "center" }}
            >
              Go back to safety
            </button>
            <button
              className="btn btn-danger"
              disabled={!checked}
              onClick={() => setPhase("processing")}
              style={{
                flex: 1,
                justifyContent: "center",
                opacity: checked ? 1 : 0.4,
                transition: "opacity 0.2s",
              }}
            >
              Simulate override
            </button>
          </div>
          <div
            className="text-body-xs text-muted"
            style={{ textAlign: "center" }}
          >
            Prototype only — no real money is ever transferred
          </div>
        </div>
      </div>
    );
  }

  /* ── Processing ── */
  if (phase === "processing") {
    const steps = [
      "Authenticating…",
      "Routing payment…",
      "Confirming with bank…",
    ];
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          padding: 40,
        }}
      >
        <div style={{ position: "relative", width: 72, height: 72 }}>
          {[72, 52, 34].map((s, i) => (
            <div
              key={s}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: s,
                height: s,
                borderRadius: "50%",
                border: `1px solid rgba(0,212,255,${0.08 + i * 0.08})`,
                transform: "translate(-50%,-50%)",
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 36,
              height: 36,
              borderRadius: "50% 0 0 50%",
              background:
                "conic-gradient(from 0deg, transparent, rgba(0,212,255,0.2) 70deg, transparent)",
              transformOrigin: "0 0",
              animation: "radar-sweep 0.9s linear infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#00D4FF",
              boxShadow: "0 0 12px rgba(0,212,255,0.9)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            width: "100%",
            maxWidth: 300,
          }}
        >
          {steps.map((s, i) => {
            const done = i < procStep - 1;
            const active = i === procStep - 1;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: i < procStep ? 1 : 0.25,
                  transition: "opacity 0.25s",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: done
                      ? "#00C27A"
                      : active
                        ? "rgba(0,212,255,0.15)"
                        : "#1C2235",
                    border: `1.5px solid ${done ? "#00C27A" : active ? "#00D4FF" : "#253047"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {done && (
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <path
                        d="M1.5 4L3 5.5L6.5 2"
                        stroke="#07090E"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className="text-body-sm"
                  style={{
                    color: active ? "#E4EAF4" : done ? "#7D8FA8" : "#3E4D62",
                  }}
                >
                  {s}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Done / Receipt ── */
  const accentColor =
    level === "LOW" ? "#00C27A" : level === "MEDIUM" ? "#F5A623" : "#FF6B35";
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "fadeIn 0.4s ease",
        }}
      >
        {/* Status icon */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: `${accentColor}15`,
              border: `2px solid ${accentColor}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: `0 0 24px ${accentColor}30`,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M7 14L11 18L21 10"
                stroke={accentColor}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="text-display-md text-primary">
            Simulation override recorded
          </div>
          {blocked && (
            <div className="text-body-xs text-muted" style={{ marginTop: 6 }}>
              The backend returned{" "}
              {level === "CRITICAL" || result.decision === "BLOCK"
                ? "CRITICAL / BLOCK"
                : "a HIGH RISK warning"}
              . No real payment was sent.
            </div>
          )}
        </div>

        {/* Receipt card */}
        <div
          style={{
            background: "#0C0F18",
            border: "1px solid #1C2235",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {/* Receipt header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid #1C2235",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="text-label-sm text-muted">
              TRANSACTION RECEIPT
            </span>
            <span className="badge badge-warn">SIMULATION</span>
          </div>
          {/* Amount */}
          <div
            style={{
              padding: "18px 18px 14px",
              borderBottom: "1px solid #1C2235",
              textAlign: "center",
            }}
          >
            <div className="text-display-xl text-primary">₹{amount}</div>
            <div
              className="text-body-sm text-secondary"
              style={{ marginTop: 4 }}
            >
              to {upi}
            </div>
          </div>
          {/* Details grid */}
          <div
            style={{
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {[
              ["Transaction ID", txnId],
              ["Time", time],
              ["Status", "Prototype override — not sent"],
              ["Method", "UPI"],
              ["VeriQ Decision", `${level} / ${result.decision}`],
            ].map(([l, v]) => (
              <div
                key={l}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="text-label-sm text-muted">{l}</span>
                <span
                  className="text-mono-sm"
                  style={{
                    color: l === "VeriQ Score" ? accentColor : "#E4EAF4",
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Post-payment safety and incident response */}
        <section
          className="post-payment-safety"
          aria-labelledby="post-payment-title"
        >
          <div className="post-payment-heading">
            <div>
              <div
                id="post-payment-title"
                className="text-display-sm text-primary"
              >
                Think this payment was a scam?
              </div>
              <div className="text-body-xs text-secondary">
                Act quickly. This is a recovery guide, not a guarantee that
                funds can be reversed.
              </div>
            </div>
            <span className="evidence-pill">DEMO WORKSPACE</span>
          </div>
          <div className="post-payment-reference">
            <span>VeriQ reference</span>
            <strong>{txnId}</strong>
            <span>Incident draft</span>
            <strong>{incidentId}</strong>
            <span>Bank/PSP reference</span>
            <strong>Unavailable in this prototype</strong>
          </div>
          <div className="post-payment-actions">
            <button
              className="btn btn-danger"
              onClick={async () => {
                const incident = await createIncident(
                  result.backendTransactionId,
                  `User suspects this completed UPI payment to ${upi} may be fraudulent.`
                );
                setIncidentReference(incident?.incident_id || null);
                setIncidentReported(true);
              }}
              style={{ justifyContent: "center" }}
            >
              {incidentReported
                ? incidentReference
                  ? "Incident created"
                  : "Saved locally"
                : "Report suspected fraud"}
            </button>
            <a className="recovery-action" href="tel:1930">
              Call 1930
            </a>
            <a
              className="recovery-action"
              href="https://cybercrime.gov.in"
              target="_blank"
              rel="noreferrer"
            >
              Open cybercrime.gov.in ↗
            </a>
            <button
              className="recovery-action"
              onClick={() =>
                window.alert(
                  "Contact your bank using the official app or the number on your bank card. Never use a number sent by the requester."
                )
              }
            >
              Contact my bank
            </button>
          </div>
          {incidentReported && (
            <div className="incident-saved-note">
              {incidentReference
                ? `Backend incident created: ${incidentReference}.`
                : `Local demo record created: ${incidentId}. The backend incident request was unavailable.`}
            </div>
          )}
          <div className="evidence-checklist">
            <div className="text-label-sm text-muted">PRESERVE EVIDENCE</div>
            {[
              "Payment confirmation screenshot",
              "Chat or message with the requester",
              "Phone number, email, QR image, or payment link",
              "Transaction ID and recipient details",
              "Bank / 1930 report reference",
            ].map(item => (
              <label key={item} className="evidence-check-item">
                <input
                  type="checkbox"
                  checked={Boolean(evidenceChecklist[item])}
                  onChange={e =>
                    setEvidenceChecklist(prev => ({
                      ...prev,
                      [item]: e.target.checked,
                    }))
                  }
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <div className="incident-timeline">
            <div className="text-label-sm text-muted">INCIDENT TIMELINE</div>
            <div>
              <b>Now</b> Prototype override recorded · {time}
            </div>
            <div>
              <b>Pending</b> Contact bank through official channel
            </div>
            <div>
              <b>Pending</b> Call 1930 and save the report reference
            </div>
          </div>
        </section>

        {/* Prototype notice */}
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(0,212,255,0.04)",
            border: "1px solid rgba(0,212,255,0.12)",
            borderRadius: 6,
            textAlign: "center",
          }}
        >
          <div className="text-body-xs text-muted">
            This is a prototype demonstration only. No real money was
            transferred at any point.
          </div>
        </div>

        <button
          className="btn btn-ghost"
          onClick={onReset}
          style={{ justifyContent: "center" }}
        >
          ← New payment
        </button>
      </div>
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function PaymentFlow() {
  const [stage, setStage] = useState<Stage>("input");
  const [upi, setUpi] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<RiskResult | null>(null);
  const requestIdRef = useRef(0);
  const recordedRequestRef = useRef<number | null>(null);

  const handlePay = useCallback(
    (u: string, a: string, note: string, purpose: string) => {
      const requestId = ++requestIdRef.current;
      setUpi(u);
      setAmount(a);
      // Backend-first: the client sends the raw payment context and renders the
      // returned evidence. The fallback is conservative and clearly labeled.
      const fallback = offlineSafetyFallback(u, a);
      setResult(fallback);
      setStage("scanning");
      void requestRiskCheck(u, a, note, purpose).then(apiResult => {
        if (apiResult && requestId === requestIdRef.current)
          setResult(apiResult);
      });
    },
    []
  );

  const recordCompletedDemo = useCallback(
    (
      status: "safe" | "review" | "fraud" | "cancelled",
      decision: "APPROVED" | "REVIEW" | "BLOCKED" | "CANCELLED"
    ) => {
      if (!result) return;
      if (recordedRequestRef.current === requestIdRef.current) return;
      recordedRequestRef.current = requestIdRef.current;
      appendDemoTransaction({
        id: `TXN_DEMO_${Date.now()}`,
        backendTransactionId: result.backendTransactionId,
        amount: Number(amount.replace(/[^0-9.]/g, "")) || 0,
        upi,
        time: nowIST(),
        risk: result.score,
        status,
        decision,
        evidenceQuality: result.evidenceQuality,
        qualification: result.qualification,
      });
    },
    [amount, result, upi]
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setStage("input");
    setResult(null);
    setUpi("");
    setAmount("");
  }, []);

  const stageOrder: Stage[] = [
    "input",
    "scanning",
    "result",
    "verify",
    "cancel",
    "continue",
  ];
  const currentIdx = stageOrder.indexOf(stage);

  return (
    <div
      className="payment-flow-shell"
      style={{
        display: "flex",
        height: "100%",
        background: "#07090E",
        minWidth: 0,
      }}
    >
      {/* Left strip */}
      <div
        className="payment-flow-rail"
        style={{
          width: 200,
          flexShrink: 0,
          background: "#0A0C14",
          borderRight: "1px solid #1C2235",
          display: "flex",
          flexDirection: "column",
          padding: "28px 20px",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 36,
          }}
        >
          <img
            src="/veriq-circle-mark-transparent.png"
            alt="VERIQ"
            width={34}
            height={34}
            style={{
              width: 34,
              height: 34,
              objectFit: "contain",
              flexShrink: 0,
              filter: "drop-shadow(0 0 8px rgba(0,212,255,0.25))",
            }}
          />
          <span
            className="font-display"
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#00D4FF",
              letterSpacing: 1.5,
            }}
          >
            VERIQ
          </span>
        </div>

        {/* Progress steps */}
        {[
          { id: "input", label: "Payment", idx: 0 },
          { id: "scanning", label: "VeriQ Scan", idx: 1 },
          { id: "result", label: "Risk Result", idx: 2 },
          { id: "verify", label: "Verify", idx: 3 },
        ].map((s, i, arr) => {
          const done = currentIdx > s.idx;
          const active =
            stage === s.id ||
            (s.id === "verify" && (stage === "cancel" || stage === "continue"));
          return (
            <div
              key={s.id}
              style={{
                display: "flex",
                gap: 10,
                paddingBottom: i < arr.length - 1 ? 20 : 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: done
                      ? "#00C27A"
                      : active
                        ? "rgba(0,212,255,0.14)"
                        : "#1C2235",
                    border: `1.5px solid ${done ? "#00C27A" : active ? "#00D4FF" : "#253047"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: active ? "0 0 8px rgba(0,212,255,0.25)" : "none",
                    transition: "all 0.25s",
                  }}
                >
                  {done ? (
                    <svg width="9" height="9" viewBox="0 0 9 9">
                      <path
                        d="M1.5 4.5L3.5 6.5L7.5 2.5"
                        stroke="#07090E"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span
                      className="text-mono-sm"
                      style={{
                        fontSize: 8,
                        color: active ? "#00D4FF" : "#3E4D62",
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>
                {i < arr.length - 1 && (
                  <div
                    style={{
                      width: 1,
                      flex: 1,
                      minHeight: 14,
                      marginTop: 3,
                      background: done ? "#00C27A" : "#1C2235",
                      transition: "background 0.3s",
                    }}
                  />
                )}
              </div>
              <div style={{ paddingTop: 1 }}>
                <div
                  className="text-body-sm"
                  style={{
                    color: active ? "#E4EAF4" : done ? "#00C27A" : "#4A5A72",
                    fontWeight: active ? 500 : 400,
                    transition: "color 0.2s",
                  }}
                >
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: "10px 12px",
            background: "rgba(0,212,255,0.04)",
            border: "1px solid rgba(0,212,255,0.1)",
            borderRadius: 5,
          }}
        >
          <div className="text-body-xs text-muted" style={{ lineHeight: 1.6 }}>
            Evidence-led payment screening before you send.
          </div>
        </div>
      </div>

      {/* Main */}
      <div
        className="payment-flow-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          className="payment-stage"
          key={stage}
          style={{ minHeight: "100%", height: "auto" }}
        >
          {stage === "input" && <StageInput onPay={handlePay} />}
          {stage === "scanning" && (
            <StageScanning onDone={() => setStage("result")} />
          )}
          {stage === "result" && result && (
            <StageResult
              result={result}
              upi={upi}
              amount={amount}
              onVerify={() => setStage("verify")}
              onAcknowledge={() =>
                void postRiskEvent(result.backendTransactionId, "ACKNOWLEDGED")
              }
              onCancel={() => {
                void postRiskEvent(result.backendTransactionId, "CANCELLED");
                setStage("cancel");
              }}
              onContinue={() => {
                void postRiskEvent(result.backendTransactionId, "CONTINUED");
                setStage("continue");
              }}
            />
          )}
          {stage === "verify" && result && (
            <StageVerify
              upi={upi}
              amount={amount}
              result={result}
              onBack={() => setStage("result")}
              onCancel={() => {
                void postRiskEvent(result.backendTransactionId, "CANCELLED");
                setStage("cancel");
              }}
              onContinue={() => {
                void postRiskEvent(result.backendTransactionId, "CONTINUED");
                setStage("continue");
              }}
            />
          )}
          {stage === "cancel" && result && (
            <StageCancel
              amount={amount}
              upi={upi}
              result={result}
              onReset={reset}
              onComplete={() => recordCompletedDemo("cancelled", "CANCELLED")}
            />
          )}
          {stage === "continue" && result && (
            <StageContinue
              amount={amount}
              upi={upi}
              level={result.level}
              result={result}
              onReset={reset}
              onComplete={() =>
                recordCompletedDemo(
                  result.level === "CRITICAL" ||
                    result.level === "HIGH" ||
                    result.decision === "BLOCK"
                    ? "fraud"
                    : result.level === "MEDIUM"
                      ? "review"
                      : "safe",
                  result.level === "CRITICAL" ||
                    result.level === "HIGH" ||
                    result.decision === "BLOCK"
                    ? "BLOCKED"
                    : result.level === "MEDIUM"
                      ? "REVIEW"
                      : "APPROVED"
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
