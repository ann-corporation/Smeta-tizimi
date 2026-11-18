package uz.anncorp.qurai.ui

import uz.anncorp.qurai.ui.components.displayToIso
import uz.anncorp.qurai.ui.components.isoToDisplay
import uz.anncorp.qurai.ui.components.isoToPickerMillis
import uz.anncorp.qurai.ui.components.pickerMillisToIso
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DatePickerTest {
    @Test fun roundTrip() {
        for (d in listOf("1970-01-01", "2026-11-18", "2024-02-29", "1999-12-31", "2000-03-01")) assertEquals(d, pickerMillisToIso(isoToPickerMillis(d)!!))
        assertEquals(0L, isoToPickerMillis("1970-01-01"))
    }
    @Test fun displayAndTyped() {
        assertEquals("18.11.2026", isoToDisplay("2026-11-18"))
        assertEquals("2026-11-05", displayToIso("5.11.2026"))
        assertNull(displayToIso("31.02.2026"))
        assertNull(isoToPickerMillis("2026-13-01"))
    }
}