import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { brand, openPanel, panelText } from '@prjct.app/pi-tui-kit';
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanExtensions, piHost, readInventory, setExtensionEnabled, uninstallPackage, type Host } from "./src/actions.ts";
import { packageName } from "./src/inventory.ts";
import { doctorPanelSpec, type DoctorIntent, type DoctorState } from "./src/panel.ts";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const USAGE = [
  "Usage:",
  "  /doctor            open the docked panel: every package and extension, with the one change to make",
  "  /doctor report     print the same inventory as text (no TUI)",
].join("\n");

type Ui = { ui: { notify(message: string, level: "info" | "error"): void; confirm?(title: string, subtitle: string): Promise<boolean> } };

export default function piDoctor(pi: ExtensionAPI) {
  pi.registerCommand("doctor", {
    description: brand("doctor: every package and extension, with the one change to make to each"),
    handler: async (args, ctx) => {
      const verb = args.trim().split(/\s+/)[0] ?? "";
      if (verb === "report") return report(ctx);
      if (verb === "help" || verb === "--help" || verb === "-h") return ctx.ui.notify(USAGE, "info");
      return openDoctorPanel(ctx);
    },
  });
}

async function openDoctorPanel(ctx: ExtensionCommandContext): Promise<void> {
  if (!(ctx.hasUI && ctx.mode === "tui")) {
    await report(ctx);
    return;
  }
  const cwd = process.cwd();
  const host = piHost(cwd, AGENT_DIR);
  const initial = await loadState(host, { text: `Reading Pi from ${host.agentDir}…`, tone: "accent" });
  const pending: { intent?: DoctorIntent } = {};
  const ops = {
    reload: async () => readInventory(host),
    request: (intent: DoctorIntent) => { pending.intent = intent; },
  };
  await openPanel(ctx, doctorPanelSpec(ops, initial));
  if (!pending.intent) return;
  const next = await fulfil(ctx, host, pending.intent).catch(error => {
    ctx.ui.notify(`doctor: ${(error as Error).message}`, "error");
    return { text: `${(error as Error).message}`, tone: "error" as "error" };
  });
  const refreshed = await loadState(host, next);
  await openPanel(ctx, doctorPanelSpec(ops, refreshed));
}

async function fulfil(ctx: ExtensionCommandContext, host: Host, intent: DoctorIntent): Promise<{ text: string; tone: "accent" | "warning" | "error" }> {
  switch (intent.action) {
    case "enable": {
      const backup = await setExtensionEnabled(host, intent.name, true);
      return { text: `Enabled ${intent.name}. Backup: ${backup}\nrun /reload to apply`, tone: "accent" };
    }
    case "disable": {
      const backup = await setExtensionEnabled(host, intent.name, false);
      return { text: `Disabled ${intent.name}. Backup: ${backup}\nrun /reload to apply`, tone: "accent" };
    }
    case "remove": {
      if (!(await confirm(ctx, `Remove ${packageName(intent.spec)}?`, "Uninstalls the package and removes it from settings.json. A backup is kept."))) {
        return { text: `Cancelled: ${packageName(intent.spec)} was not removed.`, tone: "accent" };
      }
      const backup = await uninstallPackage(host, intent.spec);
      return { text: `Removed ${packageName(intent.spec)}. Backup: ${backup}\nrun /reload to apply`, tone: "accent" };
    }
    case "clean": {
      const inv = await readInventory(host);
      const backups = inv.extensions.filter(e => e.status === "backup").map(e => e.name);
      const disabled = inv.extensions.filter(e => e.status === "disabled").map(e => e.name);
      if (backups.length === 0 && disabled.length === 0) return { text: "Nothing to clean.", tone: "accent" };
      if (!(await confirm(ctx, `Move ${backups.length + disabled.length} file(s) to a backup folder?`,
          "Nothing is deleted. Disabled files are also removed from settings.json. A backup of settings.json is kept."))) {
        return { text: `Cancelled: nothing was moved.`, tone: "accent" };
      }
      const dir = await cleanExtensions(host, backups, disabled);
      return { text: `Moved ${backups.length + disabled.length} file(s) to ${dir ?? ""}. Run /reload to apply.`, tone: "accent" };
    }
  }
}

async function loadState(host: Host, notice: { text: string; tone: "accent" | "warning" | "error" } | undefined): Promise<DoctorState> {
  const inv = await readInventory(host);
  return { inv, busy: false, notice };
}

async function report(ctx: Ui): Promise<void> {
  try {
    const host = piHost(process.cwd(), AGENT_DIR);
    const initial = await loadState(host, undefined);
    ctx.ui.notify(panelText(doctorPanelSpec({ reload: async () => initial.inv, request: () => undefined }, initial)), "info");
  } catch (error) {
    ctx.ui.notify(`doctor: ${(error as Error).message}`, "error");
  }
}

async function confirm(ctx: ExtensionCommandContext, title: string, subtitle: string): Promise<boolean> {
  return Boolean(await ctx.ui.confirm?.(title, subtitle));
}
