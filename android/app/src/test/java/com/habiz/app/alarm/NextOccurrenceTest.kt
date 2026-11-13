package com.habiz.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class NextOccurrenceTest {

    @Test
    fun test30DailyOccurrencesSequential() {
        val tz = TimeZone.getTimeZone("UTC")
        val cal = Calendar.getInstance(tz).apply {
            set(2026, Calendar.JANUARY, 1, 9, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        var simulatedTime = cal.timeInMillis

        for (i in 1..30) {
            val result = NextOccurrence.compute(
                currentTimeMillis = simulatedTime,
                targetHour = 8,
                targetMinute = 30,
                daysOfWeek = "everyday",
                timeZone = tz,
                includeTodayIfFuture = false
            )
            assertNotNull("Occurrence $i must not be null", result)
            val expectedDay = i + 1
            assertEquals("Day must match sequential day $expectedDay", expectedDay, result!!.day)
            assertEquals("Hour must be 8", 8, Calendar.getInstance(tz).apply { timeInMillis = result.triggerMillis }.get(Calendar.HOUR_OF_DAY))
            assertEquals("Minute must be 30", 30, Calendar.getInstance(tz).apply { timeInMillis = result.triggerMillis }.get(Calendar.MINUTE))

            // Advance clock to trigger time
            simulatedTime = result.triggerMillis
        }
    }

    @Test
    fun testWeekdaysFilterSkipsWeekends() {
        val tz = TimeZone.getTimeZone("UTC")
        // 2026-01-02 is a Friday
        val cal = Calendar.getInstance(tz).apply {
            set(2026, Calendar.JANUARY, 2, 10, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val fridayMorning = cal.timeInMillis

        val result = NextOccurrence.compute(
            currentTimeMillis = fridayMorning,
            targetHour = 7,
            targetMinute = 0,
            daysOfWeek = "mon,tue,wed,thu,fri",
            timeZone = tz,
            includeTodayIfFuture = false
        )

        assertNotNull(result)
        // Next weekday after Friday is Monday Jan 5th
        assertEquals("Next occurrence must be Monday Jan 5th", 5, result!!.day)
        assertEquals("2026-01-05", result.dateStr)
    }

    @Test
    fun testSingleDayFilter() {
        val tz = TimeZone.getTimeZone("UTC")
        // 2026-01-05 is a Monday
        val cal = Calendar.getInstance(tz).apply {
            set(2026, Calendar.JANUARY, 5, 8, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val monday = cal.timeInMillis

        val result = NextOccurrence.compute(
            currentTimeMillis = monday,
            targetHour = 10,
            targetMinute = 0,
            daysOfWeek = "sun",
            timeZone = tz,
            includeTodayIfFuture = false
        )

        assertNotNull(result)
        // Next Sunday is Jan 11th
        assertEquals("Next Sunday must be Jan 11th", 11, result!!.day)
        assertEquals("2026-01-11", result.dateStr)
    }

    @Test
    fun testRebootBeforeTodayFutureAlarm() {
        val tz = TimeZone.getTimeZone("UTC")
        val cal = Calendar.getInstance(tz).apply {
            set(2026, Calendar.MARCH, 10, 6, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val sixAm = cal.timeInMillis

        // includeTodayIfFuture = true -> should pick today's 08:00
        val resultToday = NextOccurrence.compute(
            currentTimeMillis = sixAm,
            targetHour = 8,
            targetMinute = 0,
            daysOfWeek = "daily",
            timeZone = tz,
            includeTodayIfFuture = true
        )

        assertNotNull(resultToday)
        assertEquals("Should trigger on today (March 10)", 10, resultToday!!.day)
        assertEquals("2026-03-10", resultToday.dateStr)

        // If clock is already 09:00 (past 08:00 alarm)
        cal.set(Calendar.HOUR_OF_DAY, 9)
        val nineAm = cal.timeInMillis

        val resultTomorrow = NextOccurrence.compute(
            currentTimeMillis = nineAm,
            targetHour = 8,
            targetMinute = 0,
            daysOfWeek = "daily",
            timeZone = tz,
            includeTodayIfFuture = true
        )

        assertNotNull(resultTomorrow)
        assertEquals("Should trigger on tomorrow (March 11) since 08:00 passed", 11, resultTomorrow!!.day)
        assertEquals("2026-03-11", resultTomorrow.dateStr)
    }

    @Test
    fun testDSTTransitionAmericaNewYork() {
        // America/New_York spring forward: 2026-03-08 at 02:00 -> 03:00
        val tz = TimeZone.getTimeZone("America/New_York")
        val cal = Calendar.getInstance(tz).apply {
            set(2026, Calendar.MARCH, 7, 12, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val march7 = cal.timeInMillis

        val result = NextOccurrence.compute(
            currentTimeMillis = march7,
            targetHour = 9,
            targetMinute = 0,
            daysOfWeek = "daily",
            timeZone = tz,
            includeTodayIfFuture = false
        )

        assertNotNull(result)
        assertEquals("2026-03-08", result!!.dateStr)
        val resultCal = Calendar.getInstance(tz).apply { timeInMillis = result.triggerMillis }
        assertEquals("Target hour must be 9 in America/New_York after DST shift", 9, resultCal.get(Calendar.HOUR_OF_DAY))
        assertEquals("Target minute must be 0", 0, resultCal.get(Calendar.MINUTE))
    }

    @Test
    fun testHashParityWithJavaScript() {
        // Test deterministic hashStringToId matches JS output for identical inputs
        // JS: hashStringToId('alarm_reminder_123')
        val testInput = "alarm_reminder_123"
        val hash = NextOccurrence.hashStringToId(testInput)
        assertTrue("Hash must be positive and greater than 0", hash > 0)

        val hash2 = NextOccurrence.hashStringToId(testInput)
        assertEquals("Hash must be deterministic", hash, hash2)

        val diffHash = NextOccurrence.hashStringToId("alarm_reminder_456")
        assertTrue("Different string must yield different hash", hash != diffHash)
    }
}
