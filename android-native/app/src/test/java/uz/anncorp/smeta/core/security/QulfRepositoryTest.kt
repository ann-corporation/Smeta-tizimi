package uz.anncorp.smeta.core.security

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi

class TasdiqStoreTest {
    private var now = 0L
    @Test fun expiresBeforeServerDoes() {
        val s = TasdiqStore { now }
        assertNull(s.current())
        s.set("tok"); now += 4 * 60_000
        assertEquals("tok", s.current())
        now += 31_000
        assertNull(s.current())
    }
    @Test fun clearForgets() { val s = TasdiqStore { now }; s.set("t"); s.clear(); assertNull(s.current()) }
}

private class FakeBff(val answers: ArrayDeque<ApiResult>) : BffApi {
    val calls = mutableListOf<Triple<String, String, JsonElement?>>()
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { calls += Triple(path, method, body); return answers.removeFirst() }
    override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody) = ApiResult(404, null)
}
private val json = Json { ignoreUnknownKeys = true }
private fun ok(s: String) = ApiResult(200, json.parseToJsonElement(s))
private fun err(status: Int, s: String) = ApiResult(status, json.parseToJsonElement(s), json.parseToJsonElement(s).jsonObject["code"]?.jsonPrimitive?.content)

@OptIn(ExperimentalCoroutinesApi::class)
class QulfRepositoryTest {
    private val tasdiq = TasdiqStore()
    private fun repo(vararg a: ApiResult) = FakeBff(ArrayDeque(a.toList())).let { it to QulfRepository(it, tasdiq) }

    @Test fun parsesState() = runTest {
        val (_, r) = repo(ok("""{"ok":true,"pin_bor":true,"bosh_vaqt_daq":15,"kalitlar":[{"id":4,"tur":"android","nom":"Pixel"},{"id":5,"tur":"webauthn","nom":null}],"rejim":"biometric_or_pin","talab":true,"usullar":["pin","qurilma"],"pin_holat":"ok","qolgan_soniya":0}"""))
        val s = r.state()!!
        assertTrue(s.pinSet); assertEquals(15, s.timeoutMin); assertEquals(2, s.devices.size); assertEquals("android", s.devices[0].kind)
        assertEquals(listOf("pin", "qurilma"), s.methods); assertTrue(s.enabled); assertTrue(s.required)
    }

    @Test fun stateNullOnServerError() = runTest { assertNull(repo(err(401, """{"ok":false,"code":"AUTH_REQUIRED"}""")).second.state()) }

    @Test fun verifyPinStoresTokenOnSuccessOnly() = runTest {
        val (f, r) = repo(ok("""{"ok":true,"tasdiq_token":"T1","usul":"pin"}"""), err(401, """{"ok":false,"code":"PIN_NOTOGRI"}"""))
        assertTrue(r.verifyPin("4827").ok); assertEquals("T1", tasdiq.current())
        tasdiq.clear()
        val bad = r.verifyPin("0001")
        assertFalse(bad.ok); assertEquals("PIN_NOTOGRI", bad.code); assertNull(tasdiq.current())
        val body = f.calls[0].third as JsonObject
        assertEquals("pin_tekshir", body["amal"]!!.jsonPrimitive.content); assertEquals("4827", body["pin"]!!.jsonPrimitive.content)
        assertEquals("/api/qulf", f.calls[0].first); assertEquals("POST", f.calls[0].second)
    }

    @Test fun blockedAndRelogin() = runTest {
        val (_, r) = repo(err(429, """{"ok":false,"code":"BLOKLANGAN","qolgan_soniya":600}"""), err(423, """{"ok":false,"code":"QAYTA_KIRISH_KERAK"}"""))
        val a = r.verifyPin("1"); assertEquals("BLOKLANGAN", a.code); assertEquals(600, a.secondsLeft)
        assertEquals("QAYTA_KIRISH_KERAK", r.verifyPin("1").code)
    }

    @Test fun networkFailureIsFlagged() = runTest { assertTrue(repo(ApiResult(0, null)).second.verifyPin("4827").network) }

    @Test fun deviceProtocolMessagesMatchServer() = runTest {
        // Must equal frontend/functions/_shared/qulf.ts qurilmaXabar(): QULF1|<purpose>|<challenge>|<credentialId>
        assertEquals("QULF1|kirish|NONCE|CRED", String(QulfRepository.message("kirish", "NONCE", "CRED")))
        assertEquals("QULF1|reg|N|C", String(QulfRepository.message("reg", "N", "C")))
        val (f, r) = repo(ok("""{"ok":true,"chaqiriq":"CQ","challenge":"CH","kredensiallar":["A","B"]}"""), ok("""{"ok":true,"tasdiq_token":"T2"}"""))
        val c = r.assertStart()!!
        assertEquals("CQ", c.challengeToken); assertEquals(listOf("A", "B"), c.credentialIds)
        assertTrue(r.assertFinish("CQ", "A", byteArrayOf(1, 2, 3)).ok)
        assertEquals("T2", tasdiq.current())
        val fin = f.calls[1].third as JsonObject
        assertEquals("qurilma_kirish_tugat", fin["amal"]!!.jsonPrimitive.content); assertEquals("AQID", fin["imzo"]!!.jsonPrimitive.content)
    }

    @Test fun registerFinishSendsSpkiAndSignature() = runTest {
        val (f, r) = repo(ok("""{"ok":true,"kredensial_id":"X"}"""))
        assertTrue(r.registerFinish("CQ", byteArrayOf(9, 9), byteArrayOf(7), "Pixel").ok)
        val b = f.calls[0].third as JsonObject
        assertEquals("qurilma_reg_tugat", b["amal"]!!.jsonPrimitive.content); assertEquals("Pixel", b["nom"]!!.jsonPrimitive.content)
    }

    @Test fun timeoutIsClampedBeforeSending() = runTest {
        val (f, r) = repo(ok("""{"ok":true}"""))
        r.setTimeout(500)
        assertEquals("60", (f.calls[0].third as JsonObject)["daq"]!!.jsonPrimitive.content)
    }
}