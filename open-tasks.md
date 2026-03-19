# Open tasks — Nirvana (for prioritization)

Total: **17** open tasks. Use this list in an LLM to reason about order, dependencies, and what to do next.

---
## 1. Triage: MVR PRDs by failure mode (#2) — complete + consistency + share
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 30m
- **Project:** MVR Reliability & Trust Recovery

update w/ most recent conversations

## 2. Triage: UW controls designs kickoff — artifacts + Arjun alignment + summary
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 30m
- **Project:** MVR Reliability & Trust Recovery

(10m) Ask Katie for existing design artifacts + links (Figma / docs) (15m) Review artifacts for driver review + MVR review failure mode relevance (25m) Send Arjun tight framing: failure modes + desired control behaviors (20m) Propose working session agenda (decisions needed from design) (20m) Summarize decisions/next steps in writing

## 3. Triage: Bulk classification pull — get Kajol query + run/validate + readout
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 30m
- **Project:** MVR Reliability & Trust Recovery

(10m) Request Kajol’s query link + where it should be run (30m) Run query + export dataset (20m) Validate row counts, null rates, obvious misclassifications (20m) Quick segmentation: volumes + error rates by program/state/size proxy (10m) Write 5-bullet readout + follow-up questions

## 4. Triage: QSQ adherence analysis (#1) — pull + join + baseline cuts
- **Status:** Todo
- **Due:** Feb 21, 2026
- **Priority:** HIGH
- **Duration:** 2h 0m
- **Project:** —

(15m) Pull last 14–28 days from Gold Standard (fields listed in notes) (25m) Identify/confirm quote event source + join key (submission_id) + define “quoted” flag (25m) Compute adherence overall + by UW + by program (25m) Add segment proxies: state + exposure bands + premium/price band (if present) (20m) Sanity checks: missing joins, duplicate submission_id, timestamp logic (10m) Save query + export dataset for follow-on analysis

## 5. MVR Pull Failures - get reporting and escalation triggers together
- **Status:** Todo
- **Due:** Feb 24, 2026
- **Priority:** LOW
- **Duration:** 30m
- **Project:** MVR Reliability & Trust Recovery

## 6. TRS enablement notes: compile inclusion checklist (no drafting yet)
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 0m
- **Project:** TRS v3 UX + Pricing Enablement

(10m) List each pricing bucket + all factors within each bucket (10m) For each bucket/factor, list required example types to include (no writing) (10m) List nuance topics to cover: capping mechanics (hard vs soft), thresholds, rationale, interaction effects (10m) List LR breakdown items to include: per-bucket contribution, target LR, delta, what we’re correcting, before/after scenario slots (10m) List development factors coverage: definition, measurement, static vs dynamic, how taken into account (multiplier/adjuster/override), decay/guardrails, example slots (10m) List deployment plan section items: AI-group-first rationale, success criteria, metrics, pilot duration, kill-switch, feedback loop

## 7. Precision Pricing UX launch plan: draft v1 (#1) - From sahana
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** HIGH
- **Duration:** REMINDER
- **Project:** TRS v3 UX + Pricing Enablement

(20m) Define target users + rollout approach (phased vs big-bang) (25m) Define enablement/gating plan + operational workflow assumptions (25m) Specify UX principles: modeled vs deterministic, uncertainty handling, copy/education needs (20m) Draft success metrics + monitoring plan (include rollback/killswitch criteria)

## 8. Identify and document examples of incorrect classifications to share with Shubham
- **Status:** Todo
- **Due:** Feb 24, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 0m
- **Project:** MVR Reliability & Trust Recovery

🪄 Created from doc: Mon Feb 9 Research and document specific examples where classifications are incorrect to provide clear cases for Shubham's review and action.

## 9. Research alternative MVR vendors to replace or supplement Verisk
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 30m
- **Project:** MVR Reliability & Trust Recovery

🪄 Created from doc: Mon Feb 9 Research alternative MVR vendors to replace or supplement Verisk due to reliability issues.

## 10. Document that the eligibility rule is miscategorizing minor vs major violations
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** LOW
- **Duration:** 30m
- **Project:** MVR Reliability & Trust Recovery

🪄 Created from doc: Mon Feb 9 Document that the eligibility rule miscategorizes minor vs major violations by using a fixed three-year lookback and relying on agent-entered years of experience instead of MVR-derived years.

## 11. Analyze underwriters bypassing drivers with insufficient experience
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 30m
- **Project:** MVR Reliability & Trust Recovery

🪄 Created from doc: Mon Feb 9 Analyze how often underwriters are bypassing drivers who do not meet the required years of experience to ensure underwriting controls are effective.

## 12. Document coaching plan for Sahana on new data sources and vendor evaluation
- **Status:** Todo
- **Due:** Feb 16, 2026
- **Priority:** LOW
- **Duration:** 1h 0m
- **Project:** Fleet Team Management

🪄 Created from doc: Mon Feb 9 Create a detailed coaching plan for Sahana focused on bringing in new data sources and evaluating data quality and vendor sources.

## 13. Define handoff + self-running monthly Pricing Trust Review cadence
- **Status:** Todo
- **Due:** Feb 20, 2026
- **Priority:** MEDIUM
- **Duration:** 1h 15m
- **Project:** Pricing Model Trust: Scalable Underwriter Enablement

Ensure enablement becomes self-sustaining and does not depend on you as the permanent operator. Checklist: (15m) Lock monthly agenda: performance, overrides, changes, decisions (20m) Assign permanent owners (UW lead + InsProd lead) (20m) Create recurring monthly "What changed" update template (15m) Document process + transition facilitation out after 1–2 cycles

## 14. Shape claims data initiative for UW NB and RN intelligence
- **Status:** Todo
- **Due:** Feb 13, 2026
- **Priority:** LOW
- **Duration:** 1h 20m
- **Project:** Fleet Team Management

🪄 Created from doc: Mon Jan 12 Develop and refine the claims data initiative focused on underwriting new business and risk intelligence.

## 15. Chaitra  6 mo
- **Status:** Todo
- **Due:** Apr 27, 2026
- **Priority:** LOW
- **Duration:** 15m
- **Project:** Fleet Team Management

## 16. Department Updates [DATE]
- **Status:** Todo
- **Due:** —
- **Priority:** HIGH
- **Duration:** 1h 30m
- **Project:** —

Gather &amp; Review Metrics Pull latest numbers for: Quote rate Bind rate Pricing accuracy (e.g. average premium variance) QSQ distribution &amp; adherence Neutral quote rate Scan for any spikes, dips or emerging trends Note any “red-flag” or “kudos” items Send analyses to Arpita Summarize key findings (1–2 bullet points each) Package charts + context in an email or ticket Send to Arpita for deeper investigation Update the Deck Swap in updated charts/tables for all metrics Write narrative bullets on: What’s trending up (“wins”) What’s trending down or flat (“concerns”) Insert your project updates section: Project Name – current status Milestone – planned date vs. actual (if applicable) Next steps Final QC &amp; Share Spell-check &amp; proof narrative bullets Verify all numbers match source data Send draft slides to any co-presenters for feedback Finalize version and confirm meeting logistics

## 17. [candidate] feedback
- **Status:** Todo
- **Due:** —
- **Priority:** MEDIUM
- **Duration:** 15m
- **Project:** —
