import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';
import { getUserTimeZone, getDateInTimeZone } from './date-utils.js';
import {
  getLocalSeasons,
  getLocalSeason,
  saveLocalSeason,
  updateLocalSeason,
  deleteLocalSeason,
} from './seasons-storage.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  try {
    const timeZone = getUserTimeZone(req, user);
    const today = getDateInTimeZone(new Date(), timeZone);

    // ── Helper: Fetch seasons merging Supabase & local storage ───────────────
    async function fetchRawSeasons() {
      let supabaseSeasons = [];
      let supabaseHasTable = false;
      try {
        const { data, error } = await supabase
          .from('seasons')
          .select('*')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          supabaseSeasons = data;
          supabaseHasTable = true;
        }
      } catch (err) {
        console.warn('[/api/seasons] Supabase seasons query skipped:', err?.message);
      }

      const localSeasons = getLocalSeasons(user_id);

      // Merge seasons avoiding duplicates by id
      const seenIds = new Set(supabaseSeasons.map(s => s.id));
      const combined = [...supabaseSeasons];
      for (const ls of localSeasons) {
        if (!seenIds.has(ls.id)) {
          combined.push(ls);
          seenIds.add(ls.id);
        }
      }

      // Sort newest created first
      combined.sort((a, b) => new Date(b.created_at || b.start_date) - new Date(a.created_at || a.start_date));

      return { seasons: combined, supabaseHasTable };
    }

    // ── GET: List seasons, get active season, or get season review ─────────────
    if (req.method === 'GET') {
      const { action, id } = req.query || {};

      // 1. Season Review Handler
      if (action === 'review' && id) {
        let season = null;
        try {
          const { data } = await supabase
            .from('seasons')
            .select('*')
            .eq('id', id)
            .eq('user_id', user_id)
            .single();
          season = data || null;
        } catch {}

        if (!season) {
          season = getLocalSeason(user_id, id);
        }

        if (!season) {
          return res.status(404).json({ error: 'Season not found' });
        }

        // Fetch habits attached to this season
        let seasonHabits = [];
        try {
          const shRes = await supabase
            .from('season_habits')
            .select('habit_id, habits(*)')
            .eq('season_id', season.id)
            .eq('user_id', user_id);
          seasonHabits = shRes.data?.map(r => r.habits).filter(Boolean) || [];
        } catch {}

        if (seasonHabits.length === 0) {
          try {
            const hRes = await supabase
              .from('habits')
              .select('*')
              .eq('user_id', user_id);
            const allHabits = hRes.data || [];
            const activeIds = season.active_habit_ids || season.activeHabitIds || [];
            if (activeIds.length > 0) {
              seasonHabits = allHabits.filter(h => activeIds.includes(h.id));
            } else {
              seasonHabits = allHabits;
            }
          } catch {}
        }

        const habitIds = seasonHabits.map(h => h.id);
        const startDate = season.start_date;
        const endDate = season.end_date;
        const effectiveEnd = today < endDate ? today : endDate;

        const startD = new Date(startDate + 'T00:00:00');
        const endD = new Date(effectiveEnd + 'T00:00:00');
        const totalDurationDays = Math.max(1, Math.round((new Date(endDate + 'T00:00:00') - startD) / (1000 * 60 * 60 * 24)) + 1);
        const daysElapsed = Math.max(1, Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1);

        let trackingLogs = [];
        if (habitIds.length > 0) {
          try {
            const { data: tData } = await supabase
              .from('habit_tracking')
              .select('*')
              .eq('user_id', user_id)
              .in('habit_id', habitIds)
              .gte('completion_date', startDate)
              .lte('completion_date', effectiveEnd)
              .eq('status', true);
            trackingLogs = tData || [];
          } catch {}
        }

        const completedDates = new Set(trackingLogs.map(t => t.completion_date));
        const daysCompleted = completedDates.size;

        let bestStreak = 0;
        let currentStreak = 0;
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          if (completedDates.has(dateStr)) {
            currentStreak++;
            if (currentStreak > bestStreak) bestStreak = currentStreak;
          } else {
            currentStreak = 0;
          }
        }

        const habitStats = seasonHabits.map(h => {
          const habitLogs = trackingLogs.filter(t => t.habit_id === h.id);
          const completions = habitLogs.length;
          const rate = Math.min(100, Math.round((completions / daysElapsed) * 100));
          const stuck = rate >= 70;
          return {
            id: h.id,
            habit_name: h.habit_name,
            category: h.category,
            color: h.color,
            tracking_type: h.tracking_type,
            target_quantity: h.target_quantity,
            unit: h.unit,
            completions,
            expectedDays: daysElapsed,
            rate,
            stuck,
          };
        });

        const stuckCount = habitStats.filter(h => h.stuck).length;
        const totalPossibleCompletions = seasonHabits.length * daysElapsed;
        const overallRate = totalPossibleCompletions > 0
          ? Math.round((trackingLogs.length / totalPossibleCompletions) * 100)
          : 0;

        let encouragingMessage = "Great job investing in your focus term! Every day counted toward building momentum.";
        if (overallRate >= 80) {
          encouragingMessage = "Phenomenal dedication this season! You locked down your routines and proved what focused effort achieves.";
        } else if (overallRate >= 60) {
          encouragingMessage = "Strong progress this season! You showed up consistently when it counted most.";
        } else if (daysCompleted > 0) {
          encouragingMessage = "Every step counts. You built valuable repetitions this season — carry that forward into your next chapter!";
        }

        return res.status(200).json({
          season,
          totalDurationDays,
          daysElapsed,
          daysCompleted,
          bestStreak,
          overallRate,
          stuckCount,
          habitStats,
          encouragingMessage,
        });
      }

      // 2. Normal List / Active Season Query
      const { seasons: seasonsData, supabaseHasTable } = await fetchRawSeasons();

      // Check for seasons whose end_date has naturally expired: auto-mark as 'ended'
      for (const s of seasonsData) {
        if (s.status === 'active' && today > s.end_date) {
          s.status = 'ended';
          updateLocalSeason(user_id, s.id, { status: 'ended' });
          if (supabaseHasTable) {
            supabase
              .from('seasons')
              .update({ status: 'ended', updated_at: new Date().toISOString() })
              .eq('id', s.id)
              .eq('user_id', user_id)
              .then(() => {})
              .catch(() => {});
          }
        }
      }

      // Enrich each season with day calculations
      const enrichedSeasons = seasonsData.map(s => {
        const startD = new Date(s.start_date + 'T00:00:00');
        const endD = new Date(s.end_date + 'T00:00:00');
        const nowD = new Date(today + 'T00:00:00');
        const totalDays = Math.max(1, Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1);
        const dayNumber = Math.max(1, Math.min(totalDays, Math.round((nowD - startD) / (1000 * 60 * 60 * 24)) + 1));
        const progressPct = Math.min(100, Math.round((dayNumber / totalDays) * 100));
        const isEndedByDate = today > s.end_date;
        return {
          ...s,
          totalDays,
          dayNumber,
          progressPct,
          isEndedByDate,
          activeHabitIds: s.active_habit_ids || s.activeHabitIds || [],
        };
      });

      // Strict segregation:
      // Active seasons = status === 'active' and not ended by date
      // Past seasons = status === 'ended' or ended by date
      const activeSeasons = enrichedSeasons.filter(s => s.status === 'active');
      const pastSeasons = enrichedSeasons.filter(s => s.status === 'ended');
      let activeSeason = activeSeasons[0] || null;

      // Ensure activeSeason has activeHabitIds populated
      if (activeSeason && (!activeSeason.activeHabitIds || activeSeason.activeHabitIds.length === 0)) {
        try {
          const { data: shData } = await supabase
            .from('season_habits')
            .select('habit_id')
            .eq('season_id', activeSeason.id)
            .eq('user_id', user_id);
          const habitIds = (shData || []).map(r => r.habit_id);
          if (habitIds.length > 0) {
            activeSeason.activeHabitIds = habitIds;
          }
        } catch {}
      }

      return res.status(200).json({
        activeSeason,
        activeSeasons,
        pastSeasons,
        seasons: enrichedSeasons,
      });
    }

    // ── POST: Create a new Season ─────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, description, start_date, end_date, active_habit_ids = [] } = req.body || {};

      if (!name?.trim()) {
        return res.status(400).json({ error: 'Season name is required' });
      }
      if (!start_date || !end_date) {
        return res.status(400).json({ error: 'Start date and end date are required' });
      }
      if (start_date > end_date) {
        return res.status(400).json({ error: 'Start date cannot be after end date' });
      }

      const activeIds = Array.isArray(active_habit_ids) ? active_habit_ids : [];

      let createdSeason = null;

      // 1. Try Supabase insert first
      try {
        const { data, error } = await supabase
          .from('seasons')
          .insert({
            user_id,
            name: name.trim(),
            description: description?.trim() || null,
            start_date,
            end_date,
            status: 'active',
          })
          .select()
          .single();

        if (!error && data) {
          createdSeason = data;
        } else if (error) {
          console.warn('[/api/seasons] Supabase insert error, falling back to local store:', error.message);
        }
      } catch (err) {
        console.warn('[/api/seasons] Supabase insert exception, falling back:', err?.message);
      }

      // 2. If Supabase table missing or errored, save to local persistent store
      if (!createdSeason) {
        createdSeason = saveLocalSeason(user_id, {
          name: name.trim(),
          description: description?.trim() || null,
          start_date,
          end_date,
          status: 'active',
          active_habit_ids: activeIds,
        });
      } else {
        // Also persist copy locally to guarantee 100% data durability
        saveLocalSeason(user_id, {
          id: createdSeason.id,
          name: createdSeason.name,
          description: createdSeason.description,
          start_date: createdSeason.start_date,
          end_date: createdSeason.end_date,
          status: createdSeason.status,
          active_habit_ids: activeIds,
          created_at: createdSeason.created_at,
        });
      }

      // 3. Best-effort insert into season_habits table if table exists
      if (activeIds.length > 0) {
        const seasonHabitsRows = activeIds.map(hId => ({
          user_id,
          season_id: createdSeason.id,
          habit_id: hId,
        }));
        try {
          await supabase.from('season_habits').insert(seasonHabitsRows);
        } catch {}
      }

      // 4. Best-effort update habits status & season_id
      if (activeIds.length > 0) {
        try {
          const { data: allUserHabits } = await supabase
            .from('habits')
            .select('id')
            .eq('user_id', user_id);

          const activeSet = new Set(activeIds);
          const unchosenIds = (allUserHabits || [])
            .map(h => h.id)
            .filter(hId => !activeSet.has(hId));

          // Try updating status on habits (silently ignore if column doesn't exist)
          await supabase
            .from('habits')
            .update({ status: 'active', season_id: createdSeason.id })
            .eq('user_id', user_id)
            .in('id', activeIds);

          if (unchosenIds.length > 0) {
            await supabase
              .from('habits')
              .update({ status: 'paused', season_id: null })
              .eq('user_id', user_id)
              .in('id', unchosenIds);
          }
        } catch {}
      }

      return res.status(201).json({
        season: createdSeason,
        activeHabitIds: activeIds,
      });
    }

    // ── PUT: Update Season, End Season, or Toggle Habit Status ────────────────
    if (req.method === 'PUT') {
      const { action, id, name, description, start_date, end_date, active_habit_ids, habit_id, status } = req.body || {};

      // Action 1: Toggle single habit status (active <-> paused)
      if (action === 'toggle_habit' && habit_id) {
        const newStatus = status === 'active' ? 'active' : 'paused';
        try {
          await supabase
            .from('habits')
            .update({ status: newStatus })
            .eq('id', habit_id)
            .eq('user_id', user_id);
        } catch {}
        return res.status(200).json({ ok: true, habit_id, status: newStatus });
      }

      // Action 2: End Season (Move from Current/Active to Past/Ended)
      if (action === 'end_season' && id) {
        // Update local store
        const updatedLocal = updateLocalSeason(user_id, id, { status: 'ended' });

        // Update Supabase if table exists
        let supabaseSeason = null;
        try {
          const { data } = await supabase
            .from('seasons')
            .update({ status: 'ended', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', user_id)
            .select()
            .single();
          supabaseSeason = data;
        } catch {}

        // Resume habits
        try {
          await supabase
            .from('habits')
            .update({ status: 'active', season_id: null })
            .eq('user_id', user_id)
            .eq('season_id', id);
        } catch {}

        return res.status(200).json({ season: supabaseSeason || updatedLocal || { id, status: 'ended' } });
      }

      // Action 3: Update Active Habits for Season
      if (action === 'update_habits' && id) {
        const activeIds = Array.isArray(active_habit_ids) ? active_habit_ids : [];

        updateLocalSeason(user_id, id, { active_habit_ids: activeIds });

        try {
          await supabase.from('season_habits').delete().eq('season_id', id).eq('user_id', user_id);
          if (activeIds.length > 0) {
            const rows = activeIds.map(hId => ({
              user_id,
              season_id: id,
              habit_id: hId,
            }));
            await supabase.from('season_habits').insert(rows);

            const { data: allUserHabits } = await supabase
              .from('habits')
              .select('id')
              .eq('user_id', user_id);

            const activeSet = new Set(activeIds);
            const unchosenIds = (allUserHabits || [])
              .map(h => h.id)
              .filter(hId => !activeSet.has(hId));

            await supabase
              .from('habits')
              .update({ status: 'active', season_id: id })
              .eq('user_id', user_id)
              .in('id', activeIds);

            if (unchosenIds.length > 0) {
              await supabase
                .from('habits')
                .update({ status: 'paused', season_id: null })
                .eq('user_id', user_id)
                .in('id', unchosenIds);
            }
          }
        } catch {}

        return res.status(200).json({ ok: true, activeHabitIds: activeIds });
      }

      // Action 4: Edit Season metadata
      if (action === 'edit' && id) {
        const updateObj = {
          ...(name?.trim() && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(start_date && { start_date }),
          ...(end_date && { end_date }),
          updated_at: new Date().toISOString(),
        };

        const localUpdated = updateLocalSeason(user_id, id, updateObj);

        let supabaseUpdated = null;
        try {
          const { data } = await supabase
            .from('seasons')
            .update(updateObj)
            .eq('id', id)
            .eq('user_id', user_id)
            .select()
            .single();
          supabaseUpdated = data;
        } catch {}

        return res.status(200).json({ season: supabaseUpdated || localUpdated || { id, ...updateObj } });
      }

      // Action 5: Reactivate an ended/archived season
      if (action === 'reactivate' && id) {
        const localReactivated = updateLocalSeason(user_id, id, { status: 'active' });

        let supabaseReactivated = null;
        try {
          const { data } = await supabase
            .from('seasons')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', user_id)
            .select()
            .single();
          supabaseReactivated = data;
        } catch {}

        return res.status(200).json({ season: supabaseReactivated || localReactivated || { id, status: 'active' } });
      }

      return res.status(400).json({ error: 'Invalid PUT action' });
    }

    // ── DELETE: Delete Season ─────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Season ID is required' });

      // Delete from local store
      deleteLocalSeason(user_id, id);

      // Best effort delete from Supabase
      try {
        await supabase
          .from('season_habits')
          .delete()
          .eq('season_id', id)
          .eq('user_id', user_id);

        await supabase
          .from('habits')
          .update({ status: 'active', season_id: null })
          .eq('season_id', id)
          .eq('user_id', user_id);

        await supabase
          .from('seasons')
          .delete()
          .eq('id', id)
          .eq('user_id', user_id);
      } catch {}

      return res.status(200).json({ ok: true, message: 'Season deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/seasons] unexpected error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
