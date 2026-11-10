import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import './reservar.css';
import { ReservarApp } from './ReservarApp.tsx';

createRoot(document.getElementById('root')!).render(<ReservarApp />);
