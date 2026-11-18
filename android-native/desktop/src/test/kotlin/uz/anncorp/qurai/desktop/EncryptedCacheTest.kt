package uz.anncorp.qurai.desktop

import uz.anncorp.smeta.core.data.EncryptedCache
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import uz.anncorp.smeta.core.data.SecretCipher
import java.nio.file.Files

class EncryptedCacheTest {
    /** Reversible stand-in for DPAPI (tests run on any OS). */
    private class XorCipher : SecretCipher {
        override fun encrypt(plain: ByteArray) = ByteArray(plain.size) { (plain[it].toInt() xor 0x5A).toByte() }
        override fun decrypt(data: ByteArray) = encrypt(data)
    }

    private fun cache() = EncryptedCache(Files.createTempDirectory("qurai-cache").toFile(), XorCipher(), ttlMs = 1000)

    @Test fun roundTripAndNotPlainOnDisk() {
        val c = cache(); c.scope(7)
        c.put("objects:1", """{"nom":"Maxfiy obyekt"}""", now = 100)
        assertEquals("""{"nom":"Maxfiy obyekt"}""", c.get("objects:1", now = 200)?.second)
        val raw = c.javaClass.getDeclaredField("root").also { it.isAccessible = true }.get(c) as java.io.File
        val all = raw.walkTopDown().filter { it.isFile }.joinToString("") { String(it.readBytes(), Charsets.ISO_8859_1) }
        assertFalse(all.contains("Maxfiy"))
    }

    @Test fun expiredEntryIsDropped() {
        val c = cache(); c.scope(7)
        c.put("k", "v", now = 0)
        assertNull(c.get("k", now = 5000))
    }

    @Test fun usersAreIsolatedAndWipeClearsAll() {
        val c = cache(); c.scope(1); c.put("k", "mine", now = 0)
        c.scope(2); assertNull(c.get("k", now = 1))
        c.scope(1); assertNotNull(c.get("k", now = 1))
        c.wipe(); c.scope(1); assertNull(c.get("k", now = 1))
    }
}