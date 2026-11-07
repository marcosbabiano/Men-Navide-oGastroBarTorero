/** «GastroBar Torero» → { small: 'GastroBar', big: 'Torero' } para el tratamiento tipográfico. */
export function splitBrand(name: string): { small: string; big: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { small: '', big: name.trim() };
  return { small: parts.slice(0, -1).join(' '), big: parts[parts.length - 1] };
}

/** «Menú Esencia» → { prefix: 'Menú', main: 'Esencia' }. */
export function splitMenuName(name: string): { prefix: string; main: string } {
  const m = /^(men[uú])\s+(.+)$/i.exec(name.trim());
  return m ? { prefix: m[1], main: m[2] } : { prefix: '', main: name.trim() };
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const roman = (i: number) => ROMAN[i] ?? String(i + 1);
