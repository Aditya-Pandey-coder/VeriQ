# VERIQ — Real-Time UPI Fraud Explainer

VERIQ is a React and FastAPI-connected prototype for safer UPI payments in India. It evaluates payment context before confirmation, explains the returned risk evidence, guides recipient verification, and provides an incident-recovery path when a user suspects fraud.

> **Prototype boundary:** VERIQ demonstrates a live risk-decision and intervention workflow. It does not move real money, access private NPCI or bank complaint databases, or prove that a real UPI recipient is legitimate.

## What VERIQ demonstrates

The payment flow sends recipient, amount, timestamp, payment purpose, note, and client context to a deployed FastAPI risk service. The interface renders the service response before a simulated payment decision.

The user can see `ALLOW`, `REVIEW`, `CRITICAL / BLOCK`, and related evidence labels. A critical result stops the user behind a safety gate. A simulation override is explicitly recorded as a prototype action; no real payment is sent.

Ask VeriQ uses the backend explanation endpoint:

```text
POST /api/v1/risk/explain/{transaction_id}
```

Incident reporting uses:

```text
POST /api/v1/incidents
```

The post-payment workspace provides a transaction reference, incident reference, bank-contact guidance, the Indian cybercrime portal, 1930 guidance, and an evidence checklist.

## Safety and evidence model

VERIQ distinguishes evidence provenance instead of presenting every signal as a verified fact.

| Signal category | Meaning in this prototype | User-facing treatment |
|---|---|---|
| `USER_PROVIDED` | Derived from the payment note or context entered by the user | Shown as user-provided context |
| `SYNTHETIC_DEMO` | Fixture used to demonstrate behavior, history, device, or recipient signals | Clearly labeled as synthetic; not a real accusation |
| `LIVE_ENRICHED` | Returned by an authorized connected backend source when available | Shown with backend provenance |
| `UNAVAILABLE` | The live risk service did not provide an assessment | Conservative fail-safe; never presented as safe |

A matching report or warning must not be described as proof of fraud. No matching warning must not be described as proof of safety. A familiar bank or PSP suffix is routing information, not identity proof.

The pitch script in [`VERIQ-TEAM-PITCH-SCRIPT.md`](./VERIQ-TEAM-PITCH-SCRIPT.md) contains the team’s recommended explanation of unverified user reports.

## Current demo scenarios

| Scenario | Expected behavior |
|---|---|
| `swiggy@icici`, ₹320 | Low-risk or allow-style flow, subject to the live backend response |
| `unknown2024@paytm`, ₹12,000 | Review-style flow |
| `quickloan99@upi`, loan-fee note | High-risk intervention flow |
| Extreme amount such as ₹32,000,000 | `CRITICAL / BLOCK` in the connected demo backend |
| Refund or KYC language | Social-engineering warning when returned by the backend |

These scenarios are demonstrations. They are not claims about the real owners or safety of the shown UPI IDs.

## Technology

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- Wouter
- FastAPI risk backend
- Local browser persistence for demo transaction history
- Render-hosted backend integration

## Project structure

```text
client/
  src/
    App.tsx
    components/
      AskVeriQ.tsx
      PaymentFlow.tsx
      ui/
    transactionStore.ts
    index.css
server/
  index.ts
shared/
  const.ts
patches/
package.json
pnpm-lock.yaml
vite.config.ts
tsconfig.json
```

## Requirements

- Node.js 22 or later
- pnpm 10 or later
- Network access to the configured backend for live risk checks

## Local setup

```bash
pnpm install
pnpm run check
pnpm run build
pnpm run dev
```

The development server normally starts on the Vite-configured port. If that port is busy, Vite chooses the next available port.

## Configuration

The frontend defaults to the deployed demo service:

```text
https://veriq-backend-56ex.onrender.com/api/v1/risk/check
```

To use another compatible backend, set:

```bash
export VITE_VERIQ_RISK_API_URL="https://your-service.example/api/v1/risk/check"
export VITE_VERIQ_USER_ID="your-demo-user-id"
```

Do not commit secrets, private API keys, production credentials, or personally identifiable payment data. Browser-exposed Vite variables are not secret storage.

## Validation checklist

Run the following before presenting or deploying:

```bash
pnpm run check
pnpm run build
```

The expected result is a successful TypeScript check and successful Vite/esbuild production build.

For a live end-to-end check, use a non-sensitive demo payload against an authorized development backend and verify:

1. The risk check returns a transaction ID.
2. A critical test returns `CRITICAL` and `BLOCK`.
3. Ask VeriQ receives an explanation from `/risk/explain/{transaction_id}`.
4. A suspected-fraud incident returns an incident ID and `CREATED` status.
5. The interface shows recovery actions without claiming that funds were frozen or reversed.

## Production readiness gaps

This repository is a competition prototype, not a production payment product. A production deployment would require authenticated users, secure server-side secret handling, authorized bank or PSP integrations, governed fraud-report data, privacy and retention controls, rate limiting, abuse prevention, audit integrity, security testing, false-positive appeals, operational monitoring, and legal/compliance review.

The current prototype uses synthetic fixtures for selected historical, behavioral, device, and recipient signals. The correct production migration is to replace those fixtures with authorized, attributable, consented signals—not to hide the distinction.

## Responsible presentation

Use this sentence in the demo:

> “VERIQ demonstrates the real-time intervention and explanation layer. Behavioral and historical signals in this prototype may be synthetic fixtures; user-provided payment context is labeled separately. Production would connect the same evidence model to authorized PSP, bank, and user-consented sources.”

Do not claim that VERIQ has searched private NPCI or bank fraud databases unless an authorized integration has actually been completed.

## License

This prototype is provided for evaluation and demonstration. Add the team’s chosen license and ownership notice before public distribution.

## References

[1]: https://www.npci.org.in/ "National Payments Corporation of India"
[2]: https://cybercrime.gov.in/ "National Cyber Crime Reporting Portal"
[3]: https://i4c.mha.gov.in/ncrp.aspx "Indian Cybercrime Coordination Centre guidance on the National Cybercrime Reporting Portal"
