import assert from "node:assert/strict";
import { test } from "node:test";
import { doctorPanelSpec, extensionNameFromId, isExtensionId, isPackageId, packageSpecFromId, type DoctorIntent, type DoctorState } from "../src/panel.ts";
import { inventory, type Inventory } from "../src/inventory.ts";

function makeState(inv: Inventory): DoctorState {
  return { inv, busy: false, notice: undefined };
}

test("items list packages first, then extensions, then orphans", () => {
  const inv = inventory({
    settingsText: JSON.stringify({ packages: ["npm:@prjct.app/pi-ui@0.1.4", "npm:@prjct.app/pi-doctor@0.1.0"] }),
    extensionFiles: ["a.ts", "off.ts"],
    npmPackageJsonText: JSON.stringify({ dependencies: { "@prjct.app/pi-ui": "^0.1.4", "@prjct.app/pi-doctor": "^0.1.0", "@prjct.app/pi-answer": "^0.1.6" } }),
  });
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  const items = spec.items();
  const ids = items.map(i => i.id);
  assert.ok(ids.some(id => isPackageId(id) && packageSpecFromId(id) === "npm:@prjct.app/pi-ui@0.1.4"), "ui package shown");
  assert.ok(ids.some(id => isPackageId(id) && packageSpecFromId(id) === "npm:@prjct.app/pi-doctor@0.1.0"), "doctor package shown");
  assert.ok(ids.some(id => id === "orphan:@prjct.app/pi-answer"), "orphan package shown");
  assert.ok(ids.some(id => isExtensionId(id) && extensionNameFromId(id) === "a.ts"), "active extension shown");
  assert.ok(ids.some(id => isExtensionId(id) && extensionNameFromId(id) === "off.ts"), "extension shown");
});

test("summary reports counts and surfaces things to clean", () => {
  const inv: Inventory = {
    packages: ["npm:@prjct.app/pi-ui@0.1.4"],
    extensions: [
      { name: "a.ts", status: "active" },
      { name: "a.ts.bak", status: "backup" },
      { name: "off.ts", status: "disabled" },
    ],
    installedNotLoaded: ["@prjct.app/pi-answer"],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  const summary = spec.summary?.() ?? "";
  assert.match(summary, /1 packages/, "package count");
  assert.match(summary, /1 extensions active/, "active extension count");
  assert.match(summary, /2 to clean/, "backup+disabled count");
  assert.match(summary, /1 installed but not loaded/, "orphan count");
});

test("enable action is only shown on a disabled extension", () => {
  const inv: Inventory = {
    packages: [],
    extensions: [
      { name: "a.ts", status: "active" },
      { name: "off.ts", status: "disabled" },
    ],
    installedNotLoaded: [],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  const enable = spec.actions?.find(a => a.key === "e");
  assert.ok(enable);
  assert.equal(enable?.when?.({ id: "ext:a.ts", label: "ext:a.ts" }), false, "active is not enableable");
  assert.equal(enable?.when?.({ id: "ext:off.ts", label: "ext:off.ts" }), true, "disabled is enableable");
});

test("disable action is only shown on an active extension", () => {
  const inv: Inventory = {
    packages: [],
    extensions: [
      { name: "a.ts", status: "active" },
      { name: "off.ts", status: "disabled" },
    ],
    installedNotLoaded: [],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  const disable = spec.actions?.find(a => a.key === "d");
  assert.ok(disable);
  assert.equal(disable?.when?.({ id: "ext:a.ts", label: "ext:a.ts" }), true);
  assert.equal(disable?.when?.({ id: "ext:off.ts", label: "ext:off.ts" }), false);
});

test("remove action is only shown on a package and requires confirm", () => {
  const inv: Inventory = {
    packages: ["npm:@prjct.app/pi-ui@0.1.4"],
    extensions: [],
    installedNotLoaded: [],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  const remove = spec.actions?.find(a => a.key === "x");
  assert.ok(remove);
  assert.equal(remove?.confirm, true, "remove must confirm");
  assert.equal(remove?.when?.({ id: "pkg:npm:@prjct.app/pi-ui@0.1.4", label: "pkg:npm:@prjct.app/pi-ui@0.1.4" }), true);
  assert.equal(remove?.when?.({ id: "ext:nothing", label: "ext:nothing" }), false);
});

test("clean is bulk and only shown when there is something to clean", () => {
  const cleanInv: Inventory = {
    packages: [],
    extensions: [{ name: "a.ts.bak", status: "backup" }],
    installedNotLoaded: [],
  };
  const emptyInv: Inventory = { packages: [], extensions: [], installedNotLoaded: [] };
  const cleanSpec = doctorPanelSpec({ reload: async () => cleanInv, request: () => undefined }, makeState(cleanInv));
  const clean = cleanSpec.actions?.find(a => a.key === "c");
  assert.ok(clean);
  assert.equal(clean?.bulk, true);
  assert.equal(clean?.confirm, true);
  assert.equal(clean?.when?.(undefined), true);

  const emptySpec = doctorPanelSpec({ reload: async () => emptyInv, request: () => undefined }, makeState(emptyInv));
  const emptyClean = emptySpec.actions?.find(a => a.key === "c");
  assert.equal(emptyClean?.when?.(undefined), false);
});

test("actions send the right intents through ops.request", () => {
  const intents: DoctorIntent[] = [];
  const inv: Inventory = {
    packages: ["npm:@prjct.app/pi-ui@0.1.4"],
    extensions: [
      { name: "a.ts", status: "active" },
      { name: "off.ts", status: "disabled" },
      { name: "a.ts.bak", status: "backup" },
    ],
    installedNotLoaded: [],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: i => intents.push(i) }, makeState(inv));
  const find = (key: string) => spec.actions?.find(a => a.key === key);
  const close = () => undefined;
  const panel = { refresh() {}, notice() {}, select() {}, close };
  find("d")?.run({ id: "ext:a.ts", label: "ext:a.ts" }, panel);
  assert.deepEqual(intents.at(-1), { action: "disable", name: "a.ts" });
  find("e")?.run({ id: "ext:off.ts", label: "ext:off.ts" }, panel);
  assert.deepEqual(intents.at(-1), { action: "enable", name: "off.ts" });
  find("x")?.run({ id: "pkg:npm:@prjct.app/pi-ui@0.1.4", label: "pkg:npm:@prjct.app/pi-ui@0.1.4" }, panel);
  assert.deepEqual(intents.at(-1), { action: "remove", spec: "npm:@prjct.app/pi-ui@0.1.4" });
  find("c")?.run(undefined, panel);
  assert.deepEqual(intents.at(-1), { action: "clean" });
});

test("detail for a package shows the spec and the action hint", () => {
  const inv: Inventory = {
    packages: ["npm:@prjct.app/pi-ui@0.1.4"],
    extensions: [],
    installedNotLoaded: [],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  const detail = spec.detail({ id: "pkg:npm:@prjct.app/pi-ui@0.1.4", label: "@prjct.app/pi-ui" });
  assert.equal(detail.title, "@prjct.app/pi-ui");
  assert.equal(detail.subtitle, "npm:@prjct.app/pi-ui@0.1.4");
  assert.ok(detail.sections?.some(s => s.title.includes("Press x to remove")));
});

test("detail for an extension shows the right hint per status", () => {
  const inv: Inventory = {
    packages: [],
    extensions: [
      { name: "a.ts", status: "active" },
      { name: "off.ts", status: "disabled" },
      { name: "a.ts.bak", status: "backup" },
    ],
    installedNotLoaded: [],
  };
  const spec = doctorPanelSpec({ reload: async () => inv, request: () => undefined }, makeState(inv));
  assert.match(spec.detail({ id: "ext:a.ts", label: "a.ts" }).sections?.at(0)?.title ?? "", /Press d to disable/);
  assert.match(spec.detail({ id: "ext:off.ts", label: "off.ts" }).sections?.at(0)?.title ?? "", /Press e to enable/);
  assert.match(spec.detail({ id: "ext:a.ts.bak", label: "a.ts.bak" }).sections?.at(0)?.title ?? "", /Press c to clean/);
});
