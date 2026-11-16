package uz.anncorp.smeta.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

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

    override suspend fun read(device: String, company: Long) = withContext(Dispatchers.IO) {
        synchronized(lock) { runCatching { load(file(device, company), device, company) } }
    }

    override suspend fun store(device: String, company: Long, write: PendingJarvisWrite): Boolean = withContext(Dispatchers.IO) {
        synchronized(lock) {
            runCatching {
                val target = file(device, company)
                val current = load(target, device, company)
                if (current == write) return@runCatching true
                if (current != null && (current != write.copy(stale = false) || !write.stale)) return@runCatching false
                check(directory.isDirectory || directory.mkdirs())
                val sealed = StoredJarvisWrite(device, company, write)
                val data = cipher.encrypt(json.encodeToString(StoredJarvisWrite.serializer(), sealed).encodeToByteArray())
                check(data.size.toLong() <= MAX_BYTES)
                val temp = File.createTempFile("jarvis-", ".tmp", directory)
                try {
                    FileOutputStream(temp).use { it.write(data); it.fd.sync() }
                    Files.move(temp.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
                } finally { temp.delete() }
                true
            }.getOrDefault(false)
        }
    }

    override suspend fun remove(device: String, company: Long, write: PendingJarvisWrite): Boolean = withContext(Dispatchers.IO) {
        synchronized(lock) {
            runCatching {
                val target = file(device, company)
                val current = load(target, device, company)
                current == null || (current == write && target.delete())
            }.getOrDefault(false)
        }
    }

    private companion object {
        val DEVICE = Regex("^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$", RegexOption.IGNORE_CASE)
        const val MAX_BYTES = 192_000L
    }
}
