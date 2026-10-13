import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanExtensions, piHost, readInventory, setExtensionEnabled, uninstallPackage } from "./src/actions.ts";
import { packageName } from "./src/inventory.ts";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const USAGE = [
  "Usage:",
  "  /pi-doctor                       report: what is loaded, disabled, leftover, or installed but not loaded",
  "  /pi-doctor disable <file.ts>     stop loading an extension (settings backed up first)",
  "  /pi-doctor enable <file.ts>      load it again",
  "  /pi-doctor clean [--yes]         move backup copies out of extensions/ (dry run without --yes)",
  "  /pi-doctor remove <spec> [--yes] uninstall a package and remove it from settings (dry run without --yes)",
].join("\n");

type Ui = { ui: { notify(message: string, level: "info" | "error"): void } };

export default function piDoctor(pi: ExtensionAPI) {
  pi.registerCommand("pi-doctor", {
    description: "report and clean Pi packages and extensions; enable, disable or uninstall them safely",
    handler: async (args, ctx) => {
      const [verb = "report", target = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const yes = [target, ...rest].includes("--yes");
      try {
        const host = piHost(process.cwd(), AGENT_DIR);
        if (verb === "report") return notify(ctx, await report(host));
        if (verb === "disable" || verb === "enable") {
          if (!target.endsWith(".ts")) return notify(ctx, USAGE);
          const backup = await setExtensionEnabled(host, target, verb === "enable");
          return notify(ctx, `pi-doctor: ${verb}d ${target}. Backup: ${backup}\nrun /reload to apply`);
        }
        if (verb === "clean") {
          const inv = await readInventory(host);
          const backups = inv.extensions.filter((e) => e.status === "backup").map((e) => e.name);
          const disabled = inv.extensions.filter((e) => e.status === "disabled").map((e) => e.name);
          const all = [...backups, ...disabled];
          if (all.length === 0) return notify(ctx, "pi-doctor: nothing to clean");
          if (!yes) {
            return notify(ctx, [
              `pi-doctor: would move to a backup folder (nothing is deleted):`,
              ...backups.map((n) => `  backup copy  ${n}`),
              ...disabled.map((n) => `  disabled     ${n}`),
              `run /pi-doctor clean --yes to do it. settings.json is backed up first.`,
            ].join("\n"));
          }
          const dir = await cleanExtensions(host, backups, disabled);
          return notify(ctx, `pi-doctor: moved ${all.length} file(s) to ${dir}. Run /reload to apply.`);
        }
        if (verb === "remove") {
          if (!target) return notify(ctx, USAGE);
          const inv = await readInventory(host);
          if (!inv.packages.includes(target)) return notify(ctx, `pi-doctor: ${target} is not in settings.json`);
          if (!yes) return notify(ctx, `pi-doctor: would uninstall ${packageName(target)} and remove it from settings.json\nrun /pi-doctor remove ${target} --yes to do it`);
          const backup = await uninstallPackage(host, target);
          return notify(ctx, `pi-doctor: uninstalled ${packageName(target)}. Backup: ${backup}\nrun /reload to apply`);
        }
        return notify(ctx, USAGE);
      } catch (err) {
        ctx.ui.notify(`pi-doctor: ${(err as Error).message}`, "error");
      }
    },
  });
}

async function report(host: ReturnType<typeof piHost>): Promise<string> {
  const inv = await readInventory(host);
  const lines = [
    `packages (${inv.packages.length}), all loaded:`,
    ...inv.packages.map((p) => `  ${p}`),
    `extensions:`,
    ...inv.extensions.map((e) => `  ${e.status.padEnd(9)} ${e.name}`),
    inv.installedNotLoaded.length
      ? `installed in npm/ but not in settings.json (not loaded):\n${inv.installedNotLoaded.map((n) => `  ${n}`).join("\n")}`
      : "nothing installed outside settings.json",
  ];
  return lines.join("\n");
}

function notify(ctx: Ui, message: string) {
  ctx.ui.notify(message, "info");
}

