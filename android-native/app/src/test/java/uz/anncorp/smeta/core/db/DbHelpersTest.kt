package uz.anncorp.smeta.core.db

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import uz.anncorp.smeta.core.data.SecretCipher
import java.io.File

class DbHelpersTest {
    @get:Rule val tmp = TemporaryFolder()

    /** Reversible stand-in for the Keystore cipher. */
    private class XorCipher(val mask: Int = 0x5A) : SecretCipher {
        override fun encrypt(plain: ByteArray) = ByteArray(plain.size) { (plain[it].toInt() xor mask).toByte() }
        override fun decrypt(data: ByteArray) = encrypt(data)
    }

    @Test fun ftsMatchBuildsPrefixAndExpression() {
        assertEquals("beton* m200*", ftsMatch("  Beton, M-200 ".replace("M-200", "m200")))
        assertEquals("с310* 1005*", ftsMatch("С310-1005"))
        assertEquals("арм*", ftsMatch("арм"))
        assertNull(ftsMatch(" -- "))
        assertNull(ftsMatch(""))
    }

    @Test fun keyIsGeneratedOnceStoredOnlyWrappedAndReused() {
        val f = File(tmp.root, "db.key"); var fresh = 0
        val c = XorCipher()
        val k1 = AppDb.loadOrCreateKey(f, c) { fresh++ }
        assertEquals(32, k1.size); assertEquals(1, fresh)
        assertFalse("raw key must not be on disk", f.readBytes().contentEquals(k1))
        val k2 = AppDb.loadOrCreateKey(f, c) { fresh++ }
        assertArrayEquals(k1, k2); assertEquals(1, fresh)
    }

    @Test fun lostWrapKeyStartsFreshAndWipesTheOldDatabase() {
        val f = File(tmp.root, "db.key"); var wiped = 0
        val k1 = AppDb.loadOrCreateKey(f, XorCipher(0x5A)) { wiped++ }
        // A different cipher (e.g. restored on another device) cannot unwrap a 32-byte key; here the mask differs, so it decrypts to different bytes of valid size.
        // Corrupt file simulates the unrecoverable case:
        f.writeBytes(byteArrayOf(1, 2, 3))
        val k2 = AppDb.loadOrCreateKey(f, XorCipher(0x5A)) { wiped++ }
        assertEquals(32, k2.size); assertEquals(2, wiped); assertNotEquals(k1.toList(), k2.toList())
        assertTrue(f.exists())
    }

    @Test fun draftExceedsOnlyWhenOverOpenRemainder() {
        fun d(h: Double) = DraftEntity(1, 1, h, "k", "n", "м3", 10.0, 4.0, 1.0, 0)   // remainder = 10 - 4 - 1 = 5
        assertFalse(d(5.0).exceeds); assertTrue(d(5.001).exceeds); assertEquals(5.0, d(1.0).qoldiq!!, 0.0)
        assertFalse(DraftEntity(1, 1, 999.0, null, "n", null, null, 0.0, 0.0, 0).exceeds)   // unknown estimate volume: nothing to compare
    }
}
