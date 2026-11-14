import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from '@/app/App';
import { PopupApp } from '@/popup/PopupApp';
import '@/styles/index.css';

// The desktop app opens small IDM-style windows on "#/popup/<kind>"; they never run the download manager.
const popup = /^#\/popup\/(add|progress|done|drop|tray)/.exec(window.location.hash);

// HashRouter keeps routing working under file:// in the packaged Electron app.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {popup ? (
      <PopupApp kind={popup[1] as 'add' | 'progress' | 'done' | 'drop' | 'tray'} />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
  </React.StrictMode>,
);
