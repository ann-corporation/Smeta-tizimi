package uz.anncorp.smeta.core.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** Reversible stand-in for the Keystore cipher: marks the output so plaintext can never match by accident. */
class FakeCipher : SecretCipher {
    override fun encrypt(plain: ByteArray) = byteArrayOf(0x7F) + plain.map { (it.toInt() xor 0x5A).toByte() }.toByteArray()
    override fun decrypt(data: ByteArray): ByteArray {
        require(data.isNotEmpty() && data[0] == 0x7F.toByte()) { "bad blob" }
        return data.drop(1).map { (it.toInt() xor 0x5A).toByte() }.toByteArray()
    }
}

class TokenStoreTest {
    @get:Rule val tmp = TemporaryFolder()
    private val cred = DeviceCredential("00000000-0000-4000-8000-000000000001", "A".repeat(43), 4_000_000_000_000L)

    private fun store(file: File = File(tmp.root, "device.bin")) = TokenStore(file, FakeCipher())

    @Test fun roundTripsAcrossInstances() {
        store().save(cred)
        assertEquals(cred, store().load())
    }

    @Test fun fileNeverContainsPlaintextToken() {
        val f = File(tmp.root, "device.bin")
        store(f).save(cred)
        assertFalse(String(f.readBytes(), Charsets.ISO_8859_1).contains(cred.token))
    }

    @Test fun corruptedFileMeansSignedOutAndIsRemoved() {
        val f = File(tmp.root, "device.bin")
        f.writeBytes(byteArrayOf(1, 2, 3))
        assertNull(store(f).load())
        assertFalse(f.exists())
    }

    @Test fun clearForgetsCredentialEverywhere() {
        val s = store()
        s.save(cred)
        s.clear()
        assertNull(s.token())
        assertNull(store().load())
    }

    @Test fun missingFileIsSignedOut() = assertNull(store().load())

    @Test fun expiryIsChecked() {
        assertTrue(cred.isExpired(cred.tugaydi))
        assertFalse(cred.isExpired(cred.tugaydi - 1))
    }
}
