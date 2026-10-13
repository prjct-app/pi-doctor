/**
 * The /doctor docked panel: every package and extension in this Pi, with the
 * one change the person can make to each. The panel never edits anything
 * itself; the command handler fulfils the intent and reopens the panel.
 */
import { SYMBOL, type PanelAction, type PanelDetail, type PanelItem, type PanelSpec, type Tone } from '@prjct.app/pi-tui-kit';
import { packageName, type ExtensionFile, type Inventory, type PackageSpec } from './inventory.ts';

export type DoctorIntent =
  | { readonly action: 'enable'; readonly name: string }
  | { readonly action: 'disable'; readonly name: string }
  | { readonly action: 'remove'; readonly spec: string }
  | { readonly action: 'clean' };

export type DoctorOps = Readonly<{
  reload(): Promise<Inventory>;
  request(intent: DoctorIntent): void;
}>;

export type DoctorState = Readonly<{
  inv: Inventory;
  busy: boolean;
  notice: { readonly text: string; readonly tone: Tone } | undefined;
}>;

const PKG = 'pkg:';
const EXT = 'ext:';
const pkgId = (spec: string): string => `${PKG}${spec}`;
const extId = (name: string): string => `${EXT}${name}`;
export const isPackageId = (id: string): boolean => id.startsWith(PKG);
export const isExtensionId = (id: string): boolean => id.startsWith(EXT);
export const extensionNameFromId = (id: string): string => id.slice(EXT.length);
export const packageSpecFromId = (id: string): string => id.slice(PKG.length);

const STATUS_TONE: Readonly<Record<ExtensionFile['status'], Tone>> = {
  active: 'success',
  disabled: 'warning',
  backup: 'dim',
};
const STATUS_WORD: Readonly<Record<ExtensionFile['status'], string>> = {
  active: 'loaded',
  disabled: 'disabled',
  backup: 'backup',
};
const STATUS_SYMBOL: Readonly<Record<ExtensionFile['status'], string>> = {
  active: SYMBOL.ok,
  disabled: SYMBOL.attention,
  backup: SYMBOL.idle,
};

/** What the panel reads, as one immutable value; every change replaces it. */
export function doctorPanelSpec(ops: DoctorOps, initial: DoctorState): PanelSpec {
  const cell: { value: DoctorState } = { value: initial };
  const listeners = new Set<() => void>();
  const publish = (next: DoctorState): void => {
    cell.value = next;
    for (const listener of listeners) listener();
  };
  const reload = async (): Promise<void> => {
    try {
      publish({ inv: await ops.reload(), busy: false, notice: cell.value.notice });
    } catch (error) {
      publish({ inv: cell.value.inv, busy: false, notice: { text: `Could not read Pi: ${errorMessage(error)}`, tone: 'error' } });
    }
  };

  const packageOf = (item: PanelItem | undefined): PackageSpec | undefined => {
    if (!item || !isPackageId(item.id)) return undefined;
    return cell.value.inv.packages.find(spec => spec === packageSpecFromId(item.id));
  };
  const extensionOf = (item: PanelItem | undefined): ExtensionFile | undefined => {
    if (!item || !isExtensionId(item.id)) return undefined;
    return cell.value.inv.extensions.find(file => file.name === extensionNameFromId(item.id));
  };
  const backupCount = (): number => cell.value.inv.extensions.filter(file => file.status === 'backup').length;
  const disabledCount = (): number => cell.value.inv.extensions.filter(file => file.status === 'disabled').length;
  const ask = (item: PanelItem | undefined, intent: DoctorIntent): void => ops.request(intent);

  const actions: PanelAction[] = [
    {
      key: 'e', label: item => {
        const ext = extensionOf(item);
        if (!ext) return 'Enable';
        return ext.status === 'disabled' ? `Enable ${ext.name}` : 'Disable';
      },
      when: item => {
        const ext = extensionOf(item);
        if (!ext) return false;
        return ext.status === 'disabled';
      },
      run: (item, panel) => { panel.close(); ask(item, { action: 'enable', name: extensionNameFromId(item!.id) }); },
    },
    {
      key: 'd', label: item => {
        const ext = extensionOf(item);
        if (!ext) return 'Disable';
        return `Disable ${ext.name}`;
      },
      when: item => {
        const ext = extensionOf(item);
        if (!ext) return false;
        return ext.status === 'active';
      },
      run: (item, panel) => { panel.close(); ask(item, { action: 'disable', name: extensionNameFromId(item!.id) }); },
    },
    {
      key: 'x', label: item => {
        const pkg = packageOf(item);
        return pkg ? `Remove ${packageName(pkg)}` : 'Remove';
      },
      when: item => !!packageOf(item),
      confirm: true,
      run: (item, panel) => { panel.close(); ask(item, { action: 'remove', spec: packageSpecFromId(item!.id) }); },
    },
    {
      key: 'c', label: `Clean (${backupCount() + disabledCount()})`,
      when: () => backupCount() + disabledCount() > 0,
      bulk: true,
      confirm: true,
      run: (_item, panel) => { panel.close(); ask(undefined, { action: 'clean' }); },
    },
  ];

  return {
    title: 'Doctor',
    summary: () => {
      const { packages, extensions, installedNotLoaded } = cell.value.inv;
      const parts = [`${packages.length} packages`, `${extensions.filter(f => f.status === 'active').length} extensions active`];
      if (backupCount() + disabledCount() > 0) parts.push(`${backupCount() + disabledCount()} to clean`);
      if (installedNotLoaded.length > 0) parts.push(`${installedNotLoaded.length} installed but not loaded`);
      return parts.join(' · ');
    },
    items: () => {
      const items: PanelItem[] = [];
      for (const spec of cell.value.inv.packages) {
        items.push({
          id: pkgId(spec), label: packageName(spec), symbol: SYMBOL.ok, tone: 'accent',
          meta: spec, search: `package ${packageName(spec)}`,
        });
      }
      for (const file of cell.value.inv.extensions) {
        items.push({
          id: extId(file.name), label: file.name, symbol: STATUS_SYMBOL[file.status], tone: STATUS_TONE[file.status],
          meta: STATUS_WORD[file.status], search: `extension ${file.name} ${file.status}`,
        });
      }
      for (const name of cell.value.inv.installedNotLoaded) {
        items.push({
          id: `orphan:${name}`, label: name, symbol: SYMBOL.attention, tone: 'dim',
          meta: 'installed, not in settings', search: `orphan ${name}`,
        });
      }
      return items;
    },
    detail: item => packageDetail(item, cell.value.inv) ?? extensionDetail(item, cell.value.inv) ?? { title: item.label },
    actions,
    empty: cell.value.busy ? 'Reading Pi…' : 'Nothing to inspect yet.',
    initial: cell.value.inv.packages[0] ? pkgId(cell.value.inv.packages[0]) : (cell.value.inv.extensions[0] ? extId(cell.value.inv.extensions[0].name) : undefined),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refreshMs: undefined,
  };
}

function packageDetail(item: PanelItem, inv: Inventory): PanelDetail | undefined {
  if (!isPackageId(item.id)) return undefined;
  const spec = packageSpecFromId(item.id);
  if (!inv.packages.includes(spec)) return undefined;
  return {
    title: packageName(spec),
    subtitle: spec,
    fields: [
      { label: 'spec', value: spec, tone: 'accent' },
      { label: 'in settings', value: 'yes', tone: 'success' },
    ],
    sections: [{ title: 'Press x to remove', lines: ['settings.json is backed up first', 'then the package is uninstalled'] }],
  };
}

function extensionDetail(item: PanelItem, inv: Inventory): PanelDetail | undefined {
  if (!isExtensionId(item.id)) return undefined;
  const file = inv.extensions.find(f => f.name === extensionNameFromId(item.id));
  if (!file) return undefined;
  const hint = file.status === 'active'
    ? 'Press d to disable'
    : file.status === 'disabled'
      ? 'Press e to enable'
      : 'Press c to clean (moves the file to a backup folder)';
  return {
    title: file.name,
    subtitle: STATUS_WORD[file.status],
    fields: [
      { label: 'file', value: file.name },
      { label: 'status', value: STATUS_WORD[file.status], tone: STATUS_TONE[file.status] },
    ],
    sections: [{ title: hint, lines: file.status === 'backup' ? ['a backup copy (.bak or .off) is never loaded'] : [] }],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
