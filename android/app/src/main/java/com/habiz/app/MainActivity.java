package com.habiz.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.habiz.app.alarm.NativeAlarmSchedulerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAlarmSchedulerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
