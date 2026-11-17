package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OmborP8Test {
    private fun obj(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test fun fuzzyToleratesTyposAndScripts() {
        assertTrue(matchesQuery("Sement M400 (qop 50 kg)", "cement"))
        assertTrue(matchesQuery("Sement M400 (qop 50 kg)", "semnt"))
        assertTrue(matchesQuery("Sement M400 (qop 50 kg)", "sment"))
        assertTrue(matchesQuery("Sement M400", "\u0446\u0435\u043C\u0435\u043D\u0442"))
        assertTrue(matchesQuery("Armatura A500C d12", "armtura"))
        assertTrue(matchesQuery("Armatura A500C d12", "armatura 12"))
        assertTrue(matchesQuery("Xlor ohak", "hlor"))
        assertFalse(matchesQuery("Qum yuvilgan", "sement"))
        assertFalse(matchesQuery("Sement M400", "sement armatura"))
        // short tokens stay exact: no wild matches
        assertFalse(matchesQuery("Gvozd 100", "gvz"))
    }

    @Test fun cleanMatchesRankBeforeTypoMatches() {
        val rows = listOf(StockRow(1, "Cement tipi", "t", 1.0), StockRow(1, "Sement M400", "t", 2.0), StockRow(1, "Semnt eski", "t", 3.0))
        val r = filterStock(rows, OmborScope.AllObjects, "sement").map { it.nomi }
        assertEquals("Semnt eski", r.last())
        assertTrue(r.size == 3)
    }

    @Test fun editDistanceBasics() {
        assertEquals(1, editDistance("sement", "semnt", 2))
        assertEquals(1, editDistance("ab", "ba", 2))
        assertEquals(3, editDistance("abcdef", "x", 2))
    }

    @Test fun historyParsesOnlyReceiptsAndIssues() {
        val rows = listOf(
            obj("""{"id":2,"obyekt_id":101,"operatsiya":"rasxod","nomi":"Sement","birligi":"qop","obyomi":40,"sana":"2026-11-16","izoh":"x"}"""),
            obj("""{"id":1,"obyekt_id":101,"operatsiya":"prixod","nomi":"Sement","birligi":"qop","obyomi":240,"sana":"2026-11-15"}"""),
            obj("""{"id":3,"operatsiya":"storno","nomi":"Sement","birligi":"qop","obyomi":1}"""),
        )
        val m = parseHistory(rows)
        assertEquals(2, m.size)
        assertEquals(listOf(1L), filterMoves(m, true, OmborScope.AllObjects, "").map { it.id })
        assertEquals(2, materialHistory(m, "Sement", "qop", 101).size)
        assertEquals(0, materialHistory(m, "Sement", "qop", 5).size)
    }

    @Test fun balanceIsReceiptsMinusIssues() {
        val m = parseHistory(listOf(
            obj("""{"id":2,"obyekt_id":101,"operatsiya":"rasxod","nomi":"Sement","birligi":"qop","obyomi":40,"sana":"2026-11-16"}"""),
            obj("""{"id":1,"obyekt_id":101,"operatsiya":"prixod","nomi":"SEMENT","birligi":"qop","obyomi":240,"sana":"2026-11-15"}"""),
        ))
        val b = balanceFromMoves(m)
        assertEquals(1, b.size)
        assertEquals(200.0, b[0].qoldiq!!, 1e-9)
        assertEquals("2026-11-16", b[0].oxirgi)
    }

    @Test fun commandPreviewParsing() {
        val p = parseCommandPreview(Json.parseToJsonElement("""{"ok":true,"buyruq":{"tur":"prixod","nomi":"Sement","birligi":"qop","miqdor":40,"obyekt_id":101,"eshitildi":"sement qirq qop"}}"""))!!
        assertEquals(CommandKind.RECEIVE, p.kind)
        assertEquals(40.0, p.qty!!, 0.0)
        assertTrue(p.canSave())
        assertEquals("sement qirq qop", p.heard)
        val w = parseCommandPreview(Json.parseToJsonElement("""{"ok":true,"natija":{"buyruq":{"tur":"qoldiq","nomi":"Sement","javob":"Qoldiq 200 qop"}}}"""))!!
        assertEquals(CommandKind.BALANCE, w.kind)
        assertFalse(w.canSave())
        assertNull(parseCommandPreview(Json.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseCommandPreview(Json.parseToJsonElement("""{"ok":true}""")))
        assertNotNull(parseCommandPreview(Json.parseToJsonElement("""{"buyruq":{"tur":"zzz"}}""")))
    }

    @Test fun commandBodies() {
        val t = textCommandBody(7, "  sement 40 qop  ", "uz")
        assertEquals("sement 40 qop", t["matn"].toString().trim('"'))
        val a = audioCommandBody(7, RecordedAudio(byteArrayOf(1, 2, 3), "audio/mp4", 900), "ru")
        assertEquals("AQID", a["audio_b64"].toString().trim('"'))
    }
}