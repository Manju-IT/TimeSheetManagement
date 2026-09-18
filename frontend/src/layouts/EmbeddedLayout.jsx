import { Outlet } from "react-router-dom";

function EmbeddedLayout() {
  return (
    <main className="min-h-screen bg-white p-4">
      <Outlet />
    </main>
  );
}

export default EmbeddedLayout;