package com.habiz.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.habiz.app.alarm.NativeAlarmSchedulerPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(NativeAlarmSchedulerPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
