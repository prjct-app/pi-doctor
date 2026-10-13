# pi-doctor

Keeps Pi's packages and extensions lean. It reports what is loaded, disabled, leftover, or installed but not loaded, and it can enable, disable, clean, or uninstall them. Nothing is deleted outright: removed files go to a backup folder and every removal is recorded in a SQLite manifest.

## Commands

| Command | What it does |
| --- | --- |
| `/pi-doctor` | Report. Read only. |
| `/pi-doctor disable <file.ts>` | Stops loading an extension. Settings backed up first. Run `/reload`. |
| `/pi-doctor enable <file.ts>` | Loads it again. |
| `/pi-doctor clean` | Lists backup copies and disabled extensions that would be moved. |
| `/pi-doctor clean --yes` | Moves them to `~/.prjct/pi-doctor/backups/clean-<time>/` and records them. |
| `/pi-doctor remove <spec>` | Shows what would be uninstalled. |
| `/pi-doctor remove <spec> --yes` | Uninstalls the package through Pi's SDK and removes it from settings. |

## Where things live

- `~/.prjct/pi-doctor/backups/` holds each backup, named by operation and time.
- `~/.prjct/pi-doctor/manifest.sqlite` records kind, name, origin, SHA-256, backup path and time for every removal.
- Nothing is written inside Pi's folder except the changes you asked for in `settings.json`.

## How Pi loads extensions

Pi loads every `*.ts` in `extensions/` unless `settings.json` has a `-` entry for it. So a file that is not listed is still active. Backup copies (`.bak`, `.off`) are never loaded.

## Development

```bash
npm test
npm run check
```

Tests use temporary folders through `PRJCT_HOME`, so they never touch your real Pi or `~/.prjct`.
