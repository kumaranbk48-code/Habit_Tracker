package com.habiz.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native BroadcastReceiver triggered directly by AlarmManager at the scheduled alarm time.
 * Evaluates Check A (completion verification) before starting any alarm sound, vibration,
 * or full-screen takeover.
 * Automatically schedules the next occurrence natively for recurring reminders so alarms
 * never cease even if the app remains unopened for >7 days.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "HABIZ_ALARM"
        const val ACTION_ALARM_TRIGGER = "com.habiz.app.ALARM_TRIGGER"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", (System.currentTimeMillis() % 100000).toInt())
        val title = intent.getStringExtra("title") ?: "🚨 Habit Alarm"
        val body = intent.getStringExtra("body") ?: "Time for your habit! Protect your streak."
        val scheduledTime = intent.getLongExtra("scheduledTime", 0L)
        val reminderId = intent.getStringExtra("reminderId") ?: ""
        val habitId = intent.getStringExtra("habitId") ?: ""
        val targetType = intent.getStringExtra("targetType") ?: "habit"
        val isSnooze = intent.getBooleanExtra("isSnooze", false)
        val isRecurring = intent.getBooleanExtra("isRecurring", false)
        val timeStr = intent.getStringExtra("timeStr") ?: ""
        val daysOfWeek = intent.getStringExtra("daysOfWeek") ?: ""
        val now = System.currentTimeMillis()
        val latencyMs = if (scheduledTime > 0) now - scheduledTime else 0L

        Log.i(
            TAG,
            "[RECEIVER] AlarmReceiver.onReceive fired! id=$id, type=$targetType, entityId='$habitId', scheduledTime=$scheduledTime (${if (scheduledTime > 0) Date(scheduledTime) else "N/A"}), now=$now, latency=${latencyMs}ms, isSnooze=$isSnooze"
        )

        // 1. Identify occurrence date in device local timezone using Locale.US
        val triggerTime = if (scheduledTime > 0) scheduledTime else now
        val occurrenceDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(triggerTime))

        // 2. Schedule next occurrence ONLY for recurring reminders (one-time reminders never get a next occurrence)
        if (!isSnooze && isRecurring && reminderId.isNotEmpty()) {
            NativeAlarmScheduler.scheduleNextOccurrence(
                context = context,
                reminderId = reminderId,
                habitId = habitId,
                targetType = targetType,
                title = title,
                body = body,
                lastScheduledTime = triggerTime,
                timeStr = timeStr,
                daysOfWeek = daysOfWeek
            )
        }

        // 3. CHECK A: Check completion status BEFORE starting sound, vibration, or full-screen takeover
        val isCompleted = NativeAlarmScheduler.isEntityCompleted(
            context = context,
            targetType = targetType,
            entityId = habitId,
            reminderId = reminderId,
            dateStr = occurrenceDate
        )

        if (isCompleted) {
            Log.i(
                TAG,
                "[CHECK_A_SKIP] 🛑 Alarm id=$id for $targetType entityId='$habitId' on $occurrenceDate is ALREADY COMPLETED. Skipping alarm sound, vibration, and takeover."
            )
            // If this was a one-time snooze alarm, clean it up from persisted storage
            if (isSnooze) {
                NativeAlarmScheduler.removePersistedAlarmId(context, id)
            }
            return
        }

        try {
            // 4. Start foreground AlarmService for continuous audio, vibration, and persistent notification
            val serviceIntent = Intent(context, AlarmService::class.java).apply {
                action = AlarmService.ACTION_START
                putExtra("id", id)
                putExtra("title", title)
                putExtra("body", body)
                putExtra("scheduledTime", scheduledTime)
                putExtra("reminderId", reminderId)
                putExtra("habitId", habitId)
                putExtra("targetType", targetType)
                putExtra("isSnooze", isSnooze)
            }
            ContextCompat.startForegroundService(context, serviceIntent)
            Log.i(TAG, "[RECEIVER] Started AlarmService as ForegroundService for id=$id")

            // 5. Launch full-screen AlarmActivity over lock screen
            val activityIntent = Intent(context, AlarmActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("id", id)
                putExtra("title", title)
                putExtra("body", body)
                putExtra("scheduledTime", scheduledTime)
                putExtra("reminderId", reminderId)
                putExtra("habitId", habitId)
                putExtra("targetType", targetType)
                putExtra("isSnooze", isSnooze)
            }
            try {
                context.startActivity(activityIntent)
                Log.i(TAG, "[RECEIVER] Launched AlarmActivity directly")
            } catch (e: Exception) {
                Log.w(TAG, "[RECEIVER] Direct activity launch prevented by OS; FullScreenIntent in Notification will handle display: ${e.message}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "[RECEIVER_ERROR] Failed to launch alarm service/activity for id=$id", e)
        }
    }
}
