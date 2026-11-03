import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/index.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// Thème appliqué avant le rendu pour éviter un flash
try {
  const s = JSON.parse(localStorage.getItem('pbt.settings') || '{}');
  const dark = s.theme === 'dark' || ((!s.theme || s.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch { /* stockage indisponible */ }

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
