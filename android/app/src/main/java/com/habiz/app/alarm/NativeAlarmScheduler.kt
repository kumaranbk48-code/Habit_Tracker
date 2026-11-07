package com.habiz.app.alarm

import android.app.AlarmManager
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
    private const val KEY_COMPLETED_GOALS = "completed_goals_set"
    private const val KEY_COMPLETED_LEARNING = "completed_learning_set"

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
     * Record completion of an entity and immediately cancel any pending snooze alarms for it.
     */
    fun saveCompletedEntity(context: Context, targetType: String, entityId: String, dateStr: String) {
        if (entityId.isEmpty()) return
        val prefs = getPrefs(context)
        val editor = prefs.edit()
        val type = (if (targetType.isEmpty()) "habit" else targetType).lowercase()

        when (type) {
            "habit" -> {
                val habitsSet = prefs.getStringSet(KEY_COMPLETED_HABITS, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                habitsSet.add("$entityId:$dateStr")
                editor.putStringSet(KEY_COMPLETED_HABITS, habitsSet)
            }
            "goal" -> {
                val goalsSet = prefs.getStringSet(KEY_COMPLETED_GOALS, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                goalsSet.add(entityId)
                editor.putStringSet(KEY_COMPLETED_GOALS, goalsSet)
            }
            "learning_journey", "learning_topic", "learning" -> {
                val learnSet = prefs.getStringSet(KEY_COMPLETED_LEARNING, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                learnSet.add(entityId)
                editor.putStringSet(KEY_COMPLETED_LEARNING, learnSet)
            }
        }
        editor.apply()
        Log.i(TAG, "[COMPLETION] Recorded completion for $type entityId='$entityId' date='$dateStr'")

        // CHECK B: Immediately cancel any active snooze alarms for this entity
        cancelSnoozeForEntity(context, entityId, "")
    }

    /**
     * Record uncompletion (undo) of an entity.
     */
    fun removeCompletedEntity(context: Context, targetType: String, entityId: String, dateStr: String) {
        if (entityId.isEmpty()) return
        val prefs = getPrefs(context)
        val editor = prefs.edit()
        val type = (if (targetType.isEmpty()) "habit" else targetType).lowercase()

        when (type) {
            "habit" -> {
                val habitsSet = prefs.getStringSet(KEY_COMPLETED_HABITS, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                habitsSet.remove("$entityId:$dateStr")
                editor.putStringSet(KEY_COMPLETED_HABITS, habitsSet)
            }
            "goal" -> {
                val goalsSet = prefs.getStringSet(KEY_COMPLETED_GOALS, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                goalsSet.remove(entityId)
                editor.putStringSet(KEY_COMPLETED_GOALS, goalsSet)
            }
            "learning_journey", "learning_topic", "learning" -> {
                val learnSet = prefs.getStringSet(KEY_COMPLETED_LEARNING, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                learnSet.remove(entityId)
                editor.putStringSet(KEY_COMPLETED_LEARNING, learnSet)
            }
        }
        editor.apply()
        Log.i(TAG, "[COMPLETION] Removed completion (undo) for $type entityId='$entityId' date='$dateStr'")
    }

    /**
     * Sync completion states from backend/local cache into native storage for offline Check A support.
     */
    fun syncCompletions(
        context: Context,
        completedHabits: List<String>,
        completedGoals: List<String>,
        completedLearning: List<String>,
        todayDate: String
    ) {
        val prefs = getPrefs(context)
        val editor = prefs.edit()

        // Habits for today
        val currentHabits = prefs.getStringSet(KEY_COMPLETED_HABITS, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
        for (hId in completedHabits) {
            currentHabits.add("$hId:$todayDate")
        }
        editor.putStringSet(KEY_COMPLETED_HABITS, currentHabits)

        // Goals
        editor.putStringSet(KEY_COMPLETED_GOALS, completedGoals.toSet())

        // Learning
        editor.putStringSet(KEY_COMPLETED_LEARNING, completedLearning.toSet())

        editor.apply()
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
        isSnooze: Boolean = false
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
            persistAlarm(context, id, reminderId, habitId, targetType, title, body, triggerTimeMillis, isSnooze)

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
     * Reschedule all upcoming alarms (both recurring and snooze) upon device reboot or package upgrade.
     */
    fun rescheduleAllUpcomingAlarms(context: Context): Int {
        val recurringAlarms = getPersistedRecurringAlarms(context)
        val snoozeAlarms = getPersistedSnoozeAlarms(context)
        val now = System.currentTimeMillis()
        var restoredRecurringCount = 0
        var restoredSnoozeCount = 0

        val validRecurring = JSONArray()
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

        for (i in 0 until recurringAlarms.length()) {
            val item = recurringAlarms.getJSONObject(i)
            val time = item.optLong("time", 0L)
            val id = item.optInt("id", 0)
            val reminderId = item.optString("reminderId", "")
            val habitId = item.optString("habitId", "")
            val targetType = item.optString("targetType", "habit")

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
                    isSnooze = false
                )
                if (ok) {
                    restoredRecurringCount++
                    validRecurring.put(item)
                }
            }
        }
        getPrefs(context).edit().putString(KEY_RECURRING_ALARMS, validRecurring.toString()).apply()

        val validSnooze = JSONArray()
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
                    validSnooze.put(item)
                }
            }
        }
        getPrefs(context).edit().putString(KEY_SNOOZE_ALARMS, validSnooze.toString()).apply()

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
        isSnooze: Boolean = false
    ) {
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

    fun removePersistedAlarmId(context: Context, id: Int) {
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
