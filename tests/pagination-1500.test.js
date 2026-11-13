import test from 'node:test';
import assert from 'node:assert/strict';
import supabase from '../api/_routes/db-client.js';
import dashboardHandler from '../api/_routes/dashboard.js';
import heatmapHandler from '../api/_routes/heatmap.js';
import reportsHandler from '../api/_routes/reports.js';
import trackingHandler from '../api/_routes/tracking.js';
import { fetchAllPaginated } from '../src/lib/fetchAllPages.js';

function createMockRes() {
  const headers = {};
  return {
    statusCode: 0,
    body: null,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    end() { return this; },
    get rawHeaders() { return headers; },
  };
}

function formatUtcYmd(daysAgo) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Installs a Supabase query mock that enforces PostgREST's 1000-row ceiling
 * whenever `.range()` is omitted (or >1000 rows requested).
 */
function setupPostgrest1500Mock(t) {
  const userId = 'user-1500-test';
  const habits = Array.from({ length: 5 }, (_, i) => ({
    id: `habit-${i + 1}`,
    user_id: userId,
    habit_name: `Habit ${i + 1}`,
    category: 'Health',
    status: 'active',
  }));

  // 300 consecutive days ending today * 5 habits = 1500 tracking rows
  const tracking = [];
  let rowIdx = 1;
  for (let dayOffset = 0; dayOffset < 300; dayOffset++) {
    const dateStr = formatUtcYmd(dayOffset);
    for (const h of habits) {
      tracking.push({
        id: `trk-${String(rowIdx++).padStart(4, '0')}`,
        user_id: userId,
        habit_id: h.id,
        completion_date: dateStr,
        status: true,
      });
    }
  }

  const tables = {
    habits,
    habit_tracking: tracking,
    goals: [],
  };

  t.mock.method(supabase.auth, 'getUser', async () => ({
    data: { user: { id: userId, user_metadata: {} } },
    error: null,
  }));

  t.mock.method(supabase, 'from', (table) => {
    const eqFilters = [];
    const inFilters = [];
    let gteFilter = null;
    let lteFilter = null;
    const orders = [];
    let rangeWindow = null;
    let wantCount = false;

    function run() {
      let rows = [...(tables[table] || [])];

      for (const [col, val] of eqFilters) {
        rows = rows.filter((r) => r[col] === val);
      }
      for (const [col, vals] of inFilters) {
        rows = rows.filter((r) => vals.includes(r[col]));
      }
      if (gteFilter) {
        const [col, val] = gteFilter;
        rows = rows.filter((r) => r[col] >= val);
      }
      if (lteFilter) {
        const [col, val] = lteFilter;
        rows = rows.filter((r) => r[col] <= val);
      }
      if (orders.length > 0) {
        rows.sort((a, b) => {
          for (const [col, asc] of orders) {
            if (a[col] < b[col]) return asc ? -1 : 1;
            if (a[col] > b[col]) return asc ? 1 : -1;
          }
          return 0;
        });
      }

      const totalCount = wantCount ? rows.length : null;
      if (rangeWindow) {
        const [from, to] = rangeWindow;
        const cappedEnd = Math.min(to, from + 999);
        rows = rows.slice(from, cappedEnd + 1);
      } else {
        // PostgREST default max-rows = 1000 when .range() is omitted
        rows = rows.slice(0, 1000);
      }

      return { data: rows, error: null, count: totalCount };
    }

    const chain = {
      select(_cols, opts) {
        if (opts?.count === 'exact') wantCount = true;
        return chain;
      },
      eq(col, val) { eqFilters.push([col, val]); return chain; },
      in(col, vals) { inFilters.push([col, vals]); return chain; },
      gte(col, val) { gteFilter = [col, val]; return chain; },
      lte(col, val) { lteFilter = [col, val]; return chain; },
      order(col, opts = {}) { orders.push([col, opts.ascending !== false]); return chain; },
      range(from, to) { rangeWindow = [from, to]; return chain; },
      limit(n) { rangeWindow = [0, Math.min(n, 1000) - 1]; return chain; },
      then(resolve, reject) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return chain;
  });

  return { tracking, oldestDate: formatUtcYmd(299), newestDate: formatUtcYmd(0) };
}

test('G-08 pagination handles 1500 tracking rows without silent 1000-row truncation', async (t) => {
  const { oldestDate, newestDate } = setupPostgrest1500Mock(t);

  // 1. Streaks & totals via /api/dashboard
  {
    const res = createMockRes();
    await dashboardHandler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      query: {},
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.totalAllTimeCompletions, 1500);
    assert.equal(res.body.currentStreak, 300);
    assert.equal(res.body.longestStreak, 300);
    assert.equal(res.body.perfectDayCount, 300);
    assert.equal(res.body.totalConsistencyDays, 300);
  }

  // 2. Heatmap via /api/heatmap (all 300 days = 1500 completions)
  {
    const res = createMockRes();
    await heatmapHandler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      query: {},
    }, res);

    assert.equal(res.statusCode, 200);
    const days = Object.values(res.body.data);
    const totalHeatmapCompletions = days.reduce((sum, d) => sum + d.completed, 0);
    assert.equal(days.length, 300);
    assert.equal(totalHeatmapCompletions, 1500);
  }

  // 3. Reports via /api/reports over custom 300-day range
  {
    const res = createMockRes();
    await reportsHandler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token', 'x-timezone': 'UTC' },
      query: { type: 'custom', fromDate: oldestDate, toDate: newestDate },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.totalCompletions, 1500);
    const statSum = res.body.habitStats.reduce((sum, h) => sum + h.count, 0);
    assert.equal(statSum, 1500);
  }

  // 4. Calendar client helper + /api/tracking endpoint (1000-row page cap -> 2 pages = 1500 rows)
  {
    const mockFetch = async (url, init = {}) => {
      const parsed = new URL(url, 'https://habit-tracker-phi-six-20.vercel.app');
      const req = {
        method: 'GET',
        headers: { authorization: init?.headers?.Authorization || 'Bearer test-token' },
        query: Object.fromEntries(parsed.searchParams.entries()),
      };
      const res = createMockRes();
      await trackingHandler(req, res);
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: {
          get(name) { return res.getHeader(name) ?? null; },
        },
        async json() { return res.body; },
      };
    };

    // Single unpaged GET defaults to 1000
    const singlePageRes = await mockFetch('/api/tracking');
    const singlePageRows = await singlePageRes.json();
    assert.equal(singlePageRows.length, 1000);
    assert.equal(singlePageRes.headers.get('X-Total-Count'), '1500');

    // fetchAllPaginated (used by CalendarPage & Dashboard) collects all 1500 unique rows
    const full = await fetchAllPaginated('/api/tracking', {}, mockFetch);
    assert.equal(full.ok, true);
    assert.equal(full.data.length, 1500);
    assert.equal(new Set(full.data.map((r) => r.id)).size, 1500);
  }
});

