import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import './page.css';
import './screen.css';
import { PlayerApp } from './PlayerApp.tsx';

createRoot(document.getElementById('root')!).render(<PlayerApp />);
