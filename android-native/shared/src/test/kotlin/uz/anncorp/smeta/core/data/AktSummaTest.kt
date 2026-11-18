package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AktSummaTest {
    @Test fun parsesServerPacket() {
        val b = Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"akt_id":5,"paket":{"qqs_bilan":4460408269.83,"ustamali":3982507383.78,"ustamasiz":3256132076.55,"narxsiz_soni":43}}}""")
        val r = parseAktSumma(b) as AktSumma.Known
        assertEquals(4460408269.83, r.pack.qqsBilan, 0.0); assertEquals(3982507383.78, r.pack.ustamali, 0.0); assertEquals(43, r.unpriced)
    }
    @Test fun missingFigureIsUnknownNotZero() {
        assertTrue(parseAktSumma(Json.parseToJsonElement("""{"ok":true,"natija":{"ok":true,"akt_id":5,"paket":null}}""")) is AktSumma.Unknown)
        assertEquals("AKT_NOT_FOUND", (parseAktSumma(Json.parseToJsonElement("""{"ok":true,"natija":{"ok":false,"code":"AKT_NOT_FOUND"}}""")) as AktSumma.Unknown).code)
        assertEquals(aktSummaRequest(7)["akt_id"].num(), 7.0)
    }
}
