import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { brand, openPanel } from '@prjct.app/pi-tui-kit';
import { homedir } from "node:os";
import { join } from "node:path";
import { cleanExtensions, piHost, readInventory, setExtensionEnabled, uninstallPackage, type Host } from "./src/actions.ts";
import { packageName } from "./src/inventory.ts";
import { doctorPanelSpec, type DoctorIntent, type DoctorState } from "./src/panel.ts";
import { auditController, type AuditController } from "./src/audit/controller.ts";
import { auditPanelSpec, auditText } from "./src/audit/panel.ts";
import { registerAuditTools } from "./src/audit/tools.ts";
import { AUDIT_TOOL_NAMES, errorText } from "./src/audit/types.ts";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const USAGE = [
  "Usage:",
  "  /doctor            open the docked panel: every package and extension, with the one change to make",
  "  /doctor scan       refresh the read-only extension/skill audit",
  "  /doctor analyze    analyze an existing scan with the active model (confirmation)",
  "  /doctor cancel     invalidate pending scan/analysis results",
  "  /doctor report     print the audit as text (no model call)",
].join("\n");



export default function piDoctor(pi: ExtensionAPI) {
  const audit = auditController(pi);
  registerAuditTools(pi, audit);
  pi.on("session_start", () => audit.reset());
  pi.on("session_shutdown", () => audit.reset());
  pi.on("agent_settled", () => audit.settled());
  pi.on("tool_call", event => {
    if (audit.get().phase === "analyzing" && !AUDIT_TOOL_NAMES.some(name => name === event.toolName))
      return { block: true, reason: "Doctor analysis is read-only: use only its evidence and assessment tools, or cancel the analysis." };
  });
  pi.registerCommand("doctor", {
    description: brand("doctor: every package and extension, with the one change to make to each"),
    handler: async (args, ctx) => {
      const verb = args.trim().split(/\s+/)[0] ?? "";
      try {
        if (verb === "cancel") { cancelAudit(ctx, audit); return ctx.ui.notify("Doctor scan/analysis canceled; measured facts retained.", "info"); }
        if (verb === "analyze") return await audit.analyze(ctx);
        if (verb === "report") return await report(ctx, audit);
        if (verb === "help" || verb === "--help" || verb === "-h") return ctx.ui.notify(USAGE, "info");
        if (verb && verb !== "scan") return ctx.ui.notify(USAGE, "error");
        return await openDoctorPanel(ctx, audit, verb === "scan");
      } catch (error) { ctx.ui.notify(`doctor: ${errorText(error)}`, "error"); }
    },
  });
}

async function openDoctorPanel(ctx: ExtensionCommandContext, audit: AuditController, rescan = false): Promise<void> {
  if (!(ctx.hasUI && ctx.mode === "tui")) return report(ctx, audit, rescan);
  const host = piHost(ctx.cwd, AGENT_DIR);
  host.settingsManager.setProjectTrusted(ctx.isProjectTrusted());
  const initial = await loadState(host, undefined);
  const pending: { intent?: DoctorIntent; analyze?: boolean } = {};
  const ops = { reload: async () => readInventory(host), request: (intent: DoctorIntent) => { pending.intent = intent; } };
  const spec = auditPanelSpec(doctorPanelSpec(ops, initial), audit, {
    scan: () => audit.scan(ctx, host), analyze: () => { pending.analyze = true; }, cancel: () => cancelAudit(ctx, audit),
  });
  const scanning = (rescan || !audit.get().report) && !["scanning", "analyzing"].includes(audit.get().phase)
    ? audit.scan(ctx, host) : undefined;
  try { await openPanel(ctx, spec); }
  finally { if (audit.get().phase === "scanning") audit.cancel(); await scanning; }
  if (pending.analyze) return audit.analyze(ctx);
  if (!pending.intent) return;
  const result = await fulfil(ctx, host, pending.intent);
  ctx.ui.notify(result.text, result.tone === "error" ? "error" : "info");
  return openDoctorPanel(ctx, audit, true);
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

async function report(ctx: ExtensionCommandContext, audit: AuditController, rescan = false): Promise<void> {
  const host = piHost(ctx.cwd, AGENT_DIR);
  host.settingsManager.setProjectTrusted(ctx.isProjectTrusted());
  if (rescan || !audit.get().report) await audit.scan(ctx, host);
  const initial = await loadState(host, undefined);
  const spec = auditPanelSpec(doctorPanelSpec({ reload: async () => initial.inv, request: () => undefined }, initial), audit,
    { scan: () => audit.scan(ctx, host), analyze: () => undefined, cancel: audit.cancel });
  ctx.ui.notify(auditText(spec), "info");
}

function cancelAudit(ctx: ExtensionCommandContext, audit: AuditController): void {
  const stopAgent = audit.get().phase === "analyzing";
  audit.cancel();
  if (stopAgent) ctx.abort();
}

async function confirm(ctx: ExtensionCommandContext, title: string, subtitle: string): Promise<boolean> {
  return Boolean(await ctx.ui.confirm?.(title, subtitle));
}
