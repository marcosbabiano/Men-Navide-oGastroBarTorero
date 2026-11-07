/**
 * Contenido inicial del sitio.
 *
 * Solo se usa cuando el almacenamiento persistente (Netlify Blobs) todavía no tiene contenido.
 * Nunca sobrescribe cambios hechos desde /admin: el servidor lo escribe con `onlyIfNew`.
 *
 * Reglas aplicadas:
 *  - Los platos, cantidades e inclusiones son exactamente los confirmados.
 *  - Postre y bebida del Menú Distinción: secciones vacías marcadas como pendientes (no se muestran).
 *  - El tercer menú no existe todavía: se crea desde el panel.
 *  - El horario procede de directorios externos: marcado como no verificado (no se muestra).
 */
import type { Menu, SiteContent } from './schema.ts';
import { DEFAULT_THEME } from './theme.ts';

export const DEFAULT_BOOKING_URL = 'https://booking.qamarero.com/new-reservation/bar-torero';

const menuEsencia: Menu = {
  id: 'menu-esencia',
  status: 'published',
  order: 0,
  name: 'Menú Esencia',
  originalName: 'Basic',
  subtitle: 'Los clásicos de la Navidad, para compartir sin prisa',
  description:
    'Una mesa llena de entrantes para compartir, un principal a elegir y un final de chocolate. La Navidad de siempre, como debe ser.',
  tag: '',
  price: { amount: 36, unit: 'por persona', confirmed: false, note: '' },
  image: { asset: 'sliced-meat', alt: 'Carne a la brasa cortada en lonchas sobre tabla' },
  gallery: [
    { asset: 'cheese', alt: 'Queso curado con higos, nueces y hierbas' },
    { asset: 'chocolate-cake', alt: 'Porción de tarta de chocolate con salsa de chocolate' },
  ],
  sections: [
    {
      id: 'esencia-entrantes',
      kind: 'shared',
      title: 'Entrantes',
      hint: 'Para compartir en el centro de la mesa',
      pending: false,
      items: [
        {
          id: 'esencia-croquetas',
          name: 'Surtido de croquetas artesanas',
          detail: 'Una de cada especialidad',
          quantity: '3 por persona',
          quantityPending: false,
          note: '',
        },
        {
          id: 'esencia-canelon',
          name: 'Canelón de foie y trufa',
          detail: '',
          quantity: '',
          quantityPending: true,
          note: '',
        },
        { id: 'esencia-jamon', name: 'Jamón ibérico de cebo', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'esencia-quesos', name: 'Selección de quesos', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'esencia-langostinos', name: 'Langostinos torpedo', detail: '', quantity: '', quantityPending: false, note: '' },
      ],
    },
    {
      id: 'esencia-principal',
      kind: 'choice',
      title: 'Principal',
      hint: 'A elegir un plato por comensal',
      pending: false,
      items: [
        { id: 'esencia-secreto', name: 'Secreto ibérico', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'esencia-bacalao', name: 'Bacalao en salsa', detail: '', quantity: '', quantityPending: false, note: '' },
      ],
    },
    {
      id: 'esencia-postre',
      kind: 'dessert',
      title: 'Postre',
      hint: '',
      pending: false,
      items: [{ id: 'esencia-tarta', name: 'Tarta de tres chocolates', detail: '', quantity: '', quantityPending: false, note: '' }],
    },
    {
      id: 'esencia-bebida',
      kind: 'drink',
      title: 'Bebida',
      hint: '',
      pending: false,
      items: [{ id: 'esencia-bebida-incluida', name: 'Bebida incluida', detail: '', quantity: '', quantityPending: false, note: '' }],
    },
  ],
  conditions: [],
  cta: { label: 'Reservar mesa', helper: '' },
  theme: 'ivory',
  adminNotes:
    'Pendiente: confirmar el precio final y si el canelón de foie y trufa se sirve por persona o como ración para compartir. No indicar sabores de las croquetas hasta confirmarlos.',
};

const menuDistincion: Menu = {
  id: 'menu-distincion',
  status: 'published',
  order: 1,
  name: 'Menú Distinción',
  originalName: 'Deluxe',
  subtitle: 'Una mesa más generosa para las grandes ocasiones',
  description:
    'Ibérico, quesos y producto del mar al centro, y un principal a elegir entre carne y pescado. Para celebrar a lo grande.',
  tag: '',
  price: { amount: 45, unit: 'por persona', confirmed: false, note: '' },
  image: { asset: 'steak', alt: 'Corte de carne roja al punto en primer plano' },
  gallery: [
    { asset: 'prawns', alt: 'Langostinos cocidos servidos en un plato' },
    { asset: 'champagne', alt: 'Copa de vino rosado sirviéndose sobre fondo oscuro' },
  ],
  sections: [
    {
      id: 'distincion-entrantes',
      kind: 'shared',
      title: 'Entrantes',
      hint: 'Para compartir en el centro de la mesa',
      pending: false,
      items: [
        { id: 'distincion-jamon', name: 'Jamón ibérico de cebo', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'distincion-gambones', name: 'Gambones', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'distincion-quesos', name: 'Selección de quesos', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'distincion-canelon', name: 'Canelón de pato y foie', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'distincion-alcachofa', name: 'Alcachofa confitada', detail: '', quantity: '', quantityPending: false, note: '' },
      ],
    },
    {
      id: 'distincion-principal',
      kind: 'choice',
      title: 'Principal',
      hint: 'A elegir un plato por comensal',
      pending: false,
      items: [
        { id: 'distincion-entrecot', name: 'Entrecot', detail: '', quantity: '', quantityPending: false, note: '' },
        { id: 'distincion-rodaballo', name: 'Rodaballo al horno', detail: '', quantity: '', quantityPending: false, note: '' },
      ],
    },
    { id: 'distincion-postre', kind: 'dessert', title: 'Postre', hint: '', pending: true, items: [] },
    { id: 'distincion-bebida', kind: 'drink', title: 'Bebida', hint: '', pending: true, items: [] },
  ],
  conditions: [],
  cta: { label: 'Reservar mesa', helper: '' },
  theme: 'noir',
  adminNotes:
    'Pendiente: confirmar el precio final, el postre y la bebida. Mientras las secciones de postre y bebida estén marcadas como pendientes no aparecerán en la web.',
};

const DAYS = [0, 1, 2, 3, 4, 5, 6];

export function createSeedContent(): SiteContent {
  return {
    schemaVersion: 1,
    campaign: {
      name: 'Navidad',
      year: 2026,
      active: true,
      inactiveTitle: 'Nuestra campaña de Navidad volverá pronto',
      inactiveMessage:
        'Ahora mismo no hay menús de Navidad disponibles. Si quieres reservar o hacernos una consulta, llámanos y te atenderemos encantados.',
      announcement: { enabled: false, text: '' },
      introEnabled: true,
      theme: { ...DEFAULT_THEME },
      logo: null,
      favicon: null,
    },
    seo: {
      title: 'Menús de Navidad 2026 · GastroBar Torero',
      description:
        'Descubre los menús de Navidad de GastroBar Torero en Fuenlabrada de los Montes (Badajoz). Comidas y cenas con entrantes para compartir. Reserva tu mesa online.',
      siteName: 'GastroBar Torero',
      ogImage: null,
    },
    booking: {
      url: DEFAULT_BOOKING_URL,
      notice: {
        enabled: true,
        text: 'Cuando hagas tu reserva, recuerda indicarnos qué menú habéis elegido. Si tienes cualquier duda, llámanos al {telefono}.',
      },
    },
    texts: {
      nav: {
        story: 'La Navidad',
        menus: 'Menús',
        compare: 'Comparar',
        howTo: 'Reservar',
        faq: 'Preguntas',
        contact: 'Contacto',
        book: 'Reservar mesa',
      },
      intro: { line: 'Navidad {año}', skip: 'Saltar intro' },
      hero: {
        eyebrow: 'Menús de Navidad {año} · Fuenlabrada de los Montes',
        titleLead: 'Esta Navidad,',
        titleMain: 'cada encuentro',
        titleAccent: 'merece algo especial',
        subtitle:
          'Dos menús pensados para compartir, brindar y alargar la sobremesa. Comidas y cenas de Navidad en GastroBar Torero.',
        primaryCta: 'Descubrir los menús',
        secondaryCta: 'Reservar mesa',
        scrollHint: 'Desliza',
        sideNote: 'Comidas y cenas de Navidad',
        image: { asset: 'hero-ornament', alt: 'Bola roja y luces cálidas en un árbol de Navidad' },
      },
      story: {
        eyebrow: 'La Navidad se comparte',
        title: 'Las mejores mesas se recuerdan por quién se sentó en ellas',
        lead:
          'Hay comidas que se alargan hasta la tarde y cenas que terminan con la última copa. Encuentros que esperamos todo el año.',
        body: [
          'La familia que por fin coincide. Los amigos de siempre. El equipo que se merece una celebración. Esta Navidad queremos que solo tengáis que preocuparos de llegar, sentaros y disfrutar.',
          'Por eso hemos preparado dos menús con entrantes para compartir en el centro de la mesa, como se come entre los nuestros, y un plato principal que cada comensal elige a su gusto.',
        ],
        quote: 'Brindar, compartir y volver a brindar.',
        images: [
          { asset: 'toast-red', alt: 'Amigos brindando con copas de vino tinto' },
          { asset: 'pine-branch', alt: 'Rama de abeto con adornos y bayas rojas sobre madera' },
        ],
      },
      menus: {
        eyebrow: 'Nuestros menús de Navidad',
        title: 'Elige cómo quieres celebrarlo',
        intro:
          'Entrantes al centro para compartir y un principal a elegir por cada comensal. Disponibles para comidas y cenas.',
        choiceJoiner: 'o',
        illustrativeNote: 'Imágenes ilustrativas',
        emptyMessage: 'Muy pronto publicaremos nuestros menús de Navidad. Mientras tanto, puedes llamarnos para cualquier consulta.',
      },
      compare: {
        enabled: true,
        eyebrow: 'Comparativa',
        title: 'Los menús, frente a frente',
        intro: 'Todo lo que incluye cada menú, de un vistazo, para que elegir sea fácil.',
        pendingLabel: 'Consúltanos',
        commonLabel: 'En ambos menús',
        priceLabel: 'Precio',
      },
      celebration: {
        eyebrow: 'Una celebración a tu medida',
        title: 'A mediodía o por la noche, la mesa es vuestra',
        body:
          'Una comida con la familia, la cena con los compañeros o el reencuentro con los amigos de siempre. Elige el menú y el momento, y nosotros nos encargamos de que la mesa esté a la altura.',
        moments: ['Comidas', 'Cenas', 'Familia', 'Amigos', 'Compañeros'],
        images: [
          { asset: 'long-table', alt: 'Mesa larga preparada con copas y cubiertos' },
          { asset: 'friends-toast', alt: 'Grupo de amigos brindando con vino alrededor de una mesa' },
          { asset: 'gold-ornament', alt: 'Adorno navideño granate con dibujo dorado entre luces desenfocadas' },
        ],
        cta: 'Reservar mesa',
      },
      howTo: {
        eyebrow: 'Cómo reservar',
        title: 'Tu mesa, en tres pasos',
        intro: 'La reserva se hace en nuestra plataforma online, en unos minutos.',
        steps: [
          { id: 'paso-elige', title: 'Elige tu menú', text: 'Compara los menús y decide con los tuyos cuál os apetece más.' },
          {
            id: 'paso-reserva',
            title: 'Reserva online',
            text: 'Pulsa «Reservar mesa» y elige el día, la hora y el número de comensales en nuestra plataforma de reservas.',
          },
          {
            id: 'paso-indica',
            title: 'Cuéntanos qué menú',
            text: 'Indícanos el menú elegido. Si tienes cualquier duda, llámanos y te ayudamos.',
          },
        ],
        cta: 'Reservar mesa ahora',
      },
      faq: {
        eyebrow: 'Preguntas frecuentes',
        title: 'Todo lo que necesitas saber',
        intro: '¿No encuentras lo que buscas? Llámanos al {telefono} y te ayudamos.',
        items: [
          {
            id: 'faq-comidas-cenas',
            question: '¿Los menús de Navidad son para comidas o para cenas?',
            answer:
              'Para ambas. Puedes disfrutar de nuestros menús de Navidad tanto en comidas como en cenas. Consulta la disponibilidad de fechas y horas en la plataforma de reservas.',
          },
          {
            id: 'faq-como-reservar',
            question: '¿Cómo puedo reservar?',
            answer:
              'Pulsa cualquier botón «Reservar mesa» de esta página: te llevará a nuestra plataforma de reservas, donde podrás elegir día, hora y número de comensales. También puedes llamarnos al {telefono}.',
          },
          {
            id: 'faq-indicar-menu',
            question: '¿Cómo os digo qué menú hemos elegido?',
            answer:
              'Recuerda indicarnos el menú elegido al hacer tu reserva. Si no sabes cómo hacerlo o prefieres confirmarlo, llámanos al {telefono} y lo dejamos anotado.',
          },
          {
            id: 'faq-compartir',
            question: '¿Cómo se sirven los entrantes y el principal?',
            answer:
              'Los entrantes se sirven en el centro de la mesa para compartir entre todos los comensales. El plato principal es individual: cada comensal elige uno de los platos disponibles en su menú.',
          },
          {
            id: 'faq-alergenos',
            question: 'Tengo alergias o intolerancias alimentarias, ¿qué hago?',
            answer:
              'Indícanoslo antes de tu visita, llamándonos al {telefono}, y coméntalo también al llegar. Te informaremos de los alérgenos presentes en cada plato para que puedas elegir con tranquilidad.',
          },
          {
            id: 'faq-mas-informacion',
            question: '¿Dónde puedo ver qué incluye cada menú?',
            answer:
              'En la sección de menús y en la comparativa de esta página tienes el detalle de cada uno. Si necesitas cualquier aclaración, llámanos y te lo contamos.',
          },
          {
            id: 'faq-contacto',
            question: '¿Cómo puedo contactar con vosotros?',
            answer: 'Puedes llamarnos al {telefono} o visitarnos en {direccion}.',
          },
        ],
      },
      about: {
        eyebrow: 'Sobre nosotros',
        title: 'GastroBar Torero',
        body:
          'En Fuenlabrada de los Montes, GastroBar Torero es un lugar para reunirse alrededor de la buena mesa, sin prisas y con el trato cercano de siempre. Esta Navidad hemos preparado nuestros menús para que lo celebres con los tuyos.',
        image: { asset: 'bar-lights', alt: 'Barra de bar iluminada con luz cálida' },
      },
      footer: {
        closing: 'Os esperamos para brindar juntos esta Navidad.',
        legal: '',
      },
      mobileBar: { label: 'Menús de Navidad desde', cta: 'Reservar' },
    },
    business: {
      name: 'GastroBar Torero',
      description: 'Gastrobar en Fuenlabrada de los Montes (Badajoz).',
      address: {
        street: 'C. Glorieta del Tejar, 32',
        postalCode: '06660',
        locality: 'Fuenlabrada de los Montes',
        region: 'Badajoz',
        country: 'España',
      },
      phone: '+34 617 55 04 11',
      email: '',
      mapsUrl: '',
      social: { instagram: '', facebook: '', tiktok: '', whatsapp: '', google: '', tripadvisor: '' },
      contactMessage: 'Para cualquier consulta sobre los menús o tu reserva, llámanos.',
      verified: { address: false, phone: false },
      hours: {
        verified: false,
        weekly: DAYS.map((day) =>
          day >= 4
            ? { day, closed: false, ranges: [{ open: '12:00', close: '02:30' }] }
            : { day, closed: false, ranges: [] },
        ),
        specials: [],
        note: '',
        unverifiedMessage: 'Consulta nuestro horario de Navidad llamándonos al {telefono}.',
      },
    },
    menus: [menuEsencia, menuDistincion],
  };
}
