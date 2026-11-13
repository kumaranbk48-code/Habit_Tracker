package com.habiz.app.alarm

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class OccurrenceResult(
    val triggerMillis: Long,
    val dateStr: String,
    val year: Int,
    val month: Int, // 0-indexed, matches JS Date.getMonth()
    val day: Int    // 1-31, matches JS Date.getDate()
)

/**
 * Pure Kotlin repeating alarm next-occurrence calculator without Android OS dependencies.
 * Easily tested in standard JVM JUnit test suites with clock and timezone injection.
 */
object NextOccurrence {

    /**
     * Computes the next occurrence timestamp and calendar components.
     *
     * @param currentTimeMillis The baseline timestamp to calculate from
     * @param targetHour Target hour of day (0-23)
     * @param targetMinute Target minute of hour (0-59)
     * @param daysOfWeek Comma-separated allowed days ("mon,wed,fri") or "daily"/"everyday"
     * @param timeZone Injected TimeZone (default: TimeZone.getDefault())
     * @param includeTodayIfFuture Whether today's occurrence can be selected if its trigger time is still in the future (e.g. after phone reboot before today's alarm)
     */
    fun compute(
        currentTimeMillis: Long,
        targetHour: Int,
        targetMinute: Int,
        daysOfWeek: String = "",
        timeZone: TimeZone = TimeZone.getDefault(),
        includeTodayIfFuture: Boolean = false
    ): OccurrenceResult? {
        if (targetHour !in 0..23 || targetMinute !in 0..59) return null

        val allowedDays = if (daysOfWeek.isNotEmpty()) {
            daysOfWeek.split(",").map { it.trim().lowercase(Locale.ROOT) }.filter { it.isNotEmpty() }
        } else {
            emptyList()
        }
        val isEveryday = allowedDays.isEmpty() || allowedDays.any { it == "everyday" || it == "daily" || it == "all" }

        val shortDayNames = arrayOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            this.timeZone = timeZone
        }

        val startOffset = if (includeTodayIfFuture) 0 else 1
        val endOffset = startOffset + 35 // check up to 5 weeks

        for (dayOffset in startOffset..endOffset) {
            val candidate = Calendar.getInstance(timeZone).apply {
                timeInMillis = currentTimeMillis
                add(Calendar.DAY_OF_YEAR, dayOffset)
                set(Calendar.HOUR_OF_DAY, targetHour)
                set(Calendar.MINUTE, targetMinute)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }

            val dayIdx = candidate.get(Calendar.DAY_OF_WEEK) - 1
            val dayName = if (dayIdx in 0..6) shortDayNames[dayIdx] else ""

            if (!isEveryday && !allowedDays.any { dayName.startsWith(it) || it.startsWith(dayName) }) {
                continue
            }

            val candidateMillis = candidate.timeInMillis
            if (candidateMillis > currentTimeMillis) {
                return OccurrenceResult(
                    triggerMillis = candidateMillis,
                    dateStr = dateFormat.format(Date(candidateMillis)),
                    year = candidate.get(Calendar.YEAR),
                    month = candidate.get(Calendar.MONTH),
                    day = candidate.get(Calendar.DATE)
                )
            }
        }

        return null
    }

    /**
     * Deterministic string to 32-bit positive integer hash (parity with JS hashStringToId)
     */
    fun hashStringToId(str: String): Int {
        var hash = 0
        for (i in 0 until str.length) {
            hash = ((hash shl 5) - hash) + str[i].code
        }
        return (Math.abs(hash.toLong()) % 2000000000L).toInt() + 1
    }
}
