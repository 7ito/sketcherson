import React from 'react';
import ReactDOM from 'react-dom/client';
import { SketchersonWebApp } from '@7ito/sketcherson-web';
import '@7ito/sketcherson-web/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SketchersonWebApp />
  </React.StrictMode>,
);
