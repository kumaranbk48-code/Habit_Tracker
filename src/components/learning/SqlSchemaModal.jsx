import { useState, useEffect } from 'react';
import { X, Copy, Check, Database, ExternalLink, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SqlSchemaModal({ isOpen, onClose, isConfigured, onVerify }) {
  const [copied, setCopied] = useState(false);
  const [sqlCode, setSqlCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState(null);

  useEffect(() => {
    if (isOpen && !sqlCode) {
      setLoading(true);
      fetch('/api/learning?action=schema')
        .then(res => res.json())
        .then(data => {
          if (data.sql) setSqlCode(data.sql);
        })
        .catch(err => {
          console.error('Failed to load SQL schema:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, sqlCode]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!sqlCode) return;
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyMessage(null);
    try {
      const isOk = await onVerify();
      if (isOk) {
        setVerifyMessage({ type: 'success', text: 'Supabase tables detected! Cloud sync is now active.' });
      } else {
        setVerifyMessage({ type: 'error', text: 'Tables not detected yet. Make sure you pasted and clicked "Run" in Supabase SQL Editor.' });
      }
    } catch {
      setVerifyMessage({ type: 'error', text: 'Failed to verify connection.' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#14181c] border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isConfigured 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                : 'bg-[#3d7a75]/10 text-[#3d7a75] dark:text-[#5fae9e]'
            }`}>
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Supabase Tables for Learning Hub
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isConfigured ? 'Connected to Supabase' : 'Setup required to persist your journeys in the cloud'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-gray-600 dark:text-gray-300">
          {isConfigured ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start gap-3 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider">Cloud Sync Active</h4>
                <p className="text-xs mt-1 text-emerald-700 dark:text-emerald-300">
                  All 8 learning tables are active in Supabase. Your journeys, phases, topics, and notes are permanently stored and will sync across all devices and logins.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-start gap-3 text-amber-800 dark:text-amber-200">
                <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-bold uppercase tracking-wider">Why is this required?</span>
                  <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                    Without running the SQL table creation script in Supabase, journeys are only saved in temporary local cache. Creating the tables in Supabase allows permanent storage, auto-sync, and cross-device access.
                  </p>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                  3 Quick Steps (30 seconds)
                </h3>
                <ol className="space-y-2.5 text-xs">
                  <li className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#3d7a75] text-white flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                    <span>
                      Open your{' '}
                      <a
                        href="https://supabase.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#3d7a75] dark:text-[#5fae9e] font-semibold underline inline-flex items-center gap-1"
                      >
                        Supabase Dashboard <ExternalLink size={12} />
                      </a>
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#3d7a75] text-white flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                    <span>Go to <strong>SQL Editor</strong> from the left menu and click <strong>"New query"</strong>.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#3d7a75] text-white flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                    <span>Click <strong>Copy SQL Code</strong> below, paste it into the editor, and click <strong>Run</strong>.</span>
                  </li>
                </ol>
              </div>
            </>
          )}

          {/* Code Viewer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                SQL Schema Script (<code className="text-[11px] text-[#3d7a75] dark:text-[#5fae9e]">supabase/learning_hub_schema.sql</code>)
              </span>
              <button
                onClick={handleCopy}
                disabled={!sqlCode || loading}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-xl shadow transition-all disabled:opacity-50"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied to Clipboard!' : 'Copy SQL Script'}
              </button>
            </div>

            <div className="relative">
              <pre className="p-4 bg-gray-900 text-gray-100 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-60 border border-gray-800 leading-relaxed select-all">
                {loading ? 'Loading SQL script...' : (sqlCode || '-- Could not load SQL schema')}
              </pre>
            </div>
          </div>

          {verifyMessage && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              verifyMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}>
              {verifyMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {verifyMessage.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Close
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded-xl transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white text-xs font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={verifying ? 'animate-spin' : ''} />
              {verifying ? 'Verifying...' : 'Check Connection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
