import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { TuiMainScreen, visibleWidth, type Terminal } from '@earendil-works/pi-tui';
import { createPanel, RESERVED_KEYS } from '@prjct.app/pi-tui-kit';
import { fixture } from './audit-fixture.ts';
import { auditController } from '../src/audit/controller.ts';
import { auditPanelSpec } from '../src/audit/panel.ts';
import { doctorPanelSpec } from '../src/panel.ts';

test('audit reuses the shared renderer, keyboard/search and original management actions', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const audit = auditController(f.api); await audit.scan(f.ctx, f.host);
  const inventory = { packages: ['npm:fixture-ext@1.0.0'], extensions: [], installedNotLoaded: [] };
  const base = doctorPanelSpec({ reload: async () => inventory, request() {} }, { inv: inventory, busy: false, notice: undefined });
  const spec = auditPanelSpec(base, audit, { scan: () => audit.scan(f.ctx, f.host), analyze() {}, cancel: audit.cancel });
  for (const action of spec.actions ?? []) assert.equal(RESERVED_KEYS.has(action.key), false, 'no reserved shortcuts');
  assert.equal(spec.items().length, 3);
  const row = spec.items().find(item => item.label === 'fixture-skill'); assert.ok(row);
  const detail = spec.detail(row);
  assert.ok(detail.sections?.some(section => section.title === 'Purpose'));
  assert.ok(detail.sections?.some(section => section.title === 'Context accounting (estimates, not billing)'));
  assert.ok(detail.sections?.some(section => section.title === 'Verdict pending'));
  const dimensions = { columns: 120 };
  const terminal: Terminal = { start() {}, stop() {}, drainInput: async () => {}, write() {}, get columns() { return dimensions.columns; }, rows: 40,
    kittyProtocolActive: false, moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {}, setProgramStatus() {} };
  initTheme('dark', false);
  const tui = new TuiMainScreen(terminal);
  const panel = createPanel(spec, tui, f.ctx.ui.theme, () => {});
  t.after(() => { panel.dispose(); tui.stop(); });
  const key = async (value: string): Promise<void> => { panel.handleInput?.(value); await Promise.resolve(); };
  for (const width of [120, 60, 32]) {
    dimensions.columns = width;
    assert.ok(panel.render(width).every(line => visibleWidth(line) <= width), 'shared renderer fits terminal');
  }
  dimensions.columns = 120;
  await key('v');
  assert.equal(spec.items()[0]?.id, 'pkg:npm:fixture-ext@1.0.0', 'management spec unchanged');
  assert.ok(spec.actions?.find(action => action.key === 'x')?.when?.(spec.items()[0]));
  await key('v');
  await key('f');
  assert.equal(spec.items().filter(item => item.id !== 'audit:summary').length, 1, 'filter extensions');
  await key('f');
  assert.equal(spec.items()[1]?.label, 'fixture-skill', 'filter skills');
  await key('/');
  for (const character of 'does-not-exist') panel.handleInput?.(character);
  const lines = panel.render(120).join('\n');
  assert.match(lines, /Nothing matches/, 'search implemented by shared toolkit');
});

test('shared panel can cancel a scan without locking its action handler', async t => {
  const f = await fixture(); t.after(() => f.session.dispose());
  const audit = auditController(f.api);
  const inventory = { packages: [], extensions: [], installedNotLoaded: [] };
  const base = doctorPanelSpec({ reload: async () => inventory, request() {} }, { inv: inventory, busy: false, notice: undefined });
  const spec = auditPanelSpec(base, audit, { scan: () => audit.scan(f.ctx, f.host), analyze() {}, cancel: audit.cancel });
  const action = spec.actions?.find(item => item.key === 's'); assert.ok(action);
  const result = action.run(undefined, { refresh() {}, notice() {}, close() {}, select() {} });
  assert.equal(result, undefined, 'async scan runs outside shared renderer busy lock');
  assert.equal(audit.get().phase, 'scanning');
  spec.actions?.find(item => item.key === 'b')?.run(undefined, { refresh() {}, notice() {}, close() {}, select() {} });
  assert.equal(audit.get().phase, 'canceled');
});
