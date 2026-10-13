// SQLite record of everything pi-doctor removed: what it was, where it came from, its hash, and
// where its copy is kept. Same storage pattern as pi-signals: node:sqlite, file private (0600).
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { doctorHome } from "./home.ts";

export type Removal = {
  kind: "package" | "extension";
  name: string;
  origin: string;
  sha256: string;
  backupPath: string | null;
  removedAt: string;
};

export class Manifest {
  private readonly db: DatabaseSync;

  constructor(path = join(doctorHome(), "manifest.sqlite")) {
    mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`
      create table if not exists removals (
        id integer primary key,
        kind text not null check (kind in ('package', 'extension')),
        name text not null,
        origin text not null,
        sha256 text,
        backup_path text,
        removed_at text not null
      )`);
  }

  record(entry: Removal): void {
    this.db
      .prepare("insert into removals (kind, name, origin, sha256, backup_path, removed_at) values (?, ?, ?, ?, ?, ?)")
      .run(entry.kind, entry.name, entry.origin, entry.sha256, entry.backupPath, entry.removedAt);
  }

  list(): Removal[] {
    return this.db
      .prepare("select kind, name, origin, sha256, backup_path, removed_at from removals order by id desc")
      .all()
      .map((r) => ({
        kind: r.kind as "package" | "extension",
        name: String(r.name),
        origin: String(r.origin),
        sha256: r.sha256 == null ? "" : String(r.sha256),
        backupPath: r.backup_path == null ? null : String(r.backup_path),
        removedAt: String(r.removed_at),
      }));
  }

  close(): void {
    this.db.close();
  }
}
