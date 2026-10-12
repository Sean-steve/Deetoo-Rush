import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminNext } from '../../admin-web-next/src/App';

// This is the canonical Admin deployment. The approved, API-backed 16-screen
// workspace is always live here, even if a developer enabled the standalone
// design preview with VITE_ADMIN_NEXT_MODE=demo.
const root = createRoot(document.getElementById('root')!);
const mount = (App: ComponentType) => root.render(<StrictMode><App /></StrictMode>);

if (new URLSearchParams(window.location.search).get('admin-legacy') === '1') {
  // Explicit, reversible rollback only. Keep legacy styles out of the
  // canonical Admin bundle and avoid loading both UIs at once.
  void import('./legacy').then(({ LegacyAdmin }) => mount(LegacyAdmin));
} else {
  mount(() => <AdminNext forceLive />);
}
