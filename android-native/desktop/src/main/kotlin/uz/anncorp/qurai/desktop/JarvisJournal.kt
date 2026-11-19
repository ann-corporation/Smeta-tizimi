package uz.anncorp.qurai.desktop

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import uz.anncorp.smeta.core.data.ChatWrite
import uz.anncorp.smeta.core.data.ChatCursor
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.JarvisPendingStore
import uz.anncorp.smeta.core.data.PendingJarvisWrite

enum class JournalIssue { RETRY, STALE, UNREADABLE, DEVICE }

/** One durable ordered slot, using the same encrypted outbox and protocol as Android. */
class JarvisJournal(
    private val outbox: JarvisPendingStore, private val device: String, private val company: Long,
    private val send: suspend (PendingJarvisWrite, String) -> ChatWrite,
) {
    private val mutex = Mutex()
    private var loaded = false
    var pending: PendingJarvisWrite? = null; private set
    var issue: JournalIssue? = null; private set
    var savedCursor: ChatCursor? = null; private set

    private fun sameDevice(): Boolean {
        if (outbox.deviceId() == device) return true
        issue = JournalIssue.DEVICE
        return false
    }

    private suspend fun load() {
        if (loaded || !sameDevice()) return
        val stored = outbox.read(device, company)
        if (stored.isFailure) { issue = JournalIssue.UNREADABLE; return }
        pending = stored.getOrNull()
        issue = if (pending?.stale == true) JournalIssue.STALE else if (pending != null) JournalIssue.RETRY else null
        loaded = true
    }

    suspend fun restore(): PendingJarvisWrite? = mutex.withLock { if (!sameDevice()) null else { load(); pending } }

    suspend fun submit(write: PendingJarvisWrite): String? = mutex.withLock {
        load()
        if (!loaded || !sameDevice() || issue == JournalIssue.UNREADABLE || pending != null) return@withLock null
        savedCursor = null
        pending = write
        attempt()
    }

    suspend fun retry(): String? = mutex.withLock {
        load()
        if (!loaded || !sameDevice()) return@withLock null
        attempt()
    }

    /** Only an explicit user action may copy a conflicted unsaved pair into a new conversation. */
    suspend fun fork(): String? = mutex.withLock {
        val old = pending?.takeIf { it.stale } ?: return@withLock null
        if (!sameDevice()) return@withLock null
        val next = old.copy(cursor = ChatCursor(java.util.UUID.randomUUID().toString()), title = JarvisRepository.chatTitle(old.turns),
            operationId = null, preview = old.turns, stale = false)
        if (!outbox.replace(device, company, old, next)) return@withLock null
        savedCursor = null
        pending = next
        attempt()
    }

    private suspend fun attempt(): String? {
        val write = pending ?: return null
        if (write.stale) { issue = JournalIssue.STALE; return null }
        issue = JournalIssue.RETRY
        if (!sameDevice() || !outbox.store(device, company, write) || !sameDevice()) return null
        val result = try { send(write, device) }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { ChatWrite.Failed }
        if (!sameDevice()) return null
        return when (result) {
            is ChatWrite.Saved -> {
                if (!outbox.remove(device, company, write)) null
                else { savedCursor = write.cursor.copy(etag = result.etag); pending = null; issue = null; result.etag }
            }
            ChatWrite.Stale -> {
                val stale = write.copy(stale = true)
                if (outbox.store(device, company, stale)) { pending = stale; issue = JournalIssue.STALE }
                else issue = JournalIssue.RETRY
                null
            }
            else -> null
        }
    }
}
