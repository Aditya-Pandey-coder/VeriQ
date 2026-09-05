# VERIQ Team Pitch Script
## Safe handling of unverified user-reported UPI signals

**Recommended duration:** 90 seconds

### Speaker script

“VERIQ does not treat a user report as proof that a UPI ID is fraudulent. That distinction is central to our safety model.

When a user reports a suspicious recipient, VERIQ stores the report with its timestamp, the payment context, the evidence the user chooses to provide, and the source classification. A report is not immediately promoted into a hard blacklist. It passes through deduplication, abuse controls, moderation, and confidence thresholds.

One report can create a warning signal, but it cannot establish guilt. Multiple independent reports with consistent evidence can increase confidence, while stale, duplicated, contradictory, or low-quality reports are down-weighted or withheld from the user-facing decision.

Our interface uses careful language. We say, ‘A matching warning was found in the sources checked.’ We do not say, ‘This UPI ID is definitely fraudulent.’ If no report matches, we say, ‘No matching warning was found. This does not prove that the recipient is legitimate.’

Every warning carries provenance. The user can see whether the signal came from their own payment note, a synthetic demonstration fixture, an authorized partner feed, or a moderated user report. Synthetic data is never presented as a verified real-world complaint.

We also give the affected recipient a correction and appeal path. A report can be challenged, reviewed, corrected, or removed when it is inaccurate. This protects legitimate recipients from being permanently labeled by a single unverified accusation.

VERIQ therefore uses user reports as one input in an evidence-fusion system, not as a verdict. The safest action is determined by the quality, recency, independence, and consistency of the available signals, together with payment amount, intent, recipient history, and social-engineering context.

In the current prototype, some behavioral and historical signals are synthetic fixtures so that we can demonstrate the workflow safely. In production, those fixtures would be replaced by authorized bank, PSP, and user-consented signals. VERIQ’s promise is not that it knows everything. Its promise is that it tells the user what it knows, what it cannot prove, and what the safest next action is.”

## Judge questions and concise answers

| Judge question | Recommended answer |
|---|---|
| “Does one report block a UPI ID?” | “No. One report creates a reviewable warning signal, not a definitive fraud label.” |
| “How do you stop fake reports?” | “We use rate limits, duplicate detection, evidence requirements, moderation, confidence thresholds, and appeal handling.” |
| “What do you show the user?” | “We show the source, freshness, evidence quality, and calibrated wording. We distinguish ‘reported’ from ‘confirmed.’” |
| “What happens when there are no reports?” | “We say no matching warning was found. We never call the recipient safe solely because the database is silent.” |
| “Can a legitimate recipient challenge a report?” | “Yes. Production VERIQ would provide a correction and appeal workflow with audit history.” |
| “Are your current reports real?” | “The current prototype uses synthetic fixtures for behavioral demonstrations. User-entered payment notes are user-provided. We do not claim access to private bank or NPCI fraud databases.” |
| “What would production require?” | “Authorized PSP or bank integrations, a governed reporting network, privacy controls, security review, retention rules, and a formal false-positive process.” |

## Three phrases the team must use

> “Reported is not the same as confirmed.”

> “No matching warning is not proof of safety.”

> “Every signal is shown with its provenance and limitations.”

## Three claims the team must avoid

The team must not say that VERIQ has searched live NPCI, bank, or PSP complaint databases unless an authorized integration actually exists. The team must not call a UPI ID fraudulent based on a familiar bank suffix or a single user complaint. The team must not claim that a synthetic demo fixture is a verified fact about a real recipient.

## Closing line

“VERIQ is designed to stop harmful payments without creating a new harm: falsely labeling innocent people. We make uncertainty visible, preserve user agency, and turn a fraud alert into a safe action.”

## References

[1]: https://www.npci.org.in/ "National Payments Corporation of India"
[2]: https://cybercrime.gov.in/ "National Cyber Crime Reporting Portal"
[3]: https://i4c.mha.gov.in/ncrp.aspx "Indian Cybercrime Coordination Centre guidance on the National Cybercrime Reporting Portal"
