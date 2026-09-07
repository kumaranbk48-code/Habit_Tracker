import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children }) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Fix: lock body scroll when modal is open so background doesn't scroll on mobile
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col border border-gray-100/50 dark:border-slate-700/80"
        style={{
          animation: 'fadeIn 0.2s ease both',
          maxHeight: 'calc(100vh - 3rem)',
        }}
      >
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-800 rounded-t-2xl flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        {/* Body — scrollable */}
        <div className="px-6 py-5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 overflow-y-auto rounded-b-2xl">{children}</div>
      </div>
    </div>,
    document.body
  );
}
