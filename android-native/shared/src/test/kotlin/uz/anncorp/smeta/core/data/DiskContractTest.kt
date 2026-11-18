package uz.anncorp.smeta.feature.disk

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class DiskContractTest {
    @Test fun paths() {
        assertEquals("/api/hujjat-maydoni?amal=royxat", diskListPath(DiskTab.MINE, 5))
        assertEquals("/api/hujjat-maydoni?amal=royxat&kompaniya_id=5&papka_id=9", diskListPath(DiskTab.COMPANY, 5, 9))
        assertEquals("/api/hujjat-maydoni?amal=royxat&savat=1&kompaniya_id=5", diskListPath(DiskTab.TRASH, 5))
        assertEquals("/api/hujjat-maydoni?amal=ulashilgan", diskListPath(DiskTab.SHARED, 5))
    }

    @Test fun parsesListing() {
        val l = parseDiskListing(Json.parseToJsonElement("""{"ok":true,"daraja":3,"shaxsiy":true,"yol":[{"id":1,"nom":"A"}],"papkalar":[{"id":2,"nom":"P","tizim":false}],"fayllar":[{"id":3,"nom":"f.pdf","bayt":2048,"versiya":2,"yangilandi":"2026-11-14T08:00:00+00:00","savatda":null,"izohlar":1}]}"""))
        assertNotNull(l)
        val rows = l!!.toRows()
        assertEquals(listOf("p2", "f3"), rows.map { it.key })
        assertEquals("14.11.2026", rows[1].meta)
        assertEquals("2,0 KB  \u00b7  v2", rows[1].sub)
    }

    @Test fun sharedAndBytes() {
        val s = parseDiskShared(Json.parseToJsonElement("""{"ok":true,"royxat":[{"turi":"fayl","id":7,"nom":"x","bergan":"Ali"}]}"""))
        assertEquals(1, s!!.size)
        assertEquals("", formatBytes(null))
        assertEquals("512 B", formatBytes(512))
    }
}