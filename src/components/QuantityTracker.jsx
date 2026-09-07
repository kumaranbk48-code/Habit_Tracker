import { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';

// Displays progress for a quantity-based habit (e.g. "2 / 3 liters") with a
// small input to log more and a reset button to correct mistakes.
export default function QuantityTracker({ current = 0, target = 0, unit = '', onAdd, onReset }) {
  const [amount, setAmount] = useState('');

  const safeCurrent = Number(current) || 0;
  const safeTarget   = Number(target)  || 0;
  const pct  = safeTarget > 0 ? Math.min(100, Math.round((safeCurrent / safeTarget) * 100)) : 0;
  const done = safeTarget > 0 && safeCurrent >= safeTarget;

  // Trim trailing zeros for a clean display (e.g. 2 instead of 2.00)
  const displayNum = (n) => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  const handleAdd = () => {
    const val = parseFloat(amount);
    if (!isNaN(val) && val > 0) {
      onAdd(val);
      setAmount('');
    }
  };

  return (
    <div className="min-w-[170px]">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${done ? 'text-[#2f6b5c] dark:text-[#7fd1b9]' : 'text-gray-700 dark:text-gray-300'}`}>
          {displayNum(safeCurrent)} / {displayNum(safeTarget)} {unit}
        </span>
        {done && <span className="text-xs">✅</span>}
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-[#3d7a75] dark:bg-[#5fae9e]' : 'bg-[#436170] dark:bg-[#688a9c]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="Amount"
          className="w-16 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#3d7a75] outline-none dark:text-gray-100 dark:bg-gray-800"
        />
        <button
          onClick={handleAdd}
          className="p-1.5 bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb] hover:bg-[#d9ecea] dark:hover:bg-[#1f3a3a] rounded-lg transition-colors flex-shrink-0"
          title={`Add ${unit}`}
          type="button"
        >
          <Plus size={12} />
        </button>
        <button
          onClick={onReset}
          disabled={safeCurrent === 0}
          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          title="Reset today's progress"
          type="button"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
}
