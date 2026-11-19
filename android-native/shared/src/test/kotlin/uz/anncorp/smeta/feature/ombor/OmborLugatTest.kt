package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

class OmborLugatTest {
    private fun j(s: String) = Json.parseToJsonElement(s)

    @Test fun listBodyAndParse() {
        val b = lugatListBody(8, 3, LugatType.SUPPLIER)
        assertEquals("lugat_royxat", b["amal"].str()); assertEquals("kontragent", b["tur"].str()); assertEquals(3.0, b["sklad_id"].num()!!, 0.0)
        val rows = parseLugat(j("""{"ok":true,"qatorlar":[{"id":5,"tur":"material","ibora":"mix","kanonik":"Mix 20 kg","birlik":"qop","soni":3},{"id":6,"tur":"kontragent","ibora":"aliga","kanonik":"Ali MChJ","soni":1}]}"""))!!
        assertEquals(2, rows.size); assertEquals(LugatRow(5, LugatType.MATERIAL, "mix", "Mix 20 kg", "qop", 3), rows[0]); assertEquals(LugatType.SUPPLIER, rows[1].type)
        assertNull(parseLugat(j("""{"ok":false,"code":"MIGRATSIYA_YOQ"}""")))
    }

    @Test fun editBodiesMatchTheSiteWire() {
        val add = lugatEditBody(8, 3, LugatAction.Add(LugatType.MATERIAL, "  mix ", " Mix 20 kg "))
        assertEquals("qosh", add["lugat_amal"].str()); assertEquals("mix", add["yuk"].obj()!!["ibora"].str()); assertEquals("Mix 20 kg", add["yuk"].obj()!!["kanonik"].str())
        assertEquals("nomla", lugatEditBody(8, 3, LugatAction.Rename(5, "X"))["lugat_amal"].str())
        val m = lugatEditBody(8, 3, LugatAction.Merge(listOf(5, 6), "Y"))
        assertEquals("birlashtir", m["lugat_amal"].str()); assertEquals(2, (m["yuk"].obj()!!["ids"] as JsonArray).size)
        assertEquals("ochir", lugatEditBody(8, 3, LugatAction.Delete(5))["lugat_amal"].str())
    }

    @Test fun validationAndErrors() {
        assertFalse(lugatActionValid(LugatAction.Add(LugatType.MATERIAL, " ", "x"))); assertTrue(lugatActionValid(LugatAction.Add(LugatType.MATERIAL, "a", "b")))
        assertFalse(lugatActionValid(LugatAction.Merge(listOf(1), "x"))); assertFalse(lugatActionValid(LugatAction.Rename(1, " ")))
        assertNull(lugatError(ApiResult(200, j("""{"ok":true}"""))))
        assertEquals("NETWORK", lugatError(ApiResult(0, null)))
        assertEquals("MIGRATSIYA_YOQ", lugatError(ApiResult(501, j("""{"ok":false,"code":"MIGRATSIYA_YOQ"}"""))))
    }
}
