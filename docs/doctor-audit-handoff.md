# Doctor audit implementation handoff

Status: npm 0.3.0 published and installed; independent QA and semantic acceptance pending.
Base: `7c7781c`. Scope: [ticket](../tickets/doctor-audit.md), approved
[PRD](doctor-audit-prd.md) and [SDD](doctor-audit-sdd.md).

## Candidate

- Deterministic evidence collection, separate disk/context accounting and
  shared installed-dependency graph.
- Explicit active-agent semantic analysis with typed paginated evidence and
  validated assessment recording; no nested model or classifier.
- Data/actions/detail adapter over the existing Doctor management `PanelSpec`.
  All rendering, layout, search and keyboard handling remain in `pi-tui-kit`.
- Scan/cancel/filter/sort and text details; management confirmations retained.

The owner authorized npm publication and installation with "public ae instala".
Release authorization does not turn pending QA or semantic checks into passes.
No Git push or PR publication is authorized by this release instruction.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | Typecheck and immutable-binding check pass |
| `npm test` | 30 tests pass, 0 fail |
| `git diff --check` | Pass |
| `npm pack --dry-run --json` | All nine audit modules included; no publish |
| Installed SDK 1.2.0 isolated host | Candidate + npm Team/Palette load together |
| Host command/data checks | Short command, purposes/context detail, explicit print-mode rescan, engine-tool classification, unchanged settings and inactive analysis tools pass |
| Model requests during host scan | 0 |
| Published npm 0.3.0 integrity | Matches verified tarball |
| Installed npm 0.3.0 source files | Match published tarball |
| Real profile changes | Doctor pin only; no local extensions |
| Installed npm Doctor + Team/Palette in SDK 1.2.0 | Commands and audit data checks pass |

Package tests use SDK 1.1.0. The shared renderer is exercised at widths 120, 60
and 32, including shared search and the original management actions. Fixtures
test retained context edits/compaction, repeated/reference reads, shared
dependencies, partial failures, private files, symlinks, consent races, stale
results, invalid assessments and cancellation.

Verification logs, installed-host script, full candidate diff and content
digests are stored in the session's `/tmp/doctor-audit-evidence-*` directory.
The source manifest binds dirty and untracked files, not just the base commit.

## Review and remaining acceptance

Manual implementer self-review only. RDD tool: unavailable; no tool receipt
produced. No delegation or independent review tool was discovered.

The next `/qa` contract contains 17 observable items covering DA-01–DA-12,
the owner's TUI/SOLID/DRY/KISS steering, tool restoration, print-mode rescan
and ticket DoR/DoD. Independent QA must also exercise real active-model
judgment: a zero-call safety/UI extension and a skill irrelevant to the current
task must not be removed solely for absent observed use.

Remaining checks:
- Real active-model semantic quality and error/abort lifecycle.
- Independent interactive TUI and read-only tool-guard verification.
- Separate semantic/QA acceptance; npm publication and installation are authorized.

Discovery and attribution limits remain explicit: effective SDK skills and
observable registrations do not cover every excluded or hook-only resource;
indirect reads/dynamic injection and exact provider billing are unknown.
Common-secret redaction is bounded, not universal detection.

Inherited management limitation: `src/actions.ts` suppresses settings-copy
errors. Normal backup regressions pass; failure-to-copy handling was not changed
or tested by this audit candidate.
