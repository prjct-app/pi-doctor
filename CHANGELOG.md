# Changelog

## 0.1.0

- Report of installed packages and extensions: active, disabled, backup copy, or installed but not loaded.
- `disable` / `enable` an extension by toggling its entry in settings through Pi's SDK, with a settings backup first.
- `clean [--yes]`: moves backup copies and disabled extensions out of Pi and records each one in a SQLite manifest. Dry run without `--yes`.
- `remove <spec> [--yes]`: uninstalls a package through Pi's SDK, backs up settings, and records it in the manifest.
- Data lives in `~/.prjct/pi-doctor/` (backups in `backups/`, manifest in `manifest.sqlite`), outside Pi's folder.
