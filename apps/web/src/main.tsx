import React from 'react';
import ReactDOM from 'react-dom/client';
import { SketchersonWebApp } from '@sketcherson/web';
import '@sketcherson/web/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SketchersonWebApp />
  </React.StrictMode>,
);
