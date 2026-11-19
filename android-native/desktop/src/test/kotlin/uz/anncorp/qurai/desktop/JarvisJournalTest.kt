package uz.anncorp.qurai.desktop

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import uz.anncorp.smeta.core.data.*

class JarvisJournalTest {
    private val turns = listOf(ChatMsg(true, "Synthetic question"), ChatMsg(false, "Synthetic answer"))
    private val draft get() = PendingJarvisWrite(ChatCursor("chat", "a".repeat(32)), null, turns, "stable-op", turns)
    private class Store : JarvisPendingStore {
        var device = "device"
        var value: PendingJarvisWrite? = null
        var badRead = false; var badStore = false; var badRemove = false
        override fun deviceId() = device
        override suspend fun read(device: String, company: Long): Result<PendingJarvisWrite?> =
            if (badRead) Result.failure(IllegalStateException("Synthetic failure")) else Result.success(value)
        override suspend fun store(device: String, company: Long, write: PendingJarvisWrite): Boolean {
            if (badStore || value != null && value != write && value != write.copy(stale = false)) return false
            value = write; return true
        }
        override suspend fun remove(device: String, company: Long, write: PendingJarvisWrite): Boolean {
            if (badRemove || value != write) return false
            value = null; return true
        }
        override suspend fun replace(device: String, company: Long, expected: PendingJarvisWrite, replacement: PendingJarvisWrite): Boolean {
            if (value != expected) return false
            value = replacement; return true
        }
    }

    @Test fun neverSendsBeforeDurableStoreAndRetriesExactlyTheSameOperation() = runBlocking {
        val store = Store(); val sent = mutableListOf<PendingJarvisWrite>()
        val journal = JarvisJournal(store, "device", 17) { write, device ->
            assertEquals("device", device); assertEquals(write, store.value); sent += write
            if (sent.size == 1) ChatWrite.Failed else ChatWrite.Saved("b".repeat(32))
        }
        assertNull(journal.submit(draft))
        assertEquals(draft, store.value)
        assertEquals(JournalIssue.RETRY, journal.issue)
        assertNull(journal.submit(draft.copy(operationId = "must-not-overwrite")))
        assertEquals(1, sent.size)
        assertEquals("b".repeat(32), journal.retry())
        assertEquals(listOf(draft, draft), sent)
        assertNull(store.value); assertNull(journal.issue)
    }

    @Test fun aRestartRestoresTheUnsavedPairAndReusesItsId() = runBlocking {
        val store = Store().apply { value = draft }
        val journal = JarvisJournal(store, "device", 17) { write, _ -> assertEquals(draft, write); ChatWrite.Saved("b".repeat(32)) }
        assertEquals(draft, journal.restore())
        assertEquals("b".repeat(32), journal.retry())
        assertEquals(ChatCursor("chat", "b".repeat(32)), journal.savedCursor)
    }

    @Test fun cancellingTheSenderLeavesTheAlreadyEncryptedPairRecoverable() = runBlocking {
        val store = Store()
        val journal = JarvisJournal(store, "device", 17) { _, _ -> throw kotlinx.coroutines.CancellationException("Synthetic cancellation") }
        try { journal.submit(draft); fail("Expected cancellation") } catch (_: kotlinx.coroutines.CancellationException) { }
        assertEquals(draft, store.value)
        assertEquals(draft, journal.pending)
    }

    @Test fun failedEncryptionAndUnreadableSlotsNeverReachTheServer() = runBlocking {
        val store = Store().apply { badStore = true }; var calls = 0
        val journal = JarvisJournal(store, "device", 17) { _, _ -> calls++; ChatWrite.Failed }
        assertNull(journal.submit(draft)); assertEquals(0, calls); assertEquals(draft, journal.pending)
        val corrupt = Store().apply { badRead = true }
        val blocked = JarvisJournal(corrupt, "device", 17) { _, _ -> calls++; ChatWrite.Failed }
        assertNull(blocked.restore()); assertEquals(JournalIssue.UNREADABLE, blocked.issue)
        assertNull(blocked.submit(draft)); assertEquals(0, calls)
    }

    @Test fun credentialChangeCannotReadOrSendThePriorSessionsDraft() = runBlocking {
        val store = Store().apply { value = draft }; var calls = 0
        val journal = JarvisJournal(store, "device", 17) { _, _ -> calls++; ChatWrite.Failed }
        journal.restore(); store.device = "other-device"
        assertNull(journal.restore()); assertNull(journal.retry()); assertEquals(0, calls)
        assertEquals(JournalIssue.DEVICE, journal.issue); assertEquals(draft, store.value)
    }

    @Test fun aLostCleanupAcknowledgementDoesNotGenerateANewOperation() = runBlocking {
        val store = Store().apply { badRemove = true }; val sent = mutableListOf<PendingJarvisWrite>()
        val journal = JarvisJournal(store, "device", 17) { write, _ -> sent += write; ChatWrite.Saved("b".repeat(32)) }
        assertNull(journal.submit(draft)); assertEquals(draft, store.value)
        store.badRemove = false
        assertEquals("b".repeat(32), journal.retry()); assertEquals(listOf(draft, draft), sent)
    }

    @Test fun aConflictIsNotRebasedOrForkedWithoutTheExplicitAction() = runBlocking {
        val store = Store(); var calls = 0
        val journal = JarvisJournal(store, "device", 17) { _, _ -> calls++; ChatWrite.Stale }
        journal.submit(draft); assertEquals(JournalIssue.STALE, journal.issue)
        assertNull(journal.retry()); assertEquals(1, calls)
        assertEquals(draft.copy(stale = true), store.value)
    }

    @Test fun anExplicitConflictForkIsDurableAndNeverOverwritesTheOriginalChat() = runBlocking {
        val store = Store().apply { value = draft.copy(stale = true) }; val sent = mutableListOf<PendingJarvisWrite>()
        val journal = JarvisJournal(store, "device", 17) { write, _ ->
            assertEquals(write, store.value); sent += write
            if (sent.size == 1) ChatWrite.Failed else ChatWrite.Saved("b".repeat(32))
        }
        journal.restore(); assertNull(journal.fork())
        val next = store.value!!
        assertNotEquals("chat", next.cursor.id); assertNull(next.cursor.etag)
        assertEquals(turns, next.turns); assertEquals(turns, next.preview); assertEquals("Synthetic question", next.title)
        assertNull(journal.fork()); assertEquals(1, sent.size)
        assertEquals("b".repeat(32), journal.retry()); assertEquals(sent[0], sent[1])
    }
}
