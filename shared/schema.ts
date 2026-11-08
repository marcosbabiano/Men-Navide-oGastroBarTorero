/**
 * Esquema de contenido del sitio (fuente única de verdad).
 * Se usa en el servidor para validar todo lo que se guarda y en el panel para
 * mostrar errores comprensibles antes de enviar. La web pública solo importa los tipos.
 */
import { z } from 'zod';
import { checkThemeContrast } from './theme.ts';

// Caracteres de control (excepto salto de línea y tabulador) no permitidos en textos.
// eslint-disable-next-line no-control-regex -- saneamiento intencionado de caracteres de control
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

export const safeText = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .refine((v) => !CONTROL_CHARS.test(v), 'Contiene caracteres no permitidos');

export const idSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Identificador no válido (minúsculas, números y guiones)');

/** URL http(s) o vacía. Se rechazan esquemas peligrosos (javascript:, data:…). */
export const optionalUrl = z
  .string()
  .max(600)
  .refine((v) => v === '' || isHttpUrl(v), 'Debe ser una dirección web que empiece por https://');

export const httpsUrl = z
  .string()
  .max(600)
  .refine((v) => isHttpUrl(v, true), 'Debe ser una dirección web segura (https://)');

export function isHttpUrl(value: string, httpsOnly = false): boolean {
  try {
    const u = new URL(value);
    if (httpsOnly) return u.protocol === 'https:';
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal no válido (#RRGGBB)');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM)');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida (AAAA-MM-DD)');

export const imageRefSchema = z.object({
  asset: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/, 'Imagen no válida'),
  alt: safeText(240),
});

export const timeRangeSchema = z.object({ open: time, close: time });

export const weeklyHoursSchema = z.object({
  day: z.number().int().min(0).max(6),
  closed: z.boolean(),
  ranges: z.array(timeRangeSchema).max(3),
});

export const specialHoursSchema = z.object({
  id: idSchema,
  date: isoDate,
  label: safeText(80),
  closed: z.boolean(),
  ranges: z.array(timeRangeSchema).max(3),
  note: safeText(200),
});

export const menuItemSchema = z.object({
  id: idSchema,
  name: safeText(120),
  detail: safeText(300),
  quantity: safeText(80),
  /** Marca interna: la cantidad está pendiente de confirmar (no se muestra en la web). */
  quantityPending: z.boolean(),
  note: safeText(200),
});

export const SECTION_KINDS = ['shared', 'choice', 'dessert', 'drink', 'extra'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const menuSectionSchema = z.object({
  id: idSchema,
  kind: z.enum(SECTION_KINDS),
  title: safeText(80),
  hint: safeText(160),
  /** Si está pendiente, la sección nunca se muestra en la web pública. */
  pending: z.boolean(),
  /** Grupos «a elegir»: cuántas opciones elige cada comensal. */
  choose: z.number().int().min(1).max(10),
  items: z.array(menuItemSchema).max(40),
});

export const MENU_STATUSES = ['draft', 'published', 'hidden'] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];
export const MENU_THEMES = ['ivory', 'noir', 'burgundy', 'forest', 'gourmet'] as const;
export type MenuTheme = (typeof MENU_THEMES)[number];

export const menuSchema = z.object({
  id: idSchema,
  status: z.enum(MENU_STATUSES),
  order: z.number().int().min(0).max(999),
  name: safeText(80),
  originalName: safeText(80),
  subtitle: safeText(160),
  description: safeText(700),
  tag: safeText(40),
  price: z.object({
    amount: z.number().min(0).max(10000).multipleOf(0.01).nullable(),
    unit: safeText(40),
    confirmed: z.boolean(),
    note: safeText(160),
  }),
  image: imageRefSchema.nullable(),
  gallery: z.array(imageRefSchema).max(8),
  sections: z.array(menuSectionSchema).max(12),
  conditions: z.array(safeText(240)).max(12),
  cta: z.object({ label: safeText(60), helper: safeText(200) }),
  theme: z.enum(MENU_THEMES),
  /** Notas internas: nunca se envían a la web pública. */
  adminNotes: safeText(1500),
});

/* ---------------- Estructura de la landing (gestor de secciones) ---------------- */

/** Enlace de botón: vacío = plataforma de reservas; también https, #ancla, tel: y mailto:. */
export const ctaHref = z
  .string()
  .max(600)
  .refine(
    (v) => v === '' || isHttpUrl(v, true) || /^#[a-z0-9-]{1,60}$/.test(v) || /^tel:\+?[0-9 ]{6,20}$/.test(v) || /^mailto:[^\s@]+@[^\s@]+$/.test(v),
    'Enlace no válido: deja vacío para reservas, o usa https://…, #seccion, tel: o mailto:',
  );

export const BLOCK_TEMPLATES = ['image-text', 'text-image', 'fullbleed', 'gallery', 'quote', 'divider', 'cta', 'info'] as const;
export type BlockTemplate = (typeof BLOCK_TEMPLATES)[number];
export const BLOCK_TONES = ['dark', 'light', 'burgundy'] as const;

export const customBlockSchema = z.object({
  template: z.enum(BLOCK_TEMPLATES),
  tone: z.enum(BLOCK_TONES),
  eyebrow: safeText(60),
  title: safeText(160),
  subtitle: safeText(240),
  body: safeText(1500),
  images: z.array(imageRefSchema).max(8),
  cta: z.object({ label: safeText(40), href: ctaHref }),
});
export type CustomBlock = z.infer<typeof customBlockSchema>;

export const BUILTIN_SECTIONS = ['hero', 'story', 'menus', 'compare', 'celebration', 'howTo', 'faq', 'about'] as const;
export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number];
export const SECTION_TYPES = [...BUILTIN_SECTIONS, 'custom'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const layoutSectionSchema = z
  .object({
    id: idSchema,
    type: z.enum(SECTION_TYPES),
    visible: z.boolean(),
    /** Nombre en el panel y, si navLabel está vacío, no aparece en la navegación. */
    label: safeText(60),
    navLabel: safeText(30),
    block: customBlockSchema.nullable(),
  })
  .refine((s) => (s.type === 'custom') === !!s.block, 'Los bloques personalizados necesitan contenido');
export type LayoutSection = z.infer<typeof layoutSectionSchema>;

const faqItemSchema = z.object({ id: idSchema, question: safeText(200), answer: safeText(1200) });
const stepSchema = z.object({ id: idSchema, title: safeText(80), text: safeText(400) });

export const themeSchema = z
  .object({ carbon: hexColor, burgundy: hexColor, gold: hexColor, ivory: hexColor })
  .superRefine((t, ctx) => {
    for (const issue of checkThemeContrast(t)) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: [issue.field] });
    }
  });

export const socialSchema = z.object({
  instagram: optionalUrl,
  facebook: optionalUrl,
  tiktok: optionalUrl,
  whatsapp: optionalUrl,
  google: optionalUrl,
  tripadvisor: optionalUrl,
});

export const siteContentSchema = z.object({
  schemaVersion: z.literal(1),
  campaign: z.object({
    name: safeText(80),
    year: z.number().int().min(2024).max(2100),
    active: z.boolean(),
    inactiveTitle: safeText(120),
    inactiveMessage: safeText(500),
    announcement: z.object({ enabled: z.boolean(), text: safeText(160) }),
    introEnabled: z.boolean(),
    theme: themeSchema,
    logo: imageRefSchema.nullable(),
    favicon: imageRefSchema.nullable(),
    /** Ornamentos de marca (ilustraciones con transparencia). Vacíos = no se muestran. */
    decor: z.object({
      heroAccent: imageRefSchema.nullable(),
      divider: imageRefSchema.nullable(),
      branch: imageRefSchema.nullable(),
    }),
  }),
  seo: z.object({
    title: safeText(70),
    description: safeText(170),
    siteName: safeText(60),
    ogImage: imageRefSchema.nullable(),
  }),
  booking: z.object({
    url: httpsUrl,
    notice: z.object({ enabled: z.boolean(), text: safeText(300) }),
  }),
  texts: z.object({
    nav: z.object({
      story: safeText(30),
      menus: safeText(30),
      compare: safeText(30),
      howTo: safeText(30),
      faq: safeText(30),
      contact: safeText(30),
      book: safeText(30),
    }),
    intro: z.object({ line: safeText(80), skip: safeText(30) }),
    hero: z.object({
      eyebrow: safeText(120),
      titleLead: safeText(60),
      titleMain: safeText(60),
      titleAccent: safeText(60),
      subtitle: safeText(320),
      primaryCta: safeText(40),
      secondaryCta: safeText(40),
      scrollHint: safeText(30),
      sideNote: safeText(80),
      image: imageRefSchema,
    }),
    story: z.object({
      eyebrow: safeText(60),
      title: safeText(140),
      lead: safeText(500),
      body: z.array(safeText(800)).max(4),
      quote: safeText(200),
      images: z.array(imageRefSchema).max(3),
    }),
    menus: z.object({
      eyebrow: safeText(60),
      title: safeText(120),
      intro: safeText(400),
      choiceJoiner: safeText(10),
      illustrativeNote: safeText(120),
      emptyMessage: safeText(200),
    }),
    compare: z.object({
      eyebrow: safeText(60),
      title: safeText(120),
      intro: safeText(300),
      pendingLabel: safeText(60),
      commonLabel: safeText(60),
      priceLabel: safeText(40),
    }),
    celebration: z.object({
      eyebrow: safeText(60),
      title: safeText(140),
      body: safeText(600),
      moments: z.array(safeText(40)).max(8),
      images: z.array(imageRefSchema).max(4),
      cta: safeText(40),
    }),
    howTo: z.object({
      eyebrow: safeText(60),
      title: safeText(120),
      intro: safeText(300),
      steps: z.array(stepSchema).max(6),
      cta: safeText(40),
    }),
    faq: z.object({
      eyebrow: safeText(60),
      title: safeText(120),
      intro: safeText(300),
      items: z.array(faqItemSchema).max(30),
    }),
    about: z.object({
      eyebrow: safeText(60),
      title: safeText(120),
      body: safeText(900),
      image: imageRefSchema.nullable(),
    }),
    footer: z.object({ closing: safeText(140), legal: safeText(500) }),
    mobileBar: z.object({ label: safeText(40), cta: safeText(30) }),
  }),
  business: z.object({
    name: safeText(80),
    description: safeText(400),
    address: z.object({
      street: safeText(120),
      postalCode: safeText(10),
      locality: safeText(80),
      region: safeText(80),
      country: safeText(60),
    }),
    phone: z
      .string()
      .max(30)
      .regex(/^[+0-9 ()-]*$/, 'Teléfono no válido'),
    email: z.union([z.literal(''), z.email('Correo no válido').max(120)]),
    mapsUrl: optionalUrl,
    social: socialSchema,
    contactMessage: safeText(300),
    verified: z.object({ address: z.boolean(), phone: z.boolean() }),
    hours: z.object({
      verified: z.boolean(),
      weekly: z.array(weeklyHoursSchema).length(7),
      specials: z.array(specialHoursSchema).max(40),
      note: safeText(300),
      unverifiedMessage: safeText(300),
    }),
  }),
  menus: z.array(menuSchema).max(30),
  /** Parches de datos ya aplicados (evita repetirlos o duplicar contenido). */
  patches: z.array(z.string().max(60)).max(100),
  layout: z
    .object({ sections: z.array(layoutSectionSchema).max(40) })
    .superRefine((l, ctx) => {
      const ids = new Set<string>();
      for (const [i, s] of l.sections.entries()) {
        if (ids.has(s.id)) ctx.addIssue({ code: 'custom', message: `Sección duplicada (${s.id})`, path: ['sections', i, 'id'] });
        ids.add(s.id);
      }
      for (const t of BUILTIN_SECTIONS) {
        if (l.sections.filter((s) => s.type === t).length > 1) ctx.addIssue({ code: 'custom', message: `La sección «${t}» está repetida`, path: ['sections'] });
      }
    }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type Menu = z.infer<typeof menuSchema>;
export type MenuSection = z.infer<typeof menuSectionSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type ImageRef = z.infer<typeof imageRefSchema>;
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;
export type SpecialHours = z.infer<typeof specialHoursSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type Theme = z.infer<typeof themeSchema>;

export const mediaAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(['static', 'upload']),
  src: z.string(),
  widths: z.array(z.number()),
  width: z.number(),
  height: z.number(),
  alt: z.string(),
  folder: z.string(),
  position: z.string().optional(),
  lqip: z.string().optional(),
  credit: z.string().optional(),
  sourceUrl: z.string().optional(),
  illustrative: z.boolean().optional(),
  uploadedAt: z.string().optional(),
  uploadedBy: z.string().optional(),
  bytes: z.number().optional(),
  contentType: z.string().optional(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const MEDIA_FOLDERS = ['portada', 'platos', 'ambiente', 'ilustraciones', 'ornamentos', 'marca', 'texturas', 'otros'] as const;

/** Convierte los errores de Zod en una lista legible para el panel. */
export function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
