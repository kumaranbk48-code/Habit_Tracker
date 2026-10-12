import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

  return createPortal(
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="modal-dialog"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={`bg-white dark:bg-[#1a2129] rounded-2xl shadow-2xl w-full ${maxWidth} flex flex-col border border-[#e2e8ec] dark:border-[#2a343d]`}
            style={{
              maxHeight: 'calc(100vh - 3rem)',
            }}
          >
            {/* Header — fixed */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8ec] dark:border-[#2a343d] bg-white dark:bg-[#1a2129] rounded-t-2xl flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-[#f1f3f5] dark:hover:bg-[#2a343d] transition-colors flex-shrink-0 cursor-pointer"
              >
                <X size={16} />
              </motion.button>
            </div>
            {/* Body — scrollable */}
            <div className="px-6 py-5 bg-white dark:bg-[#1a2129] text-gray-800 dark:text-gray-200 overflow-y-auto rounded-b-2xl">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
