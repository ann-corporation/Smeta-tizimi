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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class AuthRepositoryTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var tokens: TokenStore
    private lateinit var auth: AuthRepository
    private val json = Json { ignoreUnknownKeys = true }
    private val device = "00000000-0000-4000-8000-0000000000aa"
    private val token = "Z".repeat(43)

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        tokens = TokenStore(File(tmp.root, "d.bin"), FakeCipher())
        auth = AuthRepository(server.url("/"), tokens, json, "0.1.1", { "Test" }, { "Android 14" })
    }

    @After fun tearDown() = server.shutdown()

    private fun enrolOk() = MockResponse().setBody("""{"ok":true,"device_id":"$device","token":"$token","tugaydi":4000000000000}""")

    @Test fun passwordLoginEnrolsDeviceWithTemporaryCookieThenDropsIt() = runTest {
        server.enqueue(MockResponse().setHeader("Set-Cookie", "sess=abc; Path=/; HttpOnly").setBody("""{"ok":true}"""))
        server.enqueue(enrolOk())
        val s = auth.newSession()
        assertEquals(AuthOutcome.Success, auth.loginPassword(s, "fake-user", "fake-pass"))

        val login = server.takeRequest()
        assertEquals("/api/kirish", login.path)
        assertTrue(login.getHeader("Origin")!!.startsWith("http://"))
        assertNull(login.getHeader("Authorization"))
        val enrol = server.takeRequest()
        assertEquals("/api/desktop/qurilma", enrol.path)
        assertEquals("sess=abc", enrol.getHeader("Cookie"))
        val body = json.parseToJsonElement(enrol.body.readUtf8()) as JsonObject
        assertNotNull(body["operation_id"])
        assertEquals("0.1.1", body["ilova_versiya"]!!.jsonPrimitive.content)

        assertEquals(DeviceCredential(device, token, 4000000000000), tokens.load())
        // The cookie must be gone after enrolment.
        server.enqueue(MockResponse().setBody("{}"))
        s.client.newCall(okhttp3.Request.Builder().url(server.url("/x")).build()).execute().close()
        assertNull(server.takeRequest().getHeader("Cookie"))
    }

    @Test fun wrongCredentialsGiveBadCredentialsAndStoreNothing() = runTest {
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"xato":"nope"}"""))
        val r = auth.loginPassword(auth.newSession(), "fake-user", "wrong")
        assertEquals(AuthOutcome.Failure(AuthError.BAD_CREDENTIALS), r)
        assertNull(tokens.load())
        assertEquals(1, server.requestCount)
    }

    @Test fun rateLimitAndServerErrorsAreDistinguished() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setBody("{}"))
        assertEquals(AuthOutcome.Failure(AuthError.RATE_LIMITED), auth.loginPassword(auth.newSession(), "a", "b"))
        server.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
        assertEquals(AuthOutcome.Failure(AuthError.SERVER), auth.loginPassword(auth.newSession(), "a", "b"))
    }

    @Test fun enrolPolicyRefusalsMapToSpecificErrors() = runTest {
        for ((status, code, expected) in listOf(
            Triple(429, "DEVICE_LIMIT", AuthError.DEVICE_LIMIT),
            Triple(426, "DESKTOP_UPDATE_REQUIRED", AuthError.UPDATE_REQUIRED),
            Triple(403, "DESKTOP_DISABLED", AuthError.DISABLED),
        )) {
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            server.enqueue(MockResponse().setResponseCode(status).setBody("""{"ok":false,"code":"$code"}"""))
            assertEquals(AuthOutcome.Failure(expected), auth.loginPassword(auth.newSession(), "a", "b"))
        }
        assertNull(tokens.load())
    }

    @Test fun googleFlowPostsCredentialThenEnrols() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"clientId":"web-client.apps.googleusercontent.com"}"""))
        server.enqueue(MockResponse().setHeader("Set-Cookie", "sess=g; Path=/").setBody("""{"ok":true}"""))
        server.enqueue(enrolOk())
        val s = auth.newSession()
        assertEquals("web-client.apps.googleusercontent.com", auth.googleClientId(s))
        assertEquals(AuthOutcome.Success, auth.loginGoogle(s, "fake.id.token"))
        server.takeRequest()
        val post = server.takeRequest()
        assertEquals("/api/kirish-google", post.path)
        assertTrue(post.body.readUtf8().contains("\"credential\":\"fake.id.token\""))
        assertNotNull(tokens.load())
    }

    @Test fun telegramStartAndPollMapping() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"nonce":"n1","sir":"s1","belgi":"1234","havola":"https://t.me/bot?start=n1","tugaydi":"2099-01-01T00:00:00Z"}"""))
        val (start, err) = auth.telegramStart(auth.newSession())
        assertNull(err)
        assertEquals("https://t.me/bot?start=n1", start!!.link)
        assertEquals("1234", start.code)
        assertTrue(start.expiresAtMs > System.currentTimeMillis())

        val s = auth.newSession()
        server.enqueue(MockResponse().setBody("""{"ok":true,"holat":"kutmoqda"}"""))
        assertEquals(PollResult.Waiting, auth.telegramPoll(s, "n1", "s1"))
        server.enqueue(MockResponse().setHeader("Set-Cookie", "sess=t; Path=/").setBody("""{"ok":true,"holat":"tayyor"}"""))
        assertEquals(PollResult.Ready, auth.telegramPoll(s, "n1", "s1"))
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"ok":false,"code":"KIRISH_RAD"}"""))
        assertEquals(PollResult.Denied, auth.telegramPoll(s, "n1", "s1"))
        server.enqueue(MockResponse().setResponseCode(410).setBody("""{"ok":false,"code":"MUDDATI_OTGAN"}"""))
        assertEquals(PollResult.Expired, auth.telegramPoll(s, "n1", "s1"))
        server.enqueue(MockResponse().setResponseCode(502).setBody("{}"))
        assertEquals(PollResult.Transient, auth.telegramPoll(s, "n1", "s1"))
    }

    @Test fun telegramDisabledMapsToOff() = runTest {
        server.enqueue(MockResponse().setResponseCode(503).setBody("""{"ok":false,"code":"YOQILMAGAN"}"""))
        assertEquals(AuthError.TELEGRAM_OFF, auth.telegramStart(auth.newSession()).second)
    }
}
