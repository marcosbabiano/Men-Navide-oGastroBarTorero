/**
 * Revisión de contenido pendiente y bloqueos de publicación.
 * Se usa en el dashboard («Información pendiente»), en el editor de menús y en el servidor
 * antes de publicar (los bloqueos impiden publicar).
 */
import type { Menu, SiteContent } from './schema.ts';
import { collectImageRefs, visibleMenus } from './public.ts';

export type IssueLevel = 'blocker' | 'warning' | 'info';

export interface ContentIssue {
  level: IssueLevel;
  area: 'menus' | 'establecimiento' | 'campana' | 'textos' | 'multimedia';
  menuId?: string;
  message: string;
}

const KIND_LABEL: Record<string, string> = {
  shared: 'entrantes',
  choice: 'principales',
  dessert: 'postre',
  drink: 'bebida',
  extra: 'sección adicional',
};

export function menuIssues(menu: Menu): ContentIssue[] {
  const out: ContentIssue[] = [];
  const name = menu.name.trim() || 'Menú sin nombre';
  const willShow = menu.status === 'published';
  const blockerIfShown: ContentIssue['level'] = willShow ? 'blocker' : 'warning';

  if (!menu.name.trim()) out.push({ level: blockerIfShown, area: 'menus', menuId: menu.id, message: 'El menú no tiene nombre comercial.' });
  if (menu.price.amount === null)
    out.push({ level: blockerIfShown, area: 'menus', menuId: menu.id, message: `${name}: falta el precio.` });
  else if (!menu.price.confirmed)
    out.push({ level: 'warning', area: 'menus', menuId: menu.id, message: `${name}: precio pendiente de confirmación.` });

  const visibleSections = menu.sections.filter((s) => !s.pending && s.items.some((i) => i.name.trim()));
  if (!visibleSections.length)
    out.push({ level: blockerIfShown, area: 'menus', menuId: menu.id, message: `${name}: no tiene ningún plato visible.` });

  for (const s of menu.sections) {
    const label = s.title.trim() || KIND_LABEL[s.kind];
    if (s.pending)
      out.push({ level: 'warning', area: 'menus', menuId: menu.id, message: `${name}: ${label.toLowerCase()} pendiente de completar (no se muestra).` });
    else if (!s.items.some((i) => i.name.trim()))
      out.push({ level: 'info', area: 'menus', menuId: menu.id, message: `${name}: la sección «${label}» está vacía y no se mostrará.` });
    if (!s.pending && s.kind === 'choice' && s.items.filter((i) => i.name.trim()).length === 1)
      out.push({ level: 'warning', area: 'menus', menuId: menu.id, message: `${name}: la sección «${label}» es «a elegir» pero solo tiene un plato.` });
    for (const i of s.items) {
      if (i.quantityPending)
        out.push({ level: 'warning', area: 'menus', menuId: menu.id, message: `${name}: confirmar la cantidad de «${i.name || 'plato sin nombre'}».` });
      if (!i.name.trim() && !s.pending)
        out.push({ level: 'info', area: 'menus', menuId: menu.id, message: `${name}: hay un plato sin nombre en «${label}» (se ignora).` });
    }
  }
  if (!menu.image) out.push({ level: 'info', area: 'menus', menuId: menu.id, message: `${name}: sin imagen principal (se usará un fondo decorativo).` });
  if (menu.status === 'draft') out.push({ level: 'info', area: 'menus', menuId: menu.id, message: `${name}: en borrador (no aparece en la web).` });
  return out;
}

export function contentIssues(content: SiteContent, knownAssetIds?: Set<string>): ContentIssue[] {
  const out: ContentIssue[] = [];
  for (const m of [...content.menus].sort((a, b) => a.order - b.order)) out.push(...menuIssues(m));

  if (!visibleMenus(content.menus).length)
    out.push({ level: 'warning', area: 'menus', message: 'No hay ningún menú publicado: la web mostrará un mensaje de «próximamente».' });

  const ids = new Set<string>();
  for (const m of content.menus) {
    if (ids.has(m.id)) out.push({ level: 'blocker', area: 'menus', message: `Hay dos menús con el mismo identificador (${m.id}).` });
    ids.add(m.id);
  }

  const b = content.business;
  if (!b.hours.verified)
    out.push({ level: 'warning', area: 'establecimiento', message: 'Horario sin verificar: no se muestra en la web.' });
  if (!b.verified.address)
    out.push({ level: 'warning', area: 'establecimiento', message: 'Dirección pendiente de verificar.' });
  if (!b.verified.phone) out.push({ level: 'warning', area: 'establecimiento', message: 'Teléfono pendiente de verificar.' });
  if (!b.phone.trim()) out.push({ level: 'warning', area: 'establecimiento', message: 'Falta el teléfono de contacto.' });
  if (!Object.values(b.social).some(Boolean))
    out.push({ level: 'info', area: 'establecimiento', message: 'No hay redes sociales configuradas (permanecen ocultas).' });
  if (!content.texts.footer.legal.trim())
    out.push({ level: 'info', area: 'textos', message: 'Texto legal del pie (titular, NIF…) sin completar.' });

  if (!content.campaign.active) out.push({ level: 'info', area: 'campana', message: 'La campaña está desactivada: la web muestra el mensaje de campaña inactiva.' });

  if (knownAssetIds) {
    for (const ref of collectImageRefs(content)) {
      if (!knownAssetIds.has(ref.asset))
        out.push({ level: 'blocker', area: 'multimedia', message: `Una imagen seleccionada ya no existe (${ref.asset}). Elige otra.` });
      else if (!ref.alt.trim())
        out.push({ level: 'warning', area: 'multimedia', message: `Falta el texto alternativo de una imagen (${ref.asset}).` });
    }
  }
  return out;
}

export function publishBlockers(content: SiteContent, knownAssetIds?: Set<string>): ContentIssue[] {
  return contentIssues(content, knownAssetIds).filter((i) => i.level === 'blocker');
}
