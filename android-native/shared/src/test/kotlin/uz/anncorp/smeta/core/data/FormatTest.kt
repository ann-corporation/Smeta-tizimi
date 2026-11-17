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

    @Test fun parseVolumeAcceptsNegativeForNormagaKeltirish() {
        assertEquals(-2.5, parseVolume("-2,5")!!, 0.0)
        assertEquals(-2.5, parseVolume("\u22122,5")!!, 0.0)   // true minus sign
        assertEquals(-0.3, parseVolume("-0,3")!!, 0.0)
        assertEquals(-0.3, parseVolume("\u22120.3")!!, 0.0)
        assertEquals(-2.5, parseVolume("\u20132,5")!!, 0.0)   // en dash from some keyboards
        assertEquals(-1234.567, parseVolume("-1 234,567")!!, 0.0)
        assertEquals(-7.0, parseVolume("-7")!!, 0.0)
        assertEquals(0.0, parseVolume("-0,0004")!!, 0.0)       // rounds to zero: never negative zero
        assertEquals(-1.235, parseVolume("-1,2345")!!, 0.0)
    }

    @Test fun toggleMinusFlipsTheSign() {
        assertEquals("-5", toggleMinus("5")); assertEquals("5", toggleMinus("-5")); assertEquals("-", toggleMinus(""))
        assertEquals("2,5", toggleMinus("\u22122,5"))
    }

    @Test fun faktAfterCanGoBelowZero() {
        assertEquals(-0.5, faktAfter(2.0, -2.5), 0.0)
        assertEquals(4.5, faktAfter(2.0, 2.5), 0.0)
        assertEquals(0.3, faktAfter(0.1, 0.2), 0.0)
    }
    @Test fun volumeRoundsHalfUpToThreeDecimals() {
        assertEquals(1.235, parseVolume("1,2345")!!, 0.0)
        assertEquals(1.234, parseVolume("1,2344")!!, 0.0)
        assertEquals(0.001, parseVolume("0,0005")!!, 0.0)
        assertEquals(0.0, parseVolume("0,0004")!!, 0.0)
    }

    @Test fun volumeRejectsGarbage() {
        listOf("", " ", ",", ".", "abc", "1,2,3", "1.2.3", "+5", "1e5", "--5", "5-", "-", "-,", "- -5", "-1e5", "12,5m").forEach { assertNull("'$it'", parseVolume(it)) }
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

    @Test fun isoStampShownAsDayMonthYear() {
        assertEquals("14.11.2026 08:10", formatIsoStamp("2026-11-14T08:10:00+00:00"))
        assertEquals("14.11.2026 08:10", formatIsoStamp("2026-11-14 08:10"))
        assertEquals("20.11.2026", formatIsoStamp("2026-11-20"))
        assertEquals("kecha", formatIsoStamp("kecha"))
    }
}
