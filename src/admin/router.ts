import { useEffect, useState } from 'react';

export function navigate(hash: string) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function useHashRoute(): { path: string[]; query: URLSearchParams } {
  const read = () => {
    const raw = location.hash.replace(/^#\/?/, '') || 'inicio';
    const [p, q] = raw.split('?');
    return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q ?? '') };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
