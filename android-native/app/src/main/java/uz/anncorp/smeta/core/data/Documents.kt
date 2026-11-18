package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import java.io.File
import java.net.URLDecoder

/*
 * Documents (hujjatlar) of an object. Same canonical registry as the web Document Center: GET /api/hujjat-royxat (metadata) and
 * GET /api/hujjat-ol (bytes from the private R2 bucket, authorised per document) - both through the mobile BFF allow-list, so the
 * device never gets more than its user may open on the website. Downloaded files are kept only AES-GCM encrypted (Keystore key)
 * under noBackupFilesDir; a decrypted copy exists only transiently for the PDF viewer / share sheet and is deleted afterwards.
 */

enum class DocKind { PDF, IMAGE, SHEET, OTHER }

/** Registry types the website knows (`document_type`); anything else is shown as a plain document. */
enum class DocType(val code: String) { F2("f2_hujjat"), F3("f3"), PACK("shartnoma_oylik_paket"), OTHER("") }

@Serializable
data class DocItem(
    val id: Long, val name: String, val type: String, val mime: String, val size: Long, val updatedAt: String, val sha256: String, val ready: Boolean,
) {
    val docType: DocType get() = DocType.entries.firstOrNull { it.code == type && it != DocType.OTHER } ?: DocType.OTHER
    val isF2: Boolean get() = docType == DocType.F2 || type.startsWith("f2")
    val kind: DocKind get() = docKind(mime, name)
}

fun docKind(mime: String?, name: String?): DocKind {
    val m = mime.orEmpty().lowercase()
    val n = name.orEmpty().lowercase()
    return when {
        m == "application/pdf" || n.endsWith(".pdf") -> DocKind.PDF
        m.startsWith("image/") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp") -> DocKind.IMAGE
        m.contains("spreadsheet") || m.contains("ms-excel") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv") -> DocKind.SHEET
        else -> DocKind.OTHER
    }
}

fun documentsRequest(companyId: Long, objectId: Long, limit: Int = 300): String = "/api/hujjat-royxat?kompaniya_id=$companyId&obyekt_id=$objectId&limit=$limit"
fun documentRequest(id: Long): String = "/api/hujjat-ol?id=$id"

/** `{ok:true, documents:[...]}` -> documents, newest first (the server already orders by updatedAt desc). Null for any other shape. */
fun parseDocuments(body: JsonElement?): List<DocItem>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val list = root["documents"].arr() ?: return null
    return list.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val id = o["id"].str()?.toLongOrNull() ?: return@mapNotNull null
        DocItem(
            id = id, name = o["filename"].str()?.takeIf { it.isNotBlank() } ?: "hujjat-$id", type = o["type"].str().orEmpty(),
            mime = o["mime"].str() ?: "application/octet-stream", size = o["size"].num()?.toLong() ?: 0L,
            updatedAt = o["updatedAt"].str().orEmpty(), sha256 = o["sha256"].str().orEmpty(), ready = o["canonicalStatus"].str() == "READY",
        )
    }
}

// ---------- encrypted cache ----------

/**
 * Downloaded documents at rest: AES-GCM through [cipher] (Android Keystore in the app), one file per document revision.
 * The key includes the content hash, so a re-issued document never serves stale bytes. Bounded to [maxBytes]; the oldest files go first.
 */
class DocCache(private val dir: File, private val cipher: SecretCipher, private val maxBytes: Long = 120L * 1024 * 1024) {
    private fun fileFor(companyId: Long, id: Long, sha256: String) = File(dir, "${companyId}_${id}_${sha256.take(16).filter { it.isLetterOrDigit() }.ifEmpty { "x" }}.enc")

    @Synchronized
    fun get(companyId: Long, id: Long, sha256: String): ByteArray? {
        val f = fileFor(companyId, id, sha256)
        if (!f.exists()) return null
        return runCatching { cipher.decrypt(f.readBytes()).also { f.setLastModified(System.currentTimeMillis()) } }.getOrElse { f.delete(); null }
    }

    @Synchronized
    fun has(companyId: Long, id: Long, sha256: String): Boolean = fileFor(companyId, id, sha256).exists()

    @Synchronized
    fun put(companyId: Long, id: Long, sha256: String, bytes: ByteArray) {
        dir.mkdirs()
        // A new revision of the same document replaces the old file.
        dir.listFiles { f -> f.name.startsWith("${companyId}_${id}_") }?.forEach { it.delete() }
        val f = fileFor(companyId, id, sha256)
        val tmp = File(dir, f.name + ".tmp")
        tmp.writeBytes(cipher.encrypt(bytes))
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
        trim()
    }

    private fun trim() {
        val files = dir.listFiles { f -> f.name.endsWith(".enc") }?.sortedBy { it.lastModified() }.orEmpty().toMutableList()
        var total = files.sumOf { it.length() }
        while (total > maxBytes && files.isNotEmpty()) { val f = files.removeAt(0); total -= f.length(); f.delete() }
    }

    /** Sign-out / device change: nothing of a previous user may stay on the device. */
    @Synchronized
    fun clear() { dir.listFiles()?.forEach { it.delete() } }

    /** Bytes currently cached (shown in Settings > Storage). */
    fun sizeBytes(): Long = dir.listFiles()?.sumOf { it.length() } ?: 0L
}

// ---------- repository ----------

sealed interface OpenResult {
    data class Ready(val name: String, val mime: String, val bytes: ByteArray, val fromCache: Boolean) : OpenResult
    data object Offline : OpenResult
    /** 402: a paid archive document (F-2 / F-3 / monthly pack) whose token payment is not proven yet - it is paid on the website. */
    data object PaymentRequired : OpenResult
    data object Forbidden : OpenResult
    data object Missing : OpenResult
    data object TooLarge : OpenResult
    data class Failed(val code: String?) : OpenResult
}

class DocumentsRepository(private val api: BffApi, private val db: AppDb, private val json: Json, private val cache: DocCache) {
    fun observe(obyektId: Long): Flow<List<DocItem>?> = db.meta().observe("doclist:$obyektId").map { s ->
        s?.let { runCatching { json.decodeFromString<List<DocItem>>(it) }.getOrNull() }
    }

    fun lastUpdated(obyektId: Long): Flow<Long?> = db.meta().observe("doclist_ts:$obyektId").map { it?.toLongOrNull() }

    suspend fun refresh(companyId: Long, obyektId: Long, now: Long = System.currentTimeMillis()): SyncResult {
        val r = api.bff(documentsRequest(companyId, obyektId))
        if (!r.ok) return r.syncFailure()
        val docs = parseDocuments(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("doclist:$obyektId", json.encodeToString(docs)))
        db.meta().put(MetaEntity("doclist_ts:$obyektId", now.toString()))
        return SyncResult.Ok
    }

    fun isCached(companyId: Long, doc: DocItem): Boolean = cache.has(companyId, doc.id, doc.sha256)

    /** Encrypted copy first (works offline); otherwise download through the BFF and keep it encrypted. */
    suspend fun open(companyId: Long, doc: DocItem): OpenResult {
        cache.get(companyId, doc.id, doc.sha256)?.let { return OpenResult.Ready(doc.name, doc.mime, it, true) }
        val r = api.bffBytes(documentRequest(doc.id), MAX_BYTES)
        return when {
            r.status == 0 -> OpenResult.Offline
            r.status == 402 -> OpenResult.PaymentRequired
            r.status == 413 -> OpenResult.TooLarge
            r.status == 403 || r.status == 401 -> OpenResult.Forbidden
            r.status == 404 || r.code == "CANONICAL_BINARY_MISSING" || r.code == "DOCUMENT_NOT_FOUND" -> OpenResult.Missing
            r.ok && (r.bytes?.size ?: 0) > 0 -> {
                val bytes: ByteArray = r.bytes!!
                runCatching { cache.put(companyId, doc.id, doc.sha256, bytes) }
                OpenResult.Ready(r.filename ?: doc.name, r.mime?.takeIf { it.isNotBlank() } ?: doc.mime, bytes, false)
            }
            else -> OpenResult.Failed(r.code ?: "HTTP ${r.status}")
        }
    }

    fun clearCache() = cache.clear()

    companion object { const val MAX_BYTES = DOC_MAX_BYTES }
}
