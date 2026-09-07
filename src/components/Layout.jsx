import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[#f7f9fa] dark:bg-[#14181c]">
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
