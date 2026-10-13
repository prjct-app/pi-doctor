# Doctor audit — SDD v1

Baseline: approved [PRD v1](doctor-audit-prd.md), DA-01–DA-12.
Local design choices implement the approved outcome; no new product fork.

## Contracts
- Discovery uses the current public SDK's tool/command source metadata and
  command-context skill list, plus configured package paths. Never reload scanned
  extensions or call package resolution that can install/repair dependencies.
  Runtime source metadata proves registration; configuration alone does not.
- Filesystem collector reads manifests, documentation and bounded source files
  only under identified resource roots. Never follow arbitrary symlinks out of
  roots. Disk traversal counts logical file bytes; excludes node_modules/.git.
  Dependency manifests resolve read-only; real paths deduplicate shared packages.
- Current-context collector uses the SDK's compaction-aware session projection.
  Correlate tool calls/results by ID for exact observed read text and tool use.
  Unobservable bash/codemode reads and dynamic injections remain unknown.
- Token estimates use ceil(characters / 4), never provider-billed tokens. Tool
  declaration estimates are pre-provider/pre-loadout; hiding/codemode transformations
  prevent claims of exact final injection. Skill catalog entries use SDK formatting
  with shared wrapper overhead separate.
- Report owns immutable resources, measurements, evidence IDs and warnings.
  Dependencies are a separate global graph: no summing shared bytes per resource.
- Semantic analysis runs in the existing active agent, preserving model/reasoning
  and current context. Explicit consent adds a bounded request; the agent reads
  paged audit evidence and records structured assessments with typed tools.
  No classifier, nested model or automatic completion. Explicit analysis temporarily
  declares only the two audit tools and blocks other tool calls as a read-only
  guard; completion/cancel/failure restores the previous tool set.
- Recording validates scan/session identity, per-resource evidence references,
  unique IDs and required reasons/uncertainty. Rescans/cancel invalidate pending
  results. Unknown/missing rows remain pending. Analysis completion never edits
  settings. Reports stay session-memory only, cleared on session replacement.
- Reuse `pi-tui-kit` openPanel/PanelSpec and the existing Doctor management spec.
  The audit adapter supplies data/actions/detail only; it defines no renderer,
  navigation, input handling, layout, borders, search or styles. Collection,
  context accounting, semantic validation and the panel adapter have separate
  reasons to change (SOLID/DRY/KISS).
- Shared docked panel provides scan/progress/cancel, analysis, sort/filter and detail;
  existing confirmed management intents stay separate. Text commands expose the
  same facts. Analysis tools activate only for the requested run, then withdraw.

## Boundaries and failures
Scanned prose is untrusted data. Only resource excerpts and facts go to the active
agent; no auth/global-history files, full raw source dump or new telemetry.
Redact common secret formats and assignments from excerpts; allow-list file kinds.
Errors are per-resource warnings. Abort retains the last finished facts. Missing
model blocks semantic analysis only. Failed/incomplete agent runs mark unresolved
assessments rather than inventing recommendations.

## Verification
DA-01/09/10: panel and lifecycle tests, rendered panel narrow/wide, cancel/retry.
DA-02/03: resource fixtures, shared dependencies, malformed manifest, symlink.
DA-04/05/06: tool ownership, skill advertisement vs reads, compaction, estimates.
DA-07/08: structured validation and agent instruction guard tests; live semantic
quality requires independent QA/owner acceptance, not only deterministic tests.
DA-11/12: credential sentinel, read-only settings digest, existing action tests.
Installed-host integration uses an isolated SDK session with sibling extensions
loaded together; production settings remain npm-only. No release authorization.
