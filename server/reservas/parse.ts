/**
 * Intérprete determinista de correos de notificación de reservas (Qamarero u otros).
 *
 * No se conoce aún el formato exacto de los correos reales: el intérprete busca etiquetas
 * habituales en español («Fecha», «Hora», «Personas», «Localizador»…) en HTML o texto, admite
 * «Etiqueta: valor», celdas de tabla y etiqueta en una línea con el valor en la siguiente, y
 * después aplica patrones de respaldo. Nunca inventa: lo que no encuentra queda vacío.
 * El resultado incluye las líneas interpretadas para auditar cómo se leyó cada correo.
 */
import { normalizePhone, REF_RE } from '../../shared/reservas.ts';

export interface RawEmail {
  messageId: string;
  from: string;
  subject: string;
  date: string; // ISO de recepción
  text: string;
  html: string;
}

export interface ParsedEmail {
  type: 'new' | 'modified' | 'cancelled' | 'unknown';
  reservationId: string;
  ref: string;
  name: string;
  phone: string;
  email: string;
  date: string;
  time: string;
  people: number | null;
  zone: string;
  menu: string;
  notes: string;
  status: string;
  /** Pares etiqueta → valor reconocidos (auditoría). */
  fields: Record<string, string>;
  missing: string[];
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', euro: '€' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/[ \u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[º°ª#.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const LABELS: [keyof Omit<ParsedEmail, 'type' | 'fields' | 'missing' | 'ref'>, RegExp][] = [
  ['reservationId', /^(localizador|codigo( de)?( la)? reserva|id( de)?( la)? reserva|n(umero)?( de)? reserva|reserva n(umero)?|referencia( de la reserva)?|identificador|codigo|booking id|reservation id)$/],
  ['name', /^(nombre( y apellidos)?|nombre del cliente|cliente|titular|a nombre de|name)$/],
  ['phone', /^(telefono|movil|tel|telefono movil|phone)$/],
  ['email', /^(e-?mail|correo( electronico)?)$/],
  ['date', /^(fecha( de( la)? reserva)?|dia|date)$/],
  ['time', /^(hora|hora de( la)? reserva|time)$/],
  ['people', /^(personas|comensales|pax|n(umero)?( de)? (personas|comensales)|invitados|guests)$/],
  ['zone', /^(zona|sala|espacio|ubicacion|area|mesa)$/],
  ['menu', /^(menu|menu seleccionado|tipo de menu)$/],
  ['notes', /^(observaciones|comentarios?|notas?|peticiones( especiales)?|comentario del cliente)$/],
  ['status', /^(estado( de( la)? reserva)?|status)$/],
];

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha en AAAA-MM-DD a partir de formatos habituales en español. */
export function parseDate(s: string, receivedIso: string): string {
  const t = norm(s);
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+(?:de|del)\\s+(\\d{4}))?`).exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2]) + 1;
    let year = m[3] ? Number(m[3]) : Number(receivedIso.slice(0, 4)) || new Date().getUTCFullYear();
    if (!m[3]) {
      const recvMonth = Number(receivedIso.slice(5, 7)) || 1;
      if (month < recvMonth - 2) year++;
    }
    return `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

export function parseTime(s: string): string {
  const m = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function detectType(subject: string, text: string): ParsedEmail['type'] {
  const s = norm(`${subject}\n${text.slice(0, 400)}`);
  if (/cancelad|anulad|cancelacion/.test(s)) return 'cancelled';
  if (/modificad|actualizad|modificacion|cambio en (tu|la|su) reserva|editad/.test(s)) return 'modified';
  if (/nueva reserva|reserva confirmada|confirmacion de reserva|reserva recibida|has recibido una reserva|new reservation|reserva realizada/.test(s)) return 'new';
  return 'unknown';
}

export function parseEmail(e: RawEmail): ParsedEmail {
  const text = [e.text?.trim() ? e.text : '', e.html ? htmlToText(e.html) : ''].filter(Boolean).join('\n');
  const lines = text.split(/\n/).flatMap((l) => l.split('\t').length > 2 ? [l] : [l]).map((l) => l.trim()).filter(Boolean);
  const out: ParsedEmail = { type: detectType(e.subject, text), reservationId: '', ref: '', name: '', phone: '', email: '', date: '', time: '', people: null, zone: '', menu: '', notes: '', status: '', fields: {}, missing: [] };
  const set = (key: (typeof LABELS)[number][0], value: string, label: string) => {
    const v = value.replace(/^[\s:|-]+/, '').trim();
    if (!v || (out[key] !== '' && out[key] !== null)) return;
    out.fields[label] = v;
    switch (key) {
      case 'people': {
        const n = /\d{1,3}/.exec(v);
        if (n) out.people = Number(n[0]);
        break;
      }
      case 'date':
        out.date = parseDate(v, e.date);
        if (!out.time) out.time = parseTime(v);
        break;
      case 'time':
        out.time = parseTime(v);
        break;
      case 'phone':
        out.phone = v.replace(/[^\d+]/g, '');
        break;
      default:
        (out as unknown as Record<string, string>)[key] = v.slice(0, key === 'notes' ? 800 : 160);
    }
  };
  const match = (label: string) => LABELS.find(([, re]) => re.test(norm(label)));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // «Etiqueta: valor», «Etiqueta | valor» o celdas separadas por tabulador.
    const cells = line.includes('\t') ? line.split('\t').map((c) => c.trim()).filter(Boolean) : null;
    if (cells && cells.length >= 2) {
      for (let k = 0; k + 1 < cells.length; k += 2) {
        const m = match(cells[k].replace(/:$/, ''));
        if (m) set(m[0], cells[k + 1], cells[k]);
      }
      continue;
    }
    const kv = /^([^:|]{2,40})[:|]\s*(.*)$/.exec(line);
    if (kv) {
      const m = match(kv[1]);
      if (m) {
        if (kv[2].trim()) set(m[0], kv[2], kv[1]);
        else if (lines[i + 1] && !match(lines[i + 1].replace(/:$/, ''))) set(m[0], lines[++i], kv[1]);
        continue;
      }
    }
    // Etiqueta sola en una línea y valor en la siguiente.
    const solo = match(line);
    if (solo && lines[i + 1] && !match(lines[i + 1].replace(/:$/, ''))) set(solo[0], lines[++i], line);
  }
  // Patrones de respaldo sobre todo el texto.
  const flat = text.replace(/\s+/g, ' ');
  out.ref = REF_RE.exec(flat)?.[0] ?? '';
  if (!out.email) out.email = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(flat.replace(e.from, ''))?.[0] ?? '';
  if (!out.date) out.date = parseDate(flat, e.date);
  if (!out.time) {
    const t = /(?:a las|hora:?)\s*([01]?\d|2[0-3])[:.h]([0-5]\d)/i.exec(flat);
    if (t) out.time = `${t[1].padStart(2, '0')}:${t[2]}`;
  }
  if (out.people === null) {
    const p = /(?:para|mesa (?:de|para))\s+(\d{1,3})\s+(?:personas|comensales|pax)/i.exec(flat) ?? /(\d{1,3})\s+(?:personas|comensales|pax)\b/i.exec(flat);
    if (p) out.people = Number(p[1]);
  }
  if (!out.phone) out.phone = /(?:\+34\s?)?[6789]\d{2}\s?\d{2,3}\s?\d{2,3}\s?\d{0,2}/.exec(flat)?.[0]?.replace(/\s/g, '') ?? '';
  out.phone = out.phone ? (normalizePhone(out.phone) ?? '') : '';
  if (out.email && /qamarero|noreply|no-reply/i.test(out.email)) out.email = '';
  for (const k of ['reservationId', 'name', 'phone', 'date', 'time', 'people'] as const) if (out[k] === '' || out[k] === null) out.missing.push(k);
  return out;
}

/** ¿El remitente está autorizado? (contiene alguno de los fragmentos configurados). */
export function senderAllowed(from: string, allowed: string[]): boolean {
  const f = from.toLowerCase();
  return allowed.some((a) => a.trim() && f.includes(a.trim().toLowerCase()));
}
