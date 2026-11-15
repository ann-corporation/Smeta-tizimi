package uz.anncorp.smeta.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** Sign-up and invite acceptance run before device enrolment, with the temporary cookie jar (same as sign-in). */
class SignUpFlowTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var tokens: TokenStore
    private lateinit var auth: AuthRepository
    private val json = Json { ignoreUnknownKeys = true }
    private fun enrolOk() = MockResponse().setBody("""{"ok":true,"device_id":"00000000-0000-4000-8000-0000000000aa","token":"${"Z".repeat(43)}","tugaydi":4000000000000}""")

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        tokens = TokenStore(File(tmp.root, "d.bin"), FakeCipher())
        auth = AuthRepository(server.url("/"), tokens, json, "0.1.1", { "Test" }, { "Android 14" })
    }
    @After fun tearDown() = server.shutdown()

    @Test fun emailCodeReturnsVerificationIdAndLowercasesTheAddress() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"tasdiqlash_id":"v-1"}"""))
        val (sent, err) = auth.requestEmailCode(auth.newSession(), " Test@Example.UZ ")
        assertNull(err); assertEquals("v-1", sent!!.verificationId)
        val req = server.takeRequest()
        assertEquals("/api/royxat-email-kod", req.path)
        assertEquals("test@example.uz", (json.parseToJsonElement(req.body.readUtf8()) as JsonObject)["email"]!!.jsonPrimitive.content)
    }

    @Test fun emailCodeFailureMapsToTheAppError() = runTest {
        server.enqueue(MockResponse().setResponseCode(503).setBody("""{"ok":false,"code":"EMAIL_XIZMATI_SOZLANMAGAN"}"""))
        assertEquals(AuthError.EMAIL_OFF, auth.requestEmailCode(auth.newSession(), "a@b.uz").second)
    }

    @Test fun signUpCreatesTheAccountThenSignsInAndEnrolsTheDevice() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"login":"a@b.uz"}"""))
        server.enqueue(MockResponse().setHeader("Set-Cookie", "sess=abc; Path=/; HttpOnly").setBody("""{"ok":true}"""))
        server.enqueue(enrolOk())
        val r = auth.signUpEmail(auth.newSession(), "A@B.uz", "v-1", "123456", " Ali Valiyev ", "password1", "op-9")
        assertEquals(AuthOutcome.Success, r)
        val reg = json.parseToJsonElement(server.takeRequest().also { assertEquals("/api/royxat-ozi", it.path) }.body.readUtf8()) as JsonObject
        assertEquals("a@b.uz", reg["login"]!!.jsonPrimitive.content); assertEquals("Ali Valiyev", reg["ism"]!!.jsonPrimitive.content)
        assertEquals("v-1", reg["tasdiqlash_id"]!!.jsonPrimitive.content); assertEquals("op-9", reg["operation_id"]!!.jsonPrimitive.content)
        assertEquals("/api/kirish", server.takeRequest().path)
        val enrol = server.takeRequest()
        assertEquals("/api/desktop/qurilma", enrol.path); assertEquals("sess=abc", enrol.getHeader("Cookie"))
        assertNotNull(tokens.load())
    }

    @Test fun wrongCodeStopsBeforeSignInAndStoresNothing() = runTest {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"ok":false,"code":"KOD_NOTOGRI"}"""))
        val r = auth.signUpEmail(auth.newSession(), "a@b.uz", "v-1", "000000", "Ali", "password1")
        assertEquals(AuthOutcome.Failure(AuthError.CODE_WRONG), r)
        assertEquals(1, server.requestCount); assertNull(tokens.load())
    }

    @Test fun inviteByTokenAndByPhoneCode() = runTest {
        server.enqueue(MockResponse().setHeader("Set-Cookie", "sess=t; Path=/; HttpOnly").setBody("""{"ok":true,"yangi":true,"rol":"pto"}"""))
        server.enqueue(enrolOk())
        assertEquals(AuthOutcome.Success, auth.acceptInvite(auth.newSession(), "T".repeat(24), null, null, "password1", "op-1"))
        val b1 = json.parseToJsonElement(server.takeRequest().body.readUtf8()) as JsonObject
        assertEquals("qabul", b1["amal"]!!.jsonPrimitive.content); assertEquals("T".repeat(24), b1["token"]!!.jsonPrimitive.content); assertNull(b1["kod"])
        server.takeRequest()

        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"ok":false,"code":"TAKLIF_RAD"}"""))
        assertEquals(AuthOutcome.Failure(AuthError.INVITE_BAD), auth.acceptInvite(auth.newSession(), null, "+998901234567", "12345678", "password1"))
        val b2 = json.parseToJsonElement(server.takeRequest().body.readUtf8()) as JsonObject
        assertEquals("12345678", b2["kod"]!!.jsonPrimitive.content); assertEquals("+998901234567", b2["telefon"]!!.jsonPrimitive.content)
    }
}
