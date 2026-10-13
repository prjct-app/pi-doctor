# Add an evidence-backed Doctor audit

Size: L (one cohesive scan/report/analysis workflow). Ready: yes for implementation.
Baseline: docs/doctor-audit-prd.md; design: docs/doctor-audit-sdd.md.
Implementation candidate: docs/doctor-audit-handoff.md. Independent QA pending.
Blocked by: none. No tracker publication requested.

## Outcome
Doctor explains extension/skill purpose, capabilities, disk/context costs and
evidence-backed recommendations without changing configuration during a scan.

## Scope
PRD DA-01–DA-12; deterministic collector, active-agent assessment contract,
docked panel, text report and regression/host evidence.

## Out of scope
Sync changes, moving clones, release, global-history reads, automatic cleanup,
exact billing attribution, runtime RAM/latency profiling.

## DoR
- [x] Owner approved baseline and privacy/model decisions.
- [x] Public SDK discovery and compaction-aware context contracts inspected.
- [x] Existing source/tests available; no credential required for fixture tests.
- [x] Work tree had no existing changes before the new PRD.

## AC
- [ ] Every DA-01–DA-12 acceptance condition in the PRD is observable.
- [ ] No model call on open or deterministic scan; explicit analysis consent.
- [ ] Facts include purpose, capabilities, provenance, disk and labeled context estimates.
- [ ] Skill advertisement, full-load potential and observed retained reads are distinct.
- [ ] Shared dependency totals deduplicate physical packages; unknowns stay unknown.
- [ ] Assessments validate scan/session/evidence and never mutate settings.
- [ ] Progress, cancel, partial failures, filters/sorting and text path are usable.
- [ ] Existing confirmed management actions pass regression tests.

## Test cases
TC1: package + skill + retained read fixture; inspect purpose/cost/detail.
TC2: shared dependency, excluded skill, missing file and malicious excerpt.
TC3: canceled/stale/invalid assessment; verify facts retained and no success verdict.
TC4: isolated installed SDK host with other extensions; no model/real-data use.
TC5: runtime semantic quality and owner acceptance remain separate QA gates.

## DoD
- [x] Package tests and typecheck pass; affected host integration executed.
- [x] Candidate manifest and current QA contract supplied.
- [ ] Independent review/QA and owner candidate approval recorded, or pending.
