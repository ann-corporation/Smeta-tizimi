package uz.anncorp.smeta.feature.zayavka

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class ZayavkaContractTest {
    @Test fun payloadMatchesWebCommand() {
        val p = requestPayload(17, 5, " Sement ", BigDecimal("2.50"), "tonna", "", "orta", "BL 311-01", "11111111-1111-4111-8111-111111111111")
        assertEquals("erp_amal", p["amal"]!!.jsonPrimitive.content)
        assertEquals("zayavka_yarat", p["operatsiya"]!!.jsonPrimitive.content)
        val pl = p["payload"]!!.jsonObject
        assertEquals("Sement", pl["item_text"]!!.jsonPrimitive.content)
        assertEquals("2.5", pl["requested_qty"]!!.jsonPrimitive.content)
        assertEquals("null", pl["required_date"]!!.toString())
        assertEquals("11111111-1111-4111-8111-111111111111", pl["operation_id"]!!.jsonPrimitive.content)
    }

    @Test fun validation() {
        assertNull(validateRequest(5, "Sement", "2,5", ""))
        assertEquals("obyekt", validateRequest(null, "Sement", "2", ""))
        assertEquals("nom", validateRequest(5, " ", "2", ""))
        assertEquals("miqdor", validateRequest(5, "Sement", "0", ""))
        assertEquals("miqdor", validateRequest(5, "Sement", "-3", ""))
        assertEquals("sana", validateRequest(5, "Sement", "2", "20.11.2026"))
    }

    @Test fun roles() {
        assertTrue(canRequestMaterial("prorab")); assertTrue(canRequestMaterial("PTO")); assertFalse(canRequestMaterial("omborchi")); assertFalse(canRequestMaterial(null))
    }

    @Test fun noteKeepsRowCode() {
        assertEquals("BL 311-01 \u00B7 tez kerak", composeNote("311-01", "tez kerak"))
        assertNull(composeNote("", " "))
    }

    @Test fun parsesWebRowsAndOldStatuses() {
        val rows: List<JsonObject> = listOf(
            buildJsonObject { put("id", 1); put("obyekt_id", 5); put("item_text", "Sement"); put("requested_qty", 2.0); put("unit", "t"); put("status", "kutilmoqda") },
            buildJsonObject { put("id", 2); put("maxsulot", "Gvozd"); put("holat", "weird") },
            buildJsonObject { put("item_text", "no id") },
        )
        val r = parseRequests(rows)
        assertEquals(2, r.size)
        assertEquals("submitted", r[0].status)
        assertEquals("draft", r[1].status)
        assertEquals("Gvozd", r[1].item)
    }
}