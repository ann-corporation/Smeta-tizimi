package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private class Rec(private val reply: ApiResult) : BffApi {
    val calls = mutableListOf<Pair<String, JsonObject?>>()
    override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult { calls += path to (body as? JsonObject); return reply }
    override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody): ApiResult = ApiResult(404, null)
}

private fun res(text: String, status: Int = 200) = ApiResult(status, Json.parseToJsonElement(text), null)

class JarvisPreviewTest {
    @Test fun previewAnswerCarriesTheConfirmationToken() {
        val r = JarvisRepository.map(res("""{"ok":true,"javob":"Ko'rib chiqing","f2_preview":{"ok":true,"holat":"tasdiq_kerak","token":"tok-1"}}"""))
        assertEquals("tok-1", (r as JarvisResult.Answer).previewToken)
    }

    @Test fun ordinaryAnswerAndNonPendingPreviewHaveNoToken() {
        assertNull((JarvisRepository.map(res("""{"ok":true,"javob":"Salom"}""")) as JarvisResult.Answer).previewToken)
        assertNull((JarvisRepository.map(res("""{"ok":true,"javob":"x","f2_preview":{"holat":"yozildi","token":"t"}}""")) as JarvisResult.Answer).previewToken)
    }

    @Test fun confirmPostsTheSameWireAsTheWebCardAndReportsFailure() = runBlocking {
        val ok = Rec(res("""{"ok":true,"holat":"yozildi"}"""))
        assertNull(JarvisRepository(ok).confirm(8, "tok-1"))
        val (path, body) = ok.calls.single()
        assertEquals("/api/f2-buyruq", path)
        assertEquals("tasdiq", body!!["amal"]!!.jsonPrimitive.content)
        assertEquals("tok-1", body["token"]!!.jsonPrimitive.content)
        assertEquals("true", body["tasdiqlayman"]!!.jsonPrimitive.content)
        assertEquals("TOKEN_YAROQSIZ", JarvisRepository(Rec(res("""{"ok":false,"code":"TOKEN_YAROQSIZ"}""", 409))).confirm(8, "x"))
    }

    @Test fun transcribeSendsBase64AndReturnsTheText() = runBlocking {
        val api = Rec(res("""{"ok":true,"text":"  kirim qil ","draft_only":true}"""))
        val (text, err) = JarvisRepository(api).transcribe(8, byteArrayOf(1, 2, 3), "audio/wav")
        assertEquals("kirim qil", text); assertNull(err)
        val (path, body) = api.calls.single()
        assertEquals("/api/ombor-ovoz", path)
        assertEquals("AQID", body!!["audio_b64"]!!.jsonPrimitive.content)
        assertEquals("audio/wav", body["mime"]!!.jsonPrimitive.content)
        val (t2, e2) = JarvisRepository(Rec(res("""{"ok":false,"code":"VOICE_NO_SPEECH"}""", 422))).transcribe(8, byteArrayOf(1), "audio/wav")
        assertNull(t2); assertEquals("VOICE_NO_SPEECH", e2)
    }
}
