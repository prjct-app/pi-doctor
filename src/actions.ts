// Changes made through Pi's SDK. Each change backs up settings.json first, and cleanup moves
// files into a backup folder instead of deleting them.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { inventory, packageName, type Inventory } from "./inventory.ts";
import { backupRoot } from "./home.ts";
import { Manifest } from "./manifest.ts";

export type Host = {
  agentDir: string;
  settingsManager: SettingsManager;
  packages: DefaultPackageManager;
};

export function piHost(cwd: string, agentDir: string): Host {
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const packages = new DefaultPackageManager({ cwd, agentDir, settingsManager });
  return { agentDir, settingsManager, packages };
}

export async function readInventory(host: Host): Promise<Inventory> {
  const settingsText = await readFile(join(host.agentDir, "settings.json"), "utf8").catch(() => undefined);
  const npmJson = await readFile(join(host.agentDir, "npm", "package.json"), "utf8").catch(() => undefined);
  const extensionFiles = (await readdir(join(host.agentDir, "extensions")).catch(() => [] as string[])).sort();
  return inventory({ settingsText, extensionFiles, npmPackageJsonText: npmJson });
}

export async function backupSettings(host: Host, label: string): Promise<string> {
  const dir = join(backupRoot(), `${label}-${stamp()}`);
  await mkdir(dir, { recursive: true });
  await copyFile(join(host.agentDir, "settings.json"), join(dir, "settings.json")).catch(() => undefined);
  return dir;
}

// Enables or disables an extension file by toggling its "-" entry in settings.json.
export async function setExtensionEnabled(host: Host, name: string, enabled: boolean): Promise<string> {
  const backup = await backupSettings(host, enabled ? "enable" : "disable");
  const current = host.settingsManager.getExtensionPaths();
  const matches = (entry: string) => entry.replace(/^-/, "").split("/").pop() === name;
  const without = current.filter((entry) => !matches(entry));
  const was = current.find(matches);
  if (enabled) {
    host.settingsManager.setExtensionPaths(was ? [...without, was.replace(/^-/, "")] : without);
  } else {
    const path = was ?? join(host.agentDir, "extensions", name);
    host.settingsManager.setExtensionPaths([...without, `-${path.replace(/^-/, "")}`]);
  }
  await host.settingsManager.flush();
  return backup;
}

// Cleanup moves files into a backup folder instead of deleting them. Backup copies (.bak, .off) are
// never loaded. Disabled extensions are moved too, and their "-" entry is removed from settings.json.
// settings.json is backed up before anything changes.
export async function cleanExtensions(host: Host, backups: string[], disabled: string[]): Promise<string | undefined> {
  if (backups.length === 0 && disabled.length === 0) return undefined;
  const dir = join(backupRoot(), `clean-${stamp()}`);
  await mkdir(dir, { recursive: true });
  await copyFile(join(host.agentDir, "settings.json"), join(dir, "settings.json")).catch(() => undefined);
  const manifest = new Manifest();
  try {
    for (const name of [...backups, ...disabled]) {
      const from = join(host.agentDir, "extensions", name);
      const sha256 = createHash("sha256").update(await readFile(from)).digest("hex");
      await rename(from, join(dir, name));
      manifest.record({
        kind: "extension",
        name,
        origin: from,
        sha256,
        backupPath: join(dir, name),
        removedAt: new Date().toISOString(),
      });
    }
  } finally {
    manifest.close();
  }
  if (disabled.length > 0) {
    const gone = (entry: string) => disabled.includes(entry.replace(/^-/, "").split("/").pop() ?? "");
    host.settingsManager.setExtensionPaths(host.settingsManager.getExtensionPaths().filter((e) => !(e.startsWith("-") && gone(e))));
    await host.settingsManager.flush();
  }
  return dir;
}

// Uninstalls a package through the SDK and removes it from settings.json.
export async function uninstallPackage(host: Host, source: string): Promise<string> {
  const backup = await backupSettings(host, "uninstall");
  await host.packages.removeAndPersist(source);
  const manifest = new Manifest();
  try {
    manifest.record({
      kind: "package",
      name: packageName(source),
      origin: source,
      sha256: "",
      backupPath: backup,
      removedAt: new Date().toISOString(),
    });
  } finally {
    manifest.close();
  }
  return backup;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

