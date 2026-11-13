package com.habiz.app.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.habiz.app.R
import java.util.Date

data class ActiveAlarmItem(
    val id: Int,
    val title: String,
    val body: String,
    val scheduledTime: Long,
    val reminderId: String,
    val habitId: String,
    val targetType: String,
    val isSnooze: Boolean = false
)

/**
 * Foreground service that plays continuous repeating alarm audio and vibration.
 * Continues running even when the app is backgrounded, frozen, or closed.
 * Manages an active alarm queue for simultaneous multiple alarms.
 */
class AlarmService : Service() {

    companion object {
        const val TAG = "HABIZ_ALARM"
        const val CHANNEL_ID = "habiz_alarm_channel"
        const val ACTION_START = "com.habiz.app.ALARM_START"
        const val ACTION_STOP = "com.habiz.app.ALARM_STOP"

        val activeAlarms = java.util.Collections.synchronizedList(mutableListOf<ActiveAlarmItem>())

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var currentAlarmId: Int = 0
            private set
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "[SERVICE] AlarmService.onCreate()")
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        // Acquire partial wake lock for up to 10 minutes to guarantee sound continues if device sleeps
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "HabitTracker:AlarmServiceWakeLock"
            ).apply {
                acquire(10 * 60 * 1000L) // 10 minutes timeout
            }
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] Could not acquire WakeLock: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        Log.i(TAG, "[SERVICE] onStartCommand action=$action")

        if (action == ACTION_STOP) {
            val removeId = intent?.getIntExtra("id", 0) ?: 0
            val removeHabitId = intent?.getStringExtra("habitId") ?: ""
            if (removeId != 0 || removeHabitId.isNotEmpty()) {
                synchronized(activeAlarms) {
                    activeAlarms.removeAll { 
                        (removeId != 0 && it.id == removeId) || 
                        (removeHabitId.isNotEmpty() && it.habitId == removeHabitId) 
                    }
                }
            } else {
                activeAlarms.clear()
            }

            if (activeAlarms.isEmpty()) {
                stopAlarm()
            } else {
                // Update persistent notification with the next active alarm
                val topItem = activeAlarms[0]
                currentAlarmId = topItem.id
                val notif = buildAlarmNotification(
                    id = topItem.id,
                    title = topItem.title,
                    body = topItem.body,
                    scheduledTime = topItem.scheduledTime,
                    reminderId = topItem.reminderId,
                    habitId = topItem.habitId,
                    targetType = topItem.targetType,
                    queueSize = activeAlarms.size
                )
                val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(currentAlarmId, notif)
                Log.i(TAG, "[SERVICE] Updated foreground notification for next alarm in queue: id=$currentAlarmId (remaining=${activeAlarms.size})")
            }
            return START_NOT_STICKY
        }

        val id = intent?.getIntExtra("id", (System.currentTimeMillis() % 100000).toInt()) ?: (System.currentTimeMillis() % 100000).toInt()
        val title = intent?.getStringExtra("title") ?: "🚨 Habit Alarm"
        val body = intent?.getStringExtra("body") ?: "Time for your habit! Protect your streak."
        val scheduledTime = intent?.getLongExtra("scheduledTime", 0L) ?: 0L
        val reminderId = intent?.getStringExtra("reminderId") ?: ""
        val habitId = intent?.getStringExtra("habitId") ?: ""
        val targetType = intent?.getStringExtra("targetType") ?: "habit"
        val isSnooze = intent?.getBooleanExtra("isSnooze", false) ?: false

        val incoming = ActiveAlarmItem(id, title, body, scheduledTime, reminderId, habitId, targetType, isSnooze)
        synchronized(activeAlarms) {
            if (activeAlarms.none { it.id == id }) {
                activeAlarms.add(incoming)
            }
        }

        currentAlarmId = activeAlarms[0].id
        isRunning = true

        val topItem = activeAlarms[0]

        // 1. Build the persistent high-priority foreground notification with Snooze & Dismiss actions
        val notification = buildAlarmNotification(
            id = topItem.id,
            title = topItem.title,
            body = topItem.body,
            scheduledTime = topItem.scheduledTime,
            reminderId = topItem.reminderId,
            habitId = topItem.habitId,
            targetType = topItem.targetType,
            queueSize = activeAlarms.size
        )

        // 2. Start foreground service immediately to comply with Android 8-16 5-second rule
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(currentAlarmId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(currentAlarmId, notification)
            }
            Log.i(TAG, "[SERVICE] startForeground active for alarm id=$currentAlarmId (queue size=${activeAlarms.size})")
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE_ERROR] startForeground failed", e)
        }

        // 3. Start repeating audio playback if not already playing
        startAlarmAudio()

        // 4. Start repeating vibration if not already vibrating
        startAlarmVibration()

        return START_NOT_STICKY
    }

    private fun buildAlarmNotification(
        id: Int,
        title: String,
        body: String,
        scheduledTime: Long,
        reminderId: String,
        habitId: String,
        targetType: String,
        queueSize: Int = 1
    ): android.app.Notification {
        ensureChannelExists()

        val displayTitle = if (queueSize > 1) "$title (+${queueSize - 1} more)" else title

        // Intent to launch the Full-Screen AlarmActivity
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
            putExtra("scheduledTime", scheduledTime)
            putExtra("reminderId", reminderId)
            putExtra("habitId", habitId)
            putExtra("targetType", targetType)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            id,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action: Snooze 10 minutes
        val snoozeIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            this.action = AlarmActionReceiver.ACTION_SNOOZE
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
            putExtra("reminderId", reminderId)
            putExtra("habitId", habitId)
            putExtra("targetType", targetType)
        }
        val snoozePendingIntent = PendingIntent.getBroadcast(
            this,
            id,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Action: Dismiss Alarm
        val dismissIntent = Intent(this, AlarmActionReceiver::class.java).apply {
            this.action = AlarmActionReceiver.ACTION_DISMISS
            putExtra("id", id)
            putExtra("reminderId", reminderId)
            putExtra("habitId", habitId)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            this,
            id,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
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

        if (NativeAlarmScheduler.canUseFullScreenIntent(this)) {
            builder.setFullScreenIntent(fullScreenPendingIntent, true)
        } else {
            Log.w(TAG, "[SERVICE] USE_FULL_SCREEN_INTENT permission denied on Android 14+; posting notification without full-screen takeover.")
        }

        return builder.build()
    }

    private fun startAlarmAudio() {
        if (mediaPlayer != null && mediaPlayer?.isPlaying == true) {
            Log.d(TAG, "[SERVICE] Audio already playing, keeping existing playback")
            return
        }

        try {
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            // Request audio focus
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(audioAttributes)
                    .build()
                audioManager?.requestAudioFocus(audioFocusRequest!!)
            } else {
                @Suppress("DEPRECATION")
                audioManager?.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            }

            // Create MediaPlayer with alarm sound resource
            var soundUri = Uri.parse("android.resource://" + packageName + "/" + R.raw.alarm)
            var player: MediaPlayer? = null
            try {
                player = MediaPlayer().apply {
                    setAudioAttributes(audioAttributes)
                    setDataSource(applicationContext, soundUri)
                    isLooping = true
                    prepare()
                    start()
                }
            } catch (e: Exception) {
                Log.w(TAG, "[SERVICE] R.raw.alarm failed, falling back to system default alarm: ${e.message}")
                soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                player = MediaPlayer().apply {
                    setAudioAttributes(audioAttributes)
                    setDataSource(applicationContext, soundUri)
                    isLooping = true
                    prepare()
                    start()
                }
            }

            mediaPlayer = player
            Log.i(TAG, "[SERVICE] Continuous repeating alarm sound started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE_ERROR] Failed to start MediaPlayer audio", e)
        }
    }

    private fun startAlarmVibration() {
        if (vibrator != null) return

        try {
            val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }

            val pattern = longArrayOf(0, 800, 400, 800, 400)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // 0 means repeat at index 0 indefinitely
                vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(pattern, 0)
            }

            vibrator = vib
            Log.i(TAG, "[SERVICE] Repeating vibration started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE_ERROR] Failed to start vibration", e)
        }
    }

    private fun stopAlarm() {
        Log.i(TAG, "[SERVICE] Stopping alarm service, audio, and vibration")
        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] Error releasing MediaPlayer: ${e.message}")
        }

        try {
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] Error cancelling vibrator: ${e.message}")
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager?.abandonAudioFocusRequest(audioFocusRequest!!)
            } else {
                @Suppress("DEPRECATION")
                audioManager?.abandonAudioFocus(null)
            }
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] Error abandoning audio focus: ${e.message}")
        }

        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] Error releasing wake lock: ${e.message}")
        }

        isRunning = false
        currentAlarmId = 0
        activeAlarms.clear()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun ensureChannelExists() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (notificationManager.getNotificationChannel(CHANNEL_ID) == null) {
                val soundUri = Uri.parse("android.resource://" + packageName + "/" + R.raw.alarm)
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
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                }
                notificationManager.createNotificationChannel(channel)
            }
        }
    }

    override fun onDestroy() {
        Log.i(TAG, "[SERVICE] AlarmService.onDestroy()")
        stopAlarm()
        super.onDestroy()
    }
}

