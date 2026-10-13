# Doctor audit — PRD v1

Status: Approved baseline. Product owner: repository owner.
Source: owner's request to explain each extension's purpose, contents, weight,
value and recommended decision, including skill context injection; scope choices
confirmed through the clarification panel in this session.

## Outcome

Make `/doctor` a decision aid, not only an installed-resource inventory. Explain
what each extension and skill contributes, what it costs, and what action makes
sense for the owner's overall workflow, with project/session relevance added.
The existing panel currently offers inventory and management actions only.

## Scope and decisions

- Include effective user/project resources and package-supplied skills. Separate
  configured, installed, loaded, excluded and unresolved states; installation
  alone is not evidence of loading.
- Judge overall workflow value first; current project/session relevance is a
  separate dimension. A temporarily irrelevant resource may still be valuable.
- Read extension/skill files and current context only. Do not scan global session
  history. Do not read credentials or execute scanned extension/skill code.
- Semantic analysis uses the active model, explicitly on demand. No automatic
  background completion, cheaper model substitution or classifier verdict.
- Recommendations never automatically disable, remove or rewrite resources.
- This revision does not change `/sync`, move dev checkouts, or authorize release.

## Requirements and acceptance

| ID | Required behavior | Observable acceptance |
| --- | --- | --- |
| DA-01 | Scan from the docked `/doctor` panel; show progress, cancellation, result and failures. | Opening the panel does not call a model. Explicit scan updates the report. A canceled or failed scan is not shown as a successful new verdict. |
| DA-02 | Explain every extension's purpose and exposed capabilities: tools, commands, hooks and bundled resources where observable. | Each row has a detailed purpose/capability view with evidence provenance. Dynamic or unavailable capabilities are marked unknown instead of invented. |
| DA-03 | Measure extension/skill disk footprint, separating resource bytes, package bytes and shared dependencies. | A fixture with a shared dependency counts it once in aggregate totals and identifies sharing. Logical file bytes are not labeled RAM or context tokens. |
| DA-04 | Report extension context contributions: exposed tool declarations, observable injected instructions/messages and outputs. | Each figure has scope and measurement method. Unattributable dynamic contributions are unknown; zero is shown only when established. Shared contributions are not counted independently as unique overhead. |
| DA-05 | Report skill context contributions in separate categories: advertised catalog entry, full instructions and loaded references. | An advertised but unread skill is not charged its entire instructions as current injection. Potential full-load size is separate from observed/current presence. Repeated reads and post-compaction uncertainty are visible. |
| DA-06 | Distinguish byte counts, token estimates, observed usage and provider-reported totals. | Estimates identify their method and do not claim exact billing or per-resource provider token attribution. Unknown measurement remains unknown. |
| DA-07 | Produce an evidence-based value verdict and recommended action for each extension and skill. | Each assessment covers contribution, workflow value, project relevance, overlap/cost, reasons, evidence references, uncertainty and one recommendation: keep, use on demand, review, disable or remove. |
| DA-08 | Never equate absent observed use with no value. | A command-only UI extension and an unneeded-in-this-session skill are not recommended for removal solely because no invocation was seen. Dependencies and safety/workflow roles are considered. |
| DA-09 | Provide a global summary and priorities, with useful sort/filter options and per-resource detail. | The owner can inspect high context contributors, disk contributors and review candidates, and trace each recommendation back to its item evidence. Unknown values remain visible. |
| DA-10 | Keep deterministic scan facts available when model analysis cannot complete. | With no model, timeout, cancellation or invalid model output, collected facts remain inspectable; semantic verdicts are pending/failed, not fabricated. |
| DA-11 | Preserve privacy and trust boundaries. | No global session files or auth files are read; inspected files are treated as untrusted evidence, not instructions. Before analysis, show the active model and the categories sent. Use only task-relevant excerpts and exclude/redact secret material. |
| DA-12 | Preserve safe management actions and npm-only runtime installation. | Scanning does not modify settings or install packages. Existing confirmed management actions continue to work, with backups. Any later release is independently authorized. |

All requirements derive from the owner's requested audit outcome, clarified scope,
or safeguards necessary for that scope. Exact provider token attribution, runtime
memory profiling and latency benchmarks are not promised by this revision.

## Journeys and quality constraints

1. Open Doctor; inspect measured facts without a model request.
2. Request analysis; see model/data scope, progress and cancel control.
3. Inspect global priorities; open an extension or skill for reasons and evidence.
4. Decide whether to act; recommendations themselves have no side effects.
5. Missing/unreadable resources, duplicate skills, partial capability discovery,
   missing model and invalid output yield visible partial results.

Scans must not block the editor indefinitely; cancellation and resource boundaries
are required. Preserve Pi's public SDK, shared docked panel, immutable UI state
and independent npm package dependencies. Do not add parallel context pruning,
telemetry collection or model routing.

## Success measures

- Coverage: discovered extension/skill rows with either evidence-backed assessment
  or an explicit unresolved reason, divided by all discovered rows.
- Transparency: every cost figure identifies its scope/method; every recommendation
  links reasons and evidence. No baseline measured yet.
- Safety: no configuration mutation from scan/analysis; no global-history reads.
- Owner outcome: can explain why a resource should be kept, loaded on demand,
  reviewed or removed without opening its source manually.

## Approval and next boundary

Confirmed: overall-workflow criterion, current-project/session relevance, active
model on demand, resource files/current context only, no global-history scan.
The owner accepted the complete baseline through the clarification panel:
"Aprobar este alcance". Technical design must validate public-SDK
discovery/attribution limits before promising
actual injected-token measurements. No implementation or release is completed
by this document; no independent QA or candidate approval is implied.
