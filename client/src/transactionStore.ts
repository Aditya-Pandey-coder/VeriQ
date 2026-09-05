export type DemoTransactionStatus = "safe" | "review" | "fraud" | "cancelled";

export interface DemoTransaction {
  id: string;
  backendTransactionId?: string;
  amount: number;
  upi: string;
  time: string;
  risk: number;
  status: DemoTransactionStatus;
  decision: "APPROVED" | "REVIEW" | "BLOCKED" | "CANCELLED";
  evidenceQuality?: string;
  qualification?: string;
}

const STORAGE_KEY = "veriq-demo-transaction-history";
const UPDATE_EVENT = "veriq-demo-history-updated";

function fingerprint(item: DemoTransaction) {
  // Older builds could write the same completed demo repeatedly with new IDs.
  // Collapse those legacy duplicates by payment signature during migration.
  return item.id.startsWith("TXN_DEMO_")
    ? `${item.upi}|${item.amount}|${item.risk}|${item.decision}`
    : `${item.id}|${item.upi}|${item.amount}|${item.risk}|${item.decision}`;
}

function unique(items: DemoTransaction[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = fingerprint(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function read(): DemoTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? unique(value) : [];
  } catch {
    return [];
  }
}

function publish(items: DemoTransaction[]) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(unique(items).slice(0, 20))
  );
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function clearDemoHistory() {
  if (typeof window === "undefined") return;
  publish([]);
}

export function appendDemoTransaction(transaction: DemoTransaction) {
  if (typeof window === "undefined") return;
  const existing = read();
  if (existing.some(item => item.id === transaction.id)) return;
  publish([transaction, ...existing]);
}

export function updateDemoTransaction(
  id: string,
  patch: Partial<DemoTransaction>
) {
  if (typeof window === "undefined") return;
  publish(read().map(item => (item.id === id ? { ...item, ...patch } : item)));
}

export function deleteDemoTransaction(id: string) {
  if (typeof window === "undefined") return;
  publish(read().filter(item => item.id !== id));
}

export function subscribeToDemoHistory(callback: () => void) {
  window.addEventListener(UPDATE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function getDemoHistory() {
  return read();
}

export function inferBankFromUpi(upi: string) {
  const suffix = upi.toLowerCase().split("@")[1] || "";
  const banks: Record<string, string> = {
    okhdfcbank: "HDFC Bank",
    hdfcbank: "HDFC Bank",
    hdfc: "HDFC Bank",
    okicici: "ICICI Bank",
    icici: "ICICI Bank",
    okaxis: "Axis Bank",
    axis: "Axis Bank",
    ybl: "Yes Bank",
    oksbi: "State Bank of India",
    sbi: "State Bank of India",
    kotak: "Kotak Mahindra Bank",
    kotakbank: "Kotak Mahindra Bank",
    pnb: "Punjab National Bank",
    bob: "Bank of Baroda",
    barodampay: "Bank of Baroda",
    paytm: "Paytm Payments Bank",
    phonepe: "PhonePe",
    apl: "Amazon Pay",
  };
  return banks[suffix] || "Verified UPI bank handle";
}
