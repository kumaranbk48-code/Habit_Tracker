import { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose }) {
  // Fix: use ref to always call the latest onClose without resetting the timer
  // on every parent re-render. Without this, any parent state change (e.g. from
  // fetchData updating habits list) creates a new onClose reference, which the
  // useEffect sees as a dependency change and resets the 3.5 s timer to zero.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), 3500);
    return () => clearTimeout(timer);
  }, []); // intentionally empty — only run once on mount

  const isSuccess = type === 'success';

  return (
    <div
      className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl text-sm font-medium max-w-xs toast-enter ${
        isSuccess
          ? 'bg-white border border-green-100 text-gray-800'
          : 'bg-white border border-red-100 text-gray-800'
      }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isSuccess ? 'bg-green-100' : 'bg-red-100'
      }`}>
        {isSuccess
          ? <CheckCircle2 size={18} className="text-green-600" />
          : <XCircle size={18} className="text-red-600" />
        }
      </div>
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 ml-1 flex-shrink-0 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
