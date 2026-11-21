package uz.anncorp.smeta.core.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class JarvisOutboxTest {
    @get:Rule val folder = TemporaryFolder()

    @Test fun restoresAnEncryptedBatchForOnlyItsDeviceAndCompany() = runBlocking {
        val firstDevice = "00000000-0000-4000-8000-000000000001"
        var device = firstDevice
        val turns = listOf(ChatMsg(true, "Synthetic question"), ChatMsg(false, "Synthetic answer"))
        val write = PendingJarvisWrite(ChatCursor("synthetic", "a".repeat(32)), null, turns,
            "00000000-0000-4000-8000-000000000011", turns)
        val directory = folder.newFolder("outbox")
        fun outbox() = JarvisOutbox(directory, TestCipher(), Json) { device }
        assertTrue(outbox().store(device, 17, write))
        assertFalse(directory.listFiles()!!.single { it.extension == "bin" }.readBytes().decodeToString().contains(turns[0].text))
        assertEquals(write, outbox().read(device, 17).getOrThrow())
        assertNull(outbox().read(device, 18).getOrThrow())
        val swapped = File(directory, "$device-18.bin")
        directory.listFiles()!!.single { it.extension == "bin" }.copyTo(swapped)
        assertTrue(outbox().read(device, 18).isFailure)
        assertTrue(swapped.delete())
        device = "00000000-0000-4000-8000-000000000002"
        assertTrue(outbox().read(firstDevice, 17).isFailure)
        assertNull(outbox().read(device, 17).getOrThrow())
        assertFalse(outbox().remove(firstDevice, 17, write))
        device = firstDevice
        assertFalse(outbox().store(device, 17, write.copy(operationId = "different")))
        assertTrue(outbox().store(device, 17, write.copy(stale = true)))
        assertFalse(outbox().remove(device, 17, write))
        assertTrue(outbox().remove(device, 17, write.copy(stale = true)))
        assertNull(outbox().read(device, 17).getOrThrow())
    }

    @Test fun replacesOnlyTheExactEncryptedConflictDraft() = runBlocking {
        val device = "00000000-0000-4000-8000-000000000001"
        val outbox = JarvisOutbox(folder.newFolder("replace"), TestCipher(), Json) { device }
        val turns = listOf(ChatMsg(true, "Synthetic pending"), ChatMsg(false, "Answer"))
        val old = PendingJarvisWrite(ChatCursor("old", "a".repeat(32)), null, turns, "op", turns, stale = true)
        val fresh = old.copy(cursor = ChatCursor("new"), title = "Synthetic pending", operationId = null, stale = false)
        assertTrue(outbox.store(device, 17, old))
        assertFalse(outbox.replace(device, 17, old.copy(operationId = "different"), fresh))
        assertEquals(old, outbox.read(device, 17).getOrThrow())
        assertTrue(outbox.replace(device, 17, old, fresh))
        assertEquals(fresh, outbox.read(device, 17).getOrThrow())
        assertFalse(outbox.replace(device, 17, old, old))
    }

    private class TestCipher : SecretCipher {
        private val key = SecretKeySpec(ByteArray(32) { 42 }, "AES")
        override fun encrypt(plain: ByteArray): ByteArray = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, key)
            iv + doFinal(plain)
        }
        override fun decrypt(data: ByteArray): ByteArray = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, data.copyOfRange(0, 12)))
            doFinal(data, 12, data.size - 12)
        }
    }
}
