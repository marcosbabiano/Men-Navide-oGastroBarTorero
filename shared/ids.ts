/** Genera identificadores cortos y seguros para URLs (válidos para el esquema). */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 9);
  const p = prefix.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'id';
  return `${p}-${rand}`;
}
