package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class CachingBffApiTest {
    private class Xor : SecretCipher {
        override fun encrypt(plain: ByteArray) = ByteArray(plain.size) { (plain[it].toInt() xor 0x5A).toByte() }
        override fun decrypt(data: ByteArray) = encrypt(data)
    }
    private class Fake(var online: Boolean = true) : BffApi {
        var calls = 0
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            calls++
            return if (online) ApiResult(200, buildJsonObject { put("ok", true); put("v", "live") }) else ApiResult(0, null)
        }
        override suspend fun upload(companyId: Long, obyektId: Long, body: okhttp3.RequestBody) = ApiResult(0, null)
    }
    private val q = buildJsonObject { put("soro", "akt_reestr_obyekt_v1"); put("obyekt_id", 1) }

    private fun make(fake: Fake, now: () -> Long = { 1_000L }, user: () -> String? = { "u1" }) =
        CachingBffApi(fake, EncryptedCache(Files.createTempDirectory("rc").toFile(), Xor()), user, now)

    @Test fun offlineReadServedFromCacheAndMarkedStale() = runBlocking<Unit> {
        val f = Fake(); val c = make(f)
        assertEquals(200, c.bff("/api/sb", "POST", q).status); assertNull(c.staleSince.value)
        f.online = false
        val r = c.bff("/api/sb", "POST", q)
        assertTrue(r.ok); assertEquals(1_000L, c.staleSince.value)
        c.bff("/api/hujjat-aylanish?bolim=kiruvchi", "GET").also { assertFalse(it.ok) }
    }

    @Test fun writesAreNeverCachedOrServedOffline() = runBlocking<Unit> {
        val f = Fake(); val c = make(f)
        val w = buildJsonObject { put("amal", "akt_lifecycle_transition_v1") }
        c.bff("/api/sb-yoz", "POST", w); f.online = false
        assertTrue(c.bff("/api/sb-yoz", "POST", w).networkError)
        assertFalse(isCacheableRead("/api/sessiya", "GET", null)); assertFalse(isCacheableRead("/api/hujjat-aylanish", "POST", buildJsonObject { put("amal", "zanjir_qaror") }))
    }

    @Test fun expiresAfter72hAndWipeClears() = runBlocking<Unit> {
        var t = 0L; val f = Fake(); val c = make(f, { t })
        c.bff("/api/sb", "POST", q); f.online = false
        t = 73L * 3600_000
        assertTrue(c.bff("/api/sb", "POST", q).networkError)
        t = 0; f.online = true; c.bff("/api/sb", "POST", q); f.online = false; c.wipe()
        assertTrue(c.bff("/api/sb", "POST", q).networkError)
    }

    @Test fun perUserScope() = runBlocking<Unit> {
        var u = "a"; val f = Fake(); val c = make(f, user = { u })
        c.bff("/api/sb", "POST", q); f.online = false; u = "b"
        assertTrue(c.bff("/api/sb", "POST", q).networkError)
    }
}

