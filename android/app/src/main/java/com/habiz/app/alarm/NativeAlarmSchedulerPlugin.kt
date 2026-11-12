package com.habiz.app.alarm

import android.content.Intent
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor Plugin exposing the Native Alarm Scheduler and lifecycle events to JavaScript / React.
 */
@CapacitorPlugin(name = "NativeAlarmScheduler")
class NativeAlarmSchedulerPlugin : Plugin() {

    companion object {
        const val TAG = "HABIZ_ALARM"

        @Volatile
        private var instance: NativeAlarmSchedulerPlugin? = null

        fun notifyDismissed(id: Int, reminderId: String, habitId: String) {
            try {
                val data = JSObject().apply {
                    put("id", id)
                    put("reminderId", reminderId)
                    put("habitId", habitId)
                    put("timestamp", System.currentTimeMillis())
                }
                instance?.notifyListeners("alarmDismissed", data)
                Log.i(TAG, "[PLUGIN] Emitted 'alarmDismissed' event to JavaScript: id=$id, habitId='$habitId'")
            } catch (e: Exception) {
                Log.w(TAG, "[PLUGIN] Could not emit 'alarmDismissed' event: ${e.message}")
            }
        }

        fun notifySnoozed(id: Int, reminderId: String, habitId: String, snoozeTime: Long) {
            try {
                val data = JSObject().apply {
                    put("id", id)
                    put("reminderId", reminderId)
                    put("habitId", habitId)
                    put("snoozeTime", snoozeTime)
                    put("timestamp", System.currentTimeMillis())
                }
                instance?.notifyListeners("alarmSnoozed", data)
                Log.i(TAG, "[PLUGIN] Emitted 'alarmSnoozed' event to JavaScript: id=$id, snoozeTime=$snoozeTime")
            } catch (e: Exception) {
                Log.w(TAG, "[PLUGIN] Could not emit 'alarmSnoozed' event: ${e.message}")
            }
        }

        fun notifyCompleted(id: Int, reminderId: String, habitId: String, targetType: String) {
            try {
                val data = JSObject().apply {
                    put("id", id)
                    put("reminderId", reminderId)
                    put("habitId", habitId)
                    put("targetType", targetType)
                    put("timestamp", System.currentTimeMillis())
                }
                instance?.notifyListeners("alarmCompleted", data)
                Log.i(TAG, "[PLUGIN] Emitted 'alarmCompleted' event to JavaScript: id=$id, habitId='$habitId', type='$targetType'")
            } catch (e: Exception) {
                Log.w(TAG, "[PLUGIN] Could not emit 'alarmCompleted' event: ${e.message}")
            }
        }
    }

    override fun load() {
        super.load()
        instance = this
        Log.i(TAG, "[PLUGIN] NativeAlarmSchedulerPlugin loaded")
    }

    @PluginMethod
    fun schedule(call: PluginCall) {
        try {
            val alarmsArray = call.getArray("alarms")
            if (alarmsArray == null || alarmsArray.length() == 0) {
                // Check if single alarm object passed directly
                val id = call.getInt("id")
                val at = call.getDouble("at") // Numeric timestamp
                if (id != null && at != null) {
                    val title = call.getString("title") ?: "🚨 Habit Alarm"
                    val body = call.getString("body") ?: "Time for your habit!"
                    val reminderId = call.getString("reminderId") ?: ""
                    val habitId = call.getString("habitId") ?: ""
                    val targetType = call.getString("targetType") ?: "habit"
                    val isSnooze = call.getBoolean("isSnooze") ?: false
                    val isRecurring = call.getBoolean("isRecurring") ?: true
                    val timeStr = call.getString("timeStr") ?: ""
                    val daysOfWeek = call.getString("daysOfWeek") ?: ""

                    val ok = NativeAlarmScheduler.scheduleAlarm(
                        context,
                        id,
                        at.toLong(),
                        title,
                        body,
                        reminderId,
                        habitId,
                        targetType,
                        isSnooze,
                        timeStr,
                        daysOfWeek,
                        isRecurring
                    )
                    val ret = JSObject()
                    ret.put("scheduledCount", if (ok) 1 else 0)
                    call.resolve(ret)
                    return
                }

                val ret = JSObject()
                ret.put("scheduledCount", 0)
                call.resolve(ret)
                return
            }

            var scheduledCount = 0
            for (i in 0 until alarmsArray.length()) {
                val item = alarmsArray.getJSONObject(i)
                val id = item.getInt("id")
                val at = item.optLong("at", 0L)
                val title = item.optString("title", "🚨 Habit Alarm")
                val body = item.optString("body", "Time for your habit!")
                val reminderId = item.optString("reminderId", "")
                val habitId = item.optString("habitId", "")
                val targetType = item.optString("targetType", "habit")
                val isSnooze = item.optBoolean("isSnooze", false)
                val isRecurring = item.optBoolean("isRecurring", true)
                val timeStr = item.optString("timeStr", "")
                val daysOfWeek = item.optString("daysOfWeek", "")

                if (at > 0) {
                    val ok = NativeAlarmScheduler.scheduleAlarm(
                        context,
                        id,
                        at,
                        title,
                        body,
                        reminderId,
                        habitId,
                        targetType,
                        isSnooze,
                        timeStr,
                        daysOfWeek,
                        isRecurring
                    )
                    if (ok) scheduledCount++
                }
            }

            Log.i(TAG, "[PLUGIN] schedule() call completed: scheduled $scheduledCount / ${alarmsArray.length()} alarms")
            val ret = JSObject()
            ret.put("scheduledCount", scheduledCount)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] Error in schedule()", e)
            call.reject("Failed to schedule alarms: ${e.message}", e)
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        try {
            var cancelledCount = 0

            val reminderId = call.getString("reminderId")
            if (!reminderId.isNullOrEmpty()) {
                cancelledCount += NativeAlarmScheduler.cancelByReminderId(context, reminderId)
            }

            val idsArray = call.getArray("ids")
            if (idsArray != null) {
                for (i in 0 until idsArray.length()) {
                    val id = idsArray.getInt(i)
                    if (NativeAlarmScheduler.cancelAlarm(context, id)) {
                        cancelledCount++
                    }
                }
            }

            val singleId = call.getInt("id")
            if (singleId != null) {
                if (NativeAlarmScheduler.cancelAlarm(context, singleId)) {
                    cancelledCount++
                }
            }

            Log.i(TAG, "[PLUGIN] cancel() call completed: cancelled $cancelledCount alarm(s)")
            val ret = JSObject()
            ret.put("cancelledCount", cancelledCount)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] Error in cancel()", e)
            call.reject("Failed to cancel alarms: ${e.message}", e)
        }
    }

    @PluginMethod
    fun replaceAll(call: PluginCall) {
        try {
            val alarmsArray = call.getArray("alarms")
            val scheduledCount = NativeAlarmScheduler.replaceAllAlarms(context, alarmsArray)
            Log.i(TAG, "[PLUGIN] replaceAll() call completed: atomically scheduled $scheduledCount alarm(s)")
            val ret = JSObject()
            ret.put("scheduledCount", scheduledCount)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] Error in replaceAll()", e)
            call.reject("Failed to replace alarms atomically: ${e.message}", e)
        }
    }

    @PluginMethod
    fun cancelAll(call: PluginCall) {
        try {
            val count = NativeAlarmScheduler.cancelAllAlarms(context)
            Log.i(TAG, "[PLUGIN] cancelAll() call completed: cancelled $count alarm(s)")
            val ret = JSObject()
            ret.put("cancelledCount", count)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] Error in cancelAll()", e)
            call.reject("Failed to cancel all alarms: ${e.message}", e)
        }
    }

    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        val granted = NativeAlarmScheduler.canScheduleExactAlarms(context)
        val ret = JSObject()
        ret.put("exact_alarm", if (granted) "granted" else "denied")
        call.resolve(ret)
    }

    @PluginMethod
    fun canUseFullScreenIntent(call: PluginCall) {
        val granted = NativeAlarmScheduler.canUseFullScreenIntent(context)
        val ret = JSObject()
        ret.put("full_screen_intent", if (granted) "granted" else "denied")
        call.resolve(ret)
    }

    @PluginMethod
    fun stopCurrentAlarm(call: PluginCall) {
        try {
            val stopIntent = Intent(context, AlarmService::class.java).apply {
                this.action = AlarmService.ACTION_STOP
            }
            context.startService(stopIntent)
            AlarmActivity.activeActivity?.finishAndRemoveTask()
            val ret = JSObject()
            ret.put("stopped", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to stop alarm service: ${e.message}", e)
        }
    }

    @PluginMethod
    fun isAlarmActive(call: PluginCall) {
        val ret = JSObject()
        ret.put("isActive", AlarmService.isRunning)
        ret.put("currentAlarmId", AlarmService.currentAlarmId)
        call.resolve(ret)
    }

    @PluginMethod
    fun recordCompletion(call: PluginCall) {
        try {
            val targetType = call.getString("targetType") ?: "habit"
            val entityId = call.getString("entityId") ?: ""
            val reminderId = call.getString("reminderId") ?: ""
            val date = call.getString("date") ?: ""

            if (entityId.isNotEmpty()) {
                NativeAlarmScheduler.saveCompletedEntity(context, targetType, entityId, date)
                NativeAlarmScheduler.cancelSnoozeForEntity(context, entityId, reminderId)

                // If currently ringing for this entity, stop the alarm
                if (AlarmService.isRunning) {
                    val stopIntent = Intent(context, AlarmService::class.java).apply {
                        this.action = AlarmService.ACTION_STOP
                        putExtra("habitId", entityId)
                    }
                    context.startService(stopIntent)
                }
            }

            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] recordCompletion failed: ${e.message}", e)
            call.reject("Failed to record completion: ${e.message}", e)
        }
    }

    @PluginMethod
    fun recordUncompletion(call: PluginCall) {
        try {
            val targetType = call.getString("targetType") ?: "habit"
            val entityId = call.getString("entityId") ?: ""
            val date = call.getString("date") ?: ""

            if (entityId.isNotEmpty()) {
                NativeAlarmScheduler.removeCompletedEntity(context, targetType, entityId, date)
            }

            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] recordUncompletion failed: ${e.message}", e)
            call.reject("Failed to record uncompletion: ${e.message}", e)
        }
    }

    @PluginMethod
    fun syncCompletions(call: PluginCall) {
        try {
            val habitsArray = call.getArray("completedHabits")
            val goalsArray = call.getArray("completedGoals")
            val learningArray = call.getArray("completedLearning")
            val today = call.getString("today") ?: ""

            val habitsList = mutableListOf<String>()
            if (habitsArray != null) {
                for (i in 0 until habitsArray.length()) {
                    habitsList.add(habitsArray.getString(i))
                }
            }

            val goalsList = mutableListOf<String>()
            if (goalsArray != null) {
                for (i in 0 until goalsArray.length()) {
                    goalsList.add(goalsArray.getString(i))
                }
            }

            val learningList = mutableListOf<String>()
            if (learningArray != null) {
                for (i in 0 until learningArray.length()) {
                    learningList.add(learningArray.getString(i))
                }
            }

            NativeAlarmScheduler.syncCompletions(context, habitsList, goalsList, learningList, today)

            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "[PLUGIN_ERROR] syncCompletions failed: ${e.message}", e)
            call.reject("Failed to sync completions: ${e.message}", e)
        }
    }

    @PluginMethod
    fun getDismissedAlarms(call: PluginCall) {
        try {
            val dismissed = NativeAlarmScheduler.getDismissedAlarms(context)
            val ret = JSObject()
            ret.put("dismissed", JSArray(dismissed.toString()))
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to get dismissed alarms: ${e.message}", e)
        }
    }
}
