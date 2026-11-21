package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.*
import org.junit.Test

class JarvisWarehouseTest {
    private fun frame(company: Long = 17, result: String = "null"): JarvisWarehouse? = parseJarvisWarehouse(Json.parseToJsonElement("""
        {"company":17,"question":"10 qop sement kirim qil","warehouseId":3,
        "warehouses":[{"id":3,"kompaniya_id":17,"nomi":"Ombor 3","yozish":true},
          {"id":4,"kompaniya_id":99,"nomi":"Begona","yozish":true}],"result":$result}
    """), company)
    private val preview = """{"ok":true,"holat":"tasdiq_kerak","token":"synthetic-signed","preview":{"narx":0,"narx_rejim_sorov":false}}"""

    @Test fun companyAndWarehouseRemainBoundToTheServerFrame() {
        assertNull(frame(99))
        assertEquals(listOf(3L), frame()!!.warehouses.map { it.id })
        assertNull(frame()!!.request(4))
        val body = frame()!!.request(3)!!.body
        assertEquals("tahlil", body["amal"].str())
        assertEquals("10 qop sement kirim qil", body["matn"].str())
        assertFalse(body.containsKey("actor_id"))
    }
    @Test fun confirmationRequiresAnActualPreviewAndAnExplicitRequest() {
        assertNull(frame()!!.request(3, confirm = true))
        val model = frame(result = preview)!!
        assertEquals("tahlil", model.request(3)!!.body["amal"].str())
        val confirmed = model.request(3, confirm = true)!!.body
        assertEquals("tasdiq", confirmed["amal"].str())
        assertEquals("synthetic-signed", confirmed["token"].str())
        assertEquals(confirmed, model.request(3, confirm = true)!!.body)
        assertNull(frame(result = preview.replace("false", "true"))!!.request(3, confirm = true))
    }
    @Test fun zeroPriceRemainsZeroAndMissingPriceRemainsAbsent() {
        assertEquals("0", frame(result = preview)!!.result?.get("preview").obj()?.get("narx").str())
        assertNull(frame(result = """{"ok":true,"holat":"savol"}""")!!.result?.get("preview").obj()?.get("narx"))
    }
    @Test fun answerMappingPreservesProposalOnlyInsideExpectedCompany() {
        val warehouse = Json.parseToJsonElement("""{"company":17,"question":"mix kirim qil","warehouseId":null,"warehouses":[{"id":3,"kompaniya_id":17,"nomi":"Ombor","yozish":true}],"result":null}""")
        val reply = ApiResult(200, JsonObject(mapOf("javob" to kotlinx.serialization.json.JsonPrimitive("Taklif"), "warehouse_reply" to warehouse)))
        assertNotNull((JarvisRepository.map(reply, 17) as JarvisResult.Answer).warehouse)
        assertNull((JarvisRepository.map(reply, 99) as JarvisResult.Answer).warehouse)
        val both = ApiResult(200, JsonObject(reply.body.obj().orEmpty() + mapOf("f2_preview" to Json.parseToJsonElement("""{"holat":"tasdiq_kerak","token":"synthetic-f2"}"""))))
        val answer = JarvisRepository.map(both, 17) as JarvisResult.Answer
        assertEquals("synthetic-f2", answer.previewToken)
        assertNotNull(answer.warehouse)
    }
}
