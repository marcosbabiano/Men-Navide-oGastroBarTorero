/**
 * Datos confirmados de los menús de Navidad 2026 (actualización de noviembre).
 * Los usa el contenido inicial y el parche controlado que actualiza contenidos ya guardados.
 */
import type { Menu, MenuItem, MenuSection } from './schema.ts';

const item = (id: string, name: string, detail = ''): MenuItem => ({ id, name, detail, quantity: '', quantityPending: false, note: '' });

export const PATCH_MENUS_2026_11 = 'menus-2026-11-gourmet-postres';

export const DISTINCION_DESSERT: Pick<MenuSection, 'title' | 'hint' | 'items'> = {
  title: 'Para terminar',
  hint: '',
  items: [item('distincion-postre-incluido', 'Postre')],
};

export const DISTINCION_DRINK: Pick<MenuSection, 'title' | 'hint' | 'items'> = {
  title: 'Bebida',
  hint: '',
  items: [item('distincion-bebida-incluida', 'Bebida incluida')],
};

/** Menú Selección Gourmet: en borrador y sin precio hasta que se configure en /admin. */
export function gourmetMenu(order: number): Menu {
  return {
    id: 'menu-seleccion-gourmet',
    status: 'draft',
    order,
    name: 'Menú Selección Gourmet',
    originalName: 'Gourmet',
    subtitle: '',
    description: '',
    tag: '',
    price: { amount: null, unit: 'por persona', confirmed: false, note: '' },
    image: null,
    gallery: [],
    sections: [
      {
        id: 'gourmet-entrantes',
        kind: 'shared',
        title: 'Para empezar',
        hint: 'Entrantes al centro de la mesa',
        pending: false,
        choose: 1,
        items: [
          item('gourmet-iberico-queso', 'Surtido de Jamón Ibérico y Queso Curado', 'Con tostas de pan de cristal.'),
          item('gourmet-croquetas', 'Surtido de Croquetas Caseras de la Casa', 'Crujientes por fuera y melosas por dentro.'),
          item('gourmet-canelon', 'Canelón de Carrillera', 'Sabor intenso, gratinado al momento con su bechamel trufada.'),
        ],
      },
      {
        id: 'gourmet-primero',
        kind: 'choice',
        title: 'Primer plato',
        hint: 'A elegir una opción por comensal',
        pending: false,
        choose: 1,
        items: [
          item('gourmet-alcachofas', 'Alcachofas Confitadas', 'Tiernas flores de alcachofa confitadas a baja temperatura.'),
          item('gourmet-mariscada', 'Mariscada Cocida Especial', 'Selección de marisco cocido en su punto de sal.'),
        ],
      },
      {
        id: 'gourmet-segundo',
        kind: 'choice',
        title: 'Segundo plato',
        hint: 'A elegir una opción por comensal',
        pending: false,
        choose: 1,
        items: [
          item('gourmet-rodaballo', 'Lomo de Rodaballo al Horno', 'Sobre cama de verduras confitadas y suave bilbaína.'),
          item('gourmet-magret', 'Magret de Pato', 'Fileteado y acompañado de una reducción de frutos rojos o salsa de naranja de temporada.'),
          item('gourmet-entrecot', 'Entrecot'),
        ],
      },
      {
        id: 'gourmet-postre',
        kind: 'dessert',
        title: 'Para terminar',
        hint: '',
        pending: false,
        choose: 1,
        items: [item('gourmet-postre-casa', 'Postre Navideño de la Casa'), item('gourmet-cafe-dulces', 'Café y Dulces Tradicionales')],
      },
      {
        id: 'gourmet-bebida',
        kind: 'drink',
        title: 'Bebida',
        hint: '',
        pending: false,
        choose: 1,
        items: [item('gourmet-bebida-incluida', 'Bebida incluida')],
      },
    ],
    conditions: [],
    cta: { label: 'Reservar mesa', helper: '' },
    theme: 'gourmet',
    adminNotes: 'Pendiente: configurar el precio. Se mantiene en borrador hasta entonces (la web no lo muestra).',
  };
}
