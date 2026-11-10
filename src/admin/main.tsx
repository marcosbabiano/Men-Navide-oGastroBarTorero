import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import './admin.css';
import { AdminRoot } from './AdminApp.tsx';

// /admin/pantallas (enlace directo) → ruta interna del panel.
if (/^\/admin\/pantallas\/?$/.test(location.pathname) && !location.hash) history.replaceState(null, '', '/admin#/pantallas');
if (/^\/admin\/reservas\/?$/.test(location.pathname) && !location.hash) history.replaceState(null, '', '/admin#/reservas');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminRoot />
  </StrictMode>,
);
