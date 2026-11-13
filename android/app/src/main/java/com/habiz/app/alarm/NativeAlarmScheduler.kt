package com.habiz.app.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.util.Log
import com.habiz.app.MainActivity
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Date
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Dedicated Native Alarm Scheduler using AlarmManager.setAlarmClock().
 *
 * setAlarmClock() informs the Android system and OEM power controllers (such as Vivo's PEM)
 * that this is a critical, user-visible alarm clock event.
 * Under Android CDD, alarms scheduled via setAlarmClock() are immune to cgroup freeze kills
 * and background process deferrals.
 */
object NativeAlarmScheduler {

    const val TAG = "HABIZ_ALARM"
    private const val PREFS_NAME = "habiz_alarm_storage"
    private const val KEY_RECURRING_ALARMS = "active_recurring_alarms"
    private const val KEY_SNOOZE_ALARMS = "active_snooze_alarms"
    private const val KEY_ALARMS_LEGACY = "active_alarms"
    private const val KEY_DISMISSED = "dismissed_alarms"
    private const val KEY_COMPLETED_HABITS = "completed_habits_map"
    private const val COMPLETED_HABITS_RETENTION_DAYS = 7
    private val prefsLock = Any()
    private const val KEY_COMPLETED_GOALS = "completed_goals_set"
    private const val KEY_COMPLETED_LEARNING = "completed_learning_set"

    /**
     * Replicates the exact hashStringToId algorithm from src/lib/nativeNotifications.js
     * Ensures native alarm IDs and JavaScript alarm IDs match 100% deterministically.
     */
    fun hashStringToId(str: String): Int {
        var hash = 0
        for (i in 0 until str.length) {
            hash = ((hash shl 5) - hash) + str[i].code
        }
        return (Math.abs(hash.toLong()) % 2000000000L).toInt() + 1
    }

    /**
     * Check if an activity has already been completed.
     * Habits: checked strictly for the specific occurrence date (YYYY-MM-DD).
     * Goals: checked globally (status Completed or milestones done).
     * Learning Hub / Roadmaps: checked globally (status Completed).
     */
    fun isEntityCompleted(
        context: Context,
        targetType: String,
        entityId: String,
        reminderId: String,
        dateStr: String
    ): Boolean {
        val prefs = getPrefs(context)
        val type = (if (targetType.isEmpty()) "habit" else targetType).lowercase()

        when (type) {
            "habit" -> {
                val habitsSet = prefs.getStringSet(KEY_COMPLETED_HABITS, emptySet()) ?: emptySet()
                if (entityId.isNotEmpty() && habitsSet.contains("$entityId:$dateStr")) return true
                if (reminderId.isNotEmpty() && habitsSet.contains("$reminderId:$dateStr")) return true
                return false
            }
            "goal" -> {
                val goalsSet = prefs.getStringSet(KEY_COMPLETED_GOALS, emptySet()) ?: emptySet()
                if (entityId.isNotEmpty() && goalsSet.contains(entityId)) return true
                if (reminderId.isNotEmpty() && goalsSet.contains(reminderId)) return true
                return false
            }
            "learning_journey", "learning_topic", "learning" -> {
                val learnSet = prefs.getStringSet(KEY_COMPLETED_LEARNING, emptySet()) ?: emptySet()
                if (entityId.isNotEmpty() && learnSet.contains(entityId)) return true
                if (reminderId.isNotEmpty() && learnSet.contains(reminderId)) return true
                return false
            }
            else -> return false
        }
    }

    /**
     * Prune completed-habit entries older than retentionDays (yyyy-MM-dd suffix)
     * so KEY_COMPLETED_HABITS does not grow unbounded over time (G-15).
     */
    private fun pruneCompletedHabits(entries: Set<String>, retentionDays: Int = COMPLETED_HABITS_RETENTION_DAYS): MutableSet<String> {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val cutoffCal = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, -retentionDays)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val cutoffDateStr = dateFormat.format(cutoffCal.time)

        val pruned = mutableSetOf<String>()
        for (entry in entries) {
            val sepIdx = entry.lastIndexOf(':')
            if (sepIdx <= 0 || sepIdx >= entry.length - 1) continue
            val entryDate = entry.substring(sepIdx + 1)
            if (entryDate.length == 10 && entryDate >= cutoffDateStr) {
                pruned.add(entry)
            }
        }
        return pruned
    }

    /**
     * Record completion of an entity and immediately cancel any pending snooze alarms for it.
     */
    fun saveCompletedEntity(context: Context, targetType: String, entityId: String, dateStr: String) {
        if (entityId.isEmpty()) return
        synchronized(prefsLock) {
            val prefs = getPrefs(context)
            val editor = prefs.edit()
            val type = (if (targetType.isEmpty()) "habit" else targetType).lowercase()

            when (type) {
                "habit" -> {
                    val habitsSet = pruneCompletedHabits(prefs.getStringSet(KEY_COMPLETED_HABITS, emptySet()) ?: emptySet())
                    habitsSet.add("$entityId:$dateStr")
                    editor.putStringSet(KEY_COMPLETED_HABITS, habitsSet)
                }
                "goal" -> {
                    val goalsSet = prefs.getStringSet(KEY_COMPLETED_GOALS, emptySet())?.toMutableSet() ?: mutableSetOf()
                    goalsSet.add(entityId)
                    editor.putStringSet(KEY_COMPLETED_GOALS, goalsSet)
                }
                "learning_journey", "learning_topic", "learning" -> {
                    val learnSet = prefs.getStringSet(KEY_COMPLETED_LEARNING, emptySet())?.toMutableSet() ?: mutableSetOf()
                    learnSet.add(entityId)
                    editor.putStringSet(KEY_COMPLETED_LEARNING, learnSet)
                }
            }
            editor.apply()
        }
        Log.i(TAG, "[COMPLETION] Recorded completion for $targetType entityId='$entityId' date='$dateStr'")

        // CHECK B: Immediately cancel any active snooze alarms for this entity
        cancelSnoozeForEntity(context, entityId, "")
    }

    /**
     * Record uncompletion (undo) of an entity.
     */
    fun removeCompletedEntity(context: Context, targetType: String, entityId: String, dateStr: String) {
        if (entityId.isEmpty()) return
        synchronized(prefsLock) {
            val prefs = getPrefs(context)
            val editor = prefs.edit()
            val type = (if (targetType.isEmpty()) "habit" else targetType).lowercase()

            when (type) {
                "habit" -> {
                    val habitsSet = prefs.getStringSet(KEY_COMPLETED_HABITS, emptySet())?.toMutableSet() ?: mutableSetOf()
                    habitsSet.remove("$entityId:$dateStr")
                    editor.putStringSet(KEY_COMPLETED_HABITS, habitsSet)
                }
                "goal" -> {
                    val goalsSet = prefs.getStringSet(KEY_COMPLETED_GOALS, emptySet())?.toMutableSet() ?: mutableSetOf()
                    goalsSet.remove(entityId)
                    editor.putStringSet(KEY_COMPLETED_GOALS, goalsSet)
                }
                "learning_journey", "learning_topic", "learning" -> {
                    val learnSet = prefs.getStringSet(KEY_COMPLETED_LEARNING, emptySet())?.toMutableSet() ?: mutableSetOf()
                    learnSet.remove(entityId)
                    editor.putStringSet(KEY_COMPLETED_LEARNING, learnSet)
                }
            }
            editor.apply()
        }
        Log.i(TAG, "[COMPLETION] Removed completion (undo) for $targetType entityId='$entityId' date='$dateStr'")
    }

    /**
     * Sync completion states from backend/local cache into native storage for offline Check A support.
     * Replaces today's habit completion set so un-completions sync cleanly (G-05).
     */
    fun syncCompletions(
        context: Context,
        completedHabits: List<String>,
        completedGoals: List<String>,
        completedLearning: List<String>,
        todayDate: String
    ) {
        synchronized(prefsLock) {
            val prefs = getPrefs(context)
            val editor = prefs.edit()

            // Prune stale dates and replace all entries for todayDate so un-completions are reflected immediately
            val existingHabits = pruneCompletedHabits(prefs.getStringSet(KEY_COMPLETED_HABITS, emptySet()) ?: emptySet())
            val updatedHabits = existingHabits.filter { !it.endsWith(":$todayDate") }.toMutableSet()
            for (hId in completedHabits) {
                updatedHabits.add("$hId:$todayDate")
            }
            editor.putStringSet(KEY_COMPLETED_HABITS, updatedHabits)

            // Goals
            editor.putStringSet(KEY_COMPLETED_GOALS, completedGoals.toSet())

            // Learning
            editor.putStringSet(KEY_COMPLETED_LEARNING, completedLearning.toSet())

            editor.apply()
        }
        Log.i(
            TAG,
            "[COMPLETION] Synced native completions: ${completedHabits.size} habit(s) on $todayDate, ${completedGoals.size} goal(s), ${completedLearning.size} learning activity(ies)"
        )

        // CHECK B: Ensure any active snooze for a completed item is cancelled
        for (hId in completedHabits) {
            cancelSnoozeForEntity(context, hId, "")
        }
        for (gId in completedGoals) {
            cancelSnoozeForEntity(context, gId, "")
        }
        for (lId in completedLearning) {
            cancelSnoozeForEntity(context, lId, "")
        }
    }

    /**
     * Cancel any active snooze alarm matching an entity ID or reminder ID.
     */
    fun cancelSnoozeForEntity(context: Context, entityId: String, reminderId: String): Int {
        if (entityId.isEmpty() && reminderId.isEmpty()) return 0
        val snoozes = getPersistedSnoozeAlarms(context)
        val remainingSnoozes = JSONArray()
        var cancelledCount = 0

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        for (i in 0 until snoozes.length()) {
            val item = snoozes.getJSONObject(i)
            val hId = item.optString("habitId", "")
            val rId = item.optString("reminderId", "")
            val id = item.getInt("id")

            val matches = (entityId.isNotEmpty() && (hId == entityId || rId == entityId)) ||
                          (reminderId.isNotEmpty() && (rId == reminderId || hId == reminderId))

            if (matches) {
                // Cancel AlarmManager PendingIntent
                val broadcastIntent = Intent(context, AlarmReceiver::class.java).apply {
                    action = AlarmReceiver.ACTION_ALARM_TRIGGER
                    data = Uri.parse("habiz://alarm/$id")
                }
                val pi = PendingIntent.getBroadcast(
                    context,
                    id,
                    broadcastIntent,
                    PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
                )
                if (pi != null) {
                    alarmManager.cancel(pi)
                    pi.cancel()
                }
                cancelledCount++
                Log.i(TAG, "[SNOOZE_CANCEL] Cancelled active snooze alarm id=$id for completed entity='$entityId' / reminder='$reminderId'")
            } else {
                remainingSnoozes.put(item)
            }
        }

        if (cancelledCount > 0) {
            getPrefs(context).edit().putString(KEY_SNOOZE_ALARMS, remainingSnoozes.toString()).apply()
        }
        return cancelledCount
    }

    /**
     * Check if the application is permitted to schedule exact alarms.
     */
    fun canScheduleExactAlarms(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
    }

    /**
     * Check if full-screen intents are allowed on Android 14+ (API 34+).
     */
    fun canUseFullScreenIntent(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.canUseFullScreenIntent()
        } else {
            true
        }
    }

    /**
     * Schedule a high-priority user-facing alarm using AlarmManager.setAlarmClock().
     */
    fun scheduleAlarm(
        context: Context,
        id: Int,
        triggerTimeMillis: Long,
        title: String,
        body: String,
        reminderId: String = "",
        habitId: String = "",
        targetType: String = "habit",
        isSnooze: Boolean = false,
        timeStr: String = "",
        daysOfWeek: String = "",
        isRecurring: Boolean = true
    ): Boolean {
        val now = System.currentTimeMillis()
        if (triggerTimeMillis <= now) {
            Log.w(
                TAG,
                "[SCHEDULE_SKIP] Alarm id=$id is scheduled in the past: triggerTimeMillis=$triggerTimeMillis, now=$now (${now - triggerTimeMillis}ms ago)"
            )
            return false
        }

        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                Log.e(TAG, "[SCHEDULE_ERROR] SCHEDULE_EXACT_ALARM permission not granted by user!")
                return false
            }

            // 1. Dedicated explicit Broadcast Intent for AlarmReceiver
            val broadcastIntent = Intent(context, AlarmReceiver::class.java).apply {
                action = AlarmReceiver.ACTION_ALARM_TRIGGER
                data = Uri.parse("habiz://alarm/$id")
                putExtra("id", id)
                putExtra("title", title)
                putExtra("body", body)
                putExtra("scheduledTime", triggerTimeMillis)
                putExtra("reminderId", reminderId)
                putExtra("habitId", habitId)
                putExtra("targetType", targetType)
                putExtra("isSnooze", isSnooze)
                putExtra("timeStr", timeStr)
                putExtra("daysOfWeek", daysOfWeek)
                putExtra("isRecurring", isRecurring)
            }

            // 2. Dedicated PendingIntent for each alarm (using id as unique requestCode)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                id,
                broadcastIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // 3. PendingIntent for AlarmClockInfo to display when user taps system clock indicator
            val showIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("alarm_id", id)
            }
            val showPendingIntent = PendingIntent.getActivity(
                context,
                id,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // 4. Schedule with setAlarmClock()
            val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerTimeMillis, showPendingIntent)
            alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)

            // 5. Persist alarm details for tracking, cancellation, and reboot restoration
            persistAlarm(context, id, reminderId, habitId, targetType, title, body, triggerTimeMillis, isSnooze, timeStr, daysOfWeek, isRecurring)

            Log.i(
                TAG,
                "[SCHEDULE] AlarmManager.setAlarmClock (${if (isSnooze) "SNOOZE" else "RECURRING"}): id=$id, scheduledTime=${Date(triggerTimeMillis)} ($triggerTimeMillis), in ${(triggerTimeMillis - now) / 1000}s, title='$title'"
            )
            return true
        } catch (e: Exception) {
            Log.e(TAG, "[SCHEDULE_ERROR] Failed to schedule alarm id=$id with setAlarmClock()", e)
            return false
        }
    }

    /**
     * Compute and schedule the next occurrence of a recurring reminder natively.
     * Generates an alarm ID identical to the JavaScript formula (${reminderId}_${year}_${month}_${date}_${timeStr}).
     * Prevents duplicate alarms and evaluates completion suppression for the newly computed occurrence date.
     */
    fun scheduleNextOccurrence(
        context: Context,
        reminderId: String,
        habitId: String,
        targetType: String,
        title: String,
        body: String,
        lastScheduledTime: Long,
        timeStr: String = "",
        daysOfWeek: String = ""
    ): Boolean {
        if (reminderId.isEmpty() && habitId.isEmpty()) return false

        var targetHour = -1
        var targetMinute = -1
        if (timeStr.isNotEmpty() && timeStr.contains(":")) {
            val parts = timeStr.split(":")
            if (parts.size >= 2) {
                targetHour = parts[0].trim().toIntOrNull() ?: -1
                targetMinute = parts[1].trim().toIntOrNull() ?: -1
            }
        }
        if (targetHour == -1 || targetMinute == -1) {
            val prevCal = Calendar.getInstance().apply {
                timeInMillis = if (lastScheduledTime > 0) lastScheduledTime else System.currentTimeMillis()
            }
            targetHour = prevCal.get(Calendar.HOUR_OF_DAY)
            targetMinute = prevCal.get(Calendar.MINUTE)
        }

        val allowedDays = if (daysOfWeek.isNotEmpty()) {
            daysOfWeek.split(",").map { it.trim().lowercase(Locale.ROOT) }.filter { it.isNotEmpty() }
        } else {
            emptyList()
        }
        val isEveryday = allowedDays.isEmpty() || allowedDays.any { it == "everyday" || it == "daily" || it == "all" }

        val shortDayNames = arrayOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
        val now = System.currentTimeMillis()
        var nextTriggerMillis = 0L
        var nextDateStr = ""
        var nextYear = 0
        var nextMonth = 0
        var nextDate = 0

        val occurrence = NextOccurrence.compute(
            currentTimeMillis = now,
            targetHour = targetHour,
            targetMinute = targetMinute,
            daysOfWeek = daysOfWeek,
            includeTodayIfFuture = false
        )

        if (occurrence != null) {
            nextTriggerMillis = occurrence.triggerMillis
            nextDateStr = occurrence.dateStr
            nextYear = occurrence.year
            nextMonth = occurrence.month
            nextDate = occurrence.day
        }

        if (nextTriggerMillis <= now || nextDateStr.isEmpty()) {
            Log.w(TAG, "[NEXT_OCCURRENCE] Could not find next recurrence date for reminderId='$reminderId'")
            return false
        }

        // Check completion suppression for the new occurrence
        if (isEntityCompleted(context, targetType, habitId, reminderId, nextDateStr)) {
            Log.i(TAG, "[NEXT_OCCURRENCE_SKIP] Next occurrence on $nextDateStr for $targetType '$habitId' is already completed.")
            return false
        }

        // Exact formula matching JS: `${reminderId}_${scheduleAt.getFullYear()}_${scheduleAt.getMonth()}_${scheduleAt.getDate()}_${timeStr}`
        val cleanTime = if (timeStr.isNotEmpty()) timeStr else String.format(Locale.US, "%02d:%02d", targetHour, targetMinute)
        val uniqueKey = "${reminderId}_${nextYear}_${nextMonth}_${nextDate}_${cleanTime}"
        val nextId = hashStringToId(uniqueKey)

        // Check if an alarm with nextId is already active in recurring alarms to prevent duplicates
        val activeRecurring = getPersistedRecurringAlarms(context)
        for (i in 0 until activeRecurring.length()) {
            val existing = activeRecurring.getJSONObject(i)
            if (existing.optInt("id") == nextId && existing.optLong("time") > now) {
                Log.i(TAG, "[NEXT_OCCURRENCE_EXISTS] Alarm id=$nextId ($uniqueKey) is already scheduled. Skipping duplicate.")
                return true
            }
        }

        Log.i(TAG, "[NEXT_OCCURRENCE] Scheduling next occurrence: id=$nextId, key=$uniqueKey, date=$nextDateStr, time=${Date(nextTriggerMillis)}")

        return scheduleAlarm(
            context = context,
            id = nextId,
            triggerTimeMillis = nextTriggerMillis,
            title = title,
            body = body,
            reminderId = reminderId,
            habitId = habitId,
            targetType = targetType,
            isSnooze = false,
            timeStr = cleanTime,
            daysOfWeek = daysOfWeek,
            isRecurring = true
        )
    }

    /**
     * Cancel an active alarm by its unique integer id.
     */
    fun cancelAlarm(context: Context, id: Int): Boolean {
        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            val broadcastIntent = Intent(context, AlarmReceiver::class.java).apply {
                action = AlarmReceiver.ACTION_ALARM_TRIGGER
                data = Uri.parse("habiz://alarm/$id")
            }

            val pendingIntent = PendingIntent.getBroadcast(
                context,
                id,
                broadcastIntent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )

            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent)
                pendingIntent.cancel()
                Log.i(TAG, "[CANCEL] Successfully cancelled alarm PendingIntent: id=$id")
            } else {
                Log.d(TAG, "[CANCEL] No active PendingIntent found for alarm id=$id")
            }

            removePersistedAlarmId(context, id)
            return true
        } catch (e: Exception) {
            Log.e(TAG, "[CANCEL_ERROR] Failed to cancel alarm id=$id", e)
            return false
        }
    }

    /**
     * Cancel all alarms associated with a specific reminderId.
     */
    fun cancelByReminderId(context: Context, reminderId: String): Int {
        if (reminderId.isEmpty()) return 0
        val alarms = getPersistedAlarms(context)
        var cancelledCount = 0

        for (i in 0 until alarms.length()) {
            val item = alarms.getJSONObject(i)
            if (item.optString("reminderId") == reminderId) {
                val id = item.getInt("id")
                if (cancelAlarm(context, id)) {
                    cancelledCount++
                }
            }
        }

        Log.i(TAG, "[CANCEL] Cancelled $cancelledCount alarm(s) for reminderId='$reminderId'")
        return cancelledCount
    }

    /**
     * Cancel all scheduled regular recurring alarms in the app.
     * CRITICAL: Active +10 min snooze alarms are stored in a separate partition and are NEVER deleted.
     */
    fun cancelAllAlarms(context: Context): Int {
        val recurringAlarms = getPersistedRecurringAlarms(context)
        val snoozeAlarms = getPersistedSnoozeAlarms(context)
        var cancelledCount = 0

        for (i in 0 until recurringAlarms.length()) {
            val item = recurringAlarms.getJSONObject(i)
            val id = item.getInt("id")
            if (cancelAlarm(context, id)) {
                cancelledCount++
            }
        }

        getPrefs(context).edit().remove(KEY_RECURRING_ALARMS).apply()

        val snoozeIds = mutableListOf<Int>()
        for (i in 0 until snoozeAlarms.length()) {
            snoozeIds.add(snoozeAlarms.getJSONObject(i).getInt("id"))
        }

        Log.i(
            TAG,
            "[CANCEL_ALL] Cancelled $cancelledCount recurring alarm(s). PRESERVED ${snoozeAlarms.length()} active snooze alarm(s): $snoozeIds"
        )
        return cancelledCount
    }

    /**
     * Atomically replace all recurring alarms without a cancel-then-schedule gap (G-06).
     * Schedules new alarms first, then cancels obsolete recurring alarms.
     * Preserves all active snooze alarms.
     */
    fun replaceAllAlarms(context: Context, alarmsArray: JSONArray?): Int {
        synchronized(prefsLock) {
            val previousRecurring = getPersistedRecurringAlarms(context)
            val newIds = mutableSetOf<Int>()
            var scheduledCount = 0

            if (alarmsArray != null) {
                for (i in 0 until alarmsArray.length()) {
                    val obj = alarmsArray.getJSONObject(i)
                    val id = obj.optInt("id", 0)
                    val at = obj.optLong("at", 0L)
                    if (id == 0 || at <= 0L) continue

                    val title = obj.optString("title", "🚨 Habit Alarm")
                    val body = obj.optString("body", "Time for your habit!")
                    val reminderId = obj.optString("reminderId", "")
                    val habitId = obj.optString("habitId", "")
                    val targetType = obj.optString("targetType", "habit")
                    val isSnooze = obj.optBoolean("isSnooze", false)
                    val isRecurring = obj.optBoolean("isRecurring", true)
                    val timeStr = obj.optString("timeStr", "")
                    val daysOfWeek = obj.optString("daysOfWeek", "")

                    newIds.add(id)
                    val ok = scheduleAlarm(
                        context = context,
                        id = id,
                        triggerTimeMillis = at,
                        title = title,
                        body = body,
                        reminderId = reminderId,
                        habitId = habitId,
                        targetType = targetType,
                        isSnooze = isSnooze,
                        timeStr = timeStr,
                        daysOfWeek = daysOfWeek,
                        isRecurring = isRecurring
                    )
                    if (ok) scheduledCount++
                }
            }

            var cancelledStale = 0
            for (i in 0 until previousRecurring.length()) {
                val oldItem = previousRecurring.getJSONObject(i)
                val oldId = oldItem.optInt("id", 0)
                if (oldId != 0 && !newIds.contains(oldId)) {
                    if (cancelAlarm(context, oldId)) {
                        cancelledStale++
                    }
                }
            }

            Log.i(TAG, "[REPLACE_ALL] Atomically scheduled $scheduledCount alarm(s) and cancelled $cancelledStale stale alarm(s).")
            return scheduledCount
        }
    }

    /**
     * Reschedule all upcoming alarms (both recurring and snooze) upon device reboot or package upgrade.
     * Rolls forward any passed recurring alarms to their next occurrence and preserves them in storage.
     */
    fun rescheduleAllUpcomingAlarms(context: Context): Int {
        val recurringAlarms = getPersistedRecurringAlarms(context)
        val snoozeAlarms = getPersistedSnoozeAlarms(context)
        val now = System.currentTimeMillis()
        var restoredRecurringCount = 0
        var restoredSnoozeCount = 0
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

        for (i in 0 until recurringAlarms.length()) {
            val item = recurringAlarms.getJSONObject(i)
            val time = item.optLong("time", 0L)
            val id = item.optInt("id", 0)
            val reminderId = item.optString("reminderId", "")
            val habitId = item.optString("habitId", "")
            val targetType = item.optString("targetType", "habit")
            val timeStr = item.optString("timeStr", "")
            val daysOfWeek = item.optString("daysOfWeek", "")
            val isRecurring = item.optBoolean("isRecurring", false)

            if (time > now && id != 0) {
                val occurrenceDate = dateFormat.format(Date(time))
                if (isEntityCompleted(context, targetType, habitId, reminderId, occurrenceDate)) {
                    Log.i(TAG, "[RESTORE_SKIP] Skipping restore of recurring alarm id=$id for $targetType entityId='$habitId' on $occurrenceDate: already completed.")
                    continue
                }

                val ok = scheduleAlarm(
                    context = context,
                    id = id,
                    triggerTimeMillis = time,
                    title = item.optString("title", "🚨 Habit Alarm"),
                    body = item.optString("body", "Time for your habit!"),
                    reminderId = reminderId,
                    habitId = habitId,
                    targetType = targetType,
                    isSnooze = false,
                    timeStr = timeStr,
                    daysOfWeek = daysOfWeek,
                    isRecurring = isRecurring
                )
                if (ok) {
                    restoredRecurringCount++
                }
            } else if (time <= now && id != 0) {
                // Remove expired occurrence from storage
                removePersistedAlarmId(context, id)

                // If reminder was recurring, schedule next occurrence natively (scheduleAlarm will persist it into storage)
                if (isRecurring) {
                    val ok = scheduleNextOccurrence(
                        context = context,
                        reminderId = reminderId,
                        habitId = habitId,
                        targetType = targetType,
                        title = item.optString("title", "🚨 Habit Alarm"),
                        body = item.optString("body", "Time for your habit!"),
                        lastScheduledTime = time,
                        timeStr = timeStr,
                        daysOfWeek = daysOfWeek
                    )
                    if (ok) {
                        restoredRecurringCount++
                    }
                }
            }
        }

        // Restore active snooze alarms
        for (i in 0 until snoozeAlarms.length()) {
            val item = snoozeAlarms.getJSONObject(i)
            val time = item.optLong("time", 0L)
            val id = item.optInt("id", 0)
            val reminderId = item.optString("reminderId", "")
            val habitId = item.optString("habitId", "")
            val targetType = item.optString("targetType", "habit")

            if (time > now && id != 0) {
                val occurrenceDate = dateFormat.format(Date(time))
                if (isEntityCompleted(context, targetType, habitId, reminderId, occurrenceDate)) {
                    Log.i(TAG, "[RESTORE_SKIP] Skipping restore of snooze alarm id=$id for $targetType entityId='$habitId' on $occurrenceDate: already completed.")
                    continue
                }

                val ok = scheduleAlarm(
                    context = context,
                    id = id,
                    triggerTimeMillis = time,
                    title = item.optString("title", "🚨 Habit Alarm"),
                    body = item.optString("body", "⏰ Snoozed: Time for your habit!"),
                    reminderId = reminderId,
                    habitId = habitId,
                    targetType = targetType,
                    isSnooze = true
                )
                if (ok) {
                    restoredSnoozeCount++
                }
            } else if (time <= now && id != 0) {
                removePersistedAlarmId(context, id)
            }
        }

        Log.i(
            TAG,
            "[RESTORE] Reboot restoration complete: Restored $restoredRecurringCount recurring alarm(s) and $restoredSnoozeCount snooze alarm(s)."
        )
        return restoredRecurringCount + restoredSnoozeCount
    }

    // --- Dismissal and Snooze tracking ---

    fun recordDismissed(context: Context, id: Int, reminderId: String, habitId: String) {
        try {
            val dismissed = getDismissedAlarms(context)
            val obj = JSONObject().apply {
                put("id", id)
                put("reminderId", reminderId)
                put("habitId", habitId)
                put("dismissedAt", System.currentTimeMillis())
            }
            dismissed.put(obj)

            // Keep at most 50 recent dismissed entries
            val trimmed = JSONArray()
            val startIdx = if (dismissed.length() > 50) dismissed.length() - 50 else 0
            for (i in startIdx until dismissed.length()) {
                trimmed.put(dismissed.getJSONObject(i))
            }

            getPrefs(context).edit().putString(KEY_DISMISSED, trimmed.toString()).apply()
            removePersistedAlarmId(context, id)
            Log.i(TAG, "[RECORD] Recorded alarm dismissal: id=$id, reminderId='$reminderId', habitId='$habitId'")
        } catch (e: Exception) {
            Log.w(TAG, "[RECORD_ERROR] Failed to record dismissal: ${e.message}")
        }
    }

    fun recordSnoozed(context: Context, id: Int, reminderId: String, habitId: String, snoozeTime: Long) {
        // Remove the original alarm that just fired
        removePersistedAlarmId(context, id)
    }

    fun getDismissedAlarms(context: Context): JSONArray {
        val raw = getPrefs(context).getString(KEY_DISMISSED, "[]") ?: "[]"
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    // --- Persistence helpers (Separated Partition Architecture) ---

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getPersistedRecurringAlarms(context: Context): JSONArray {
        val raw = getPrefs(context).getString(KEY_RECURRING_ALARMS, null)
        if (raw != null) {
            return try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
        }
        // Legacy migration fallback
        val legacy = getPrefs(context).getString(KEY_ALARMS_LEGACY, "[]") ?: "[]"
        val arr = try { JSONArray(legacy) } catch (e: Exception) { JSONArray() }
        val recurring = JSONArray()
        for (i in 0 until arr.length()) {
            val item = arr.getJSONObject(i)
            if (!item.optBoolean("isSnooze", false) && !item.optString("body", "").startsWith("⏰ Snoozed:")) {
                recurring.put(item)
            }
        }
        return recurring
    }

    fun getPersistedSnoozeAlarms(context: Context): JSONArray {
        val raw = getPrefs(context).getString(KEY_SNOOZE_ALARMS, null)
        if (raw != null) {
            return try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
        }
        // Legacy migration fallback
        val legacy = getPrefs(context).getString(KEY_ALARMS_LEGACY, "[]") ?: "[]"
        val arr = try { JSONArray(legacy) } catch (e: Exception) { JSONArray() }
        val snoozes = JSONArray()
        for (i in 0 until arr.length()) {
            val item = arr.getJSONObject(i)
            if (item.optBoolean("isSnooze", false) || item.optString("body", "").startsWith("⏰ Snoozed:")) {
                snoozes.put(item)
            }
        }
        return snoozes
    }

    fun getPersistedAlarms(context: Context): JSONArray {
        val recurring = getPersistedRecurringAlarms(context)
        val snoozes = getPersistedSnoozeAlarms(context)
        val combined = JSONArray()
        for (i in 0 until recurring.length()) combined.put(recurring.getJSONObject(i))
        for (i in 0 until snoozes.length()) combined.put(snoozes.getJSONObject(i))
        return combined
    }

    private fun persistAlarm(
        context: Context,
        id: Int,
        reminderId: String,
        habitId: String,
        targetType: String,
        title: String,
        body: String,
        triggerTimeMillis: Long,
        isSnooze: Boolean = false,
        timeStr: String = "",
        daysOfWeek: String = "",
        isRecurring: Boolean = true
    ) {
        synchronized(prefsLock) {
            val targetKey = if (isSnooze) KEY_SNOOZE_ALARMS else KEY_RECURRING_ALARMS
            val currentList = if (isSnooze) getPersistedSnoozeAlarms(context) else getPersistedRecurringAlarms(context)
            val updated = JSONArray()

            // Remove any existing entry for this id
            for (i in 0 until currentList.length()) {
                val item = currentList.getJSONObject(i)
                if (item.getInt("id") != id) {
                    updated.put(item)
                }
            }

            val newObj = JSONObject().apply {
                put("id", id)
                put("reminderId", reminderId)
                put("habitId", habitId)
                put("targetType", targetType)
                put("title", title)
                put("body", body)
                put("time", triggerTimeMillis)
                put("isSnooze", isSnooze)
                put("timeStr", timeStr)
                put("daysOfWeek", daysOfWeek)
                put("isRecurring", isRecurring)
            }
            updated.put(newObj)

            getPrefs(context).edit().putString(targetKey, updated.toString()).apply()

            // Also clean up from the opposite partition if it existed
            val otherKey = if (isSnooze) KEY_RECURRING_ALARMS else KEY_SNOOZE_ALARMS
            val otherList = if (isSnooze) getPersistedRecurringAlarms(context) else getPersistedSnoozeAlarms(context)
            val cleanedOther = JSONArray()
            var otherModified = false
            for (i in 0 until otherList.length()) {
                val item = otherList.getJSONObject(i)
                if (item.getInt("id") == id) {
                    otherModified = true
                } else {
                    cleanedOther.put(item)
                }
            }
            if (otherModified) {
                getPrefs(context).edit().putString(otherKey, cleanedOther.toString()).apply()
            }
        }
    }

    fun removePersistedAlarmId(context: Context, id: Int) {
        synchronized(prefsLock) {
            // Remove from recurring partition
            val recurring = getPersistedRecurringAlarms(context)
            val updatedRecurring = JSONArray()
            for (i in 0 until recurring.length()) {
                val item = recurring.getJSONObject(i)
                if (item.getInt("id") != id) {
                    updatedRecurring.put(item)
                }
            }
            getPrefs(context).edit().putString(KEY_RECURRING_ALARMS, updatedRecurring.toString()).apply()

            // Remove from snooze partition
            val snoozes = getPersistedSnoozeAlarms(context)
            val updatedSnoozes = JSONArray()
            for (i in 0 until snoozes.length()) {
                val item = snoozes.getJSONObject(i)
                if (item.getInt("id") != id) {
                    updatedSnoozes.put(item)
                }
            }
            getPrefs(context).edit().putString(KEY_SNOOZE_ALARMS, updatedSnoozes.toString()).apply()
        }
    }
}
