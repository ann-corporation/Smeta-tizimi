package uz.anncorp.smeta.feature.zayavka

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ZayavkaTrackTest {
    private fun row(id: Long, status: String, qty: Double? = 10.0, delivered: Double? = 0.0, obyekt: Long = 1, req: String? = null, item: String = "Sement") =
        ZayavkaRow(id, obyekt, item, qty, "t", status, delivered, req, null, null, null)

    @Test fun groupsAndCounts() {
        val rows = listOf(row(1, "submitted"), row(2, "partially_delivered"), row(3, "delivered"), row(4, "cancelled"), row(5, "approved"))
        assertEquals(StatusGroup.OPEN, statusGroup("approved")); assertEquals(StatusGroup.DELIVERING, statusGroup("ordered")); assertEquals(StatusGroup.DONE, statusGroup("closed"))
        val c = groupCounts(rows)
        assertEquals(5, c[StatusGroup.ALL]); assertEquals(2, c[StatusGroup.OPEN]); assertEquals(1, c[StatusGroup.DELIVERING]); assertEquals(1, c[StatusGroup.CANCELLED])
    }

    @Test fun filtersByGroupObjectText() {
        val rows = listOf(row(1, "submitted", obyekt = 1), row(2, "submitted", obyekt = 2, item = "Gvozd"), row(3, "delivered"))
        assertEquals(listOf(1L, 2L), filterRequests(rows, StatusGroup.OPEN, null, "").map { it.id })
        assertEquals(listOf(2L), filterRequests(rows, StatusGroup.ALL, 2L, "").map { it.id })
        assertEquals(listOf(2L), filterRequests(rows, StatusGroup.ALL, null, " gvo ").map { it.id })
    }

    @Test fun timelineMarksReachedCurrentAhead() {
        val t = timeline("ordered")
        assertEquals(StepState.DONE, t.first { it.code == "approved" }.state)
        assertEquals(StepState.CURRENT, t.first { it.code == "ordered" }.state)
        assertEquals(StepState.TODO, t.first { it.code == "closed" }.state)
        val c = timeline("cancelled")
        assertEquals(listOf("submitted", "cancelled"), c.map { it.code }); assertEquals(StepState.CANCELLED, c.last().state)
        assertEquals(StepState.CURRENT, timeline("weird").first().state)
    }

    @Test fun progressNeverInventsZero() {
        assertEquals(0.25f, deliveredFraction(row(1, "ordered", 100.0, 25.0))!!, 1e-6f)
        assertEquals(1f, deliveredFraction(row(1, "ordered", 10.0, 50.0))!!, 0f)
        assertNull(deliveredFraction(row(1, "ordered", null, 5.0))); assertNull(deliveredFraction(row(1, "ordered", 0.0, 0.0))); assertNull(deliveredFraction(row(1, "ordered", 10.0, null)))
    }

    @Test fun overdueOnlyWhileOpen() {
        val today = LocalDate.of(2026, 11, 16)
        assertTrue(isOverdue(row(1, "approved", req = "2026-11-10"), today))
        assertFalse(isOverdue(row(1, "approved", req = "2026-11-16"), today))
        assertFalse(isOverdue(row(1, "delivered", req = "2026-11-10"), today))
        assertFalse(isOverdue(row(1, "approved", req = null), today))
    }

    @Test fun parsesRemainingKeepingNull() {
        val o = kotlinx.serialization.json.Json.parseToJsonElement("""{"id":7,"obyekt_id":1,"item_text":"A","requested_qty":5,"status":"approved","remaining_qty":2.5,"updated_at":"2026-11-15T10:00:00Z"}""") as kotlinx.serialization.json.JsonObject
        val r = parseRequests(listOf(o)).single()
        assertEquals(2.5, r.remaining!!, 0.0); assertEquals("2026-11-15T10:00:00Z", r.updated)
        val o2 = kotlinx.serialization.json.Json.parseToJsonElement("""{"id":8,"obyekt_id":1,"item_text":"B","status":"approved"}""") as kotlinx.serialization.json.JsonObject
        assertNull(parseRequests(listOf(o2)).single().remaining)
    }
}
