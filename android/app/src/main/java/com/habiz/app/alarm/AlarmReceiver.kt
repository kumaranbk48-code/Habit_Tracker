package com.habiz.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native BroadcastReceiver triggered directly by AlarmManager at the scheduled alarm time.
 * Evaluates Check A (completion verification) before starting alarm audio, vibration,
 * overlay/activity launch, and always-on FSI notification fallback.
 * Schedules the next occurrence independently so failures in one launch step never skip
 * future occurrences or prevent fallback steps.
 */
class AlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "HABIZ_ALARM"
        const val ACTION_ALARM_TRIGGER = "com.habiz.app.ALARM_TRIGGER"
    }

    override fun onReceive(context: Context, intent: Intent) {
        var receiverWakeLock: PowerManager.WakeLock? = null
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            receiverWakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "HabitTracker:AlarmReceiverWakeLock"
            ).apply {
                acquire(30_000L)
            }
            NativeAlarmScheduler.logDiag(context, "wakelock", "acquired_30s")
        } catch (e: Exception) {
            Log.w(TAG, "[RECEIVER] WakeLock acquire error (${e.javaClass.simpleName}): ${e.message}")
            NativeAlarmScheduler.logDiag(context, "wakelock", "error=${e.javaClass.simpleName}:${e.message}")
        }

        try {
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
            NativeAlarmScheduler.logDiag(
                context,
                "receiver_fired",
                "id=$id reminderId=$reminderId type=$targetType entityId=$habitId latencyMs=$latencyMs isSnooze=$isSnooze"
            )

            // 1. Identify occurrence date in device local timezone using Locale.US
            val triggerTime = if (scheduledTime > 0) scheduledTime else now
            val occurrenceDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(triggerTime))

            // 2. CHECK A: Verify completion before starting audio, vibration, or screen takeover
            val skipReason = NativeAlarmScheduler.checkEntityCompletedReason(
                context = context,
                targetType = targetType,
                entityId = habitId,
                reminderId = reminderId,
                dateStr = occurrenceDate
            )

            if (skipReason != null) {
                Log.i(
                    TAG,
                    "[CHECK_A_SKIP] 🛑 Alarm id=$id for $targetType entityId='$habitId' on $occurrenceDate skipped ($skipReason)."
                )
                NativeAlarmScheduler.logDiag(
                    context,
                    "check_a_skipped",
                    "id=$id reminderId=$reminderId type=$targetType reason=$skipReason date=$occurrenceDate"
                )
                if (isSnooze) {
                    NativeAlarmScheduler.removePersistedAlarmId(context, id)
                }
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
                return
            }

            // 3. Step A: Start foreground AlarmService independently
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
            var serviceStarted = false
            try {
                ContextCompat.startForegroundService(context, serviceIntent)
                serviceStarted = true
                Log.i(TAG, "[RECEIVER] Started AlarmService as ForegroundService for id=$id")
                NativeAlarmScheduler.logDiag(context, "service_start", "ok id=$id type=$targetType")
            } catch (e: Exception) {
                Log.e(TAG, "[RECEIVER] ForegroundService start failed (${e.javaClass.simpleName}): ${e.message}", e)
                NativeAlarmScheduler.logDiag(context, "service_start", "error=${e.javaClass.simpleName}:${e.message}")
            }

            // 4. Step B: Direct AlarmActivity launch independently
            val activityIntent = AlarmNotificationHelper.buildAlarmActivityIntent(
                context = context,
                id = id,
                title = title,
                body = body,
                scheduledTime = scheduledTime,
                reminderId = reminderId,
                habitId = habitId,
                targetType = targetType,
                isSnooze = isSnooze
            )
            try {
                context.startActivity(activityIntent)
                Log.i(TAG, "[RECEIVER] Launched AlarmActivity directly")
                NativeAlarmScheduler.logDiag(context, "activity_launch_direct", "ok id=$id type=$targetType")
            } catch (e: Exception) {
                Log.w(TAG, "[RECEIVER] Direct activity launch failed (${e.javaClass.simpleName}): ${e.message}")
                NativeAlarmScheduler.logDiag(context, "activity_launch_direct", "error=${e.javaClass.simpleName}:${e.message}")
            }

            // 5. Step C (Always-on fallback if foreground service threw): post FSI notification directly + retry startService
            if (!serviceStarted) {
                try {
                    val fallbackNotif = AlarmNotificationHelper.buildAlarmNotification(
                        context = context,
                        id = id,
                        title = title,
                        body = body,
                        scheduledTime = scheduledTime,
                        reminderId = reminderId,
                        habitId = habitId,
                        targetType = targetType,
                        queueSize = 1
                    )
                    NotificationManagerCompat.from(context).notify(id, fallbackNotif)
                    NativeAlarmScheduler.logDiag(
                        context,
                        "fsi_notification_posted",
                        "source=receiver_fallback id=$id canFsi=${NativeAlarmScheduler.canUseFullScreenIntent(context)} canOverlay=${AlarmNotificationHelper.canShowOverlays(context)} sdk=${Build.VERSION.SDK_INT}"
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "[RECEIVER] Fallback FSI notification post failed (${e.javaClass.simpleName}): ${e.message}")
                    NativeAlarmScheduler.logDiag(context, "fsi_notification_posted", "error=${e.javaClass.simpleName}:${e.message}")
                }

                try {
                    context.startService(serviceIntent)
                    NativeAlarmScheduler.logDiag(context, "service_start_fallback", "ok id=$id")
                } catch (e: Exception) {
                    Log.w(TAG, "[RECEIVER] Fallback startService failed (${e.javaClass.simpleName}): ${e.message}")
                    NativeAlarmScheduler.logDiag(context, "service_start_fallback", "error=${e.javaClass.simpleName}:${e.message}")
                }
            }

            // 6. Always schedule next occurrence for recurring reminders
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
        } finally {
            try {
                if (receiverWakeLock?.isHeld == true) {
                    receiverWakeLock.release()
                }
            } catch (_: Exception) {}
        }
    }
}
