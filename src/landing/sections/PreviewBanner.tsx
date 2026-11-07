export function PreviewBanner({ includeDrafts, onToggle }: { includeDrafts: boolean; onToggle: () => void }) {
  return (
    <div className="pbanner" role="status">
      <span className="pbanner__dot" aria-hidden="true" />
      <strong>Vista previa del borrador</strong>
      <span className="pbanner__muted">No es la web publicada.</span>
      <label className="pbanner__toggle">
        <input type="checkbox" checked={includeDrafts} onChange={onToggle} /> Incluir menús en borrador
      </label>
      <a href="/admin" className="pbanner__link">
        Volver al panel
      </a>
    </div>
  );
}
