import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Download, AlertCircle, RefreshCw, Calendar, TrendingUp,
  CheckCircle2, Flame, Layers, Award, Target, ChevronDown,
  ChevronLeft, ChevronRight, Check, Clock
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import HabizLoader from '../components/HabizLoader';

function formatLocalYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatRangeString(fromStr, toStr) {
  if (!fromStr || !toStr) return 'Select Date Range';
  try {
    const f = new Date(fromStr + 'T00:00:00');
    const t = new Date(toStr + 'T00:00:00');
    const fMonth = f.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tFormatted = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fMonth} - ${tFormatted}`;
  } catch {
    return `${fromStr} - ${toStr}`;
  }
}

export default function Reports() {
  const { session } = useAuth();
  const [reportType, setReportType] = useState('weekly'); // 'weekly' | 'monthly' | 'custom'
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week, -1 = last week, etc.
  const [monthOffset, setMonthOffset] = useState(0); // 0 = this month, -1 = last month, etc.

  // Custom date range state
  const todayDate = useMemo(() => new Date(), []);
  const todayYMD = useMemo(() => formatLocalYMD(todayDate), [todayDate]);
  
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatLocalYMD(d);
  });
  const [customEnd, setCustomEnd] = useState(todayYMD);

  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const dateMenuRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target)) {
        setDateMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute active date boundaries based on type & offset
  const { computedFrom, computedTo, displayPeriodLabel } = useMemo(() => {
    const now = new Date();

    if (reportType === 'weekly') {
      const target = new Date(now);
      target.setDate(now.getDate() + (weekOffset * 7));

      // Sunday start
      const start = new Date(target);
      start.setDate(target.getDate() - target.getDay());

      // Saturday end
      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const fromStr = formatLocalYMD(start);
      const toStr = formatLocalYMD(end);

      let labelTag = '';
      if (weekOffset === 0) labelTag = ' (This Week)';
      else if (weekOffset === -1) labelTag = ' (Last Week)';
      else labelTag = ` (${Math.abs(weekOffset)} wks ago)`;

      return {
        computedFrom: fromStr,
        computedTo: toStr,
        displayPeriodLabel: `${formatRangeString(fromStr, toStr)}${labelTag}`,
      };
    }

    if (reportType === 'monthly') {
      const targetMonthDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const start = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth(), 1);
      const end = new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth() + 1, 0);

      const fromStr = formatLocalYMD(start);
      const toStr = formatLocalYMD(end);

      const monthName = targetMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let labelTag = '';
      if (monthOffset === 0) labelTag = ' (This Month)';
      else if (monthOffset === -1) labelTag = ' (Last Month)';

      return {
        computedFrom: fromStr,
        computedTo: toStr,
        displayPeriodLabel: `${monthName}${labelTag}`,
      };
    }

    // Custom
    return {
      computedFrom: customStart,
      computedTo: customEnd,
      displayPeriodLabel: formatRangeString(customStart, customEnd),
    };
  }, [reportType, weekOffset, monthOffset, customStart, customEnd]);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFetchError('');
    try {
      const queryParams = new URLSearchParams({
        type: reportType,
        fromDate: computedFrom,
        toDate: computedTo,
      });

      const res = await fetch(`/api/reports?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

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
  }, [session, reportType, computedFrom, computedTo]);

  useEffect(() => {
    if (session) fetchReport();
  }, [session, fetchReport]);

  // Next / Prev navigation handlers
  const handlePrevPeriod = () => {
    if (reportType === 'weekly') {
      setWeekOffset(prev => prev - 1);
    } else if (reportType === 'monthly') {
      setMonthOffset(prev => prev - 1);
    } else {
      // Shift custom by 7 days back
      const s = new Date(customStart + 'T00:00:00');
      const e = new Date(customEnd + 'T00:00:00');
      s.setDate(s.getDate() - 7);
      e.setDate(e.getDate() - 7);
      setCustomStart(formatLocalYMD(s));
      setCustomEnd(formatLocalYMD(e));
    }
  };

  const handleNextPeriod = () => {
    if (reportType === 'weekly') {
      if (weekOffset < 0) setWeekOffset(prev => prev + 1);
    } else if (reportType === 'monthly') {
      if (monthOffset < 0) setMonthOffset(prev => prev + 1);
    } else {
      const s = new Date(customStart + 'T00:00:00');
      const e = new Date(customEnd + 'T00:00:00');
      s.setDate(s.getDate() + 7);
      e.setDate(e.getDate() + 7);
      setCustomStart(formatLocalYMD(s));
      setCustomEnd(formatLocalYMD(e));
    }
  };

  const isNextDisabled = reportType === 'weekly' ? weekOffset >= 0 : reportType === 'monthly' ? monthOffset >= 0 : false;

  // PDF Export
  const exportPDF = async () => {
    if (!data || pdfLoading) return;
    setPdfLoading(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(`HabiZ — ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`, 14, 20);
      doc.setFontSize(11);
      doc.setTextColor(120);
      doc.text(`Period: ${data.fromDate} → ${data.toDate}`, 14, 30);
      doc.text(`Completion Rate: ${data.completionRate}%   |   Total Completions: ${data.totalCompletions} / ${data.totalPossible}`, 14, 38);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 46,
        head: [['Habit', 'Category', 'Completions', 'Period Rate']],
        body: (data.habitStats || []).map(h => [
          h.status === 'paused' ? `${h.name} (Paused)` : h.name,
          h.category,
          h.count,
          `${h.rate || 0}%`
        ]),
        headStyles: { fillColor: [23, 130, 116] },
      });

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY ?? 46) + 10,
        head: [['Goal', 'Target Date', 'Status']],
        body: (data.goals || []).map(g => [g.goal_name, g.target_date, g.status]),
        headStyles: { fillColor: [23, 130, 116] },
      });

      doc.save(`habiz-report-${reportType}-${data.fromDate}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export failed: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // Build daily timeline points for the Area Chart using real API dailyBreakdown
  const trendData = useMemo(() => {
    if (data?.dailyBreakdown && data.dailyBreakdown.length > 0) {
      return data.dailyBreakdown.map(d => ({
        name: d.name,
        label: d.label,
        date: d.date,
        rate: d.rate,
        completed: d.completed,
      }));
    }
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const rate = data?.completionRate || 0;
    return days.map(d => ({ name: d, rate: Math.max(10, Math.round(rate * 0.8)), completed: 0 }));
  }, [data]);

  const activeHabitsCount = data?.habits?.filter(h => h.status !== 'paused').length ?? 0;
  const completionRate = data?.completionRate ?? 0;
  const totalCompletions = data?.totalCompletions ?? 0;

  // Pie chart data
  const pieData = data ? [
    { name: 'Completed', value: data.totalCompletions ?? 0 },
    { name: 'Remaining', value: Math.max(0, (data.totalPossible ?? 0) - (data.totalCompletions ?? 0)) },
  ] : [];

  const PIE_COLORS = ['#178274', '#1f2c39'];

  // SVG Circular Gauge calculation
  const circleRadius = 48;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - ((completionRate || 0) / 100) * circumference;

  // Fast options for week selection
  const weekPresets = useMemo(() => {
    return [0, -1, -2, -3, -4].map(offset => {
      const target = new Date();
      target.setDate(target.getDate() + (offset * 7));
      const s = new Date(target);
      s.setDate(target.getDate() - target.getDay());
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      const title = offset === 0 ? 'This Week' : offset === -1 ? 'Last Week' : `${Math.abs(offset)} Weeks Ago`;
      return {
        offset,
        title,
        dates: `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      };
    });
  }, []);

  // Fast options for month selection
  const monthPresets = useMemo(() => {
    return [0, -1, -2, -3, -4, -5].map(offset => {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const title = offset === 0 ? 'This Month' : offset === -1 ? 'Last Month' : target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return {
        offset,
        title,
        name: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      };
    });
  }, []);

  return (
    <div className="space-y-6 page-enter pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            See your progress in numbers across weeks, months, and custom terms.
          </p>
        </div>

        {/* Right Controls: Interactive Date Range Selector, Period Tabs, PDF Button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Interactive Date Range Navigator */}
          <div className="relative" ref={dateMenuRef}>
            <div className="inline-flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.08] shadow-xs">
              <button
                type="button"
                onClick={handlePrevPeriod}
                className="p-1.5 hover:bg-white/10 text-slate-300 rounded-xl transition-colors cursor-pointer"
                title={`Previous ${reportType === 'weekly' ? 'Week' : reportType === 'monthly' ? 'Month' : '7 Days'}`}
              >
                <ChevronLeft size={15} />
              </button>

              <button
                type="button"
                onClick={() => setDateMenuOpen(prev => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                title="Click to choose a specific week or month"
              >
                <Calendar size={13} className="text-teal-400" />
                <span className="truncate max-w-[200px] sm:max-w-none">{displayPeriodLabel}</span>
                <ChevronDown size={13} className={`text-slate-400 transition-transform ${dateMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={handleNextPeriod}
                disabled={isNextDisabled}
                className="p-1.5 hover:bg-white/10 text-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                title={`Next ${reportType === 'weekly' ? 'Week' : reportType === 'monthly' ? 'Month' : '7 Days'}`}
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Interactive Dropdown / Date Picker Popover */}
            <AnimatePresence>
              {dateMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-[#0e1620] border border-white/10 shadow-2xl p-4 z-50 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      {reportType === 'weekly' ? 'Select Week' : reportType === 'monthly' ? 'Select Month' : 'Select Range'}
                    </span>
                    <span className="text-[10px] text-teal-400 font-medium">Click to apply</span>
                  </div>

                  {/* 1. WEEK SELECTION DROPDOWN */}
                  {reportType === 'weekly' && (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {weekPresets.map(w => {
                        const isSelected = weekOffset === w.offset;
                        return (
                          <button
                            key={w.offset}
                            type="button"
                            onClick={() => {
                              setWeekOffset(w.offset);
                              setDateMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                              isSelected
                                ? 'bg-teal-500/20 text-teal-200 border border-teal-500/35 font-bold'
                                : 'hover:bg-white/[0.05] text-slate-300 border border-transparent'
                            }`}
                          >
                            <div>
                              <div className="font-semibold text-white">{w.title}</div>
                              <div className="text-[11px] text-slate-400">{w.dates}</div>
                            </div>
                            {isSelected && <Check size={14} className="text-teal-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. MONTH SELECTION DROPDOWN */}
                  {reportType === 'monthly' && (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {monthPresets.map(m => {
                        const isSelected = monthOffset === m.offset;
                        return (
                          <button
                            key={m.offset}
                            type="button"
                            onClick={() => {
                              setMonthOffset(m.offset);
                              setDateMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                              isSelected
                                ? 'bg-teal-500/20 text-teal-200 border border-teal-500/35 font-bold'
                                : 'hover:bg-white/[0.05] text-slate-300 border border-transparent'
                            }`}
                          >
                            <span className="font-semibold text-white">{m.name}</span>
                            {isSelected && <Check size={14} className="text-teal-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. CUSTOM RANGE SELECTION */}
                  {reportType === 'custom' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-slate-400 block font-medium">Start Date</label>
                        <input
                          type="date"
                          value={customStart}
                          max={todayYMD}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500/50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] text-slate-400 block font-medium">End Date</label>
                        <input
                          type="date"
                          value={customEnd}
                          max={todayYMD}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500/50"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setDateMenuOpen(false);
                          fetchReport();
                        }}
                        className="w-full py-2 rounded-xl text-xs font-bold bg-[#178274] hover:bg-[#136c60] text-white transition-colors cursor-pointer"
                      >
                        Apply Date Range
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Period selector: Weekly | Monthly | Custom */}
          <div className="inline-flex p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl relative">
            {[
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'custom', label: 'Custom' },
            ].map((t) => {
              const active = reportType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setReportType(t.id);
                    if (t.id === 'weekly') setWeekOffset(0);
                    if (t.id === 'monthly') setMonthOffset(0);
                    setDateMenuOpen(false);
                  }}
                  className={`relative px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="activeReportPeriod"
                      className="absolute inset-0 bg-[#178274] rounded-lg shadow-xs -z-0"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* PDF Export */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={exportPDF}
            disabled={!data || pdfLoading}
            className="inline-flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Download PDF Summary"
          >
            {pdfLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download size={13} className="text-teal-400" />
            )}
            <span>PDF</span>
          </motion.button>
        </div>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-950/40 border border-red-900/60 rounded-2xl">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); fetchReport(); }}
            className="flex items-center gap-1.5 text-xs font-medium text-teal-400 hover:underline"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <HabizLoader size="lg" text="Loading reports & analytics..." />
      ) : (
        <div className="space-y-6">
          {/* ── Top Hero: Habit Completion Rate Panel ── */}
          <div className="habiz-panel p-6 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-10 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              {/* Left Column: Title + Circular Ring + Percentage + Trend Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 lg:max-w-xs flex-shrink-0">
                {/* SVG Ring Gauge */}
                <div className="relative w-32 h-32 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r={circleRadius}
                      stroke="rgba(255, 255, 255, 0.06)"
                      strokeWidth="10"
                      fill="transparent"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r={circleRadius}
                      stroke="url(#reportTealGrad)"
                      strokeWidth="10"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient id="reportTealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#178274" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-black text-white tracking-tight">
                      {completionRate}%
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-extrabold text-white tracking-tight">
                    Habit Completion Rate
                  </h3>
                  <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/25">
                    <TrendingUp size={13} className="text-teal-400" />
                    <span>{displayPeriodLabel}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {data?.totalCompletions || 0} of {data?.totalPossible || 0} completions achieved in this period ({data?.daysCount || 7} days).
                  </p>
                </div>
              </div>

              {/* Right Column: Real Daily Timeline Area Chart */}
              <div className="flex-1 w-full h-44 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#178274" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#178274" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      stroke="#485968"
                      tick={{ fill: '#8899a8', fontSize: 11, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#485968"
                      tick={{ fill: '#8899a8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          return (
                            <div className="bg-[#0c131c] border border-white/10 rounded-xl p-2.5 text-xs text-white shadow-xl">
                              <p className="font-bold text-teal-300">{item.label || item.name}</p>
                              <p className="text-slate-300 mt-1">Rate: <span className="font-semibold">{item.rate}%</span></p>
                              {item.completed !== undefined && (
                                <p className="text-slate-400 text-[11px]">{item.completed} completed</p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="rate"
                      stroke="#2dd4bf"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#curveGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── 3 Summary Metric Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Total Habits */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="habiz-panel p-5 rounded-2xl flex items-center gap-4 cursor-default"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0">
                <Layers size={22} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Total Habits</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-white">{activeHabitsCount}</span>
                  <span className="text-xs font-semibold text-teal-400">Active</span>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Completed */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="habiz-panel p-5 rounded-2xl flex items-center gap-4 cursor-default"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Completed</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-white">{totalCompletions}</span>
                  <span className="text-xs text-slate-400 capitalize">in this period</span>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Days Tracked */}
            <motion.div
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className="habiz-panel p-5 rounded-2xl flex items-center gap-4 cursor-default"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <Clock size={22} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Period Length</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-2xl font-black text-white">{data?.daysCount || 7}</span>
                  <span className="text-xs font-medium text-amber-400 flex items-center gap-1">
                    days analyzed
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Habit Performance Bar Chart & Completion Overview ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Habit Performance Bar Chart */}
            <div className="habiz-panel p-6 rounded-3xl">
              <h2 className="text-sm font-bold text-white tracking-tight mb-4 flex items-center justify-between">
                <span>Habit Breakdown</span>
                <span className="text-xs text-slate-400 font-normal">Check-ins count in period</span>
              </h2>
              {(data?.habitStats || []).length > 0 ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.habitStats} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#8899a8' }}
                        angle={-15}
                        textAnchor="end"
                        stroke="#223242"
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8899a8' }} stroke="#223242" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0c131c',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#178274" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex items-center justify-center text-slate-400 text-xs">
                  No habit data recorded for this period
                </div>
              )}
            </div>

            {/* Completion Pie Overview */}
            <div className="habiz-panel p-6 rounded-3xl">
              <h2 className="text-sm font-bold text-white tracking-tight mb-4">
                Completion Ratio
              </h2>
              {data?.totalPossible > 0 ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: '12px', color: '#8899a8' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0c131c',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex items-center justify-center text-slate-400 text-xs">
                  No completion data recorded for this period
                </div>
              )}
            </div>
          </div>

          {/* ── Goals Achievement Table ── */}
          <div className="habiz-panel rounded-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Target size={16} className="text-teal-400" />
                <span>Goal Achievement</span>
              </h2>
              <span className="text-xs text-slate-400">
                {(data?.goals || []).length} Goals Tracked
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white/[0.02] border-b border-white/[0.04]">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Goal</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Target Date</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {(data?.goals || []).map((g) => (
                    <tr key={g.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3.5 font-medium text-slate-200 text-xs sm:text-sm">
                        {g.goal_name}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-400">
                        {formatDate(g.target_date)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          g.status === 'Completed'
                            ? 'bg-teal-500/15 text-teal-300 border border-teal-500/25'
                            : g.status === 'In Progress'
                            ? 'bg-sky-500/15 text-sky-300 border border-sky-500/25'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                        }`}>
                          {g.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(data?.goals || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-xs">
                        No goals found for this account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
