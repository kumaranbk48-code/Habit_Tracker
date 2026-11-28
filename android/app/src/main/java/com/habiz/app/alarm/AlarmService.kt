package com.habiz.app.alarm

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationManagerCompat
import com.habiz.app.R

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

        @Volatile
        var clearOverlayCallback: (() -> Unit)? = null

        fun removeAlarm(removeId: Int, removeHabitId: String) {
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
        }
    }

    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var windowManager: WindowManager? = null
    private var overlayAnchorView: View? = null
    private val watchdogHandler = Handler(Looper.getMainLooper())
    private var watchdogGeneration: Long = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "[SERVICE] AlarmService.onCreate()")
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

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
            removeAlarm(removeId, removeHabitId)

            if (activeAlarms.isEmpty()) {
                stopAlarm()
            } else {
                // Update persistent notification with the next active alarm
                val topItem = activeAlarms[0]
                currentAlarmId = topItem.id
                val notif = AlarmNotificationHelper.buildAlarmNotification(
                    context = this,
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
        val notification = AlarmNotificationHelper.buildAlarmNotification(
            context = this,
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
            NativeAlarmScheduler.logDiag(
                this,
                "fsi_notification_posted",
                "source=service id=$currentAlarmId canFsi=${NativeAlarmScheduler.canUseFullScreenIntent(this)} canOverlay=${AlarmNotificationHelper.canShowOverlays(this)} sdk=${Build.VERSION.SDK_INT}"
            )
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE_ERROR] startForeground failed", e)
            NativeAlarmScheduler.logDiag(this, "service_start_foreground", "error=${e.javaClass.simpleName}:${e.message}")
        }

        // 3. Start repeating audio playback and vibration
        startAlarmAudio()
        startAlarmVibration()

        // 4. Launch AlarmActivity from service (with temporary 1x1 overlay anchor on Android 15+ when permitted)
        launchActivityWithOverlayAnchor(incoming)

        // 5. Watchdog retries at 2s & 6s if AlarmActivity failed to show
        scheduleLaunchWatchdog(incoming)

        return START_NOT_STICKY
    }

    private fun addOverlayAnchorIfPermitted() {
        if (overlayAnchorView != null) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || !Settings.canDrawOverlays(this)) return
        try {
            val view = View(this).apply {
                setBackgroundColor(0x00000000)
            }
            val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }
            val params = WindowManager.LayoutParams(
                1,
                1,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = 0
                y = 0
            }
            windowManager?.addView(view, params)
            overlayAnchorView = view
            clearOverlayCallback = { removeOverlayAnchor() }
            NativeAlarmScheduler.logDiag(this, "overlay_view_added", "ok sdk=${Build.VERSION.SDK_INT}")
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] Failed to add 1x1 overlay anchor (${e.javaClass.simpleName}): ${e.message}")
            NativeAlarmScheduler.logDiag(this, "overlay_view_added", "error=${e.javaClass.simpleName}:${e.message}")
        }
    }

    private fun removeOverlayAnchor() {
        clearOverlayCallback = null
        val view = overlayAnchorView ?: return
        overlayAnchorView = null
        try {
            windowManager?.removeViewImmediate(view)
        } catch (_: Exception) {
            try {
                windowManager?.removeView(view)
            } catch (_: Exception) {}
        }
    }

    private fun launchActivityWithOverlayAnchor(item: ActiveAlarmItem) {
        addOverlayAnchorIfPermitted()
        try {
            val actIntent = AlarmNotificationHelper.buildAlarmActivityIntent(
                context = this,
                id = item.id,
                title = item.title,
                body = item.body,
                scheduledTime = item.scheduledTime,
                reminderId = item.reminderId,
                habitId = item.habitId,
                targetType = item.targetType,
                isSnooze = item.isSnooze
            )
            startActivity(actIntent)
            Log.i(TAG, "[SERVICE] Launched AlarmActivity for id=${item.id}")
        } catch (e: Exception) {
            Log.w(TAG, "[SERVICE] AlarmActivity launch from service failed (${e.javaClass.simpleName}): ${e.message}")
            NativeAlarmScheduler.logDiag(this, "service_activity_launch", "error=${e.javaClass.simpleName}:${e.message}")
        }
    }

    private fun scheduleLaunchWatchdog(item: ActiveAlarmItem) {
        watchdogHandler.removeCallbacksAndMessages(null)
        val gen = ++watchdogGeneration
        val delays = listOf(2000L to 1, 6000L to 2)
        for ((delayMs, attempt) in delays) {
            watchdogHandler.postDelayed({
                if (gen != watchdogGeneration || !isRunning) return@postDelayed
                val stillActive = synchronized(activeAlarms) { activeAlarms.any { it.id == item.id } }
                if (!stillActive) return@postDelayed

                if (AlarmActivity.activeActivity != null) {
                    removeOverlayAnchor()
                    return@postDelayed
                }

                Log.w(TAG, "[WATCHDOG] Retry #$attempt: AlarmActivity still null for id=${item.id}; relaunching")
                NativeAlarmScheduler.logDiag(this, "watchdog_retry", "attempt=$attempt id=${item.id}")
                launchActivityWithOverlayAnchor(item)
                try {
                    val notif = AlarmNotificationHelper.buildAlarmNotification(
                        context = this,
                        id = item.id,
                        title = item.title,
                        body = item.body,
                        scheduledTime = item.scheduledTime,
                        reminderId = item.reminderId,
                        habitId = item.habitId,
                        targetType = item.targetType,
                        queueSize = activeAlarms.size.coerceAtLeast(1)
                    )
                    NotificationManagerCompat.from(this).notify(item.id, notif)
                } catch (_: Exception) {}
            }, delayMs)
        }
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
        watchdogGeneration++
        watchdogHandler.removeCallbacksAndMessages(null)
        removeOverlayAnchor()
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

    override fun onDestroy() {
        Log.i(TAG, "[SERVICE] AlarmService.onDestroy()")
        watchdogGeneration++
        watchdogHandler.removeCallbacksAndMessages(null)
        removeOverlayAnchor()
        stopAlarm()
        super.onDestroy()
    }
}

