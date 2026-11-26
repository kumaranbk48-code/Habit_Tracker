package com.habiz.app.alarm

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * BroadcastReceiver for handling Snooze and Dismiss actions from
 * notifications and the full-screen AlarmActivity.
 */
class AlarmActionReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "HABIZ_ALARM"
        const val ACTION_SNOOZE = "com.habiz.app.ACTION_SNOOZE"
        const val ACTION_DISMISS = "com.habiz.app.ACTION_DISMISS"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val id = intent.getIntExtra("id", 0)
        val title = intent.getStringExtra("title") ?: "🚨 Habit Alarm"
        val body = intent.getStringExtra("body") ?: "Time for your habit!"
        val scheduledTime = intent.getLongExtra("scheduledTime", 0L)
        val reminderId = intent.getStringExtra("reminderId") ?: ""
        val habitId = intent.getStringExtra("habitId") ?: ""
        val targetType = intent.getStringExtra("targetType") ?: "habit"

        Log.i(TAG, "[ACTION] Received action=$action for alarm id=$id (reminderId='$reminderId', habitId='$habitId')")

        // 1. Remove from activeAlarms synchronously and inform AlarmService to stop audio/vibration
        AlarmService.removeAlarm(id, habitId)
        try {
            val stopIntent = Intent(context, AlarmService::class.java).apply {
                this.action = AlarmService.ACTION_STOP
                putExtra("id", id)
                putExtra("habitId", habitId)
            }
            context.startService(stopIntent)
        } catch (e: Exception) {
            Log.w(TAG, "[ACTION] Error updating AlarmService: ${e.message}")
        }

        // 2. Remove notification for this id from status bar
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (id > 0) {
                notificationManager.cancel(id)
            }
        } catch (e: Exception) {
            Log.w(TAG, "[ACTION] Error cancelling notification: ${e.message}")
        }

        val now = System.currentTimeMillis()
        val refTime = if (scheduledTime > 0L) scheduledTime else now
        val todayDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
        val occMinute = SimpleDateFormat("HH:mm", Locale.US).format(Date(refTime))

        when (action) {
            ACTION_SNOOZE -> {
                val snoozeTime = now + 10 * 60 * 1000L // 10 minutes
                val snoozeId = NativeAlarmScheduler.hashStringToId("snooze_${reminderId.ifEmpty { habitId }}_${id}_$snoozeTime")

                NativeAlarmScheduler.scheduleAlarm(
                    context = context,
                    id = snoozeId,
                    triggerTimeMillis = snoozeTime,
                    title = title,
                    body = if (body.startsWith("⏰ Snoozed:")) body else "⏰ Snoozed: $body",
                    reminderId = reminderId,
                    habitId = habitId,
                    targetType = targetType,
                    isSnooze = true
                )

                NativeAlarmScheduler.addPendingAction(
                    context = context,
                    type = "snooze",
                    habitId = habitId,
                    reminderId = reminderId,
                    targetType = targetType,
                    date = todayDate,
                    occurrenceMinute = occMinute,
                    timestamp = now
                )

                NativeAlarmScheduler.recordSnoozed(context, id, reminderId, habitId, snoozeTime)
                NativeAlarmSchedulerPlugin.notifySnoozed(id, reminderId, habitId, snoozeTime)

                Log.i(
                    TAG,
                    "[SNOOZE] Alarm id=$id snoozed for 10 minutes (new id=$snoozeId at ${Date(snoozeTime)})"
                )
            }

            ACTION_DISMISS -> {
                // CHECK B: Save completion and cancel any active snooze for this entity
                NativeAlarmScheduler.saveCompletedEntity(context, targetType, habitId, todayDate)
                NativeAlarmScheduler.addPendingAction(
                    context = context,
                    type = "complete",
                    habitId = habitId,
                    reminderId = reminderId,
                    targetType = targetType,
                    date = todayDate,
                    occurrenceMinute = occMinute,
                    timestamp = now
                )
                NativeAlarmScheduler.cancelSnoozeForEntity(context, habitId, reminderId)

                NativeAlarmScheduler.recordDismissed(context, id, reminderId, habitId)
                NativeAlarmSchedulerPlugin.notifyDismissed(id, reminderId, habitId)
                NativeAlarmSchedulerPlugin.notifyCompleted(id, reminderId, habitId, targetType)

                Log.i(TAG, "[DISMISS] Alarm id=$id marked done & completed: entityId='$habitId' ($targetType)")
            }
        }
    }
}

