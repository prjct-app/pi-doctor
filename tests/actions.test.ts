import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cleanExtensions, piHost, readInventory, setExtensionEnabled } from "../src/actions.ts";

process.env.PRJCT_HOME = await mkdtemp(join(tmpdir(), "prjct-home-"));

async function agent() {
  const dir = await mkdtemp(join(tmpdir(), "pi-doctor-"));
  await mkdir(join(dir, "extensions"), { recursive: true });
  await writeFile(join(dir, "settings.json"), JSON.stringify({
    packages: [],
    extensions: [join(dir, "extensions", "a.ts")],
  }, null, 2));
  await writeFile(join(dir, "extensions", "a.ts"), "export default () => {};\n");
  await writeFile(join(dir, "extensions", "a.ts.bak-1"), "old\n");
  return dir;
}

test("disable writes a '-' entry through the SDK, enable removes it, both keep a backup", async () => {
  const dir = await agent();
  const host = piHost(dir, dir);
  const backup = await setExtensionEnabled(host, "a.ts", false);
  assert.ok((await readdir(backup)).includes("settings.json"));
  assert.ok(backup.startsWith(process.env.PRJCT_HOME!), "backup must live outside the Pi folder");
  const off = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  assert.ok(off.extensions.some((e: string) => e.startsWith("-") && e.endsWith("a.ts")), JSON.stringify(off));

  const inv = await readInventory(piHost(dir, dir));
  assert.equal(inv.extensions.find((e) => e.name === "a.ts")?.status, "disabled");

  await setExtensionEnabled(piHost(dir, dir), "a.ts", true);
  const on = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  assert.ok(on.extensions.every((e: string) => !e.startsWith("-")), JSON.stringify(on));
});

test("clean moves backup copies out of extensions/ and keeps them", async () => {
  const dir = await agent();
  const host = piHost(dir, dir);
  const inv = await readInventory(host);
  const names = inv.extensions.filter((e) => e.status === "backup").map((e) => e.name);
  assert.deepEqual(names, ["a.ts.bak-1"]);
  const moved = await cleanExtensions(host, names, []);
  assert.ok(moved);
  assert.equal(await readFile(join(moved!, "a.ts.bak-1"), "utf8"), "old\n");
  assert.deepEqual(await readdir(join(dir, "extensions")), ["a.ts"]);
});

test("clean also moves disabled extensions out and removes their '-' entry, with backups", async () => {
  const dir = await agent();
  await setExtensionEnabled(piHost(dir, dir), "a.ts", false);
  const host = piHost(dir, dir);
  const inv = await readInventory(host);
  const disabled = inv.extensions.filter((e) => e.status === "disabled").map((e) => e.name);
  assert.deepEqual(disabled, ["a.ts"]);
  const moved = await cleanExtensions(host, [], disabled);
  assert.equal(await readFile(join(moved!, "a.ts"), "utf8"), "export default () => {};\n");
  assert.equal(await readFile(join(moved!, "settings.json"), "utf8").then((t) => t.includes("-")), true);
  const after = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  assert.deepEqual(after.extensions, []);
  const { Manifest } = await import("../src/manifest.ts");
  const manifest = new Manifest();
  const rows = manifest.list().filter((r) => r.name === "a.ts");
  manifest.close();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "extension");
  assert.equal(rows[0].sha256.length, 64);
  assert.deepEqual(await readdir(join(dir, "extensions")), ["a.ts.bak-1"]);
});
