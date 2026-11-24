package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.channels.FileChannel
import java.nio.file.StandardOpenOption

@Serializable
data class PendingJarvisWrite(
    val cursor: ChatCursor, val title: String?, val turns: List<ChatMsg>, val operationId: String?,
    val preview: List<ChatMsg>, val stale: Boolean = false,
)
@Serializable
private data class StoredJarvisWrite(val device: String, val company: Long, val pending: PendingJarvisWrite)

interface JarvisPendingStore {
    fun deviceId(): String?
    suspend fun read(device: String, company: Long): Result<PendingJarvisWrite?>
    suspend fun store(device: String, company: Long, write: PendingJarvisWrite): Boolean
    suspend fun remove(device: String, company: Long, write: PendingJarvisWrite): Boolean
    suspend fun replace(device: String, company: Long, expected: PendingJarvisWrite, replacement: PendingJarvisWrite): Boolean = false
}

/** One ordered slot per device credential and company. Never stores the bearer or a plaintext transcript. */
class JarvisOutbox(
    private val directory: File, private val cipher: SecretCipher, private val json: Json,
    private val credential: () -> String?,
) : JarvisPendingStore {
    private val lock = Any()
    override fun deviceId() = credential()

    private fun file(device: String, company: Long): File {
        check(company > 0 && DEVICE.matches(device) && device == credential())
        return File(directory, "$device-$company.bin")
    }

    private fun load(file: File, device: String, company: Long): PendingJarvisWrite? {
        if (!file.exists()) return null
        check(file.length() in 1..MAX_BYTES)
        val stored = json.decodeFromString(StoredJarvisWrite.serializer(), cipher.decrypt(file.readBytes()).decodeToString())
        check(stored.device == device && stored.company == company)
        return stored.pending
    }

    private fun persist(target: File, device: String, company: Long, write: PendingJarvisWrite) {
        check(directory.isDirectory || directory.mkdirs())
        val sealed = StoredJarvisWrite(device, company, write)
        val data = cipher.encrypt(json.encodeToString(StoredJarvisWrite.serializer(), sealed).encodeToByteArray())
        check(data.size.toLong() <= MAX_BYTES)
        val temp = File.createTempFile("jarvis-", ".tmp", directory)
        try {
            FileOutputStream(temp).use { it.write(data); it.fd.sync() }
            Files.move(temp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } finally { temp.delete() }
    }

    /** The lock spans processes too: two Windows instances must not replace each other's slot. */
    private fun <T> exclusive(device: String, company: Long, action: (File) -> T): T {
        file(device, company)
        check(directory.isDirectory || directory.mkdirs())
        return FileChannel.open(File(directory, "$device-$company.lock").toPath(), StandardOpenOption.CREATE, StandardOpenOption.WRITE).use { channel ->
            channel.lock().use { action(file(device, company)) }
        }
    }

    override suspend fun read(device: String, company: Long) = withContext(Dispatchers.IO) {
        synchronized(lock) { runCatching { exclusive(device, company) { load(it, device, company) } } }
    }

    override suspend fun store(device: String, company: Long, write: PendingJarvisWrite): Boolean = withContext(Dispatchers.IO) {
        synchronized(lock) {
            runCatching {
              exclusive(device, company) { target ->
                val current = load(target, device, company)
                if (current == write) return@exclusive true
                if (current != null && (current != write.copy(stale = false) || !write.stale)) return@exclusive false
                persist(target, device, company, write)
                true
              }
            }.getOrDefault(false)
        }
    }

    override suspend fun remove(device: String, company: Long, write: PendingJarvisWrite): Boolean = withContext(Dispatchers.IO) {
        synchronized(lock) {
            runCatching {
              exclusive(device, company) { target ->
                val current = load(target, device, company)
                current == null || (current == write && target.delete())
              }
            }.getOrDefault(false)
        }
    }

    /** Explicit conflict fork: replace exactly this durable draft without a delete-before-write gap. */
    override suspend fun replace(device: String, company: Long, expected: PendingJarvisWrite, replacement: PendingJarvisWrite) = withContext(Dispatchers.IO) {
        synchronized(lock) {
            runCatching {
              exclusive(device, company) { target ->
                if (load(target, device, company) != expected) return@exclusive false
                persist(target, device, company, replacement)
                true
              }
            }.getOrDefault(false)
        }
    }

    private companion object {
        val DEVICE = Regex("^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", RegexOption.IGNORE_CASE)
        const val MAX_BYTES = 192_000L
    }
}
