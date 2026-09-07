import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ open, isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  const isModalOpen = Boolean(open ?? isOpen);

  // Close on Escape key
  useEffect(() => {
    if (!isModalOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModalOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`bg-white dark:bg-[#1a2129] rounded-2xl shadow-2xl w-full ${maxWidth} flex flex-col border border-[#e2e8ec] dark:border-[#2a343d]`}
        style={{
          animation: 'fadeIn 0.2s ease both',
          maxHeight: 'calc(100vh - 3rem)',
        }}
      >
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8ec] dark:border-[#2a343d] bg-white dark:bg-[#1a2129] rounded-t-2xl flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-[#f1f3f5] dark:hover:bg-[#2a343d] transition-colors flex-shrink-0 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        {/* Body — scrollable */}
        <div className="px-6 py-5 bg-white dark:bg-[#1a2129] text-gray-800 dark:text-gray-200 overflow-y-auto rounded-b-2xl">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
