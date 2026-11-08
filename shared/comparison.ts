/**
 * Comparativa generada a partir del contenido real publicado.
 * No añade nada: si un menú no tiene una sección confirmada, la celda queda «pendiente».
 */
import type { Menu, SectionKind } from './schema.ts';
import { normalizeDish } from './format.ts';

export interface ComparisonItem {
  /** Título del grupo cuando un menú tiene varios grupos del mismo tipo (p. ej. Primer y Segundo plato). */
  group?: string;
  name: string;
  quantity: string;
  detail: string;
  common: boolean;
}

export interface ComparisonCell {
  menuId: string;
  items: ComparisonItem[];
  pending: boolean;
}

export interface ComparisonRow {
  key: string;
  kind: SectionKind;
  label: string;
  hint: string;
  cells: ComparisonCell[];
}

const KIND_ORDER: SectionKind[] = ['shared', 'choice', 'dessert', 'drink', 'extra'];
const KIND_LABEL: Record<SectionKind, string> = {
  shared: 'Para compartir',
  choice: 'Platos a elegir',
  dessert: 'Postre',
  drink: 'Bebida',
  extra: '',
};

/** Recibe menús ya saneados (proyección pública). */
export function buildComparison(menus: Menu[]): ComparisonRow[] {
  const rowKeys: { key: string; kind: SectionKind; label: string; hint: string }[] = [];
  for (const kind of KIND_ORDER) {
    if (kind === 'extra') {
      const titles = new Map<string, string>();
      for (const m of menus)
        for (const s of m.sections) if (s.kind === 'extra') titles.set(normalizeDish(s.title), s.title);
      for (const [norm, title] of titles) rowKeys.push({ key: `extra:${norm}`, kind, label: title, hint: '' });
    } else if (menus.some((m) => m.sections.some((s) => s.kind === kind))) {
      const hint = menus.flatMap((m) => m.sections).find((s) => s.kind === kind && s.hint)?.hint ?? '';
      rowKeys.push({ key: kind, kind, label: KIND_LABEL[kind], hint });
    }
  }

  return rowKeys.map(({ key, kind, label, hint }) => {
    const perMenu = menus.map((m) => {
      const sections = m.sections.filter((s) =>
        kind === 'extra' ? s.kind === 'extra' && `extra:${normalizeDish(s.title)}` === key : s.kind === kind,
      );
      const multi = sections.length > 1;
      return {
        menu: m,
        items: sections.flatMap((s) =>
          s.items.map((i, k) => ({ ...i, group: multi && k === 0 ? (s.choose > 1 ? `${s.title} (elige ${s.choose})` : s.title) : undefined })),
        ),
      };
    });
    const commonNames = new Set<string>();
    if (menus.length > 1) {
      const sets = perMenu.map((p) => new Set(p.items.map((i) => normalizeDish(i.name))));
      for (const n of sets[0] ?? []) if (sets.every((s) => s.has(n))) commonNames.add(n);
    }
    return {
      key,
      kind,
      label,
      hint,
      cells: perMenu.map(({ menu, items }) => ({
        menuId: menu.id,
        pending: items.length === 0,
        items: items.map((i) => ({
          ...(i.group ? { group: i.group } : {}),
          name: i.name,
          quantity: i.quantity,
          detail: i.detail,
          common: commonNames.has(normalizeDish(i.name)),
        })),
      })),
    };
  });
}

/** Platos exclusivos de cada menú dentro de una fila (para el resumen «lo que cambia»). */
export function exclusiveCount(row: ComparisonRow, menuId: string): number {
  const cell = row.cells.find((c) => c.menuId === menuId);
  return cell ? cell.items.filter((i) => !i.common).length : 0;
}
