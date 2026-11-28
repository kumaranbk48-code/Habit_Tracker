package com.habiz.app.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.habiz.app.R

/**
 * Shared notification channel and NotificationCompat.Builder helper used by both
 * AlarmService and AlarmReceiver's fallback path so there is one canonical implementation.
 */
object AlarmNotificationHelper {
    const val TAG = "HABIZ_ALARM"
    const val CHANNEL_ID = "habiz_alarm_channel"

    fun canShowOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Settings.canDrawOverlays(context)
            } catch (_: Exception) {
                false
            }
        } else {
            true
        }
    }

    fun ensureChannelExists(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (notificationManager.getNotificationChannel(CHANNEL_ID) == null) {
                val soundUri = Uri.parse("android.resource://" + context.packageName + "/" + R.raw.alarm)
                val audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()

                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Habit & Goal Alarms",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "High-priority alarms with sound, vibration, and heads-up banner"
                    setSound(soundUri, audioAttributes)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 250, 500, 250, 500)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                notificationManager.createNotificationChannel(channel)
            }
        }
    }

    fun buildAlarmActivityIntent(
        context: Context,
        id: Int,
        title: String,
        body: String,
        scheduledTime: Long,
        reminderId: String,
        habitId: String,
        targetType: String,
        isSnooze: Boolean = false
    ): Intent {
        return Intent(context, AlarmActivity::class.java).apply {
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
    }

    fun buildAlarmNotification(
        context: Context,
        id: Int,
        title: String,
        body: String,
        scheduledTime: Long,
        reminderId: String,
        habitId: String,
        targetType: String,
        queueSize: Int = 1
    ): Notification {
        ensureChannelExists(context)

        val displayTitle = if (queueSize > 1) "$title (+${queueSize - 1} more)" else title

        val fullScreenIntent = buildAlarmActivityIntent(
            context = context,
            id = id,
            title = title,
            body = body,
            scheduledTime = scheduledTime,
            reminderId = reminderId,
            habitId = habitId,
            targetType = targetType
        )
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            id,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val snoozeIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            this.action = AlarmActionReceiver.ACTION_SNOOZE
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
            putExtra("scheduledTime", scheduledTime)
            putExtra("reminderId", reminderId)
            putExtra("habitId", habitId)
            putExtra("targetType", targetType)
        }
        val snoozePendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val dismissIntent = Intent(context, AlarmActionReceiver::class.java).apply {
            this.action = AlarmActionReceiver.ACTION_DISMISS
            putExtra("id", id)
            putExtra("scheduledTime", scheduledTime)
            putExtra("reminderId", reminderId)
            putExtra("habitId", habitId)
            putExtra("targetType", targetType)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setContentTitle(displayTitle)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(fullScreenPendingIntent)
            .addAction(0, "+10 min", snoozePendingIntent)
            .addAction(0, "✓ Mark Done", dismissPendingIntent)

        if (!NativeAlarmScheduler.canUseFullScreenIntent(context)) {
            Log.w(TAG, "[NOTIFY] USE_FULL_SCREEN_INTENT denied on Android 14+; attaching fullScreenIntent anyway.")
        }
        builder.setFullScreenIntent(fullScreenPendingIntent, true)

        return builder.build()
    }
}
