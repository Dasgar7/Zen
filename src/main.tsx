import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle benign browser lifecycle rejections (e.g., IndexedDB closing when iframe/tab is hidden or speech recognition closes)
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = typeof reason === 'string' ? reason : reason?.message || String(reason || '');
  if (msg.toLowerCase().includes('database is closing') || msg.toLowerCase().includes('database is hidden')) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (msg.toLowerCase().includes('database is closing') || msg.toLowerCase().includes('database is hidden')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
