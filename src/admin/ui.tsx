/* Componentes de interfaz del panel. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ---------------- Avisos (toasts) ---------------- */
interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  title: string;
  text?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}
const ToastContext = createContext<{ show: (t: Omit<Toast, 'id'>) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.kind === 'error' ? 9000 : 5000);
  }, []);
  const api = useRef({ show });
  api.current.show = show;
  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span className="toast__icon" aria-hidden="true">
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}
            </span>
            <div className="toast__body">
              <strong>{t.title}</strong>
              {t.text && <p>{t.text}</p>}
            </div>
            {t.action &&
              (t.action.href ? (
                <a className="toast__action" href={t.action.href} target="_blank" rel="noopener noreferrer">
                  {t.action.label}
                </a>
              ) : (
                <button type="button" className="toast__action" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              ))}
            <button type="button" className="toast__close" aria-label="Cerrar aviso" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider ausente');
  return ctx;
}

/* ---------------- Diálogo de confirmación ---------------- */
interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  useEffect(() => {
    if (state && ref.current && !ref.current.open) ref.current.showModal();
  }, [state]);
  const close = (v: boolean) => {
    state?.resolve(v);
    ref.current?.close();
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog ref={ref} className="dialog" onCancel={() => close(false)} aria-labelledby="confirm-title">
        {state && (
          <div className="dialog__inner">
            <h2 id="confirm-title" className="dialog__title">
              {state.title}
            </h2>
            {state.text && <div className="dialog__text">{state.text}</div>}
            <div className="dialog__actions">
              <button type="button" className="abtn abtn--ghost" onClick={() => close(false)}>
                Cancelar
              </button>
              <button type="button" className={`abtn ${state.danger ? 'abtn--danger' : 'abtn--primary'}`} onClick={() => close(true)} autoFocus>
                {state.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('ConfirmProvider ausente');
  return ctx;
}

/* ---------------- Campos ---------------- */
interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  counter?: { value: number; max: number };
  className?: string;
}

export function Field({ label, hint, error, children, counter, className = '' }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {counter && (
          <span className={`field__counter ${counter.value > counter.max ? 'is-over' : ''}`}>
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children(id, describedBy)}
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  max?: number;
};

export function TextField({ label, value, onChange, hint, error, max, className, ...rest }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} counter={max ? { value: value.length, max } : undefined} className={className}>
      {(id, d) => (
        <input
          id={id}
          className="input"
          value={value}
          aria-describedby={d}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  max?: number;
};

export function TextArea({ label, value, onChange, hint, error, max, rows = 3, className, ...rest }: AreaProps) {
  return (
    <Field label={label} hint={hint} error={error} counter={max ? { value: value.length, max } : undefined} className={className}>
      {(id, d) => (
        <textarea
          id={id}
          className="input input--area"
          rows={rows}
          value={value}
          aria-describedby={d}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  tone = 'default',
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  tone?: 'default' | 'warn';
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`toggle toggle--${tone}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        className="toggle__switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-describedby={hint ? `${id}-h` : undefined}
      >
        <span className="toggle__knob" />
      </button>
      <label className="toggle__label" htmlFor={id}>
        {label}
        {hint && (
          <span className="toggle__hint" id={`${id}-h`}>
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <select id={id} className="input input--select" value={value} aria-describedby={d} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; tone?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="segmented">
      <legend className="field__label">{label}</legend>
      <div className="segmented__opts">
        {options.map((o) => (
          <label key={o.value} className={`segmented__opt ${value === o.value ? 'is-on' : ''} ${o.tone ? `tone-${o.tone}` : ''}`}>
            <input type="radio" name={label} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Número con coma o punto decimal (precio). Vacío = null. */
export function PriceField({ label, value, onChange, hint, error }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: ReactNode; error?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'));
    if (parsed !== value) setText(value === null ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const invalid = text.trim() !== '' && !/^\d{1,5}([.,]\d{1,2})?$/.test(text.trim());
  return (
    <Field label={label} hint={hint} error={invalid ? 'Escribe un importe válido, por ejemplo 36 o 36,50' : error}>
      {(id, d) => (
        <div className="input-affix">
          <input
            id={id}
            className="input"
            inputMode="decimal"
            value={text}
            aria-describedby={d}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              if (v.trim() === '') onChange(null);
              else if (/^\d{1,5}([.,]\d{1,2})?$/.test(v.trim())) onChange(Math.round(Number(v.trim().replace(',', '.')) * 100) / 100);
            }}
          />
          <span className="input-affix__suffix">€</span>
        </div>
      )}
    </Field>
  );
}

/* ---------------- Tarjetas y estructura ---------------- */
export function Card({ title, description, children, actions, id, tone }: { title?: ReactNode; description?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string; tone?: 'warn' | 'danger' }) {
  return (
    <section className={`card ${tone ? `card--${tone}` : ''}`} id={id}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {description && <p className="card__desc">{description}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'draft' | 'info' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-head__title">{title}</h1>
        {intro && <p className="page-head__intro">{intro}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}

/* ---------------- Listas reordenables ---------------- */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  label,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  label: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Para reordenar, pulsa espacio o intro, muévete con las flechas y vuelve a pulsar espacio para soltar. Escape cancela.',
        },
        announcements: {
          onDragStart: ({ active }) => `Elemento ${String(active.id)} seleccionado.`,
          onDragOver: ({ over }) => (over ? `Sobre la posición de ${String(over.id)}.` : 'Fuera de la lista.'),
          onDragEnd: ({ over }) => (over ? 'Elemento recolocado.' : 'Movimiento cancelado.'),
          onDragCancel: () => 'Movimiento cancelado.',
        },
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="sortable" aria-label={label}>
          {items.map((item, i) => (
            <SortableRow key={item.id} id={item.id} index={i} total={items.length} onMove={(dir) => onReorder(arrayMove(items, i, i + dir))}>
              {(handle) => renderItem(item, i, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  index,
  total,
  onMove,
  children,
}: {
  id: string;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <span className="drag">
      <button type="button" className="drag__handle" aria-label="Arrastrar para reordenar" {...attributes} {...listeners}>
        <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
          {[3, 10, 17].map((y) => (
            <g key={y}>
              <circle cx="4" cy={y} r="1.6" fill="currentColor" />
              <circle cx="10" cy={y} r="1.6" fill="currentColor" />
            </g>
          ))}
        </svg>
      </button>
      <span className="drag__arrows">
        <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" aria-label="Bajar" disabled={index === total - 1} onClick={() => onMove(1)}>
          ↓
        </button>
      </span>
    </span>
  );
  return (
    <li ref={setNodeRef} style={style} className={`sortable__row ${isDragging ? 'is-dragging' : ''}`}>
      {children(handle)}
    </li>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
