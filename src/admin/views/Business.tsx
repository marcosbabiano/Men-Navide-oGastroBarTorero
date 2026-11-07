import type { Draft } from 'immer';
import type { SiteContent, TimeRange } from '../../../shared/schema.ts';
import { DAY_NAMES, mapsLink } from '../../../shared/format.ts';
import { isHttpUrl } from '../../../shared/schema.ts';
import { DEFAULT_BOOKING_URL } from '../../../shared/seed.ts';
import { newId } from '../../../shared/ids.ts';
import { useStore } from '../store.tsx';
import { Card, PageHeader, TextArea, TextField, Toggle, useConfirm } from '../ui.tsx';

type Business = SiteContent['business'];

function Ranges({ ranges, onChange, label }: { ranges: TimeRange[]; onChange: (r: TimeRange[]) => void; label: string }) {
  return (
    <div className="ranges">
      {ranges.map((r, i) => (
        <div key={i} className="ranges__row">
          <label>
            <span className="sr-only">
              {label}: apertura {i + 1}
            </span>
            <input type="time" className="input input--time" value={r.open} onChange={(e) => onChange(ranges.map((x, k) => (k === i ? { ...x, open: e.target.value } : x)))} />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="sr-only">
              {label}: cierre {i + 1}
            </span>
            <input type="time" className="input input--time" value={r.close} onChange={(e) => onChange(ranges.map((x, k) => (k === i ? { ...x, close: e.target.value } : x)))} />
          </label>
          <button type="button" className="abtn abtn--small abtn--text" aria-label={`Quitar tramo ${i + 1} de ${label}`} onClick={() => onChange(ranges.filter((_, k) => k !== i))}>
            ×
          </button>
        </div>
      ))}
      {ranges.length < 3 && (
        <button type="button" className="abtn abtn--small abtn--ghost" onClick={() => onChange([...ranges, { open: '13:00', close: '16:00' }])}>
          + Tramo
        </button>
      )}
    </div>
  );
}

export function BusinessView() {
  const { content, update, fieldErrors } = useStore();
  const confirm = useConfirm();
  const b = content.business;
  const set = (fn: (b: Draft<Business>) => void) => update((d) => fn(d.business));
  const err = (p: string) => fieldErrors.find((e) => e.path === p)?.message;
  const bookingInvalid = !isHttpUrl(content.booking.url, true);

  return (
    <>
      <PageHeader title="Establecimiento" intro="Datos de contacto, reservas y horarios. Marca como verificados los datos confirmados." />

      <Card title="Reservas" description="Todos los botones «Reservar» de la web abren esta dirección en una pestaña nueva.">
        <TextField
          label="Enlace de la plataforma de reservas"
          value={content.booking.url}
          type="url"
          max={600}
          onChange={(v) => update((d) => void (d.booking.url = v.trim()))}
          error={bookingInvalid ? 'Debe ser una dirección segura que empiece por https://' : err('booking.url')}
          hint={
            <>
              Actual: Qamarero. No se añaden parámetros (la plataforma no permite preseleccionar menús).{' '}
              {!bookingInvalid && (
                <a href={content.booking.url} target="_blank" rel="noopener noreferrer">
                  Probar enlace ↗
                </a>
              )}{' '}
              {content.booking.url !== DEFAULT_BOOKING_URL && (
                <button type="button" className="linkbtn" onClick={() => update((d) => void (d.booking.url = DEFAULT_BOOKING_URL))}>
                  Restaurar enlace original
                </button>
              )}
            </>
          }
        />
        <Toggle label="Mostrar aviso para indicar el menú al reservar" checked={content.booking.notice.enabled} onChange={(v) => update((d) => void (d.booking.notice.enabled = v))} />
        <TextArea
          label="Texto del aviso"
          value={content.booking.notice.text}
          max={300}
          rows={2}
          onChange={(v) => update((d) => void (d.booking.notice.text = v))}
          hint="Aparece junto a los botones de reserva de cada menú y en «Cómo reservar». Admite {telefono}."
        />
      </Card>

      <div className="grid-2">
        <Card title="Datos del establecimiento">
          <TextField label="Nombre comercial" value={b.name} max={80} onChange={(v) => set((x) => void (x.name = v))} error={err('business.name')} />
          <TextArea label="Descripción breve (SEO y datos estructurados)" value={b.description} max={400} rows={2} onChange={(v) => set((x) => void (x.description = v))} />
          <TextField label="Teléfono" value={b.phone} max={30} inputMode="tel" onChange={(v) => set((x) => void (x.phone = v))} error={err('business.phone')} />
          <Toggle label="Teléfono verificado" checked={b.verified.phone} onChange={(v) => set((x) => void (x.verified.phone = v))} hint="Solo los datos verificados se incluyen en los datos estructurados de Google." />
          <TextField label="Correo electrónico (opcional)" value={b.email} type="email" max={120} onChange={(v) => set((x) => void (x.email = v.trim()))} error={err('business.email')} />
          <TextArea label="Mensaje de contacto" value={b.contactMessage} max={300} rows={2} onChange={(v) => set((x) => void (x.contactMessage = v))} />
        </Card>
        <Card title="Dirección">
          <TextField label="Calle y número" value={b.address.street} max={120} onChange={(v) => set((x) => void (x.address.street = v))} />
          <div className="grid-2">
            <TextField label="Código postal" value={b.address.postalCode} max={10} onChange={(v) => set((x) => void (x.address.postalCode = v))} />
            <TextField label="Localidad" value={b.address.locality} max={80} onChange={(v) => set((x) => void (x.address.locality = v))} />
            <TextField label="Provincia" value={b.address.region} max={80} onChange={(v) => set((x) => void (x.address.region = v))} />
            <TextField label="País" value={b.address.country} max={60} onChange={(v) => set((x) => void (x.address.country = v))} />
          </div>
          <Toggle label="Dirección verificada" checked={b.verified.address} onChange={(v) => set((x) => void (x.verified.address = v))} />
          <TextField
            label="Enlace de Google Maps (opcional)"
            value={b.mapsUrl}
            type="url"
            max={600}
            onChange={(v) => set((x) => void (x.mapsUrl = v.trim()))}
            error={err('business.mapsUrl')}
            hint={
              <>
                Vacío = se genera una búsqueda con la dirección.{' '}
                <a href={mapsLink(content)} target="_blank" rel="noopener noreferrer">
                  Probar ↗
                </a>
              </>
            }
          />
        </Card>
      </div>

      <Card title="Redes sociales" description="Solo se muestran las que tengan enlace. Déjalas vacías mientras no estén confirmadas.">
        <div className="grid-3">
          {(
            [
              ['instagram', 'Instagram'],
              ['facebook', 'Facebook'],
              ['tiktok', 'TikTok'],
              ['whatsapp', 'WhatsApp (enlace wa.me)'],
              ['google', 'Perfil de Google'],
              ['tripadvisor', 'Tripadvisor'],
            ] as const
          ).map(([k, label]) => (
            <TextField key={k} label={label} value={b.social[k]} type="url" max={600} placeholder="https://…" onChange={(v) => set((x) => void (x.social[k] = v.trim()))} error={err(`business.social.${k}`)} />
          ))}
        </div>
      </Card>

      <Card title="Horario" tone={b.hours.verified ? undefined : 'warn'} description="Los horarios procedentes de directorios externos no se muestran hasta que los confirmes.">
        <Toggle
          label="Horario confirmado: mostrar en la web"
          checked={b.hours.verified}
          onChange={(v) => set((x) => void (x.hours.verified = v))}
          hint={b.hours.verified ? 'El horario semanal y los especiales se muestran en el pie.' : 'Ahora se muestra el mensaje alternativo de abajo.'}
          tone="warn"
        />
        <TextArea label="Mensaje mientras el horario no esté confirmado" value={b.hours.unverifiedMessage} max={300} rows={2} onChange={(v) => set((x) => void (x.hours.unverifiedMessage = v))} />
        <h3 className="subhead">Horario semanal</h3>
        <div className="week">
          {[...b.hours.weekly]
            .sort((a, z) => a.day - z.day)
            .map((d) => {
              const i = b.hours.weekly.findIndex((x) => x.day === d.day);
              return (
                <div key={d.day} className="week__row">
                  <strong className="week__day">{DAY_NAMES[d.day]}</strong>
                  <Toggle label="Cerrado" checked={d.closed} onChange={(v) => set((x) => void (x.hours.weekly[i].closed = v))} />
                  {!d.closed && <Ranges label={DAY_NAMES[d.day]} ranges={d.ranges} onChange={(r) => set((x) => void (x.hours.weekly[i].ranges = r))} />}
                  {!d.closed && d.ranges.length === 0 && <span className="muted small">Sin horario (no se muestra)</span>}
                </div>
              );
            })}
        </div>
        <TextArea label="Nota sobre el horario (opcional)" value={b.hours.note} max={300} rows={2} onChange={(v) => set((x) => void (x.hours.note = v))} />

        <h3 className="subhead">Horarios especiales de Navidad</h3>
        {b.hours.specials.length === 0 && <p className="muted small">No hay horarios especiales. Añade días festivos o con horario distinto.</p>}
        {b.hours.specials.map((s, i) => (
          <div key={s.id} className="special">
            <div className="grid-3">
              <TextField label="Fecha" type="date" value={s.date} onChange={(v) => set((x) => void (x.hours.specials[i].date = v))} error={err(`business.hours.specials.${i}.date`)} />
              <TextField label="Nombre (opcional)" value={s.label} max={80} placeholder="Nochebuena" onChange={(v) => set((x) => void (x.hours.specials[i].label = v))} />
              <TextField label="Nota (opcional)" value={s.note} max={200} onChange={(v) => set((x) => void (x.hours.specials[i].note = v))} />
            </div>
            <div className="special__bottom">
              <Toggle label="Cerrado ese día" checked={s.closed} onChange={(v) => set((x) => void (x.hours.specials[i].closed = v))} />
              {!s.closed && <Ranges label={s.label || s.date} ranges={s.ranges} onChange={(r) => set((x) => void (x.hours.specials[i].ranges = r))} />}
              <button
                type="button"
                className="abtn abtn--small abtn--danger-ghost"
                onClick={async () => {
                  if (await confirm({ title: '¿Eliminar este horario especial?', confirmLabel: 'Eliminar', danger: true })) set((x) => void x.hours.specials.splice(i, 1));
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="abtn abtn--ghost abtn--small"
          onClick={() =>
            set((x) =>
              void x.hours.specials.push({ id: newId('especial'), date: `${content.campaign.year}-12-24`, label: '', closed: false, ranges: [{ open: '12:00', close: '17:00' }], note: '' }),
            )
          }
        >
          + Añadir horario especial
        </button>
      </Card>
    </>
  );
}
