import assert from "node:assert/strict";
import { test } from "node:test";
import { inventory, packageName } from "../src/inventory.ts";

test("a file is active unless a '-' entry disables it; backups are never loaded", () => {
  const inv = inventory({
    settingsText: JSON.stringify({
      packages: ["npm:@prjct.app/pi-ui@0.1.4"],
      extensions: ["-/Users/jj/.pi/agent/extensions/off.ts", "/Users/jj/.pi/agent/extensions/listed.ts"],
    }),
    extensionFiles: ["off.ts", "listed.ts", "auto.ts", "old.ts.bak-20260922"],
    npmPackageJsonText: undefined,
  });
  const status = Object.fromEntries(inv.extensions.map((e) => [e.name, e.status]));
  assert.deepEqual(status, { "off.ts": "disabled", "listed.ts": "active", "auto.ts": "active", "old.ts.bak-20260922": "backup" });
});

test("packages installed in npm/ but absent from settings are reported as not loaded", () => {
  const inv = inventory({
    settingsText: JSON.stringify({ packages: ["npm:@prjct.app/pi-ui@0.1.4"] }),
    extensionFiles: [],
    npmPackageJsonText: JSON.stringify({ dependencies: { "@prjct.app/pi-ui": "^0.1.4", "@prjct.app/pi-answer": "^0.1.6" } }),
  });
  assert.deepEqual(inv.installedNotLoaded, ["@prjct.app/pi-answer"]);
});

test("package names are read from npm specs", () => {
  assert.equal(packageName("npm:@prjct.app/pi-ui@0.1.4"), "@prjct.app/pi-ui");
  assert.equal(packageName("npm:left-pad@1.3.0"), "left-pad");
});
