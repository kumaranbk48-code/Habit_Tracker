package com.habiz.app.alarm

/**
 * Pure-Kotlin data model and helpers for durable native alarm action logging.
 * Kept free of Android framework dependencies so JVM unit tests verify all invariants directly.
 */
data class PendingAlarmAction(
    val id: String,
    val type: String, // "complete" | "snooze"
    val habitId: String,
    val reminderId: String,
    val targetType: String,
    val date: String, // yyyy-MM-dd local
    val occurrenceMinute: String, // HH:mm
    val timestamp: Long
)

object PendingAlarmLogic {
    const val MAX_PENDING_ACTIONS = 100
    const val MAX_DIAGNOSTIC_ENTRIES = 60
    const val RETENTION_MILLIS = 7L * 24L * 60L * 60L * 1000L

    /**
     * Pure decision helper for Check A completion suppression.
     * Returns a non-null reason string when the alarm must be skipped:
     * - "habit-complete": habit completed on [dateStr]
     * - "synced-complete": non-habit entity permanently synced as Completed
     * - "acked-today": non-habit reminder locally dismissed on [dateStr]
     * Returns null when the alarm must ring.
     */
    fun checkCompletedReason(
        targetType: String,
        entityId: String,
        reminderId: String,
        dateStr: String,
        completedHabits: Set<String>,
        completedGoals: Set<String>,
        completedLearning: Set<String>,
        ackedRemindersByDate: Set<String>
    ): String? {
        val type = (if (targetType.isEmpty()) "habit" else targetType).lowercase()
        return when (type) {
            "habit" -> {
                if ((entityId.isNotEmpty() && completedHabits.contains("$entityId:$dateStr")) ||
                    (reminderId.isNotEmpty() && completedHabits.contains("$reminderId:$dateStr"))
                ) {
                    "habit-complete"
                } else {
                    null
                }
            }
            "goal" -> {
                if ((entityId.isNotEmpty() && completedGoals.contains(entityId)) ||
                    (reminderId.isNotEmpty() && completedGoals.contains(reminderId))
                ) {
                    "synced-complete"
                } else if (reminderId.isNotEmpty() && ackedRemindersByDate.contains("$reminderId:$dateStr")) {
                    "acked-today"
                } else {
                    null
                }
            }
            "learning_journey", "learning_topic", "learning" -> {
                if ((entityId.isNotEmpty() && completedLearning.contains(entityId)) ||
                    (reminderId.isNotEmpty() && completedLearning.contains(reminderId))
                ) {
                    "synced-complete"
                } else if (reminderId.isNotEmpty() && ackedRemindersByDate.contains("$reminderId:$dateStr")) {
                    "acked-today"
                } else {
                    null
                }
            }
            else -> null
        }
    }

    fun isEntityCompletedDecision(
        targetType: String,
        entityId: String,
        reminderId: String,
        dateStr: String,
        completedHabits: Set<String>,
        completedGoals: Set<String>,
        completedLearning: Set<String>,
        ackedRemindersByDate: Set<String>
    ): Boolean = checkCompletedReason(
        targetType = targetType,
        entityId = entityId,
        reminderId = reminderId,
        dateStr = dateStr,
        completedHabits = completedHabits,
        completedGoals = completedGoals,
        completedLearning = completedLearning,
        ackedRemindersByDate = ackedRemindersByDate
    ) != null

    /**
     * Prunes `<key>:<yyyy-MM-dd>` entries whose suffix is strictly older than [cutoffDateStr].
     */
    fun pruneDateScopedEntries(entries: Set<String>, cutoffDateStr: String): MutableSet<String> {
        val pruned = mutableSetOf<String>()
        for (entry in entries) {
            val sepIdx = entry.lastIndexOf(':')
            if (sepIdx <= 0 || sepIdx >= entry.length - 1) continue
            val entryDate = entry.substring(sepIdx + 1)
            if (entryDate.length == 10 && entryDate >= cutoffDateStr) {
                pruned.add(entry)
            }
        }
        return pruned
    }

    /**
     * Appends a diagnostic log entry while retaining only the most recent [MAX_DIAGNOSTIC_ENTRIES].
     */
    fun appendDiagnosticEntry(existing: List<String>, entry: String): List<String> {
        val combined = existing + entry
        return if (combined.size > MAX_DIAGNOSTIC_ENTRIES) {
            combined.subList(combined.size - MAX_DIAGNOSTIC_ENTRIES, combined.size).toList()
        } else {
            combined.toList()
        }
    }

    fun makeActionId(
        type: String,
        habitId: String,
        reminderId: String,
        date: String,
        targetType: String = "habit"
    ): String {
        val entityKey = if (habitId.isNotEmpty()) habitId else reminderId
        val normType = targetType.ifEmpty { "habit" }.lowercase()
        return if (normType == "habit") {
            "${type}_${entityKey}_${date}"
        } else {
            "${type}_${normType}_${entityKey}_${date}"
        }
    }

    fun pruneExpired(actions: List<PendingAlarmAction>, nowMillis: Long): List<PendingAlarmAction> {
        return actions.filter { action ->
            action.timestamp > 0L && (nowMillis - action.timestamp) <= RETENTION_MILLIS
        }
    }

    fun addAction(
        actions: List<PendingAlarmAction>,
        newAction: PendingAlarmAction,
        nowMillis: Long = newAction.timestamp
    ): List<PendingAlarmAction> {
        val fresh = pruneExpired(actions, nowMillis)
        val newTargetType = newAction.targetType.ifEmpty { "habit" }
        val filtered = fresh.filterNot { existing ->
            existing.type == newAction.type &&
                existing.date == newAction.date &&
                existing.targetType.ifEmpty { "habit" }.equals(newTargetType, ignoreCase = true) &&
                if (newAction.habitId.isNotEmpty()) {
                    existing.habitId == newAction.habitId
                } else {
                    existing.reminderId == newAction.reminderId
                }
        }.toMutableList()

        filtered.add(newAction)

        return if (filtered.size > MAX_PENDING_ACTIONS) {
            filtered.subList(filtered.size - MAX_PENDING_ACTIONS, filtered.size).toList()
        } else {
            filtered
        }
    }

    fun acknowledgeActions(
        actions: List<PendingAlarmAction>,
        ackIds: Set<String> = emptySet(),
        ackTimestamps: Set<Long> = emptySet(),
        clearAll: Boolean = false
    ): List<PendingAlarmAction> {
        if (clearAll) return emptyList()
        if (ackIds.isEmpty() && ackTimestamps.isEmpty()) return actions
        return actions.filterNot { action ->
            (ackIds.isNotEmpty() && ackIds.contains(action.id)) ||
                (ackTimestamps.isNotEmpty() && ackTimestamps.contains(action.timestamp))
        }
    }

    /**
     * Re-adds "$habitId:$todayDate" for any un-acked pending "complete" habit action of today
     * so Check A preserves local native completions until the server catches up.
     */
    fun mergeCompletionsWithPending(
        serverHabitIds: Collection<String>,
        pendingActions: List<PendingAlarmAction>,
        todayDate: String
    ): Set<String> {
        val result = mutableSetOf<String>()
        for (hId in serverHabitIds) {
            if (hId.isNotEmpty()) {
                result.add("$hId:$todayDate")
            }
        }
        for (action in pendingActions) {
            val isHabit = action.targetType.isEmpty() || action.targetType.equals("habit", ignoreCase = true)
            if (isHabit &&
                action.type == "complete" &&
                action.date == todayDate &&
                action.habitId.isNotEmpty()
            ) {
                result.add("${action.habitId}:$todayDate")
            }
        }
        return result
    }
}
