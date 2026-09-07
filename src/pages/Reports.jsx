import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, AlertCircle, RefreshCw } from 'lucide-react';

// Fix: jsPDF v4 + jspdf-autotable v5 removed the CommonJS default export.
// Must import as named exports from the ESM build. The old import crashed
// silently: `import jsPDF from 'jspdf'` and `import autoTable from 'jspdf-autotable'`
// no longer work in v4/v5 — jsPDF is now a named export and autoTable is a
// method that must be explicitly registered.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Fix: format date strings as local date to avoid UTC off-by-one error
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return new Date(+y, +m - 1, +d).toLocaleDateString();
}

export default function Reports() {
  const { session } = useAuth();
  const [reportType, setReportType] = useState('daily');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/reports?type=${reportType}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      // Fix: check res.ok — previously an error object was passed to chart
      // components expecting {habitStats:[...], goals:[...]} etc.
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setFetchError(errData.error || 'Failed to load report data.');
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [session, reportType]);

  useEffect(() => {
    if (session) fetchReport();
  }, [session, fetchReport]);

  const exportPDF = async () => {
    if (!data || pdfLoading) return;
    setPdfLoading(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Habit Report`, 14, 20);
      doc.setFontSize(11);
      doc.setTextColor(120);
      doc.text(`Period: ${data.fromDate} → ${data.toDate}`, 14, 30);
      doc.text(`Completion Rate: ${data.completionRate}%   |   Total Completions: ${data.totalCompletions} / ${data.totalPossible}`, 14, 38);
      doc.setTextColor(0);

      // Fix: pass the jsPDF instance to autoTable (v5 API requirement)
      autoTable(doc, {
        startY: 46,
        head: [['Habit', 'Category', 'Completions']],
        body: (data.habitStats || []).map(h => [h.name, h.category, h.count]),
        headStyles: { fillColor: [37, 99, 235] },
      });

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY ?? 46) + 10,
        head: [['Goal', 'Target Date', 'Status']],
        body: (data.goals || []).map(g => [g.goal_name, g.target_date, g.status]),
        headStyles: { fillColor: [37, 99, 235] },
      });

      doc.save(`habit-report-${reportType}-${data.fromDate}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export failed: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // Fix: guard against null/undefined arrays before mapping
  const pieData = data ? [
    { name: 'Completed', value: data.totalCompletions ?? 0 },
    { name: 'Remaining', value: Math.max(0, (data.totalPossible ?? 0) - (data.totalCompletions ?? 0)) },
  ] : [];

  const COLORS = ['#2563eb', '#e5e7eb'];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analyse your habit performance over time</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
            {['daily', 'weekly', 'monthly'].map((t) => (
              <button
                key={t}
                onClick={() => setReportType(t)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  reportType === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {/* PDF export */}
          <button
            onClick={exportPDF}
            disabled={!data || pdfLoading}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {pdfLoading
              ? <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              : <Download size={16} />
            }
            PDF
          </button>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl mb-4">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 flex-1">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); fetchReport(); }}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 underline hover:no-underline"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500 mb-1">Completion Rate</p>
              <p className="text-3xl font-bold text-blue-600">{data.completionRate}%</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500 mb-1">Total Completions</p>
              <p className="text-3xl font-bold text-green-600">{data.totalCompletions}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-500 mb-1">Total Possible</p>
              <p className="text-3xl font-bold text-gray-800">{data.totalPossible}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Habit Performance</h2>
              {(data.habitStats || []).length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.habitStats}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                  No habit data for this period
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Completion Overview</h2>
              {/* Fix: only render pie chart when totalPossible > 0 to avoid
                  rendering an invisible/broken empty chart */}
              {data.totalPossible > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                  No completion data for this period
                </div>
              )}
            </div>
          </div>

          {/* Goals table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Goal Achievement</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Goal</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Target Date</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data.goals || []).map((g) => (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-800">{g.goal_name}</td>
                      {/* Fix: use local-date formatter to avoid off-by-one display */}
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(g.target_date)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          g.status === 'Completed'   ? 'bg-green-50 text-green-700' :
                          g.status === 'In Progress' ? 'bg-blue-50 text-blue-700'  :
                                                       'bg-amber-50 text-amber-700'
                        }`}>
                          {g.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(data.goals || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                        No goals found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
