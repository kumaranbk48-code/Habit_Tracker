package com.habiz.app.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingAlarmLogicTest {

    @Test
    fun testIdempotentAddSameHabitDateType() {
        val baseTime = 1_700_000_000_000L
        val first = PendingAlarmAction(
            id = PendingAlarmLogic.makeActionId("complete", "h1", "r1", "2026-11-26"),
            type = "complete",
            habitId = "h1",
            reminderId = "r1",
            targetType = "habit",
            date = "2026-11-26",
            occurrenceMinute = "08:00",
            timestamp = baseTime
        )
        val duplicate = first.copy(timestamp = baseTime + 5000L, occurrenceMinute = "08:01")
        val snoozeSameDay = PendingAlarmAction(
            id = PendingAlarmLogic.makeActionId("snooze", "h1", "r1", "2026-11-26"),
            type = "snooze",
            habitId = "h1",
            reminderId = "r1",
            targetType = "habit",
            date = "2026-11-26",
            occurrenceMinute = "08:00",
            timestamp = baseTime + 1000L
        )

        var list = PendingAlarmLogic.addAction(emptyList(), first, baseTime)
        list = PendingAlarmLogic.addAction(list, snoozeSameDay, baseTime + 1000L)
        list = PendingAlarmLogic.addAction(list, duplicate, baseTime + 5000L)

        assertEquals(2, list.size)
        val completeEntry = list.first { it.type == "complete" }
        assertEquals(baseTime + 5000L, completeEntry.timestamp)
        assertEquals("08:01", completeEntry.occurrenceMinute)
    }

    @Test
    fun testCapAt100Entries() {
        val baseTime = 1_700_000_000_000L
        var list = emptyList<PendingAlarmAction>()
        for (i in 1..105) {
            val action = PendingAlarmAction(
                id = "complete_h${i}_2026-11-26",
                type = "complete",
                habitId = "h$i",
                reminderId = "r$i",
                targetType = "habit",
                date = "2026-11-26",
                occurrenceMinute = "09:00",
                timestamp = baseTime + i
            )
            list = PendingAlarmLogic.addAction(list, action, baseTime + i)
        }

        assertEquals(100, list.size)
        assertFalse("Oldest entries (h1..h5) must be dropped", list.any { it.habitId == "h1" || it.habitId == "h5" })
        assertTrue("Newest entry (h105) must be retained", list.any { it.habitId == "h105" })
    }

    @Test
    fun testPruneDropsEntriesOlderThan7Days() {
        val now = 1_700_000_000_000L
        val eightDaysAgo = now - (8L * 24L * 60L * 60L * 1000L)
        val twoDaysAgo = now - (2L * 24L * 60L * 60L * 1000L)

        val oldAction = PendingAlarmAction("id-old", "complete", "h-old", "r1", "habit", "2026-11-18", "08:00", eightDaysAgo)
        val recentAction = PendingAlarmAction("id-recent", "complete", "h-recent", "r2", "habit", "2026-11-24", "08:00", twoDaysAgo)

        val pruned = PendingAlarmLogic.pruneExpired(listOf(oldAction, recentAction), now)
        assertEquals(1, pruned.size)
        assertEquals("h-recent", pruned[0].habitId)
    }

    @Test
    fun testAcknowledgeRemovesOnlyMatched() {
        val a1 = PendingAlarmAction("id-1", "complete", "h1", "r1", "habit", "2026-11-26", "08:00", 1001L)
        val a2 = PendingAlarmAction("id-2", "snooze", "h2", "r2", "habit", "2026-11-26", "09:00", 1002L)
        val a3 = PendingAlarmAction("id-3", "complete", "h3", "r3", "habit", "2026-11-26", "10:00", 1003L)

        val remaining = PendingAlarmLogic.acknowledgeActions(
            listOf(a1, a2, a3),
            ackIds = setOf("id-1"),
            ackTimestamps = setOf(1003L)
        )
        assertEquals(1, remaining.size)
        assertEquals("id-2", remaining[0].id)
    }

    @Test
    fun testSyncCompletionsPreservesPendingCompleteForToday() {
        val today = "2026-11-26"
        val pendingCompleteToday = PendingAlarmAction("complete_h-local_$today", "complete", "h-local", "r1", "habit", today, "08:00", 1000L)
        val pendingSnoozeToday = PendingAlarmAction("snooze_h-snoozed_$today", "snooze", "h-snoozed", "r2", "habit", today, "08:30", 1001L)
        val pendingCompleteYesterday = PendingAlarmAction("complete_h-yest_2026-11-25", "complete", "h-yest", "r3", "habit", "2026-11-25", "08:00", 900L)

        val merged = PendingAlarmLogic.mergeCompletionsWithPending(
            serverHabitIds = listOf("h-server"),
            pendingActions = listOf(pendingCompleteToday, pendingSnoozeToday, pendingCompleteYesterday),
            todayDate = today
        )

        assertTrue(merged.contains("h-server:$today"))
        assertTrue("Pending complete for today must be preserved after syncCompletions", merged.contains("h-local:$today"))
        assertFalse("Pending snooze must NOT be treated as complete", merged.contains("h-snoozed:$today"))
        assertFalse("Pending complete from yesterday must NOT be added to today", merged.contains("h-yest:$today"))
    }

    @Test
    fun testHabitAndGoalSameEntityIdDoNotCollideInPendingActions() {
        val baseTime = 1_700_000_000_000L
        val today = "2026-11-26"

        val habitAction = PendingAlarmAction(
            id = PendingAlarmLogic.makeActionId("snooze", "shared-id", "r-habit", today, "habit"),
            type = "snooze",
            habitId = "shared-id",
            reminderId = "r-habit",
            targetType = "habit",
            date = today,
            occurrenceMinute = "08:00",
            timestamp = baseTime
        )
        val goalAction = PendingAlarmAction(
            id = PendingAlarmLogic.makeActionId("snooze", "shared-id", "r-goal", today, "goal"),
            type = "snooze",
            habitId = "shared-id",
            reminderId = "r-goal",
            targetType = "goal",
            date = today,
            occurrenceMinute = "08:00",
            timestamp = baseTime + 1000L
        )
        val goalCompleteAction = PendingAlarmAction(
            id = PendingAlarmLogic.makeActionId("complete", "shared-id", "r-goal", today, "goal"),
            type = "complete",
            habitId = "shared-id",
            reminderId = "r-goal",
            targetType = "goal",
            date = today,
            occurrenceMinute = "08:00",
            timestamp = baseTime + 2000L
        )

        assertFalse(
            "Habit and Goal action IDs must differ even if entity ID matches",
            habitAction.id == goalAction.id
        )

        var list = PendingAlarmLogic.addAction(emptyList(), habitAction, baseTime)
        list = PendingAlarmLogic.addAction(list, goalAction, baseTime + 1000L)
        list = PendingAlarmLogic.addAction(list, goalCompleteAction, baseTime + 2000L)

        assertEquals(3, list.size)

        val mergedHabits = PendingAlarmLogic.mergeCompletionsWithPending(
            serverHabitIds = emptyList(),
            pendingActions = list,
            todayDate = today
        )
        assertFalse(
            "Non-habit complete actions must never mark a habit complete",
            mergedHabits.contains("shared-id:$today")
        )
    }

    @Test
    fun testCheckCompletedDecisionUsesPerReminderAckAndNotPermanentGoalSuppression() {
        val today = "2026-11-28"
        val tomorrow = "2026-11-29"
        val acked = setOf("rem-goal-ms1:$today", "rem-topic-1:$today")

        // Marking rem-goal-ms1 done acknowledges ONLY rem-goal-ms1 on today
        assertEquals(
            "acked-today",
            PendingAlarmLogic.checkCompletedReason(
                targetType = "goal",
                entityId = "goal-1",
                reminderId = "rem-goal-ms1",
                dateStr = today,
                completedHabits = emptySet(),
                completedGoals = emptySet(),
                completedLearning = emptySet(),
                ackedRemindersByDate = acked
            )
        )
        // Another reminder (rem-goal-ms2) for the SAME goal still rings today
        assertEquals(
            null,
            PendingAlarmLogic.checkCompletedReason(
                targetType = "goal",
                entityId = "goal-1",
                reminderId = "rem-goal-ms2",
                dateStr = today,
                completedHabits = emptySet(),
                completedGoals = emptySet(),
                completedLearning = emptySet(),
                ackedRemindersByDate = acked
            )
        )
        // Acked reminder rings again tomorrow if server did not actually complete the entity
        assertEquals(
            null,
            PendingAlarmLogic.checkCompletedReason(
                targetType = "goal",
                entityId = "goal-1",
                reminderId = "rem-goal-ms1",
                dateStr = tomorrow,
                completedHabits = emptySet(),
                completedGoals = emptySet(),
                completedLearning = emptySet(),
                ackedRemindersByDate = acked
            )
        )
        // Synced completion from server suppresses all reminders of that goal
        assertEquals(
            "synced-complete",
            PendingAlarmLogic.checkCompletedReason(
                targetType = "goal",
                entityId = "goal-1",
                reminderId = "rem-goal-ms2",
                dateStr = tomorrow,
                completedHabits = emptySet(),
                completedGoals = setOf("goal-1"),
                completedLearning = emptySet(),
                ackedRemindersByDate = emptySet()
            )
        )
        // Learning topic ack behaves identically
        assertEquals(
            "acked-today",
            PendingAlarmLogic.checkCompletedReason(
                targetType = "learning_topic",
                entityId = "topic-1",
                reminderId = "rem-topic-1",
                dateStr = today,
                completedHabits = emptySet(),
                completedGoals = emptySet(),
                completedLearning = emptySet(),
                ackedRemindersByDate = acked
            )
        )
        assertEquals(
            null,
            PendingAlarmLogic.checkCompletedReason(
                targetType = "learning_journey",
                entityId = "topic-1",
                reminderId = "rem-other-topic",
                dateStr = today,
                completedHabits = emptySet(),
                completedGoals = emptySet(),
                completedLearning = emptySet(),
                ackedRemindersByDate = acked
            )
        )
    }

    @Test
    fun testDiagnosticRingBufferRetainsLast60EntriesInOrder() {
        var entries = emptyList<String>()
        for (i in 1..75) {
            entries = PendingAlarmLogic.appendDiagnosticEntry(entries, "entry-$i")
        }
        assertEquals(PendingAlarmLogic.MAX_DIAGNOSTIC_ENTRIES, entries.size)
        assertEquals("entry-16", entries.first())
        assertEquals("entry-75", entries.last())
    }
}
