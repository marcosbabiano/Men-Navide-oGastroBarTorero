import type { Menu, MenuItem, MenuSection, SectionKind } from '../../shared/schema.ts';
import { newId } from '../../shared/ids.ts';

export const KIND_OPTIONS: { value: SectionKind; label: string; title: string; hint: string; add: string }[] = [
  { value: 'shared', label: 'Para compartir (al centro de la mesa)', title: 'Entrantes', hint: 'Para compartir en el centro de la mesa', add: 'Grupo para compartir' },
  { value: 'choice', label: 'A elegir (primer plato, segundo, principal…)', title: 'Principal', hint: 'A elegir un plato por comensal', add: 'Grupo a elegir' },
  { value: 'dessert', label: 'Postre', title: 'Postre', hint: '', add: 'Postre' },
  { value: 'drink', label: 'Bebida', title: 'Bebida', hint: '', add: 'Bebida' },
  { value: 'extra', label: 'Otro grupo', title: 'Otros', hint: '', add: 'Otro grupo' },
];

export function newItem(): MenuItem {
  return { id: newId('plato'), name: '', detail: '', quantity: '', quantityPending: false, note: '' };
}

export function newSection(kind: SectionKind): MenuSection {
  const k = KIND_OPTIONS.find((o) => o.value === kind)!;
  return { id: newId('seccion'), kind, title: k.title, hint: k.hint, pending: false, choose: 1, items: [] };
}

/** Menú nuevo: en borrador, sin precio ni platos (nunca se inventa contenido). */
export function newMenu(order: number): Menu {
  return {
    id: newId('menu'),
    status: 'draft',
    order,
    name: 'Nuevo menú',
    originalName: '',
    subtitle: '',
    description: '',
    tag: '',
    price: { amount: null, unit: 'por persona', confirmed: false, note: '' },
    image: null,
    gallery: [],
    sections: [newSection('shared'), newSection('choice'), { ...newSection('dessert'), pending: true }, { ...newSection('drink'), pending: true }],
    conditions: [],
    cta: { label: 'Reservar mesa', helper: '' },
    theme: 'burgundy',
    adminNotes: '',
  };
}

export function duplicateMenu(m: Menu, order: number): Menu {
  return {
    ...structuredClone(m),
    id: newId('menu'),
    order,
    status: 'draft',
    name: `${m.name} (copia)`,
    sections: m.sections.map((s) => ({ ...s, id: newId('seccion'), items: s.items.map((i) => ({ ...i, id: newId('plato') })) })),
  };
}
