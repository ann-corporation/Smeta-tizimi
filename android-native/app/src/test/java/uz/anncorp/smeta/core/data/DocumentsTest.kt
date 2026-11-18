package uz.anncorp.smeta.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class DocumentsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun parsesTheRegistryShape() {
        val body = json.parseToJsonElement(
            """{"ok":true,"jami":2,"documents":[
              {"id":"12","filename":"F-2 1.pdf","type":"f2_hujjat","mime":"application/pdf","size":1500,"sha256":"abc","canonicalStatus":"READY","updatedAt":"2026-11-14T09:30:00+00:00"},
              {"id":"13","filename":"","type":"hujjat","mime":"application/octet-stream","size":0,"sha256":"","canonicalStatus":"UPLOADING","updatedAt":"2026-11-10T09:30:00+00:00"},
              {"id":"x","filename":"bad"}]}""",
        )
        val docs = parseDocuments(body)!!
        assertEquals(2, docs.size)
        assertEquals(12L, docs[0].id); assertTrue(docs[0].isF2); assertTrue(docs[0].ready); assertEquals(DocKind.PDF, docs[0].kind)
        assertEquals("hujjat-13", docs[1].name); assertFalse(docs[1].ready); assertFalse(docs[1].isF2)
        assertNull(parseDocuments(json.parseToJsonElement("""{"ok":false}""")))
        assertNull(parseDocuments(null))
    }

    @Test fun requestsCarryTheScope() {
        assertEquals("/api/hujjat-royxat?kompaniya_id=8&obyekt_id=5&limit=300", documentsRequest(8, 5))
        assertEquals("/api/hujjat-ol?id=12", documentRequest(12))
    }

    @Test fun kindFromMimeOrExtension() {
        assertEquals(DocKind.PDF, docKind("application/octet-stream", "a.PDF"))
        assertEquals(DocKind.IMAGE, docKind("image/png", "x"))
        assertEquals(DocKind.SHEET, docKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x"))
        assertEquals(DocKind.SHEET, docKind(null, "f2.xlsx"))
        assertEquals(DocKind.OTHER, docKind("application/zip", "pack.zip"))
    }

    @Test fun dispositionNameIsDecoded() {
        assertEquals("F-2 №501.pdf", parseDispositionName("attachment; filename*=UTF-8''F-2%20%E2%84%96501.pdf"))
        assertEquals("a+b.pdf", parseDispositionName("attachment; filename*=UTF-8''a%2Bb.pdf"))
        assertEquals("plain.pdf", parseDispositionName("attachment; filename=\"plain.pdf\""))
        assertNull(parseDispositionName(null))
    }

    @Test fun fileNamesCannotEscapeTheDirectory() {
        assertEquals("_x", safeFileName("../x", "f"))
        assertFalse(safeFileName("../../etc/passwd", "f").contains('/'))
        assertEquals("fallback", safeFileName("   ", "fallback"))
    }

    @Test fun notificationsKeepTheApprovalChain() {
        val body = json.parseToJsonElement(
            """{"ok":true,"oqilmagan":1,"qatorlar":[
              {"id":1,"mavzu":"hujjat.tasdiq_kutmoqda","yaratildi":"2026-11-14T08:10:00Z","oqildi":null,"parametrlar":{"zanjir_id":"7"}},
              {"id":2,"mavzu":"hujjat.xat_keldi","yaratildi":"2026-11-13T08:10:00Z","oqildi":"2026-11-13T09:00:00Z","parametrlar":{}}]}""",
        )
        val l = parseNotifications(body)!!
        assertEquals(7L, l.items[0].zanjirId); assertFalse(l.items[0].oqildi)
        assertNull(l.items[1].zanjirId); assertTrue(l.items[1].oqildi)
        assertEquals(1, l.unread)
    }
}

class DocCacheTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun roundTripIsEncryptedAtRestAndRevisionAware() {
        val c = DocCache(File(tmp.root, "docs"), FakeCipher())
        val bytes = "%PDF-1.4 secret content".toByteArray()
        c.put(8, 12, "sha-one", bytes)
        val onDisk = File(tmp.root, "docs").listFiles { f -> f.name.endsWith(".enc") }!!.single().readBytes()
        assertFalse(String(onDisk, Charsets.ISO_8859_1).contains("secret content"))
        assertArrayEquals(bytes, c.get(8, 12, "sha-one"))
        assertNull(c.get(8, 12, "sha-two"))          // another revision is not served from the old file
        assertNull(c.get(9, 12, "sha-one"))          // another company never reads it
        c.put(8, 12, "sha-two", "v2".toByteArray())   // a new revision replaces the old file
        assertFalse(c.has(8, 12, "sha-one")); assertTrue(c.has(8, 12, "sha-two"))
    }

    @Test fun corruptFileIsDroppedAndClearWipesEverything() {
        val dir = File(tmp.root, "docs")
        val c = DocCache(dir, FakeCipher())
        c.put(8, 1, "h", byteArrayOf(1, 2, 3))
        dir.listFiles { f -> f.name.endsWith(".enc") }!!.single().writeBytes(byteArrayOf(0))
        assertNull(c.get(8, 1, "h"))
        assertFalse(c.has(8, 1, "h"))
        c.put(8, 2, "h", byteArrayOf(9)); c.put(8, 3, "h", byteArrayOf(9))
        c.clear()
        assertEquals(0, dir.listFiles()!!.size)
    }

    @Test fun oldestFilesGoWhenOverTheCap() {
        val dir = File(tmp.root, "docs")
        val c = DocCache(dir, FakeCipher(), maxBytes = 2_500)
        c.put(8, 1, "h", ByteArray(1000)); dir.listFiles()!!.forEach { it.setLastModified(1_000) }
        c.put(8, 2, "h", ByteArray(1000)); c.put(8, 3, "h", ByteArray(1000))
        assertFalse(c.has(8, 1, "h")); assertTrue(c.has(8, 3, "h"))
    }
}

class BytesApiTest {
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient
    private val cred = DeviceCredential("00000000-0000-4000-8000-000000000001", "T".repeat(43), 4_000_000_000_000L)

    @Before fun setUp() {
        server = MockWebServer().also { it.start() }
        val tokens = TokenStore(File(tmp.root, "d.bin"), FakeCipher()).also { it.save(cred) }
        api = ApiClient(server.url("/"), tokens, AuthEvents(), Json { ignoreUnknownKeys = true }, "0.1.3")
    }

    @After fun tearDown() = server.shutdown()

    @Test fun downloadsBinaryThroughTheBffEnvelope() = runTest {
        val pdf = "%PDF-1.4 bytes".toByteArray()
        server.enqueue(MockResponse().setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", "attachment; filename*=UTF-8''F-2%20501.pdf").setBody(Buffer().write(pdf)))
        val r = api.bffBytes("/api/hujjat-ol?id=12", 1_000_000)
        assertEquals(200, r.status); assertArrayEquals(pdf, r.bytes); assertEquals("application/pdf", r.mime); assertEquals("F-2 501.pdf", r.filename)
        val req = server.takeRequest()
        assertEquals("/api/mobil/bff", req.path)
        assertEquals("Bearer " + cred.token, req.getHeader("Authorization"))
        val sent = Json.parseToJsonElement(req.body.readUtf8()).toString()
        assertTrue(sent.contains("\"path\":\"/api/hujjat-ol?id=12\"") && sent.contains("\"method\":\"GET\""))
    }

    @Test fun refusesOversizedAndReportsServerCodes() = runTest {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/pdf").setBody(Buffer().write(ByteArray(5000))))
        assertEquals(413, api.bffBytes("/api/hujjat-ol?id=1", 1000).status)
        server.enqueue(MockResponse().setResponseCode(402).setHeader("Content-Type", "application/json").setBody("""{"ok":false,"code":"TOLOV_KERAK"}"""))
        val pay = api.bffBytes("/api/hujjat-ol?id=1", 1000)
        assertEquals(402, pay.status); assertNull(pay.bytes); assertEquals("TOLOV_KERAK", pay.code)
        server.enqueue(MockResponse().setResponseCode(502).setHeader("Content-Type", "application/json").setBody("""{"ok":false,"code":"CANONICAL_BINARY_MISSING"}"""))
        assertEquals("CANONICAL_BINARY_MISSING", api.bffBytes("/api/hujjat-ol?id=1", 1000).code)
    }

    @Test fun networkFailureIsStatusZero() = runTest {
        server.shutdown()
        assertEquals(0, api.bffBytes("/api/hujjat-ol?id=1", 1000).status)
        assertNotNull(api)
    }
}
