package uz.anncorp.smeta.feature.common

import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull

class ActDirectTest {
    private fun row(id: Long, s: Double?) = ActRow(id, null, "n$id", null, 1.0, null, s)

    @Test fun unpricedRowsAreCountedNotAddedAsZero() {
        val d = actDirect(listOf(row(1, 10.5), row(2, null), row(3, -2.5)))
        assertEquals(8.0, d.total!!, 1e-9)
        assertEquals(2, d.priced)
        assertEquals(1, d.unpriced)
    }

    @Test fun noPricedRowsMeansUnknownTotalNotZero() {
        val d = actDirect(listOf(row(1, null), row(2, null)))
        assertNull(d.total)
        assertEquals(2, d.unpriced)
        assertNull(actDirect(emptyList()).total)
    }

    @Test fun explicitZeroSumIsAKnownZero() {
        assertEquals(0.0, actDirect(listOf(row(1, 0.0))).total!!, 1e-9)
    }
}

