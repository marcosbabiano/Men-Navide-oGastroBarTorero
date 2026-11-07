import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import './admin.css';
import { AdminRoot } from './AdminApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminRoot />
  </StrictMode>,
);
