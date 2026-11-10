/**
 * /reservar — Elección anticipada de menús de Navidad (antes de reservar mesa en Qamarero).
 * /reservar/modificar/<token> — Modificación con enlace privado de un solo uso.
 * /reservar/completar/<token> — Elección de menús para una reserva ya hecha en Qamarero.
 *
 * Una selección de menús NO es una reserva: la mesa se reserva después en la plataforma oficial.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicPayload } from '../../shared/public.ts';
import type { Menu } from '../../shared/schema.ts';
import {
  adultMenus,
  applyAdultMenu,
  childMenus,
  defaultReservasConfig,
  type DinerInput,
  estimate,
  type ReservasConfig,
  type SelectionInput,
  selectionProblems,
  SERVICE_LABEL,
  syncDiners,
  choiceSections,
} from '../../shared/reservas.ts';
import { themeToCssVars } from '../../shared/theme.ts';
import { Counter, DinerCard, MenuCard, pendingSections, priceText, Summary } from './parts.tsx';

type FormConfig = Pick<ReservasConfig, 'formEnabled' | 'menuIds' | 'childMenuIds' | 'childCarta' | 'maxGuests' | 'requireEmail' | 'messages'> & { deadline: string; contactPhone: string };
type Mode = { kind: 'new' } | { kind: 'link'; token: string; linkKind: 'modify' | 'complete' };
type StepId = 'datos' | 'menu' | 'ninos' | 'platos' | 'notas' | 'revision';
const STEP_LABEL: Record<StepId, string> = { datos: 'Datos', menu: 'Menú', ninos: 'Niños', platos: 'Platos', notas: 'Notas', revision: 'Revisión' };
const DRAFT_KEY = 'torero-reserva-borrador-v1';

function routeMode(): Mode {
  const m = /^\/reservar\/(modificar|completar)\/([\w-]{30,100})\/?$/.exec(location.pathname);
  return m ? { kind: 'link', token: m[2], linkKind: m[1] === 'completar' ? 'complete' : 'modify' } : { kind: 'new' };
}

const emptySelection = (): SelectionInput => ({
  holder: { name: '', phone: '', email: '' },
  service: 'lunch',
  adults: 2,
  children: 0,
  adultMenuId: null,
  diners: syncDiners([], 2, 0, null),
  notes: { general: '', allergies: '', special: '' },
});

function readDraft(): SelectionInput | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SelectionInput) : null;
  } catch {
    return null;
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { error?: { message: string; details?: unknown } } }> {
  try {
    const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message: string } };
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: { message: 'Sin conexión. Comprueba tu conexión a internet e inténtalo de nuevo.' } } as T & { error: { message: string } } };
  }
}

export function ReservarApp() {
  const [mode] = useState(routeMode);
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [fc, setFc] = useState<FormConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [link, setLink] = useState<{ state: string; kind: string; booking: { ref: string; holder?: SelectionInput['holder']; date?: string; time?: string; people?: number | null; service?: string; selection?: SelectionInput | null } } | null>(null);
  const [s, setS] = useState<SelectionInput>(() => (mode.kind === 'new' ? (readDraft() ?? emptySelection()) : emptySelection()));
  const [original, setOriginal] = useState<SelectionInput | null>(null);
  const [step, setStep] = useState<StepId>('datos');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ ref?: string; bookingUrl?: string; title?: string; text?: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [c, f] = await Promise.all([api<PublicPayload>('/api/content'), api<FormConfig>('/api/reservas/form-config')]);
      if (!c.ok || !f.ok) return setLoadError('No se ha podido cargar el formulario. Inténtalo de nuevo en unos minutos.');
      setPayload(c.body);
      setFc(f.body);
      if (mode.kind === 'link') {
        const l = await api<NonNullable<typeof link>>(`/api/reservas/link/${mode.token}`);
        if (!l.ok) return setLoadError(l.body.error?.message ?? 'Este enlace no es válido.');
        setLink(l.body);
        if (l.body.state === 'active') {
          const sel = l.body.booking.selection;
          if (sel) {
            setS(sel);
            setOriginal(sel);
          } else {
            const base = emptySelection();
            setS({ ...base, holder: l.body.booking.holder ?? base.holder, service: (l.body.booking.service as SelectionInput['service']) ?? 'lunch', adults: l.body.booking.people ?? 2, diners: syncDiners([], l.body.booking.people ?? 2, 0, null) });
          }
        }
      }
    })();
  }, [mode]);

  // Borrador local (solo en este navegador) para no perder lo escrito al recargar.
  useEffect(() => {
    if (mode.kind !== 'new' || done) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
    } catch {
      /* sin almacenamiento */
    }
  }, [s, mode, done]);

  useEffect(() => {
    if (payload) for (const [k, v] of Object.entries(themeToCssVars(payload.content.campaign.theme))) document.documentElement.style.setProperty(k, v);
  }, [payload]);

  const cfg: ReservasConfig = useMemo(() => ({ ...defaultReservasConfig(), ...(fc ?? {}), requireEmail: mode.kind === 'new' ? (fc?.requireEmail ?? true) : false }), [fc, mode]);
  const content = payload?.content;
  const aMenus = useMemo(() => (content ? adultMenus(content, cfg) : []), [content, cfg]);
  const cMenus = useMemo(() => (content ? childMenus(content, cfg) : []), [content, cfg]);
  const allMenus: Menu[] = useMemo(() => (content ? content.menus.filter((m) => m.status === 'published') : []), [content]);
  const problems = useMemo(() => (content ? selectionProblems(s, content, cfg, { skipHolder: mode.kind === 'link' }) : []), [s, content, cfg, mode]);
  const est = useMemo(() => (content ? estimate(s, content) : { amount: 0, unknown: 0 }), [s, content]);

  const steps: StepId[] = useMemo(() => {
    const out: StepId[] = ['datos'];
    if (s.adults > 0) out.push('menu');
    if (s.children > 0) out.push('ninos');
    out.push('platos', 'notas', 'revision');
    return out;
  }, [s.adults, s.children]);
  const idx = Math.max(0, steps.indexOf(step));

  const go = (to: StepId) => {
    setStep(to);
    setShowErrors(false);
    setError('');
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const setCounts = (adults: number, children: number) => {
    const removed = s.diners.filter((d) => (d.kind === 'adult' && Number(d.id.slice(1)) > adults) || (d.kind === 'child' && Number(d.id.slice(1)) > children));
    const withData = removed.filter((d) => Object.keys(d.choices).length || d.name || d.note || d.allergy || d.mode === 'menu' && d.kind === 'child');
    if (withData.length && !window.confirm(`Se eliminarán ${withData.length} comensal(es) con elecciones ya hechas (${withData.map((d) => d.name || (d.kind === 'adult' ? `Adulto ${d.id.slice(1)}` : `Niño ${d.id.slice(1)}`)).join(', ')}). ¿Continuar?`)) return;
    setS((cur) => ({ ...cur, adults, children, adultMenuId: adults ? cur.adultMenuId : null, diners: syncDiners(cur.diners, adults, children, cur.adultMenuId) }));
  };

  const setDiner = (d: DinerInput) => setS((cur) => ({ ...cur, diners: cur.diners.map((x) => (x.id === d.id ? d : x)) }));

  const stepProblems = (id: StepId): string[] => {
    if (id === 'datos') return problems.filter((p) => !p.dinerId && /titular|teléfono|correo|comensal|grupos/.test(p.message)).map((p) => p.message);
    if (id === 'menu') return problems.filter((p) => /menú común|adultos ya no/.test(p.message)).map((p) => p.message);
    if (id === 'ninos') return s.diners.filter((d) => d.kind === 'child' && d.mode === 'menu' && !d.menuId).map((d) => `${d.name || `Niño ${d.id.slice(1)}`}: elige un menú o la carta habitual.`);
    if (id === 'platos') return problems.filter((p) => p.dinerId).map((p) => p.message);
    return problems.map((p) => p.message);
  };

  const next = () => {
    const errs = stepProblems(step);
    if (errs.length) {
      setShowErrors(true);
      if (step === 'platos') {
        const first = problems.find((p) => p.dinerId);
        if (first?.dinerId) {
          setOpen(first.dinerId);
          requestAnimationFrame(() => document.getElementById(`diner-${first.dinerId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }
      }
      return;
    }
    if (step === 'platos') setOpen(null);
    go(steps[idx + 1]);
  };

  const submit = async () => {
    if (problems.length) return setShowErrors(true);
    if (mode.kind === 'new' && !consent) return setError('Para continuar, acepta el tratamiento de los datos.');
    setBusy(true);
    setError('');
    const r =
      mode.kind === 'new'
        ? await api<{ ref: string; bookingUrl: string }>('/api/reservas/preselect', { method: 'POST', body: JSON.stringify({ selection: s, consent, website: honeypot.current?.value ?? '' }) })
        : await api<{ title: string; text: string }>(`/api/reservas/link/${mode.token}`, { method: 'POST', body: JSON.stringify({ selection: s }) });
    setBusy(false);
    if (!r.ok) return setError(r.body.error?.message ?? 'No se ha podido guardar. Inténtalo de nuevo.');
    if (mode.kind === 'new') {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* nada */
      }
    }
    setDone(r.body as { ref?: string; bookingUrl?: string; title?: string; text?: string });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  /* ---------------- estados especiales ---------------- */
  const brand = content?.business.name ?? 'GastroBar Torero';
  const phone = fc?.contactPhone || (content?.business.verified.phone ? content.business.phone : '');
  if (loadError)
    return (
      <Shell brand={brand}>
        <section className="rs-card rs-center">
          <h1 className="rs-h1">No disponible</h1>
          <p>{loadError}</p>
          {phone && (
            <a className="rs-btn rs-btn--ghost" href={`tel:${phone.replace(/\s/g, '')}`}>
              Llamar al restaurante
            </a>
          )}
        </section>
      </Shell>
    );
  if (!payload || !fc || (mode.kind === 'link' && !link))
    return (
      <Shell brand={brand}>
        <p className="rs-loading" aria-busy="true">
          Cargando…
        </p>
      </Shell>
    );
  if (mode.kind === 'new' && !fc.formEnabled)
    return (
      <Shell brand={brand}>
        <section className="rs-card rs-center">
          <h1 className="rs-h1">Reserva tu mesa</h1>
          <p>Ahora mismo la elección anticipada de menús no está disponible.</p>
          <a className="rs-btn rs-btn--gold" href={content!.booking.url}>
            Ir a la plataforma de reservas
          </a>
        </section>
      </Shell>
    );
  if (mode.kind === 'link' && link && link.state !== 'active')
    return (
      <Shell brand={brand}>
        <LinkClosed state={link.state} token={mode.token} phone={phone} />
      </Shell>
    );
  if (!aMenus.length && mode.kind === 'new')
    return (
      <Shell brand={brand}>
        <section className="rs-card rs-center">
          <h1 className="rs-h1">Menús próximamente</h1>
          <p>Todavía no hay menús de Navidad publicados.</p>
        </section>
      </Shell>
    );

  if (done) {
    if (mode.kind === 'new')
      return (
        <Shell brand={brand}>
          <section className="rs-card rs-done" aria-live="polite">
            <p className="rs-eyebrow">Paso final · Reserva de la mesa</p>
            <h1 className="rs-h1">{fc.messages.continueTitle}</h1>
            <div className="rs-ref">
              <span>Vuestra referencia</span>
              <strong data-testid="ref">{done.ref}</strong>
              <button
                type="button"
                className="rs-link"
                onClick={() => {
                  void navigator.clipboard?.writeText(done.ref ?? '');
                }}
              >
                Copiar
              </button>
            </div>
            <p>{fc.messages.continueText}</p>
            <p className="rs-note">
              Si la plataforma de reservas te ofrece un campo de <strong>observaciones o comentarios</strong>, pega allí la referencia <strong>{done.ref}</strong>: nos ayuda a relacionar vuestra reserva con la elección de menús. Indica también el número total de comensales: <strong>{s.adults + s.children}</strong>.
            </p>
            <a className="rs-btn rs-btn--gold rs-btn--big" href={done.bookingUrl ?? content!.booking.url} data-testid="continuar">
              CONTINUAR A QAMARERO
            </a>
            <p className="rs-hint">Vuestra mesa todavía no está reservada: la reserva solo es válida cuando la confirme la plataforma de reservas.</p>
          </section>
        </Shell>
      );
    return (
      <Shell brand={brand}>
        <section className="rs-card rs-done rs-center" aria-live="polite">
          <p className="rs-eyebrow">Elección guardada</p>
          <h1 className="rs-h1">{done.title}</h1>
          <p>{done.text}</p>
          {link?.kind === 'modify' && original && original.adults + original.children !== s.adults + s.children && (
            <p className="rs-note rs-note--warn">Has cambiado el número de comensales. Este cambio aún no modifica vuestra reserva de mesa: el restaurante comprobará la disponibilidad y os confirmará.</p>
          )}
        </section>
      </Shell>
    );
  }

  /* ---------------- formulario ---------------- */
  const isLink = mode.kind === 'link';
  const errs = showErrors ? stepProblems(step) : [];
  const adultsDone = s.diners.filter((d) => pendingSections(d, allMenus).length === 0).length;
  const adultMenu = aMenus.find((m) => m.id === s.adultMenuId);

  return (
    <Shell brand={brand}>
      <div ref={top} className="rs-top" />
      <header className="rs-intro">
        <p className="rs-eyebrow">{isLink ? (link?.kind === 'complete' ? 'Elección de menús · reserva ya realizada' : 'Modificar la elección de menús') : 'Menús de Navidad'}</p>
        <h1 className="rs-h1">{isLink ? (link?.kind === 'complete' ? 'Elegid vuestros menús' : 'Revisad y modificad vuestra elección') : 'Elegid vuestros menús de Navidad'}</h1>
        <p className="rs-lead">
          {isLink
            ? link?.booking.date
              ? `Reserva de ${link.booking.holder?.name ?? ''}${link.booking.date ? ` · ${new Date(`${link.booking.date}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}` : ''}${link.booking.time ? ` · ${link.booking.time} h` : ''}`
              : `Referencia ${link?.booking.ref}`
            : fc.messages.intro}
        </p>
        {!isLink && <p className="rs-badge">Todavía no estás reservando mesa: primero elegís los menús y después reserváis en la plataforma oficial.</p>}
      </header>


      <section className="rs-card rs-step" key={step} aria-labelledby="rs-step-title">
        <nav className="rs-progress" aria-label="Progreso">
          <ol>
            {steps.map((st, i) => (
              <li key={st} className={i < idx ? 'is-done' : i === idx ? 'is-current' : ''} aria-current={i === idx ? 'step' : undefined}>
                <span className="rs-progress__n">{i < idx ? '✓' : i + 1}</span>
                <span className="rs-progress__l">{STEP_LABEL[st]}</span>
              </li>
            ))}
          </ol>
          <div className="rs-progress__bar" aria-hidden="true">
            <span style={{ width: `${(idx / (steps.length - 1)) * 100}%` }} />
          </div>
        </nav>
        {step === 'datos' && (
          <>
            <h2 className="rs-h2" id="rs-step-title">
              {isLink ? 'Comensales y servicio' : 'Vuestros datos'}
            </h2>
            {!isLink ? (
              <div className="rs-grid2">
                <Field label="Nombre y apellidos del titular" value={s.holder.name} autoComplete="name" onChange={(v) => setS({ ...s, holder: { ...s.holder, name: v } })} max={100} />
                <Field label="Teléfono de contacto" value={s.holder.phone} type="tel" autoComplete="tel" inputMode="tel" onChange={(v) => setS({ ...s, holder: { ...s.holder, phone: v } })} max={30} />
                <Field label={`Correo electrónico${fc.requireEmail ? '' : ' (opcional)'}`} value={s.holder.email} type="email" autoComplete="email" onChange={(v) => setS({ ...s, holder: { ...s.holder, email: v.trim() } })} max={120} />
              </div>
            ) : (
              <p className="rs-hint">Titular: {s.holder.name}. Si necesitáis cambiar el titular o el teléfono, contactad con el restaurante.</p>
            )}
            <fieldset className="rs-seg">
              <legend className="rs-label">Tipo de servicio</legend>
              {(['lunch', 'dinner'] as const).map((v) => (
                <label key={v} className={s.service === v ? 'is-on' : ''}>
                  <input type="radio" name="service" checked={s.service === v} onChange={() => setS({ ...s, service: v })} />
                  {SERVICE_LABEL[v]}
                </label>
              ))}
            </fieldset>
            <div className="rs-grid2">
              <Counter label="Adultos" value={s.adults} min={0} max={cfg.maxGuests} onChange={(v) => setCounts(v, s.children)} />
              <Counter label="Niños" value={s.children} min={0} max={cfg.maxGuests} onChange={(v) => setCounts(s.adults, v)} />
            </div>
            <p className="rs-total">
              Total: <strong>{s.adults + s.children}</strong> {s.adults + s.children === 1 ? 'persona' : 'personas'}
            </p>
            {isLink && original && original.adults + original.children !== s.adults + s.children && (
              <p className="rs-note rs-note--warn">Cambiar aquí el número de comensales no cambia vuestra reserva de mesa: el restaurante tendrá que comprobar la disponibilidad y confirmarlo.</p>
            )}
            {!isLink && <p className="rs-hint">La fecha, la hora y la zona de la mesa se eligen después, en la plataforma de reservas.</p>}
          </>
        )}

        {step === 'menu' && (
          <>
            <h2 className="rs-h2" id="rs-step-title">
              Menú de los adultos
            </h2>
            <p className="rs-hint">Todos los adultos de la reserva comparten el mismo menú. Cada persona elegirá después sus platos.</p>
            <div className="rs-menus" role="radiogroup" aria-label="Menú de los adultos">
              {aMenus.map((m) => (
                <MenuCard
                  key={m.id}
                  menu={m}
                  name="adult-menu"
                  selected={s.adultMenuId === m.id}
                  onSelect={() => {
                    const hadChoices = s.diners.some((d) => d.kind === 'adult' && d.menuId && d.menuId !== m.id && Object.keys(d.choices).length);
                    if (hadChoices && !window.confirm('Al cambiar el menú, los platos ya elegidos por los adultos quedarán pendientes de seleccionar. ¿Continuar?')) return;
                    setS({ ...s, adultMenuId: m.id, diners: applyAdultMenu(s.diners, m.id) });
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === 'ninos' && (
          <>
            <h2 className="rs-h2" id="rs-step-title">
              Niños
            </h2>
            <p className="rs-hint">Cada niño puede comer de nuestra carta habitual (elegirá en el restaurante) o tomar uno de los menús de Navidad, el mismo que los adultos u otro.</p>
            <div className="rs-kids">
              {s.diners
                .filter((d) => d.kind === 'child')
                .map((d) => (
                  <div className="rs-kid" key={d.id}>
                    <Field label={`Niño ${d.id.slice(1)} · nombre (opcional)`} value={d.name} onChange={(v) => setDiner({ ...d, name: v })} max={60} />
                    <div className="rs-kid__opts" role="radiogroup" aria-label={`Opción del niño ${d.id.slice(1)}`}>
                      {cfg.childCarta && (
                        <label className={`rs-option ${d.mode === 'carta' ? 'is-on' : ''}`}>
                          <input type="radio" name={`kid-${d.id}`} checked={d.mode === 'carta'} onChange={() => setDiner({ ...d, mode: 'carta', menuId: null, choices: {} })} />
                          <span>
                            Carta habitual
                            <small>Elección en el restaurante</small>
                          </span>
                        </label>
                      )}
                      {cMenus.map((m) => (
                        <label key={m.id} className={`rs-option ${d.mode === 'menu' && d.menuId === m.id ? 'is-on' : ''}`}>
                          <input type="radio" name={`kid-${d.id}`} checked={d.mode === 'menu' && d.menuId === m.id} onChange={() => setDiner({ ...d, mode: 'menu', menuId: m.id, choices: d.menuId === m.id ? d.choices : {} })} />
                          <span>
                            {m.name}
                            <small>{priceText(m)}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {step === 'platos' && (
          <>
            <h2 className="rs-h2" id="rs-step-title">
              Platos de cada comensal
            </h2>
            <p className="rs-progress-line" aria-live="polite">
              <strong>
                {adultsDone} de {s.diners.length}
              </strong>{' '}
              comensales completos
            </p>
            {adultMenu && s.adults > 1 && (
              <div className="rs-tools">
                <p className="rs-label">Aplicar a todos los adultos</p>
                {choiceSections(adultMenu).map((sec) => (
                  <div className="rs-tools__row" key={sec.id}>
                    <span>{sec.title}</span>
                    <div className="rs-chips">
                      {sec.choose === 1 &&
                        sec.items.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className="rs-chip"
                            onClick={() => setS({ ...s, diners: s.diners.map((d) => (d.kind === 'adult' ? { ...d, choices: { ...d.choices, [sec.id]: [it.id] } } : d)) })}
                          >
                            {it.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
                <p className="rs-hint">Después puedes cambiar cualquier plato de forma individual.</p>
              </div>
            )}
            {problems.some((p) => p.dinerId) && (
              <details className="rs-pending" open={showErrors}>
                <summary>Elecciones pendientes ({s.diners.length - adultsDone})</summary>
                <ul>
                  {s.diners
                    .filter((d) => pendingSections(d, allMenus).length)
                    .map((d) => (
                      <li key={d.id}>
                        <button type="button" className="rs-link" onClick={() => setOpen(d.id)}>
                          {d.name || (d.kind === 'adult' ? `Adulto ${d.id.slice(1)}` : `Niño ${d.id.slice(1)}`)}: {pendingSections(d, allMenus).map((p) => p.title).join(', ')}
                        </button>
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <div className="rs-diners">
              {s.diners.map((d, i) => {
                const prev = s.diners[i - 1];
                const canCopy = !!prev && prev.mode === 'menu' && prev.menuId === d.menuId && d.mode === 'menu';
                const isOpen = open === d.id || (open === null && d.id === s.diners.find((x) => pendingSections(x, allMenus).length)?.id);
                return (
                  <DinerCard
                    key={d.id}
                    diner={d}
                    menus={allMenus}
                    open={isOpen}
                    onToggle={() => setOpen(isOpen ? '' : d.id)}
                    onChange={setDiner}
                    canCopy={canCopy}
                    onCopyPrev={() => setDiner({ ...d, choices: structuredClone(prev.choices) })}
                  />
                );
              })}
            </div>
          </>
        )}

        {step === 'notas' && (
          <>
            <h2 className="rs-h2" id="rs-step-title">
              Notas, alergias y observaciones
            </h2>
            <Area label="Alergias e intolerancias (de todo el grupo)" value={s.notes.allergies} onChange={(v) => setS({ ...s, notes: { ...s.notes, allergies: v } })} max={800} />
            <p className="rs-note">{fc.messages.allergyNotice}</p>
            <Area label="Necesidades especiales del servicio (opcional)" hint="Por ejemplo: trona, carrito, accesibilidad." value={s.notes.special} onChange={(v) => setS({ ...s, notes: { ...s.notes, special: v } })} max={500} />
            <Area label="Observaciones generales (opcional)" value={s.notes.general} onChange={(v) => setS({ ...s, notes: { ...s.notes, general: v } })} max={800} />
            <p className="rs-hint">También puedes indicar alergias y notas de cada comensal en el paso «Platos».</p>
          </>
        )}

        {step === 'revision' && (
          <>
            <h2 className="rs-h2" id="rs-step-title">
              Revisad vuestra elección
            </h2>
            <Summary s={s} menus={allMenus} showHolder={!isLink} estimate={est} />
            {!isLink && (
              <>
                <label className="rs-consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{fc.messages.privacy}</span>
                </label>
                <input ref={honeypot} className="rs-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" />
              </>
            )}
          </>
        )}

        {(errs.length > 0 || (step === 'revision' && showErrors && problems.length > 0)) && (
          <div className="rs-errors" role="alert">
            <p>Falta completar:</p>
            <ul>
              {(step === 'revision' ? problems.map((p) => p.message) : errs).slice(0, 12).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="rs-error" role="alert">
            {error}
          </p>
        )}

        <div className="rs-actions">
          {idx > 0 && (
            <button type="button" className="rs-btn rs-btn--ghost" onClick={() => go(steps[idx - 1])}>
              Atrás
            </button>
          )}
          {step !== 'revision' ? (
            <button type="button" className="rs-btn rs-btn--gold" onClick={next}>
              Continuar
            </button>
          ) : (
            <button type="button" className="rs-btn rs-btn--gold" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Guardando…' : isLink ? 'Guardar modificaciones' : 'Guardar y continuar'}
            </button>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Shell({ brand, children }: { brand: string; children: React.ReactNode }) {
  const parts = brand.trim().split(/\s+/);
  return (
    <div className="rs">
      <header className="rs-bar">
        <a href="/" className="rs-brand">
          {parts.length > 1 && <small>{parts.slice(0, -1).join(' ')}</small>}
          <span>{parts[parts.length - 1]}</span>
        </a>
      </header>
      <main className="rs-main">{children}</main>
    </div>
  );
}

function LinkClosed({ state, token, phone }: { state: string; token: string; phone: string }) {
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useCallback(async () => {
    setBusy(true);
    const r = await api(`/api/reservas/link/${token}/request`, { method: 'POST', body: JSON.stringify({ reason }) });
    setBusy(false);
    if (r.ok) setSent(true);
  }, [token, reason]);
  const title = state === 'used' ? 'Este enlace ya se ha utilizado' : state === 'deadline' ? 'El plazo para modificar los menús ha terminado' : state === 'expired' ? 'Este enlace ha caducado' : 'Este enlace ya no está activo';
  return (
    <section className="rs-card rs-center">
      <h1 className="rs-h1">{title}</h1>
      <p>{state === 'deadline' ? 'Para cualquier cambio, contactad directamente con el restaurante.' : 'Si necesitáis realizar otro cambio, contactad con GastroBar Torero para solicitar un nuevo enlace.'}</p>
      {state !== 'deadline' &&
        (sent ? (
          <p className="rs-note" role="status">
            Hemos recibido vuestra solicitud. El restaurante os enviará un nuevo enlace.
          </p>
        ) : (
          <div className="rs-request">
            <Area label="Motivo (opcional)" value={reason} onChange={setReason} max={300} />
            <button type="button" className="rs-btn rs-btn--gold" disabled={busy} onClick={() => void request()}>
              Solicitar una nueva modificación
            </button>
          </div>
        ))}
      {phone && (
        <a className="rs-btn rs-btn--ghost" href={`tel:${phone.replace(/\s/g, '')}`}>
          Llamar al restaurante
        </a>
      )}
    </section>
  );
}

function Field({ label, value, onChange, max, ...rest }: { label: string; value: string; onChange: (v: string) => void; max: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="rs-field">
      <label className="rs-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="rs-input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}
function Area({ label, value, onChange, max, hint }: { label: string; value: string; onChange: (v: string) => void; max: number; hint?: string }) {
  const id = `a-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="rs-field">
      <label className="rs-label" htmlFor={id}>
        {label}
      </label>
      {hint && <p className="rs-hint">{hint}</p>}
      <textarea id={id} className="rs-input rs-area" rows={3} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
