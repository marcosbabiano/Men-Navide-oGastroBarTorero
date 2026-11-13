/**
 * Reservas de Navidad: preselección de menús y platos, estado de la reserva oficial (Qamarero),
 * vinculación, modificaciones y cálculos de cocina. Compartido por el formulario público, el panel,
 * el servidor y las pruebas.
 *
 * Principios (se reflejan en los estados y en el panel):
 *  1. Una selección gastronómica NO equivale a una reserva confirmada.
 *  2. Una modificación en nuestra web NO equivale a una modificación aceptada por Qamarero.
 *  3. Una confirmación antigua por email NO garantiza que la reserva siga vigente.
 */
import { z } from 'zod';
import type { Menu, SiteContent } from './schema.ts';
import { safeText } from './schema.ts';

/* ---------------- Catálogos de estados ---------------- */
export const SERVICES = ['lunch', 'dinner'] as const;
export type Service = (typeof SERVICES)[number];
export const SERVICE_LABEL: Record<Service, string> = { lunch: 'Comida', dinner: 'Cena' };

export const GASTRO_STATUSES = ['pending', 'complete', 'modified', 'review', 'cancelled'] as const;
export type GastroStatus = (typeof GASTRO_STATUSES)[number];
export const GASTRO_LABEL: Record<GastroStatus, string> = {
  pending: 'Pendiente',
  complete: 'Completo',
  modified: 'Modificado',
  review: 'Requiere revisión',
  cancelled: 'Cancelado',
};

export const Q_STATUSES = [
  'pending_confirmation',
  'email_confirmed',
  'manual_linked',
  'modification_notified',
  'cancellation_notified',
  'cancelled_manual',
  'to_check',
  'incident',
] as const;
export type QStatus = (typeof Q_STATUSES)[number];
export const Q_LABEL: Record<QStatus, string> = {
  pending_confirmation: 'Pendiente de confirmación',
  email_confirmed: 'Confirmación recibida por email',
  manual_linked: 'Vinculada manualmente',
  modification_notified: 'Modificación notificada',
  cancellation_notified: 'Cancelación notificada',
  cancelled_manual: 'Cancelada manualmente',
  to_check: 'Pendiente de comprobar',
  incident: 'Incidencia',
};
export const isCancelled = (q: QStatus, g?: GastroStatus) => q === 'cancellation_notified' || q === 'cancelled_manual' || g === 'cancelled';

/* ---------------- Utilidades ---------------- */
/** Teléfono a formato internacional (+34 por defecto para números españoles de 9 cifras). */
export function normalizePhone(raw: string, defaultCountry = '34'): string | null {
  let s = (raw ?? '').replace(/[\s().-]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (/^[6789]\d{8}$/.test(s)) return `+${defaultCountry}${s}`;
  if (/^34[6789]\d{8}$/.test(s)) return `+${s}`;
  return null;
}

export function normalizeName(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud de nombres por palabras comunes (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const A = new Set(normalizeName(a).split(' ').filter((w) => w.length > 1));
  const B = new Set(normalizeName(b).split(' ').filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.min(A.size, B.size);
}

export const REF_RE = /\bTOR-[A-HJ-NP-Z2-9]{5}\b/;

/* ---------------- Entrada del formulario ---------------- */
const dinerInput = z.object({
  id: z.string().regex(/^[ac]\d{1,3}$/),
  kind: z.enum(['adult', 'child']),
  name: safeText(60),
  /** Niños: carta habitual o menú navideño. Adultos: siempre menú. */
  mode: z.enum(['menu', 'carta']),
  menuId: z.string().max(80).nullable(),
  /** sectionId → ids de plato elegidos. */
  choices: z.record(z.string().max(80), z.array(z.string().max(80)).max(10)),
  note: safeText(200),
  allergy: safeText(200),
});
export type DinerInput = z.infer<typeof dinerInput>;

export const selectionInputSchema = z.object({
  holder: z.object({
    name: safeText(100).refine((v) => v.trim().length >= 2, 'Escribe el nombre y apellidos del titular.'),
    phone: z.string().max(30),
    email: z.union([z.literal(''), z.email('Correo no válido').max(120)]),
  }),
  service: z.enum(SERVICES),
  adults: z.number().int().min(0).max(60),
  children: z.number().int().min(0).max(40),
  adultMenuId: z.string().max(80).nullable(),
  diners: z.array(dinerInput).max(100),
  notes: z.object({ general: safeText(800), allergies: safeText(800), special: safeText(500) }),
});
export type SelectionInput = z.infer<typeof selectionInputSchema>;

/* ---------------- Selección guardada (con instantánea de nombres y precios) ---------------- */
export interface MenuSnap {
  id: string;
  name: string;
  price: number | null;
  unit: string;
  sections: { id: string; title: string; kind: string; choose: number; items: { id: string; name: string; quantity: string }[] }[];
}
export interface DinerSaved extends DinerInput {
  label: string;
  menuName: string | null;
  picks: { sectionId: string; sectionTitle: string; items: { id: string; name: string }[] }[];
}
export interface Selection {
  service: Service;
  adults: number;
  children: number;
  adultMenuId: string | null;
  diners: DinerSaved[];
  notes: SelectionInput['notes'];
  menus: Record<string, MenuSnap>;
  estimate: { amount: number; unknown: number };
  savedAt: string;
}

/* ---------------- Configuración ---------------- */
export const reservasConfigSchema = z.object({
  formEnabled: z.boolean(),
  /** Vacío = todos los menús publicados. */
  menuIds: z.array(z.string().max(80)).max(20),
  childMenuIds: z.array(z.string().max(80)).max(20),
  childCarta: z.boolean(),
  maxGuests: z.number().int().min(1).max(100),
  requireEmail: z.boolean(),
  messages: z.object({
    intro: safeText(400),
    continueTitle: safeText(160),
    continueText: safeText(600),
    allergyNotice: safeText(400),
    privacy: safeText(800),
    modifiedTitle: safeText(160),
    modifiedText: safeText(400),
  }),
  whatsapp: z.object({
    template: safeText(1500),
    completeTemplate: safeText(1500),
    linkHours: z.number().int().min(1).max(24 * 60),
    deadline: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),
    contactPhone: z.string().max(30),
  }),
  email: z.object({
    allowedSenders: z.array(z.string().max(120)).max(10),
    gmailQuery: z.string().max(300),
    lunchUntil: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    autoLinkMinScore: z.number().int().min(40).max(100),
    /** Palabras que identifican una reserva de Navidad en el menú, observaciones o asunto del correo. */
    christmasKeywords: z.array(z.string().max(60)).max(30),
    /** Correo sin señales de Navidad pero con fecha dentro del periodo de menús: revisar o tratar como normal. */
    unknownInPeriod: z.enum(['review', 'normal']),
  }),
  staleDays: z.number().int().min(1).max(60),
  kitchen: z.object({
    includeUnverified: z.boolean(),
    /** itemId → 1 ración cada N comensales (entrantes compartidos). */
    sharedRules: z.record(z.string().max(80), z.number().int().min(1).max(50)),
  }),
  retentionDays: z.number().int().min(30).max(1095),
});
export type ReservasConfig = z.infer<typeof reservasConfigSchema>;

export function defaultReservasConfig(): ReservasConfig {
  return {
    formEnabled: true,
    menuIds: [],
    childMenuIds: [],
    childCarta: true,
    maxGuests: 40,
    requireEmail: true,
    messages: {
      intro: 'Elige ahora los menús y los platos de cada comensal. Después formalizarás la reserva de la mesa en nuestra plataforma de reservas.',
      continueTitle: 'Ya tenemos la elección de vuestros menús. Ahora solo falta formalizar la reserva de vuestra mesa.',
      continueText:
        'En la plataforma de reservas elegiréis la fecha, la hora, el número total de comensales y la zona según disponibilidad. Vuestra mesa no está reservada hasta que recibáis la confirmación de la reserva.',
      allergyNotice:
        'Las alergias, intolerancias y necesidades especiales deben ser revisadas y confirmadas por el establecimiento. Te contactaremos si necesitamos más información.',
      privacy:
        'Usaremos estos datos solo para preparar vuestra comida o cena de Navidad y contactaros sobre ella. Los conservaremos durante la campaña y los eliminaremos después. Puedes pedir su consulta o eliminación llamándonos.',
      modifiedTitle: 'Hemos recibido correctamente las modificaciones de vuestros menús.',
      modifiedText: 'Si necesitáis realizar otro cambio, contactad con GastroBar Torero para solicitar un nuevo enlace.',
    },
    whatsapp: {
      template:
        'Hola{nombre}, te escribimos desde GastroBar Torero.\n\nTe facilitamos un enlace para que puedas revisar y modificar la elección de los menús y platos de tu reserva.\n\nPuedes actualizar los comensales, los menús infantiles, los platos y las observaciones.\n\nEnlace: {enlace}\n\nEste enlace permite guardar una modificación. Si después necesitas hacer otros cambios, puedes solicitarnos un nuevo enlace.\n\nRecuerda que modificar el número de comensales aquí no cambia automáticamente tu reserva de mesa en Qamarero. Si necesitáis cambiar el número de personas, también tendremos que comprobar la disponibilidad y actualizar la reserva oficial.\n\nGracias.',
      completeTemplate:
        'Hola{nombre}, te escribimos desde GastroBar Torero.\n\nPara preparar vuestra comida o cena de Navidad, por favor elegid los menús y los platos de cada comensal en este enlace privado:\n\n{enlace}\n\nVuestra reserva de mesa ya está hecha: no hace falta volver a reservar.\n\nGracias.',
      linkHours: 168,
      deadline: '',
      contactPhone: '',
    },
    email: { allowedSenders: ['qamarero'], gmailQuery: 'from:(qamarero) newer_than:30d', lunchUntil: '17:00', autoLinkMinScore: 70, christmasKeywords: ['navidad', 'navideño', 'navideña', 'nochebuena', 'nochevieja', 'fin de año', 'menú esencia', 'menú distinción', 'selección gourmet'], unknownInPeriod: 'review' },
    staleDays: 3,
    kitchen: { includeUnverified: true, sharedRules: {} },
    retentionDays: 90,
  };
}

/* ---------------- Menús disponibles ---------------- */
export function publishedMenus(content: Pick<SiteContent, 'menus'>): Menu[] {
  return content.menus.filter((m) => m.status === 'published').sort((a, b) => a.order - b.order);
}
export function adultMenus(content: Pick<SiteContent, 'menus'>, cfg: ReservasConfig): Menu[] {
  const pub = publishedMenus(content);
  return cfg.menuIds.length ? pub.filter((m) => cfg.menuIds.includes(m.id)) : pub;
}
export function childMenus(content: Pick<SiteContent, 'menus'>, cfg: ReservasConfig): Menu[] {
  const pub = adultMenus(content, cfg);
  return cfg.childMenuIds.length ? pub.filter((m) => cfg.childMenuIds.includes(m.id)) : pub;
}
/** Grupos que cada comensal elige individualmente (los compartidos no se eligen). */
export const choiceSections = <T extends { sections: { kind: string; items: unknown[] }[] }>(m: T): T['sections'] => m.sections.filter((s) => s.kind === 'choice' && s.items.length > 0);

export function menuSnap(m: Menu): MenuSnap {
  return {
    id: m.id,
    name: m.name,
    price: m.price.amount,
    unit: m.price.unit,
    sections: m.sections
      .filter((s) => !s.pending)
      .map((s) => ({ id: s.id, title: s.title, kind: s.kind, choose: s.choose, items: s.items.filter((i) => i.name.trim()).map((i) => ({ id: i.id, name: i.name, quantity: i.quantityPending ? '' : i.quantity })) })),
  };
}

export function dinerLabel(d: Pick<DinerInput, 'kind' | 'name' | 'id'>): string {
  if (d.name.trim()) return d.name.trim();
  const n = Number(d.id.slice(1));
  return `${d.kind === 'adult' ? 'Adulto' : 'Niño'} ${n}`;
}

/** Fichas de comensales ajustadas a los números de adultos y niños (conserva las existentes). */
export function syncDiners(diners: DinerInput[], adults: number, children: number, adultMenuId: string | null): DinerInput[] {
  const make = (kind: 'adult' | 'child', i: number): DinerInput => ({
    id: `${kind === 'adult' ? 'a' : 'c'}${i}`,
    kind,
    name: '',
    mode: kind === 'adult' ? 'menu' : 'carta',
    menuId: kind === 'adult' ? adultMenuId : null,
    choices: {},
    note: '',
    allergy: '',
  });
  const out: DinerInput[] = [];
  for (let i = 1; i <= adults; i++) out.push(diners.find((d) => d.id === `a${i}`) ?? make('adult', i));
  for (let i = 1; i <= children; i++) out.push(diners.find((d) => d.id === `c${i}`) ?? make('child', i));
  return out;
}

/** Cambia el menú común de los adultos y deja pendientes las elecciones incompatibles. */
export function applyAdultMenu(diners: DinerInput[], menuId: string | null): DinerInput[] {
  return diners.map((d) => (d.kind !== 'adult' ? d : d.menuId === menuId ? d : { ...d, mode: 'menu', menuId, choices: {} }));
}

export interface SelectionProblem {
  dinerId?: string;
  sectionId?: string;
  message: string;
}

/** Problemas de la selección (vacío = completa). Misma función en el navegador y en el servidor. */
export function selectionProblems(input: SelectionInput, content: Pick<SiteContent, 'menus'>, cfg: ReservasConfig, opts: { skipHolder?: boolean } = {}): SelectionProblem[] {
  const out: SelectionProblem[] = [];
  const adultsAllowed = adultMenus(content, cfg);
  const childAllowed = childMenus(content, cfg);
  const total = input.adults + input.children;
  if (!opts.skipHolder) {
    if (!input.holder.name.trim()) out.push({ message: 'Falta el nombre del titular.' });
    if (!normalizePhone(input.holder.phone)) out.push({ message: 'El teléfono no es válido (escribe un móvil o un número con prefijo).' });
    if (cfg.requireEmail && !input.holder.email) out.push({ message: 'Falta el correo electrónico.' });
  }
  if (total < 1) out.push({ message: 'Indica al menos un comensal.' });
  if (total > cfg.maxGuests) out.push({ message: `Para grupos de más de ${cfg.maxGuests} personas, llámanos.` });
  if (input.adults > 0) {
    if (!input.adultMenuId) out.push({ message: 'Elige el menú común de los adultos.' });
    else if (!adultsAllowed.some((m) => m.id === input.adultMenuId)) out.push({ message: 'El menú elegido para los adultos ya no está disponible.' });
  }
  const expected = syncDiners([], input.adults, input.children, input.adultMenuId).map((d) => d.id);
  const got = input.diners.map((d) => d.id);
  if (expected.join() !== got.join()) out.push({ message: 'Las fichas de comensales no coinciden con el número de adultos y niños.' });
  for (const d of input.diners) {
    const label = dinerLabel(d);
    if (d.kind === 'adult') {
      if (d.mode !== 'menu' || d.menuId !== input.adultMenuId) {
        out.push({ dinerId: d.id, message: `${label}: todos los adultos deben tener el mismo menú.` });
        continue;
      }
    } else if (d.mode === 'carta') {
      if (!cfg.childCarta) out.push({ dinerId: d.id, message: `${label}: la carta habitual no está disponible para niños.` });
      if (d.menuId || Object.keys(d.choices).length) out.push({ dinerId: d.id, message: `${label}: con carta habitual no se eligen platos del menú.` });
      continue;
    } else if (!d.menuId || !childAllowed.some((m) => m.id === d.menuId)) {
      out.push({ dinerId: d.id, message: `${label}: elige un menú navideño o la carta habitual.` });
      continue;
    }
    const menu = publishedMenus(content).find((m) => m.id === d.menuId);
    if (!menu) {
      out.push({ dinerId: d.id, message: `${label}: el menú ya no está disponible.` });
      continue;
    }
    const secs = choiceSections(menu);
    for (const s of secs) {
      const picked = d.choices[s.id] ?? [];
      const valid = picked.filter((id) => s.items.some((i) => i.id === id));
      if (valid.length !== picked.length) out.push({ dinerId: d.id, sectionId: s.id, message: `${label}: hay un plato que ya no existe en «${s.title}».` });
      else if (new Set(picked).size !== s.choose || picked.length !== s.choose)
        out.push({ dinerId: d.id, sectionId: s.id, message: `${label}: ${s.choose > 1 ? `elige ${s.choose} platos` : 'elige un plato'} en «${s.title}».` });
    }
    for (const k of Object.keys(d.choices)) if (!secs.some((s) => s.id === k)) out.push({ dinerId: d.id, message: `${label}: hay elecciones de otro menú.` });
  }
  return out;
}

export function estimate(input: Pick<SelectionInput, 'diners'>, content: Pick<SiteContent, 'menus'>): { amount: number; unknown: number } {
  let amount = 0;
  let unknown = 0;
  for (const d of input.diners) {
    if (d.mode !== 'menu' || !d.menuId) continue;
    const m = content.menus.find((x) => x.id === d.menuId);
    if (m?.price.amount != null) amount += m.price.amount;
    else unknown++;
  }
  return { amount: Math.round(amount * 100) / 100, unknown };
}

/** Selección validada → registro con instantánea de nombres (sobrevive a cambios posteriores del menú). */
export function buildSelection(input: SelectionInput, content: Pick<SiteContent, 'menus'>, now: string): Selection {
  const menus: Record<string, MenuSnap> = {};
  const diners: DinerSaved[] = input.diners.map((d) => {
    const m = d.mode === 'menu' && d.menuId ? content.menus.find((x) => x.id === d.menuId) : undefined;
    if (m && !menus[m.id]) menus[m.id] = menuSnap(m);
    const picks = m
      ? choiceSections(m).map((s) => ({ sectionId: s.id, sectionTitle: s.title, items: (d.choices[s.id] ?? []).map((id) => ({ id, name: s.items.find((i) => i.id === id)?.name ?? id })) }))
      : [];
    return { ...d, name: d.name.trim(), note: d.note.trim(), allergy: d.allergy.trim(), label: dinerLabel(d), menuName: m?.name ?? null, picks, ...(d.mode === 'carta' ? { menuId: null, choices: {} } : {}) };
  });
  return {
    service: input.service,
    adults: input.adults,
    children: input.children,
    adultMenuId: input.adults > 0 ? input.adultMenuId : null,
    diners,
    notes: { general: input.notes.general.trim(), allergies: input.notes.allergies.trim(), special: input.notes.special.trim() },
    menus,
    estimate: estimate(input, content),
    savedAt: now,
  };
}

/** Selección guardada → entrada editable (para el enlace de modificación). */
export function selectionToInput(sel: Selection, holder: SelectionInput['holder']): SelectionInput {
  return {
    holder,
    service: sel.service,
    adults: sel.adults,
    children: sel.children,
    adultMenuId: sel.adultMenuId,
    diners: sel.diners.map((d) => ({ id: d.id, kind: d.kind, name: d.name, mode: d.mode, menuId: d.menuId, choices: d.choices, note: d.note, allergy: d.allergy })),
    notes: sel.notes,
  };
}

export const hasAllergies = (sel: Selection | null) => !!sel && (!!sel.notes.allergies || sel.diners.some((d) => !!d.allergy));

/** Resumen de cambios entre dos selecciones (para el historial y los avisos). */
export function diffSelections(a: Selection | null, b: Selection): string[] {
  if (!a) return ['Selección inicial de menús y platos.'];
  const out: string[] = [];
  if (a.adults !== b.adults) out.push(`Adultos: ${a.adults} → ${b.adults}`);
  if (a.children !== b.children) out.push(`Niños: ${a.children} → ${b.children}`);
  if (a.service !== b.service) out.push(`Servicio: ${SERVICE_LABEL[a.service]} → ${SERVICE_LABEL[b.service]}`);
  if (a.adultMenuId !== b.adultMenuId) out.push(`Menú de adultos: ${a.menus[a.adultMenuId ?? '']?.name ?? '—'} → ${b.menus[b.adultMenuId ?? '']?.name ?? '—'}`);
  const desc = (d: DinerSaved) => `${d.mode === 'carta' ? 'Carta habitual' : d.menuName ?? '—'}: ${d.picks.flatMap((p) => p.items.map((i) => i.name)).join(', ')}`;
  for (const d of b.diners) {
    const old = a.diners.find((x) => x.id === d.id);
    if (!old) out.push(`Nuevo comensal ${d.label} (${desc(d)})`);
    else if (desc(old) !== desc(d)) out.push(`${d.label}: ${desc(old)} → ${desc(d)}`);
    else if (old.allergy !== d.allergy) out.push(`${d.label}: alergias actualizadas`);
  }
  for (const d of a.diners) if (!b.diners.some((x) => x.id === d.id)) out.push(`Se elimina ${d.label}`);
  if (a.notes.allergies !== b.notes.allergies) out.push('Alergias e intolerancias actualizadas');
  if (a.notes.general !== b.notes.general || a.notes.special !== b.notes.special) out.push('Observaciones actualizadas');
  return out.length ? out : ['Sin cambios en los platos.'];
}

/* ---------------- Reserva (registro principal) ---------------- */
export interface Issue {
  id: string;
  type: 'people_mismatch' | 'people_change' | 'match_review' | 'identity_conflict' | 'parse' | 'classify' | 'other';
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}
export interface HistoryEvent {
  at: string;
  actor: string;
  source: 'form' | 'email' | 'link' | 'admin' | 'import' | 'system';
  type: string;
  summary: string;
  details?: string[];
  before?: unknown;
  after?: unknown;
}
export interface QamareroData {
  status: QStatus;
  reservationId: string;
  date: string; // AAAA-MM-DD o ''
  time: string; // HH:MM o ''
  zone: string;
  people: number | null;
  menu: string;
  notes: string;
  source: 'email' | 'manual' | 'import' | null;
  notifiedAt: string | null;
  lastNotificationType: 'new' | 'modified' | 'cancelled' | 'unknown' | null;
  lastCheckedAt: string | null;
  lastCheckedBy: string | null;
}
export interface Booking {
  id: string;
  ref: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  origin: 'form' | 'email' | 'manual' | 'import';
  holder: { name: string; phone: string; email: string };
  service: Service | null;
  selection: Selection | null;
  gastroStatus: GastroStatus;
  qamarero: QamareroData;
  /** Cambio de comensales solicitado por el cliente y pendiente de confirmar en Qamarero. */
  peopleChange: { from: number | null; to: number; status: 'pending' | 'confirmed' | 'rejected'; at: string } | null;
  match: { status: 'none' | 'linked' | 'review' | 'merged'; method: 'ref' | 'external' | 'data' | 'manual' | null; candidates: string[]; mergedInto: string | null; score: number | null };
  issues: Issue[];
  internalNotes: string;
  history: HistoryEvent[];
  archived: boolean;
  /**
   * Tipo de reserva: de Navidad (se gestiona aquí), por clasificar (correo dudoso dentro del periodo
   * de menús) o normal (descartada tras clasificarla). Ausente en registros antiguos = Navidad.
   */
  category?: 'christmas' | 'unclassified' | 'normal';
}

/** ¿El texto de un correo indica una reserva de Navidad? Devuelve la palabra o menú que lo indica. */
export function christmasSignal(texts: string[], keywords: string[], menuNames: string[]): string | null {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const hay = norm(texts.join(' \n '));
  for (const k of [...menuNames, ...keywords]) {
    const n = norm(k.trim());
    if (n.length >= 4 && hay.includes(n)) return k.trim();
  }
  return null;
}

export function emptyQamarero(): QamareroData {
  return { status: 'pending_confirmation', reservationId: '', date: '', time: '', zone: '', people: null, menu: '', notes: '', source: null, notifiedAt: null, lastNotificationType: null, lastCheckedAt: null, lastCheckedBy: null };
}

export const totalPeople = (b: Pick<Booking, 'selection'>) => (b.selection ? b.selection.adults + b.selection.children : null);
export const openIssues = (b: Pick<Booking, 'issues'>) => b.issues.filter((i) => !i.resolvedAt);

/** Servicio deducido: el del formulario o, si no hay, por la hora de Qamarero. */
export function serviceOf(b: Pick<Booking, 'service' | 'qamarero'>, lunchUntil = '17:00'): Service | null {
  if (b.qamarero.time) return b.qamarero.time < lunchUntil ? 'lunch' : 'dinner';
  return b.service;
}

/** Grado de verificación para cocina (principio 3: una confirmación antigua no garantiza vigencia). */
export type Verification = 'verified' | 'email_only' | 'incident' | 'no_booking' | 'cancelled';
export function verification(b: Booking, staleDays: number, now = Date.now()): Verification {
  if (isCancelled(b.qamarero.status, b.gastroStatus)) return 'cancelled';
  if (b.qamarero.status === 'pending_confirmation' || !b.qamarero.date) return 'no_booking';
  if (openIssues(b).length || b.qamarero.status === 'incident' || b.peopleChange?.status === 'pending' || b.match.status === 'review') return 'incident';
  const checked = b.qamarero.lastCheckedAt ? Date.parse(b.qamarero.lastCheckedAt) : 0;
  if (checked && now - checked < staleDays * 86400_000) return 'verified';
  return 'email_only';
}
export const VERIFICATION_LABEL: Record<Verification, string> = {
  verified: 'Verificada',
  email_only: 'Confirmación por email sin revisión reciente',
  incident: 'Con incidencias',
  no_booking: 'Sin reserva vinculada',
  cancelled: 'Cancelada',
};

/** Fila resumida para el listado (índice). */
export interface BookingRow {
  id: string;
  ref: string;
  origin: Booking['origin'];
  name: string;
  phone: string;
  date: string;
  time: string;
  service: Service | null;
  zone: string;
  adults: number | null;
  children: number | null;
  requested: number | null;
  confirmed: number | null;
  reservationId: string;
  email: string;
  menus: string[];
  qStatus: QStatus;
  gStatus: GastroStatus;
  matchStatus: Booking['match']['status'];
  category: NonNullable<Booking['category']>;
  issues: number;
  allergies: boolean;
  peopleChangePending: boolean;
  lastCheckedAt: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}
export function bookingRow(b: Booking, lunchUntil = '17:00'): BookingRow {
  const s = b.selection;
  const menus = s ? [...new Set(s.diners.filter((d) => d.mode === 'menu' && d.menuName).map((d) => d.menuName as string))] : b.qamarero.menu ? [b.qamarero.menu] : [];
  return {
    id: b.id,
    ref: b.ref,
    origin: b.origin,
    name: b.holder.name,
    phone: b.holder.phone,
    date: b.qamarero.date,
    time: b.qamarero.time,
    service: serviceOf(b, lunchUntil),
    zone: b.qamarero.zone,
    adults: s?.adults ?? null,
    children: s?.children ?? null,
    requested: totalPeople(b),
    confirmed: b.qamarero.people,
    reservationId: b.qamarero.reservationId,
    email: b.holder.email,
    menus,
    qStatus: b.qamarero.status,
    gStatus: b.gastroStatus,
    matchStatus: b.match.status,
    category: b.category ?? 'christmas',
    issues: openIssues(b).length,
    allergies: hasAllergies(s),
    peopleChangePending: b.peopleChange?.status === 'pending',
    lastCheckedAt: b.qamarero.lastCheckedAt,
    notifiedAt: b.qamarero.notifiedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    archived: b.archived,
  };
}

/* ---------------- Cocina ---------------- */
export interface KitchenLine {
  name: string;
  count: number;
  detail?: string;
}
export interface KitchenGroup {
  title: string;
  kind: 'menus' | 'choice' | 'shared' | 'dessert' | 'drink' | 'extra' | 'carta';
  lines: KitchenLine[];
}
export interface KitchenReport {
  bookings: number;
  people: number;
  adults: number;
  children: number;
  carta: number;
  groups: KitchenGroup[];
  allergies: { booking: string; who: string; text: string }[];
  notes: { booking: string; text: string }[];
  withoutSelection: string[];
}

/** Cantidades de producción con las elecciones reales registradas (sin inventar raciones). */
export function kitchenReport(bookings: Booking[], cfg: ReservasConfig): KitchenReport {
  const r: KitchenReport = { bookings: 0, people: 0, adults: 0, children: 0, carta: 0, groups: [], allergies: [], notes: [], withoutSelection: [] };
  const menusCount = new Map<string, number>();
  const choice = new Map<string, Map<string, number>>(); // sección (título del menú · grupo) → plato → n
  const shared = new Map<string, { name: string; menu: string; diners: number; quantity: string; itemId: string }>();
  const fixed = new Map<string, { kind: KitchenGroup['kind']; name: string; menu: string; count: number }>();
  for (const b of bookings) {
    r.bookings++;
    const s = b.selection;
    if (!s) {
      r.withoutSelection.push(`${b.holder.name}${b.qamarero.time ? ` (${b.qamarero.time})` : ''}`);
      r.people += b.qamarero.people ?? 0;
      continue;
    }
    r.people += s.adults + s.children;
    r.adults += s.adults;
    r.children += s.children;
    if (s.notes.allergies) r.allergies.push({ booking: b.holder.name, who: 'General', text: s.notes.allergies });
    if (s.notes.general || s.notes.special) r.notes.push({ booking: b.holder.name, text: [s.notes.general, s.notes.special].filter(Boolean).join(' · ') });
    for (const d of s.diners) {
      if (d.allergy) r.allergies.push({ booking: b.holder.name, who: d.label, text: d.allergy });
      if (d.mode === 'carta' || !d.menuId) {
        r.carta++;
        continue;
      }
      const m = s.menus[d.menuId];
      if (!m) continue;
      menusCount.set(m.name, (menusCount.get(m.name) ?? 0) + 1);
      for (const p of d.picks) {
        const key = `${p.sectionTitle}`;
        const map = choice.get(key) ?? new Map<string, number>();
        for (const it of p.items) map.set(it.name, (map.get(it.name) ?? 0) + 1);
        choice.set(key, map);
      }
      for (const sec of m.sections) {
        if (sec.kind === 'shared') {
          for (const it of sec.items) {
            const k = `${m.id}:${it.id}`;
            const cur = shared.get(k) ?? { name: it.name, menu: m.name, diners: 0, quantity: it.quantity, itemId: it.id };
            cur.diners++;
            shared.set(k, cur);
          }
        } else if (sec.kind !== 'choice') {
          for (const it of sec.items) {
            const k = `${sec.kind}:${it.name}`;
            const cur = fixed.get(k) ?? { kind: sec.kind as KitchenGroup['kind'], name: it.name, menu: m.name, count: 0 };
            cur.count++;
            fixed.set(k, cur);
          }
        }
      }
    }
  }
  r.groups.push({ title: 'Menús', kind: 'menus', lines: [...menusCount].map(([name, count]) => ({ name, count })) });
  for (const [title, map] of choice) r.groups.push({ title, kind: 'choice', lines: [...map].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) });
  r.groups.push({
    title: 'Entrantes para compartir',
    kind: 'shared',
    lines: [...shared.values()].map((s) => {
      const rule = cfg.kitchen.sharedRules[s.itemId];
      const per = /^(\d+)\s*(uds?\.?|unidades?|piezas?)?\s*por persona/i.exec(s.quantity);
      const detail = rule
        ? `${Math.ceil(s.diners / rule)} raciones (1 cada ${rule} comensales)`
        : per
          ? `${s.diners * Number(per[1])} unidades (${s.quantity})`
          : 'cantidad de producción pendiente de definir';
      return { name: `${s.name} · ${s.menu}`, count: s.diners, detail: `${s.diners} comensales · ${detail}` };
    }),
  });
  for (const kind of ['dessert', 'drink', 'extra'] as const) {
    const lines = [...fixed.values()].filter((f) => f.kind === kind).map((f) => ({ name: `${f.name} · ${f.menu}`, count: f.count }));
    if (lines.length) r.groups.push({ title: kind === 'dessert' ? 'Postres' : kind === 'drink' ? 'Bebida' : 'Otros', kind, lines });
  }
  if (r.carta) r.groups.push({ title: 'Niños con carta habitual', kind: 'carta', lines: [{ name: 'Carta habitual — elección en el restaurante', count: r.carta }] });
  return r;
}

/* ---------------- WhatsApp ---------------- */
export function whatsappUrl(phone: string, text: string): string | null {
  const p = normalizePhone(phone);
  if (!p) return null;
  return `https://wa.me/${p.slice(1)}?text=${encodeURIComponent(text)}`;
}
export function fillTemplate(template: string, vars: { nombre: string; enlace: string }): string {
  const first = vars.nombre.trim().split(/\s+/)[0] ?? '';
  return template.replace(/\{nombre\}/g, first ? ` ${first}` : '').replace(/\{enlace\}/g, vars.enlace);
}

/* ---------------- CSV ---------------- */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Separador «;» y BOM: Excel en español lo abre directamente.
  return `\uFEFF${rows.map((r) => r.map(esc).join(';')).join('\r\n')}\r\n`;
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const first = src.split(/\r?\n/)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
