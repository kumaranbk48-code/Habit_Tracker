package com.habiz.app.alarm

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.habiz.app.MainActivity
import com.habiz.app.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Full-screen Native Alarm Activity shown over the lock screen.
 * Visually matches the HabitTracker dark alarm card with teal accent border.
 * Features multi-alarm queue presentation for simultaneous alarms.
 */
class AlarmActivity : AppCompatActivity() {

    companion object {
        const val TAG = "HABIZ_ALARM"
        var activeActivity: AlarmActivity? = null
    }

    private val alarmQueue = mutableListOf<ActiveAlarmItem>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        activeActivity = this
        Log.i(TAG, "[ACTIVITY] AlarmActivity.onCreate()")

        // 1. Configure lock screen and wake display
        setupWindowFlags()

        // 2. Set layout
        setContentView(R.layout.activity_alarm)

        // 3. Enqueue the incoming alarm
        enqueueFromIntent(intent)

        // 4. Sync any other pending alarms from AlarmService.activeAlarms
        synchronized(AlarmService.activeAlarms) {
            for (item in AlarmService.activeAlarms) {
                if (alarmQueue.none { it.id == item.id }) {
                    alarmQueue.add(item)
                }
            }
        }

        renderCurrentAlarm()
        setupButtons()
        AlarmService.clearOverlayCallback?.invoke()

        val firstItem = alarmQueue.firstOrNull()
        NativeAlarmScheduler.logDiag(
            this,
            "activity_onCreate_shown",
            "id=${firstItem?.id ?: intent.getIntExtra("id", 0)} type=${firstItem?.targetType ?: intent.getStringExtra("targetType") ?: "habit"} queueSize=${alarmQueue.size}"
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        enqueueFromIntent(intent)
        renderCurrentAlarm()
    }

    private fun enqueueFromIntent(intent: Intent?) {
        if (intent == null) return
        val id = intent.getIntExtra("id", (System.currentTimeMillis() % 100000).toInt())
        val title = intent.getStringExtra("title") ?: "🚨 Habit Alarm"
        val body = intent.getStringExtra("body") ?: "Time for your habit! Protect your streak."
        val scheduledTime = intent.getLongExtra("scheduledTime", System.currentTimeMillis())
        val reminderId = intent.getStringExtra("reminderId") ?: ""
        val habitId = intent.getStringExtra("habitId") ?: ""
        val targetType = intent.getStringExtra("targetType") ?: "habit"
        val isSnooze = intent.getBooleanExtra("isSnooze", false)

        val item = ActiveAlarmItem(id, title, body, scheduledTime, reminderId, habitId, targetType, isSnooze)
        if (alarmQueue.none { it.id == id }) {
            alarmQueue.add(item)
        }
    }

    private fun renderCurrentAlarm() {
        if (alarmQueue.isEmpty()) {
            finishAndRemoveTask()
            return
        }

        val cur = alarmQueue[0]
        val cleanTitle = cur.title
            .replace("🚨 ALARM: ", "")
            .replace("🚨 ALARM:", "")
            .replace("🚨 ", "")
            .replace("🔥 Habit: ", "")
            .replace("🎯 Goal: ", "")
            .replace("📚 Learning: ", "")
            .replace("⏰ Snoozed: ", "")
            .trim()
        val initial = if (cleanTitle.isNotEmpty()) cleanTitle.first().uppercaseChar().toString() else "H"

        findViewById<TextView>(R.id.textAlarmTitle)?.text = if (cleanTitle.isNotEmpty()) cleanTitle else "Habit Reminder"
        findViewById<TextView>(R.id.textHabitInitial)?.text = initial

        val cleanBody = cur.body
            .replace("⏰ Snoozed: ", "")
            .replace("Urgent: ", "")
            .trim()
        findViewById<TextView>(R.id.textAlarmBody)?.text = if (cleanBody.isNotEmpty()) cleanBody else "Day 1 starts right now. Make it count."

        // Entity-specific Badge
        val type = cur.targetType.lowercase()
        val badgeView = findViewById<TextView>(R.id.textStreakBadge)
        if (type == "goal") {
            badgeView?.text = "🎯 Target Goal"
            badgeView?.setTextColor(0xFF38BDF8.toInt()) // Light blue
        } else if (type == "learning_journey" || type == "learning_topic" || type == "learning") {
            badgeView?.text = "📚 Learning Roadmap"
            badgeView?.setTextColor(0xFFA78BFA.toInt()) // Purple
        } else {
            badgeView?.text = "🔥 Start Streak"
            badgeView?.setTextColor(0xFFF59E0B.toInt()) // Amber
        }

        // Queue Badge / Sound Status indicator
        val soundStatusView = findViewById<TextView>(R.id.textSoundStatus)
        if (alarmQueue.size > 1) {
            soundStatusView?.text = "🔊 Sound ON  +${alarmQueue.size - 1} more"
        } else {
            soundStatusView?.text = "🔊 Sound ON"
        }
    }

    private fun setupButtons() {
        findViewById<Button>(R.id.btnSnooze)?.setOnClickListener {
            if (alarmQueue.isEmpty()) return@setOnClickListener
            val cur = alarmQueue.removeAt(0)
            Log.i(TAG, "[ACTIVITY] Snooze (+10 min) tapped for alarm id=${cur.id}")

            // Remove synchronously from activeAlarms so AlarmActivity cannot re-show it
            AlarmService.removeAlarm(cur.id, cur.habitId)

            val now = System.currentTimeMillis()
            val refTime = if (cur.scheduledTime > 0L) cur.scheduledTime else now
            val todayDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            val occMinute = SimpleDateFormat("HH:mm", Locale.US).format(Date(refTime))

            NativeAlarmScheduler.addPendingAction(
                context = this,
                type = "snooze",
                habitId = cur.habitId,
                reminderId = cur.reminderId,
                targetType = cur.targetType,
                date = todayDate,
                occurrenceMinute = occMinute,
                timestamp = now
            )

            val snoozeIntent = Intent(this, AlarmActionReceiver::class.java).apply {
                this.action = AlarmActionReceiver.ACTION_SNOOZE
                putExtra("id", cur.id)
                putExtra("title", cur.title)
                putExtra("body", cur.body)
                putExtra("scheduledTime", cur.scheduledTime)
                putExtra("reminderId", cur.reminderId)
                putExtra("habitId", cur.habitId)
                putExtra("targetType", cur.targetType)
            }
            sendBroadcast(snoozeIntent)

            if (alarmQueue.isNotEmpty()) {
                renderCurrentAlarm()
            } else {
                finishAndRemoveTask()
            }
        }

        findViewById<Button>(R.id.btnDismiss)?.setOnClickListener {
            if (alarmQueue.isEmpty()) return@setOnClickListener
            val cur = alarmQueue.removeAt(0)
            Log.i(TAG, "[ACTIVITY] Mark Done tapped for alarm id=${cur.id}")

            // Remove synchronously from activeAlarms so AlarmActivity cannot re-show it
            AlarmService.removeAlarm(cur.id, cur.habitId)

            val now = System.currentTimeMillis()
            val refTime = if (cur.scheduledTime > 0L) cur.scheduledTime else now
            val todayDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
            val occMinute = SimpleDateFormat("HH:mm", Locale.US).format(Date(refTime))

            // Durable idempotent pending-action log (safe even before MainActivity starts)
            NativeAlarmScheduler.addPendingAction(
                context = this,
                type = "complete",
                habitId = cur.habitId,
                reminderId = cur.reminderId,
                targetType = cur.targetType,
                date = todayDate,
                occurrenceMinute = occMinute,
                timestamp = now
            )

            // Single path: AlarmActionReceiver handles saveCompletedEntity, cancelSnooze, stop service, and notify JS
            val dismissIntent = Intent(this, AlarmActionReceiver::class.java).apply {
                this.action = AlarmActionReceiver.ACTION_DISMISS
                putExtra("id", cur.id)
                putExtra("scheduledTime", cur.scheduledTime)
                putExtra("reminderId", cur.reminderId)
                putExtra("habitId", cur.habitId)
                putExtra("targetType", cur.targetType)
            }
            sendBroadcast(dismissIntent)

            if (alarmQueue.isNotEmpty()) {
                renderCurrentAlarm()
            } else {
                // Launch MainActivity to navigate directly into app
                try {
                    val mainIntent = Intent(this, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    }
                    startActivity(mainIntent)
                } catch (e: Exception) {
                    Log.w(TAG, "[ACTIVITY] Failed to launch MainActivity on dismiss: ${e.message}")
                }
                finishAndRemoveTask()
            }
        }
    }

    private fun setupWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        }

        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )
    }

    override fun onDestroy() {
        Log.i(TAG, "[ACTIVITY] AlarmActivity.onDestroy()")
        if (activeActivity == this) {
            activeActivity = null
        }
        super.onDestroy()
    }
}

