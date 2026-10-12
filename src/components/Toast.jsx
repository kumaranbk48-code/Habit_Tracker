import { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Toast({ message, type = 'success', onClose, actionLabel, onAction }) {
  // Fix: use ref to always call the latest onClose without resetting the timer
  // on every parent re-render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const duration = actionLabel ? 5500 : 3500;
    const timer = setTimeout(() => onCloseRef.current?.(), duration);
    return () => clearTimeout(timer);
  }, [actionLabel]);

  const isSuccess = type === 'success';

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 450, damping: 26 }}
      className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl text-sm font-medium max-w-sm ${
        isSuccess
          ? 'bg-white dark:bg-[#1a2129] border border-green-100 dark:border-green-900/40 text-gray-800 dark:text-gray-100 shadow-green-950/5'
          : 'bg-white dark:bg-[#1a2129] border border-red-100 dark:border-red-900/40 text-gray-800 dark:text-gray-100'
      }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isSuccess ? 'bg-green-100 dark:bg-green-950/60' : 'bg-red-100 dark:bg-red-950/60'
      }`}>
        {isSuccess
          ? <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
          : <XCircle size={18} className="text-red-600 dark:text-red-400" />
        }
      </div>
      <span className="flex-1 text-xs sm:text-sm">{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={() => {
            onAction();
            if (onClose) onClose();
          }}
          className="text-xs font-extrabold text-[#3d7a75] dark:text-[#5fae9e] hover:underline px-2.5 py-1 rounded-lg bg-[#3d7a75]/10 dark:bg-[#3d7a75]/25 flex-shrink-0 cursor-pointer transition-colors"
        >
          {actionLabel}
        </button>
      )}
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1 flex-shrink-0 transition-colors cursor-pointer"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
