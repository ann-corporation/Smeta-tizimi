package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FormatTest {
    private val nb = " "

    @Test fun moneyUzbekStyle() {
        assertEquals("1${nb}234${nb}567,89", formatMoney(1234567.89))
        assertEquals("0,00", formatMoney(0.0))
        assertEquals("-1${nb}000,50", formatMoney(-1000.5))
        assertEquals("999,99", formatMoney(999.99))
        assertEquals("1${nb}000,00", formatMoney(999.995))
        assertEquals("—", formatMoney(null))
        assertEquals("1${nb}234${nb}568", formatMoneyShort(1234567.89))
    }

    @Test fun unknownIsNotZero() {
        assertEquals("—", formatMoney(null))
        assertEquals("0,00", formatMoney(0.0))
    }

    @Test fun vatIsTwelvePercent() {
        assertEquals(112.0, withVat(100.0)!!, 1e-9)
        assertNull(withVat(null))
    }

    @Test fun volumeParsingAcceptsCommaAndDot() {
        assertEquals(12.5, parseVolume("12,5")!!, 0.0)
        assertEquals(12.5, parseVolume("12.5")!!, 0.0)
        assertEquals(1234.567, parseVolume("1 234,567")!!, 0.0)
        assertEquals(1234.567, parseVolume("1${nb}234,567")!!, 0.0)
        assertEquals(0.5, parseVolume(",5")!!, 0.0)
        assertEquals(7.0, parseVolume("7")!!, 0.0)
        assertEquals(7.0, parseVolume("7,")!!, 0.0)
    }

    @Test fun volumeRoundsHalfUpToThreeDecimals() {
        assertEquals(1.235, parseVolume("1,2345")!!, 0.0)
        assertEquals(1.234, parseVolume("1,2344")!!, 0.0)
        assertEquals(0.001, parseVolume("0,0005")!!, 0.0)
        assertEquals(0.0, parseVolume("0,0004")!!, 0.0)
    }

    @Test fun volumeRejectsGarbage() {
        listOf("", " ", ",", ".", "abc", "1,2,3", "1.2.3", "-5", "+5", "1e5", "12,5m").forEach { assertNull("'$it'", parseVolume(it)) }
    }

    @Test fun volumeFormatTrimsZeros() {
        assertEquals("12,5", formatVolume(12.5))
        assertEquals("12", formatVolume(12.0))
        assertEquals("1${nb}234,567", formatVolume(1234.567))
        assertEquals("0", formatVolume(0.0))
        assertEquals("-3,25", formatVolume(-3.25))
        assertEquals("—", formatVolume(null))
    }

    @Test fun percent() {
        assertEquals("42,6%", formatPercent(percentOf(525127000.0, 1232381500.0)))
        assertEquals("—", formatPercent(percentOf(5.0, 0.0)))
        assertEquals("—", formatPercent(percentOf(null, 10.0)))
    }
}
