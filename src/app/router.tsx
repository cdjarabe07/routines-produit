import { createHashRouter } from 'react-router';

/* Table des routes — complétée en phase 2 (coque applicative). */
export function createAppRouter() {
  return createHashRouter([{ path: '*', element: <p>Initialisation…</p> }]);
}
