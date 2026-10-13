# pi-doctor

Inspect Pi extensions and skills in the shared docked panel. Doctor explains
purpose, observable capabilities, logical disk footprint and context estimates,
then lets the active model recommend what to keep, use on demand or review.

Available in npm 0.3.0.

## Commands

| Command | Action |
| --- | --- |
| `/doctor` | Open the panel and collect facts without a model call. |
| `/doctor scan` | Refresh the read-only audit. |
| `/doctor analyze` | Confirm an analysis of the existing scan using the active model and current context. |
| `/doctor cancel` | Cancel the Doctor operation; retain collected facts. |
| `/doctor report` | Print the same audit details as text. |

Panel controls: `s` scan, `a` analyze, `b` cancel, `f` filter, `o` sort,
`/` search and `v` switch to management. The shared TUI handles navigation,
detail focus, help and closing.

In management: `e` enable, `d` disable, `x` uninstall a package and `c`
clean backup/disabled files. Destructive actions require confirmation and back up
settings first. Run `/reload` after changing extension loading.

## Measurements and analysis

- Package/resource logical bytes exclude `node_modules` and `.git`; resolved
  runtime dependencies form a separate graph deduplicated by physical path.
- Skill catalog advertisement, potential instruction load and retained direct
  instruction/reference reads are separate.
- Tool declarations are estimated before provider/loadout transforms. Tokens use
  characters / 4; dynamic injection and indirect reads can remain unknown.
- Discovery uses configured packages, effective SDK skills and runtime capability
  metadata. Excluded resources and hook-only extensions may be undiscoverable.
- Analysis reads bounded resource excerpts and current session context, not global
  histories or auth files. Private filenames are excluded and common secrets
  redacted. Resource text is untrusted evidence.
- Analysis temporarily enables only Doctor's evidence/assessment tools, restoring
  the previous tools afterward. Recommendations never change configuration.

## Stored management data

`~/.prjct/pi-doctor/backups/` holds operation backups.
`~/.prjct/pi-doctor/manifest.sqlite` records removal origin, SHA-256, backup path
and time. Audit facts and recommendations remain session-local.

## Development

```bash
npm run check
npm test
```

Tests use isolated temporary fixtures. See the [audit design](docs/doctor-audit-sdd.md)
and [implementation ticket](tickets/doctor-audit.md).
