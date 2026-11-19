package uz.anncorp.smeta.feature.hujjat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.feature.common.DocRow

class DocFilterTest {
    private fun d(id: Long, name: String, type: String, ready: Boolean = true) = DocRow(id, name, type, "application/octet-stream", 100, "2026-11-01T00:00:00Z", ready)
    private val rows = listOf(d(1, "F2-0014.xlsx", "f2"), d(2, "F2-0013.pdf", "f2", ready = false), d(3, "Shartnoma.docx", "shartnoma"), d(4, "AOSR-1.xlsx", "aosr"))

    @Test fun filtersByTypeTextAndReady() {
        assertEquals(listOf(1L, 2L), DocFilter(type = "f2").apply(rows).map { it.id })
        assertEquals(listOf(1L), DocFilter(type = "f2", readyOnly = true).apply(rows).map { it.id })
        assertEquals(listOf(3L), DocFilter(query = " SHART ").apply(rows).map { it.id })
        assertEquals(4, DocFilter().apply(rows).size); assertFalse(DocFilter().active); assertTrue(DocFilter(query = "x").active)
    }

    @Test fun typesMostFrequentFirst() {
        assertEquals(listOf("f2" to 2, "aosr" to 1, "shartnoma" to 1), docTypes(rows))
    }

    @Test fun uniqueNamesNeverOverwrite() {
        val taken = mutableSetOf<String>()
        assertEquals("a.xlsx", uniqueFileName("a.xlsx", taken))
        assertEquals("A (1).XLSX", uniqueFileName("A.XLSX", taken))
        assertEquals("a (2).xlsx", uniqueFileName("a.xlsx", taken))
        assertEquals("noext (1)", uniqueFileName("noext", mutableSetOf("noext")))
    }

    @Test fun spreadsheetAndSize() {
        assertTrue(isSpreadsheet("F2.XLSX")); assertFalse(isSpreadsheet("a.pdf"))
        assertEquals("512 B", sizeText(512)); assertEquals("2 KB", sizeText(2048)); assertEquals("1.5 MB", sizeText(1572864))
    }
}
