import { lazy, Suspense, useState } from "react";

const AdminDashboard = lazy(() =>
  import("./views/AdminDashboard").then(({ AdminDashboard: Component }) => ({ default: Component }))
);
const CustomerApp = lazy(() =>
  import("./views/CustomerApp").then(({ CustomerApp: Component }) => ({ default: Component }))
);

function isAdminRoute() {
  const isTauriEnv = Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  const params = new URLSearchParams(window.location.search);
  return isTauriEnv || params.get("mode") === "admin";
}

export function App() {
  // Decide before the first paint so a phone never briefly renders the admin UI.
  const [isAdmin] = useState(isAdminRoute);

  return (
    <div className="surface-grid w-full min-h-screen bg-zinc-950 text-white font-sans antialiased">
      <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
        {isAdmin ? <AdminDashboard /> : <CustomerApp />}
      </Suspense>
    </div>
  );
}

export default App;
