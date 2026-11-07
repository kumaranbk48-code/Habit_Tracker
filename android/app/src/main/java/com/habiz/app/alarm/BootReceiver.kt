package com.habiz.app.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver to restore all scheduled alarms upon device reboot or app upgrade.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "HABIZ_ALARM"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "[BOOT] BootReceiver invoked with action=$action")

        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val restoredCount = NativeAlarmScheduler.rescheduleAllUpcomingAlarms(context)
            Log.i(TAG, "[BOOT] Restored $restoredCount upcoming alarm(s) after reboot")
        }
    }
}

