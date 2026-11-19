package uz.anncorp.smeta.feature.foto

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/** PARITY with the website: fixtures of frontend/src/lib/foto-dalil.test.ts (olchamHisobla, faylSanasi, fotoGuruhla, oyOraligi). */
class FotoDalilParityTest {
    private fun f(id: Long, sana: String, rid: Long?, nom: String?, izoh: String? = null, ai: String? = null) = FotoElement(id, id + 100, "qator", 5, rid, nom, sana, izoh, ai, "a.jpg", "Beton")

    @Test fun sizeFile() {
        assertEquals(Triple(1600, 1200, true), olchamHisobla(4000.0, 3000.0)); assertEquals(Triple(1200, 800, false), olchamHisobla(1200.0, 800.0)); assertEquals(false, olchamHisobla(0.0, 10.0).third)
    }

    @Test fun fileDateFallsToToday() {
        val hozir = LocalDate.of(2026, 11, 12)
        fun ms(d: LocalDate) = d.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        assertEquals("2026-11-03", faylSanasi(ms(LocalDate.of(2026, 11, 3)), hozir)); assertEquals("2026-11-12", faylSanasi(ms(LocalDate.of(2030, 1, 1)), hozir)); assertEquals("2026-11-12", faylSanasi(0, hozir))
    }

    @Test fun grouping() {
        val l = listOf(f(1, "2026-11-01", 7, "Poydevor"), f(2, "2026-11-03", null, null), f(3, "2026-11-03", 7, "Poydevor"))
        assertEquals(listOf("2026-11-03", "2026-11-01"), fotoGuruhla(l, true).map { it.kalit })
        val r = fotoGuruhla(l, false)
        assertEquals(listOf("Poydevor", "Razdelsiz"), r.map { it.sarlavha }); assertEquals(2, r[0].fotolar.size)
    }

    @Test fun monthRangeCaptionAndParse() {
        assertEquals("2026-02-01" to "2026-02-28", oyOraligi("2026-02")); assertNull(oyOraligi("2026-13"))
        assertEquals("qoldan", fotoIzohi(f(1, "2026-11-01", 1, "A", izoh = "qoldan", ai = "beton"))); assertEquals("beton", fotoIzohi(f(1, "2026-11-01", 1, "A", ai = "beton"))); assertEquals("Fakt yozuvi", manbaNomi("fakt"))
        val r = parseFotoRoyxat(Json.parseToJsonElement("""{"ok":true,"jami":1,"fotolar":[{"id":1,"document_id":9,"manba_turi":"qator","manba_id":5,"razdel_id":7,"razdel_nom":"P","sana":"2026-11-01","izoh":null,"ai_izoh":null,"original_filename":"a.jpg","manba_nom":"Beton"}],"sanalar":[],"razdellar":[{"razdel_id":7,"nom":"P","soni":1}]}"""))
        assertNotNull(r); assertEquals(1, r!!.fotolar.size); assertEquals(9L, r.fotolar[0].documentId); assertEquals(1, r.razdellar[0].soni)
        assertNull(parseFotoRoyxat(Json.parseToJsonElement("""{"ok":false}""")))
    }
}
