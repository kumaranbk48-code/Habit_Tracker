import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    // Fix: was bg-gray-50/80 (80% opacity) which made background semi-transparent.
    // This caused the modal backdrop area to look "ugly" — the half-transparent
    // gray layer bled through the dark overlay. Changed to solid bg-gray-50.
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="md:ml-64 min-h-screen">
        {/* Mobile top spacing to clear hamburger button */}
        <div className="h-16 md:hidden" />
        <div className="p-4 md:p-8 max-w-7xl mx-auto page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
