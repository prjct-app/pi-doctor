// Pure inventory: what is configured, what is installed, what is only leftover.
// Reads nothing itself; callers pass the file contents in, so it can be tested without Pi.

// Pi loads every *.ts in agentDir/extensions unless a "-" entry disables it, so a file that is not
// listed is still active. Only "-" disables, and backup copies are never loaded.
export type ExtensionStatus = "active" | "disabled" | "backup";
export type ExtensionFile = { name: string; status: ExtensionStatus };
export type Inventory = {
  packages: string[];
  extensions: ExtensionFile[];
  installedNotLoaded: string[];
};

const BACKUP = /\.(bak|off)/;

export function inventory(input: {
  settingsText: string | undefined;
  extensionFiles: string[];
  npmPackageJsonText: string | undefined;
}): Inventory {
  const settings = input.settingsText ? JSON.parse(input.settingsText) : {};
  const packages: string[] = (settings.packages ?? []).filter((p: unknown) => typeof p === "string");
  const entries: string[] = (settings.extensions ?? []).filter((e: unknown) => typeof e === "string");

  const activeNames = new Set(entries.filter((e) => !e.startsWith("-")).map(basename));
  const disabledNames = new Set(entries.filter((e) => e.startsWith("-")).map((e) => basename(e.slice(1))));

  const extensions: ExtensionFile[] = input.extensionFiles.map((name) => ({
    name,
    status: BACKUP.test(name) ? "backup" : disabledNames.has(name) && !activeNames.has(name) ? "disabled" : "active",
  }));

  const loaded = new Set(packages.map(packageName));
  const deps = Object.keys(input.npmPackageJsonText ? JSON.parse(input.npmPackageJsonText).dependencies ?? {} : {});
  const installedNotLoaded = deps.filter((name) => !loaded.has(name));

  return { packages, extensions, installedNotLoaded };
}

// "npm:@scope/name@1.2.3" -> "@scope/name"; "npm:name@1.2.3" -> "name".
export function packageName(spec: string): string {
  const bare = spec.replace(/^npm:/, "");
  const at = bare.startsWith("@") ? bare.indexOf("@", 1) : bare.indexOf("@");
  return at === -1 ? bare : bare.slice(0, at);
}

const basename = (path: string) => path.split("/").pop() ?? path;
