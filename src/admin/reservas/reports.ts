/**
 * Informes de reservas (A: servicio, B: cocina, C: desglose por reserva, D: cambios pendientes).
 * Se describen con un modelo de documento único que se convierte en:
 *  - HTML A4 para imprimir (ventana propia, sin la interfaz del panel),
 *  - PDF A4 (jsPDF) sin cortar reservas entre páginas cuando es posible,
 *  - CSV (separador «;» con BOM, se abre directamente en Excel en español).
 */
import {
  type Booking,
  isCancelled,
  kitchenReport,
  openIssues,
  Q_LABEL,
  type ReservasConfig,
  SERVICE_LABEL,
  serviceOf,
  type Service,
  toCsv,
  totalPeople,
  verification,
  VERIFICATION_LABEL,
} from '../../../shared/reservas.ts';

export type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string; tone?: 'alert' | 'muted' | 'strong' }
  | { type: 'kv'; items: [string, string][] }
  | { type: 'table'; cols: { label: string; w: number; align?: 'right' }[]; rows: string[][]; alertCol?: number }
  | { type: 'group'; title: string; tone?: 'alert'; blocks: Block[] };

export interface ReportDoc {
  title: string;
  subtitle: string;
  generatedAt: string;
  blocks: Block[];
}

export type ServiceFilter = Service | 'all';
export interface Scope {
  from: string;
  to: string;
  service: ServiceFilter;
}

const fmtDate = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
export const scopeLabel = (s: Scope) => `${s.from === s.to ? fmtDate(s.from) : `${fmtDate(s.from)} – ${fmtDate(s.to)}`} · ${s.service === 'all' ? 'Comida y cena' : SERVICE_LABEL[s.service]}`;

/** Reservas del ámbito (fecha/servicio), separando canceladas y aplicando la regla de inclusión de cocina. */
export function inScope(bookings: Booking[], scope: Scope, cfg: ReservasConfig) {
  const within = bookings.filter((b) => !b.archived && b.qamarero.date && b.qamarero.date >= scope.from && b.qamarero.date <= scope.to && (scope.service === 'all' || serviceOf(b, cfg.email.lunchUntil) === scope.service));
  const sort = (a: Booking, b: Booking) => (a.qamarero.date + a.qamarero.time).localeCompare(b.qamarero.date + b.qamarero.time);
  const active = within.filter((b) => !isCancelled(b.qamarero.status, b.gastroStatus)).sort(sort);
  const cancelled = within.filter((b) => isCancelled(b.qamarero.status, b.gastroStatus)).sort(sort);
  const production = active.filter((b) => cfg.kitchen.includeUnverified || verification(b, cfg.staleDays) === 'verified');
  return { active, cancelled, production };
}

const people = (b: Booking) => {
  const req = totalPeople(b);
  const conf = b.qamarero.people;
  if (req !== null && conf !== null && req !== conf) return `${conf} confirm. / ${req} solicit.`;
  return String(conf ?? req ?? '—');
};
const menusOf = (b: Booking) => {
  if (!b.selection) return 'Sin elección de menús';
  const counts = new Map<string, number>();
  for (const d of b.selection.diners) {
    const k = d.mode === 'carta' ? 'Carta (niños)' : (d.menuName ?? '—');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n}× ${k}`).join(', ');
};
const alertsOf = (b: Booking, cfg: ReservasConfig) => {
  const out: string[] = [];
  const v = verification(b, cfg.staleDays);
  if (v !== 'verified') out.push(VERIFICATION_LABEL[v]);
  if (b.peopleChange?.status === 'pending') out.push(`Cambio de comensales pendiente de confirmar en Qamarero (${b.peopleChange.from ?? '—'} → ${b.peopleChange.to})`);
  for (const i of openIssues(b)) if (i.type !== 'people_change') out.push(i.message);
  if (b.selection && (b.selection.notes.allergies || b.selection.diners.some((d) => d.allergy))) out.push('ALERGIAS');
  if (!b.selection) out.push('Platos sin elegir');
  return [...new Set(out)];
};

/* ---------- A · Resumen del servicio ---------- */
export function reportService(bookings: Booking[], scope: Scope, cfg: ReservasConfig): ReportDoc {
  const { active, cancelled } = inScope(bookings, scope, cfg);
  const blocks: Block[] = [];
  const services: Service[] = scope.service === 'all' ? ['lunch', 'dinner'] : [scope.service];
  for (const svc of services) {
    const list = active.filter((b) => serviceOf(b, cfg.email.lunchUntil) === svc);
    if (!list.length) continue;
    const k = kitchenReport(list, cfg);
    blocks.push({ type: 'h', text: SERVICE_LABEL[svc].toUpperCase() + (svc === 'lunch' ? 'S' : 'S') });
    blocks.push({
      type: 'kv',
      items: [
        ['Reservas', String(list.length)],
        ['Comensales', String(k.people)],
        ['Adultos / niños', `${k.adults} / ${k.children}`],
        ['Menús', k.groups.find((g) => g.kind === 'menus')?.lines.map((l) => `${l.count} ${l.name}`).join(' · ') || '—'],
        ['Niños con carta', String(k.carta)],
      ],
    });
    blocks.push({
      type: 'table',
      cols: [{ label: 'Fecha', w: 14 }, { label: 'Hora', w: 8 }, { label: 'Titular', w: 26 }, { label: 'Pers.', w: 10, align: 'right' }, { label: 'Zona', w: 12 }, { label: 'Menús', w: 30 }, { label: 'Alertas', w: 30 }],
      rows: list.map((b) => [b.qamarero.date.slice(5).split('-').reverse().join('/'), b.qamarero.time || '—', b.holder.name, people(b), b.qamarero.zone || '—', menusOf(b), alertsOf(b, cfg).join(' · ')]),
      alertCol: 6,
    });
  }
  if (!blocks.length) blocks.push({ type: 'p', text: 'No hay reservas activas en este periodo.', tone: 'muted' });
  if (cancelled.length) {
    blocks.push({ type: 'h', text: 'Canceladas (no se cuentan)' });
    blocks.push({ type: 'p', text: cancelled.map((b) => `${b.qamarero.time || '—'} ${b.holder.name}`).join(' · '), tone: 'muted' });
  }
  return { title: 'Resumen del servicio', subtitle: scopeLabel(scope), generatedAt: new Date().toISOString(), blocks };
}

/* ---------- B · Producción de cocina ---------- */
export function reportKitchen(bookings: Booking[], scope: Scope, cfg: ReservasConfig): ReportDoc {
  const { production, active } = inScope(bookings, scope, cfg);
  const k = kitchenReport(production, cfg);
  const counts = new Map<string, number>();
  for (const b of production) counts.set(verification(b, cfg.staleDays), (counts.get(verification(b, cfg.staleDays)) ?? 0) + 1);
  const blocks: Block[] = [
    {
      type: 'kv',
      items: [
        ['Reservas incluidas', `${production.length}${production.length !== active.length ? ` de ${active.length} (solo verificadas)` : ''}`],
        ['Comensales', `${k.people} (${k.adults} adultos, ${k.children} niños)`],
        ['Verificación', [...counts].map(([v, n]) => `${n} ${VERIFICATION_LABEL[v as keyof typeof VERIFICATION_LABEL].toLowerCase()}`).join(' · ') || '—'],
      ],
    },
  ];
  if (counts.get('incident') || counts.get('email_only')) blocks.push({ type: 'p', tone: 'alert', text: 'Hay reservas sin revisión reciente o con incidencias: concíliense con Qamarero antes de cerrar el servicio (ver Informe D).' });
  for (const g of k.groups) {
    if (!g.lines.length) continue;
    blocks.push({
      type: 'group',
      title: g.title,
      blocks: [{ type: 'table', cols: [{ label: 'Plato', w: g.kind === 'shared' ? 45 : 75 }, { label: 'Cantidad', w: 25, align: 'right' }, ...(g.kind === 'shared' ? [{ label: 'Producción', w: 60 }] : [])], rows: g.lines.map((l) => [l.name, String(l.count), ...(g.kind === 'shared' ? [l.detail ?? ''] : [])]) }],
    });
  }
  if (k.allergies.length)
    blocks.push({ type: 'group', title: 'ALERGIAS E INTOLERANCIAS', tone: 'alert', blocks: [{ type: 'table', cols: [{ label: 'Reserva', w: 35 }, { label: 'Comensal', w: 25 }, { label: 'Detalle', w: 70 }], rows: k.allergies.map((a) => [a.booking, a.who, a.text]), alertCol: 2 }] });
  if (k.notes.length) blocks.push({ type: 'group', title: 'Observaciones relevantes', blocks: [{ type: 'table', cols: [{ label: 'Reserva', w: 35 }, { label: 'Observación', w: 95 }], rows: k.notes.map((n) => [n.booking, n.text]) }] });
  if (k.withoutSelection.length) blocks.push({ type: 'p', tone: 'alert', text: `Reservas sin elección de platos (no se cuentan platos): ${k.withoutSelection.join(', ')}` });
  return { title: 'Producción de cocina', subtitle: scopeLabel(scope), generatedAt: new Date().toISOString(), blocks };
}

/* ---------- C · Desglose por reserva ---------- */
export function bookingBlocks(b: Booking, cfg: ReservasConfig): Block {
  const s = b.selection;
  const alerts = alertsOf(b, cfg);
  const blocks: Block[] = [
    {
      type: 'kv',
      items: [
        ['Hora · zona', `${b.qamarero.time || '—'} · ${b.qamarero.zone || '—'}`],
        ['Personas', people(b)],
        ['Teléfono', b.holder.phone || '—'],
        ['Referencias', `${b.ref}${b.qamarero.reservationId ? ` · Qamarero ${b.qamarero.reservationId}` : ''}`],
        ['Estado', `${Q_LABEL[b.qamarero.status]}`],
      ],
    },
  ];
  if (s) {
    const adult = s.adultMenuId ? s.menus[s.adultMenuId]?.name : '';
    if (adult) blocks.push({ type: 'p', text: `Menú común de los adultos: ${adult}`, tone: 'strong' });
    blocks.push({
      type: 'table',
      cols: [{ label: 'Comensal', w: 28 }, { label: 'Menú', w: 30 }, { label: 'Platos', w: 50 }, { label: 'Alergias / nota', w: 30 }],
      rows: s.diners.map((d) => [d.label, d.mode === 'carta' ? 'Carta habitual' : (d.menuName ?? '—'), d.picks.flatMap((p) => p.items.map((i) => i.name)).join(', ') || '—', [d.allergy && `⚠ ${d.allergy}`, d.note].filter(Boolean).join(' · ')]),
      alertCol: 3,
    });
    if (s.notes.allergies) blocks.push({ type: 'p', tone: 'alert', text: `Alergias e intolerancias: ${s.notes.allergies}` });
    if (s.notes.general) blocks.push({ type: 'p', text: `Observaciones: ${s.notes.general}` });
    if (s.notes.special) blocks.push({ type: 'p', text: `Necesidades del servicio: ${s.notes.special}` });
  } else blocks.push({ type: 'p', tone: 'alert', text: 'Sin elección de menús.' });
  if (alerts.length) blocks.push({ type: 'p', tone: 'alert', text: `Alertas: ${alerts.join(' · ')}` });
  return { type: 'group', title: `${b.holder.name || 'Sin nombre'} — ${b.qamarero.date ? b.qamarero.date.split('-').reverse().join('/') : 'sin fecha'}`, tone: alerts.some((a) => /ALERG|Cambio|Incid|incid/.test(a)) ? 'alert' : undefined, blocks };
}

export function reportBreakdown(bookings: Booking[], scope: Scope, cfg: ReservasConfig): ReportDoc {
  const { active } = inScope(bookings, scope, cfg);
  return { title: 'Desglose por reserva', subtitle: scopeLabel(scope), generatedAt: new Date().toISOString(), blocks: active.length ? active.map((b) => bookingBlocks(b, cfg)) : [{ type: 'p', text: 'No hay reservas activas.', tone: 'muted' }] };
}

/* ---------- D · Cambios pendientes ---------- */
export function reportPending(bookings: Booking[], scope: Scope, cfg: ReservasConfig): ReportDoc {
  const { active, cancelled } = inScope(bookings, scope, cfg);
  const modified = active.filter((b) => b.gastroStatus === 'modified' || b.gastroStatus === 'review');
  const people = active.filter((b) => b.peopleChange?.status === 'pending' || openIssues(b).some((i) => i.type === 'people_mismatch'));
  const unverified = active.filter((b) => verification(b, cfg.staleDays) !== 'verified');
  const row = (b: Booking, extra: string) => [b.qamarero.date.split('-').reverse().join('/'), b.qamarero.time || '—', b.holder.name, extra];
  const cols = [{ label: 'Fecha', w: 18 }, { label: 'Hora', w: 12 }, { label: 'Titular', w: 40 }, { label: 'Detalle', w: 80 }];
  const lastChange = (b: Booking) => [...b.history].reverse().find((h) => h.source === 'link' || h.type === 'selection_edited');
  const blocks: Block[] = [
    { type: 'group', title: `Variaciones de comensales (${people.length})`, tone: people.length ? 'alert' : undefined, blocks: [{ type: 'table', cols, rows: people.map((b) => row(b, b.peopleChange?.status === 'pending' ? `Solicitan ${b.peopleChange.to} (confirmados ${b.peopleChange.from ?? '—'}) · pendiente de confirmar en Qamarero` : openIssues(b).find((i) => i.type === 'people_mismatch')?.message ?? '')) }] },
    { type: 'group', title: `Reservas modificadas o por revisar (${modified.length})`, blocks: [{ type: 'table', cols, rows: modified.map((b) => row(b, (lastChange(b)?.details ?? []).slice(0, 4).join(' · ') || 'Requiere revisión')) }] },
    { type: 'group', title: `Sin verificar o con incidencias (${unverified.length})`, blocks: [{ type: 'table', cols, rows: unverified.map((b) => row(b, alertsOf(b, cfg).join(' · '))) }] },
    { type: 'group', title: `Cancelaciones conocidas (${cancelled.length})`, blocks: [{ type: 'table', cols, rows: cancelled.map((b) => row(b, Q_LABEL[b.qamarero.status])) }] },
  ];
  return { title: 'Cambios pendientes e incidencias', subtitle: scopeLabel(scope), generatedAt: new Date().toISOString(), blocks };
}

/* ---------- HTML A4 ---------- */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function blockHtml(b: Block): string {
  switch (b.type) {
    case 'h':
      return `<h2>${esc(b.text)}</h2>`;
    case 'p':
      return `<p class="${b.tone ?? ''}">${esc(b.text)}</p>`;
    case 'kv':
      return `<dl>${b.items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    case 'table': {
      const total = b.cols.reduce((n, c) => n + c.w, 0);
      return `<table><colgroup>${b.cols.map((c) => `<col style="width:${((c.w / total) * 100).toFixed(1)}%">`).join('')}</colgroup><thead><tr>${b.cols.map((c) => `<th${c.align ? ' class="r"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${b.rows.length ? b.rows.map((r) => `<tr>${r.map((v, i) => `<td class="${b.cols[i]?.align === 'right' ? 'r' : ''}${i === b.alertCol && v ? ' alert' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${b.cols.length}" class="muted">—</td></tr>`}</tbody></table>`;
    }
    case 'group':
      return `<section class="group ${b.tone ?? ''}"><h3>${esc(b.title)}</h3>${b.blocks.map(blockHtml).join('')}</section>`;
  }
}

export function reportHtml(doc: ReportDoc, brand: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(doc.title)} · ${esc(doc.subtitle)}</title><style>
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.35 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1b1415; margin: 0; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #5a2533; padding-bottom: 6pt; margin-bottom: 10pt; }
header h1 { font: 600 17pt Georgia, serif; margin: 0; color: #5a2533; }
header p { margin: 2pt 0 0; font-size: 10pt; }
header small { color: #6b5f60; font-size: 8.5pt; text-align: right; }
h2 { font: 700 12pt Georgia, serif; margin: 12pt 0 6pt; color: #5a2533; letter-spacing: .06em; }
h3 { font-size: 10.5pt; margin: 0 0 5pt; }
p { margin: 4pt 0; } p.alert { color: #9b1c25; font-weight: 700; } p.muted, td.muted { color: #777; } p.strong { font-weight: 700; }
dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3pt 12pt; margin: 0 0 6pt; } dl div { display: flex; gap: 4pt; } dt { color: #6b5f60; } dt::after { content: ':'; } dd { margin: 0; font-weight: 600; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 4pt 0 8pt; }
th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: #5a2533; border-bottom: 1.2pt solid #5a2533; padding: 3pt 4pt; }
td { border-bottom: .5pt solid #d8cfc7; padding: 3.5pt 4pt; vertical-align: top; word-wrap: break-word; }
.r { text-align: right; } td.alert { color: #9b1c25; font-weight: 700; }
tr, .group { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
.group { border: .8pt solid #d8cfc7; border-radius: 4pt; padding: 6pt 8pt; margin: 0 0 8pt; }
.group.alert { border-color: #9b1c25; border-width: 1.4pt; }
footer { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 8pt; color: #888; display: flex; justify-content: space-between; }
@media screen { body { max-width: 190mm; margin: 12mm auto; } }
</style></head><body><header><div><h1>${esc(doc.title)}</h1><p>${esc(doc.subtitle)}</p></div><small>${esc(brand)}<br>Generado ${new Date(doc.generatedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</small></header>${doc.blocks.map(blockHtml).join('')}<footer><span>${esc(brand)} · ${esc(doc.title)}</span><span>Uso interno · contiene datos personales</span></footer></body></html>`;
}

export function printReport(doc: ReportDoc, brand: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(reportHtml(doc, brand));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
  return true;
}

/* ---------- PDF ---------- */
export async function reportPdf(doc: ReportDoc, brand: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 12;
  const CW = W - 2 * M;
  let y = 0;
  const lh = 4.3;
  const burgundy: [number, number, number] = [90, 37, 51];
  const header = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(...burgundy);
    pdf.text(doc.title, M, 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 20, 21);
    pdf.text(doc.subtitle, M, 21.5);
    pdf.setFontSize(8);
    pdf.setTextColor(110, 100, 100);
    pdf.text(`${brand} · ${new Date(doc.generatedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`, W - M, 16, { align: 'right' });
    pdf.setDrawColor(...burgundy);
    pdf.setLineWidth(0.6);
    pdf.line(M, 24, W - M, 24);
    y = 30;
  };
  const newPage = () => {
    pdf.addPage();
    header();
  };
  const ensure = (h: number) => {
    if (y + h > H - 16) newPage();
  };
  // Medición (para no cortar grupos entre páginas).
  const measure = (b: Block, width: number): number => {
    pdf.setFontSize(9);
    switch (b.type) {
      case 'h':
        return 9;
      case 'p':
        return pdf.splitTextToSize(b.text, width).length * lh + 1.5;
      case 'kv':
        return Math.ceil(b.items.length / 2) * lh + 2;
      case 'table': {
        const total = b.cols.reduce((n, c) => n + c.w, 0);
        let h = 6;
        for (const r of b.rows) h += Math.max(...r.map((v, i) => pdf.splitTextToSize(v || '—', (b.cols[i].w / total) * width - 2).length)) * 3.9 + 1.6;
        return h + 2;
      }
      case 'group':
        return 8 + b.blocks.reduce((n, x) => n + measure(x, width - 6), 0);
    }
  };
  const draw = (b: Block, x: number, width: number) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 20, 21);
    switch (b.type) {
      case 'h':
        ensure(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11.5);
        pdf.setTextColor(...burgundy);
        pdf.text(b.text, x, y + 5);
        y += 9;
        break;
      case 'p': {
        const lines = pdf.splitTextToSize(b.text, width) as string[];
        ensure(lines.length * lh + 2);
        if (b.tone === 'alert') {
          pdf.setTextColor(155, 28, 37);
          pdf.setFont('helvetica', 'bold');
        } else if (b.tone === 'muted') pdf.setTextColor(120, 120, 120);
        else if (b.tone === 'strong') pdf.setFont('helvetica', 'bold');
        pdf.text(lines, x, y + 3.5);
        y += lines.length * lh + 1.5;
        break;
      }
      case 'kv': {
        ensure(Math.ceil(b.items.length / 2) * lh + 2);
        b.items.forEach(([k, v], i) => {
          const cx = x + (i % 2) * (width / 2);
          const cy = y + 3.5 + Math.floor(i / 2) * lh;
          pdf.setTextColor(110, 100, 100);
          pdf.text(`${k}:`, cx, cy);
          pdf.setTextColor(30, 20, 21);
          pdf.setFont('helvetica', 'bold');
          pdf.text(pdf.splitTextToSize(v, width / 2 - 30)[0] ?? '', cx + 28, cy);
          pdf.setFont('helvetica', 'normal');
        });
        y += Math.ceil(b.items.length / 2) * lh + 2;
        break;
      }
      case 'table': {
        const total = b.cols.reduce((n, c) => n + c.w, 0);
        const ws = b.cols.map((c) => (c.w / total) * width);
        const head = () => {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.8);
          pdf.setTextColor(...burgundy);
          let cx = x;
          b.cols.forEach((c, i) => {
            pdf.text(c.label.toUpperCase(), c.align === 'right' ? cx + ws[i] - 1 : cx + 1, y + 3.5, c.align === 'right' ? { align: 'right' } : undefined);
            cx += ws[i];
          });
          pdf.setDrawColor(...burgundy);
          pdf.setLineWidth(0.35);
          pdf.line(x, y + 5, x + width, y + 5);
          y += 6.5;
        };
        ensure(14);
        head();
        pdf.setFontSize(8.6);
        for (const r of b.rows.length ? b.rows : [['—']]) {
          const cells = r.map((v, i) => pdf.splitTextToSize(v || '—', ws[i] - 2) as string[]);
          const rh = Math.max(...cells.map((c) => c.length)) * 3.9 + 1.6;
          if (y + rh > H - 16) {
            newPage();
            head();
            pdf.setFontSize(8.6);
          }
          let cx = x;
          cells.forEach((lines, i) => {
            const alert = i === b.alertCol && r[i];
            pdf.setFont('helvetica', alert ? 'bold' : 'normal');
            if (alert) pdf.setTextColor(155, 28, 37);
            else pdf.setTextColor(30, 20, 21);
            pdf.text(lines, b.cols[i]?.align === 'right' ? cx + ws[i] - 1 : cx + 1, y + 3.3, b.cols[i]?.align === 'right' ? { align: 'right' } : undefined);
            cx += ws[i];
          });
          y += rh;
          pdf.setDrawColor(216, 207, 199);
          pdf.setLineWidth(0.15);
          pdf.line(x, y - 0.6, x + width, y - 0.6);
        }
        y += 2;
        break;
      }
      case 'group': {
        const h = measure(b, width);
        if (h < H - 46) ensure(h);
        else ensure(30);
        const top = y;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        if (b.tone === 'alert') pdf.setTextColor(155, 28, 37);
        pdf.text(b.title, x + 3, y + 5);
        y += 8;
        for (const inner of b.blocks) draw(inner, x + 3, width - 6);
        if (pdf.getNumberOfPages() && y > top) {
          pdf.setDrawColor(...(b.tone === 'alert' ? ([155, 28, 37] as [number, number, number]) : ([216, 207, 199] as [number, number, number])));
          pdf.setLineWidth(b.tone === 'alert' ? 0.5 : 0.25);
          pdf.roundedRect(x, top, width, y - top + 1, 1.5, 1.5);
        }
        y += 4;
        break;
      }
    }
  };
  header();
  for (const b of doc.blocks) draw(b, M, CW);
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`${brand} · ${doc.title} · Uso interno (datos personales)`, M, H - 8);
    pdf.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return pdf.output('blob');
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- CSV ---------- */
export function csvBookings(bookings: Booking[], cfg: ReservasConfig): string {
  return toCsv([
    ['Fecha', 'Hora', 'Servicio', 'Titular', 'Teléfono', 'Correo', 'Zona', 'Personas confirmadas', 'Personas solicitadas', 'Adultos', 'Niños', 'Menús', 'Estado Qamarero', 'Estado gastronómico', 'Verificación', 'Alergias', 'Referencia', 'Localizador Qamarero'],
    ...bookings.map((b) => [
      b.qamarero.date,
      b.qamarero.time,
      (() => {
        const s = serviceOf(b, cfg.email.lunchUntil);
        return s ? SERVICE_LABEL[s] : '';
      })(),
      b.holder.name,
      b.holder.phone,
      b.holder.email,
      b.qamarero.zone,
      b.qamarero.people,
      totalPeople(b),
      b.selection?.adults ?? '',
      b.selection?.children ?? '',
      menusOf(b),
      Q_LABEL[b.qamarero.status],
      b.gastroStatus,
      VERIFICATION_LABEL[verification(b, cfg.staleDays)],
      [b.selection?.notes.allergies, ...(b.selection?.diners.filter((d) => d.allergy).map((d) => `${d.label}: ${d.allergy}`) ?? [])].filter(Boolean).join(' | '),
      b.ref,
      b.qamarero.reservationId,
    ]),
  ]);
}
export function csvDiners(bookings: Booking[]): string {
  const rows: (string | number | null)[][] = [['Fecha', 'Hora', 'Titular', 'Referencia', 'Comensal', 'Tipo', 'Menú', 'Platos', 'Alergias', 'Nota']];
  for (const b of bookings)
    for (const d of b.selection?.diners ?? [])
      rows.push([b.qamarero.date, b.qamarero.time, b.holder.name, b.ref, d.label, d.kind === 'adult' ? 'Adulto' : 'Niño', d.mode === 'carta' ? 'Carta habitual' : (d.menuName ?? ''), d.picks.flatMap((p) => p.items.map((i) => i.name)).join(', '), d.allergy, d.note]);
  return toCsv(rows);
}
