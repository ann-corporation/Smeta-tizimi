package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UnitsAccessTest {
    @Test fun unitsFoldToOneCyrillicSpelling() {
        assertEquals("\u043c3", displayUnit("m3"))
        assertEquals("\u043c3", displayUnit("\u043c3"))
        assertEquals("\u043c3", displayUnit("M\u00b3"))
        assertEquals("\u043a\u0433", displayUnit("kg"))
        assertEquals("", displayUnit(null))
        assertEquals("noma", displayUnit("noma"))
    }

    @Test fun amountsNeedF2Read() {
        assertTrue(canSeeActAmounts(null))
        assertTrue(canSeeActAmounts(setOf("f2.read")))
        assertFalse(canSeeActAmounts(setOf("fakt.read")))
        assertEquals(null, aktSummaUnknownText("PERMISSION_DENIED"))
        assertEquals(null, aktSummaUnknownText("HIDDEN"))
    }
}