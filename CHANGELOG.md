# Changelog

## 0.3.0

- Add extension/skill purpose, capability evidence, separate disk/context costs and shared dependency measurements to the existing Doctor panel.
- Add confirmed active-agent assessments, validated recommendations and read-only analysis tools.
- Add scan/cancel, filtering/sorting and a text report through the shared TUI data contract; retain existing management actions.

## 0.2.0

- `/doctor` opens the shared docked panel: every package and extension in this Pi, with the one change to make to each. Press `e` to enable, `d` to disable, `x` to remove a package, `c` to clean backups and disabled files. Settings.json is backed up before any change. Replaces the old `/pi-doctor` text-only command.

## 0.1.0

- Report of installed packages and extensions: active, disabled, backup copy, or installed but not loaded.
- `disable` / `enable` an extension by toggling its entry in settings through Pi's SDK, with a settings backup first.
- `clean [--yes]`: moves backup copies and disabled extensions out of Pi and records each one in a SQLite manifest. Dry run without `--yes`.
- `remove <spec> [--yes]`: uninstalls a package through Pi's SDK, backs up settings, and records it in the manifest.
- Data lives in `~/.prjct/pi-doctor/` (backups in `backups/`, manifest in `manifest.sqlite`), outside Pi's folder.
