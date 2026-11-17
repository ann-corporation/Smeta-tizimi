package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.feature.hub.FirstStepId
import uz.anncorp.smeta.feature.hub.firstSteps

private class SinovRecorder(private val answer: (String, String) -> ApiResult) : BffApi {
    val calls = mutableListOf<Triple<String, String, JsonElement?>>()
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { calls += Triple(path, method, body); return answer(path, method) }
    override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
}

private fun sres(text: String, status: Int = 200, code: String? = null) = ApiResult(status, Json.parseToJsonElement(text), code)

class SinovTest {
    @Test fun parsesStartableAccount() {
        val s = parseSinov(Json.parseToJsonElement("""{"ok":true,"boshlangan":false,"kompaniya_id":null,"haqiqiy":false,"boshlash_mumkin":true,"demo_obyekt_id":null,"demo_mavjud":false,"balans":null}"""))!!
        assertTrue(s.canStart); assertFalse(s.showChecklist); assertNull(s.balance)
    }

    @Test fun parsesTrialAccountAndHidesChecklistOnceReal() {
        val raw = """{"ok":true,"boshlangan":true,"kompaniya_id":7,"haqiqiy":%s,"boshlash_mumkin":false,"demo_obyekt_id":55,"demo_mavjud":true,"balans":1000}"""
        val trial = parseSinov(Json.parseToJsonElement(raw.format("false")))!!
        assertTrue(trial.showChecklist); assertTrue(trial.demoOpened); assertEquals(1000.0, trial.balance!!, 0.0); assertEquals(7L, trial.companyId)
        assertFalse(parseSinov(Json.parseToJsonElement(raw.format("true")))!!.showChecklist)
    }

    @Test fun oldServerOrFailureMeansNothingToShow() = runBlocking {
        assertNull(parseSinov(null)); assertNull(parseSinov(Json.parseToJsonElement("""{"ok":false}""")))
        assertNull(SinovRepository(SinovRecorder { _, _ -> ApiResult(404, null) }).state())
        assertNull(SinovRepository(SinovRecorder { _, _ -> ApiResult(0, null) }).state())
    }

    @Test fun stateReadsTheSharedCompanyEndpoint() = runBlocking {
        val api = SinovRecorder { _, _ -> sres("""{"ok":true,"boshlangan":false,"haqiqiy":false,"boshlash_mumkin":true,"demo_mavjud":false}""") }
        assertTrue(SinovRepository(api).state()!!.canStart)
        assertEquals("/api/company?sinov=1" to "GET", api.calls.single().let { it.first to it.second })
    }

    @Test fun startAndDemoSendTheWebActionsWithOperationId() = runBlocking {
        val api = SinovRecorder { _, _ -> sres("""{"ok":true,"kompaniya_id":9,"bonus_token":1000,"balans":1000,"demo_obyekt_id":77}""") }
        val repo = SinovRepository(api) { "op-1" }
        assertEquals(SinovResult.Done(9, 77, 1000.0), repo.start())
        repo.demo()
        val (a, b) = api.calls
        assertEquals("POST", a.second); assertEquals("/api/company", a.first)
        assertEquals("sinov_boshlash", (a.third as JsonObject)["action"]!!.jsonPrimitive.content)
        assertEquals("op-1", (a.third as JsonObject)["operation_id"]!!.jsonPrimitive.content)
        assertEquals("sinov_demo", (b.third as JsonObject)["action"]!!.jsonPrimitive.content)
    }

    @Test fun mapsServerCodes() = runBlocking {
        fun failing(code: String, status: Int) = SinovRepository(SinovRecorder { _, _ -> sres("""{"ok":false,"code":"$code"}""", status, code) })
        assertEquals(SinovResult.Failed(SinovError.LIMIT), failing("LIMIT", 429).start())
        assertEquals(SinovResult.Failed(SinovError.ALREADY_HAS), failing("SINOV_KERAKMAS", 409).start())
        assertEquals(SinovResult.Failed(SinovError.NO_DEMO), failing("DEMO_YOQ", 404).demo())
        assertEquals(SinovResult.Failed(SinovError.AUTH), failing("AUTH_REQUIRED", 401).start())
        assertEquals(SinovResult.Failed(SinovError.SERVER), failing("UPSTREAM", 500).start())
        assertEquals(SinovResult.Failed(SinovError.NETWORK), SinovRepository(SinovRecorder { _, _ -> ApiResult(0, null) }).start())
    }

    @Test fun firstStepsChecklist() {
        val base = SinovState(started = true, companyId = 1, real = false, canStart = false, demoObjectId = null, demoAvailable = true, balance = 1000.0)
        val steps = firstSteps(base, jarvis = true)
        assertEquals(listOf(FirstStepId.DEMO, FirstStepId.UPLOAD, FirstStepId.F2, FirstStepId.AI, FirstStepId.REAL), steps.map { it.id })
        assertFalse(steps.first().done); assertTrue(steps.first().available)
        assertFalse(firstSteps(base, jarvis = false).any { it.id == FirstStepId.AI })
        assertFalse(firstSteps(base.copy(demoAvailable = false), jarvis = true).first().available)
        assertTrue(firstSteps(base.copy(demoObjectId = 5), jarvis = true).first().done)
    }
}