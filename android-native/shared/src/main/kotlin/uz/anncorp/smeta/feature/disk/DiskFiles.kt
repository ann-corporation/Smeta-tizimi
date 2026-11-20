package uz.anncorp.smeta.feature.disk

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.DOC_MAX_BYTES
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder

/*
 * Disk: one file - open (view), download, versions and "Tizimda ochish" (open the screen that made a system document).
 * Same endpoints as the site (frontend/functions/api/hujjat-maydoni.ts: amal=versiyalar; hujjat-maydoni-ol.ts: ?id=&v=&korish=1); both apps share this file.
 * "Tizimda ochish" is the Kotlin twin of frontend/src/lib/disk-manba-yol.ts `tizimdaOchishYoli` (same manba_turi -> page rules; the website path is the
 * fallback when this app has no screen for it).
 */

/** One stored version of a file (newest first on the server). */
data class DiskVersion(val number: Int, val bytes: Long?, val mime: String?, val created: String?, val by: String?, val current: Boolean)

fun diskVersionsPath(fileId: Long) = "/api/hujjat-maydoni?amal=versiyalar&fayl_id=$fileId"

/** Bytes of a file (or of one [version]); [inline] asks the server for the view disposition. */
fun diskFilePath(fileId: Long, version: Int? = null, inline: Boolean = false) =
    "/api/hujjat-maydoni-ol?id=$fileId" + (version?.let { "&v=$it" } ?: "") + (if (inline) "&korish=1" else "")

fun parseDiskVersions(body: JsonElement?): List<DiskVersion>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return o["versiyalar"].arr()?.mapNotNull { e ->
        val x = e.obj() ?: return@mapNotNull null
        DiskVersion(x["raqam"].num()?.toInt() ?: return@mapNotNull null, x["bayt"].num()?.toLong(), x["mime"].str(), x["yaratildi"].str(), x["kim"].str(), (x["joriy"] as? JsonPrimitive)?.booleanOrNull == true)
    }
}

/** One-shot upload ceiling of POST /api/mobil/hujjat-yukla (MOBIL_HM_BIR_MARTA_MAX on the server). Bigger files use the website. */
const val DISK_UPLOAD_MAX_BYTES = 25L * 1024 * 1024

/**
 * Multipart body of POST /api/mobil/hujjat-yukla: `fayl`, `operation_id` (UUID; the server de-duplicates a retried upload by it), and the target
 * (`kompaniya_id` = company drive, none = personal; `papka_id` = folder, none = root). Same field names the server reads.
 */
fun diskUploadForm(name: String, mime: String, bytes: ByteArray, operationId: String, companyId: Long?, folderId: Long?): okhttp3.MultipartBody =
    okhttp3.MultipartBody.Builder().setType(okhttp3.MultipartBody.FORM)
        .addFormDataPart("operation_id", operationId)
        .apply { if (companyId != null) addFormDataPart("kompaniya_id", companyId.toString()); if (folderId != null) addFormDataPart("papka_id", folderId.toString()) }
        .addFormDataPart("fayl", name, bytes.toRequestBody(mime.ifBlank { "application/octet-stream" }.toMediaTypeOrNull()))
        .build()

/** Body of POST /api/hujjat-maydoni for a folder action: op = yarat | nomla | kochir | ochir (the site's hmPapka). Absent ids are left out, not sent as null. */
fun diskFolderBody(companyId: Long?, op: String, folderId: Long? = null, name: String? = null, parentId: Long? = null): kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.buildJsonObject {
    put("amal", "papka"); put("op", op)
    companyId?.let { put("kompaniya_id", it) }; folderId?.let { put("papka_id", it) }; name?.let { put("nom", it) }; parentId?.let { put("ota_id", it) }
}

/** Body of POST /api/hujjat-maydoni for a file action: op = nomla | kochir | savat | tikla (the site's hmFaylAmal). */
fun diskFileBody(fileId: Long, op: String, name: String? = null, folderId: Long? = null): kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.buildJsonObject {
    put("amal", "fayl"); put("fayl_id", fileId); put("op", op)
    name?.let { put("nom", it) }; folderId?.let { put("papka_id", it) }
}

/** Result of a Disk write (upload, folder or file action), one list for both apps; the host maps it to a message. */
enum class DiskOp { DONE, OFFLINE, FORBIDDEN, TOO_LARGE, QUOTA, BAD_TYPE, EXISTS, NOT_EMPTY, FAILED }

/** Maps a write answer: HTTP status + server `code` (KVOTA_TUGADI 413, MIME_REJECTED 415, NOM_BAND 409, RUXSAT_YOQ 403, PAPKA_BOSH_EMAS, FILE_TOO_LARGE 413). Code wins over status. */
fun diskOpResult(status: Int, code: String?, bodyOk: Boolean?): DiskOp {
    val c = code.orEmpty().uppercase()
    return when {
        status == 0 -> DiskOp.OFFLINE
        status in 200..299 && bodyOk != false -> DiskOp.DONE
        c == "KVOTA_TUGADI" -> DiskOp.QUOTA
        c == "FILE_TOO_LARGE" -> DiskOp.TOO_LARGE
        c == "MIME_REJECTED" || status == 415 -> DiskOp.BAD_TYPE
        c == "NOM_BAND" || status == 409 -> DiskOp.EXISTS
        c == "PAPKA_BOSH_EMAS" -> DiskOp.NOT_EMPTY
        c == "RUXSAT_YOQ" || status == 401 || status == 403 -> DiskOp.FORBIDDEN
        status == 413 -> DiskOp.TOO_LARGE
        else -> DiskOp.FAILED
    }
}
/** Why a download did not produce bytes (one list for both apps; the host maps it to a message). */
enum class DiskNotice { SAVED, OFFLINE, FORBIDDEN, TOO_LARGE, MISSING, PAYMENT, FAILED }

sealed interface DiskBytes {
    class Ready(val name: String, val mime: String, val bytes: ByteArray) : DiskBytes
    data class Failed(val notice: DiskNotice) : DiskBytes
}

/** Maps the binary answer of the BFF the same way for Android and Windows. */
fun diskBytesResult(status: Int, bytes: ByteArray?, mime: String?, filename: String?, fallbackName: String, fallbackMime: String?): DiskBytes = when {
    status == 0 -> DiskBytes.Failed(DiskNotice.OFFLINE)
    status == 402 -> DiskBytes.Failed(DiskNotice.PAYMENT)
    status == 413 -> DiskBytes.Failed(DiskNotice.TOO_LARGE)
    status == 401 || status == 403 -> DiskBytes.Failed(DiskNotice.FORBIDDEN)
    status == 404 -> DiskBytes.Failed(DiskNotice.MISSING)
    status in 200..299 && (bytes?.size ?: 0) > 0 -> DiskBytes.Ready(filename?.takeIf { it.isNotBlank() } ?: fallbackName, mime?.takeIf { it.isNotBlank() } ?: fallbackMime ?: "application/octet-stream", bytes!!)
    else -> DiskBytes.Failed(DiskNotice.FAILED)
}

suspend fun BffApi.diskVersions(fileId: Long): List<DiskVersion>? {
    val r = bff(diskVersionsPath(fileId))
    return if (r.networkError || !r.ok) null else parseDiskVersions(r.body)
}

suspend fun BffApi.diskFetch(file: DiskFile, version: Int?): DiskBytes {
    val r = bffBytes(diskFilePath(file.id, version), DOC_MAX_BYTES)
    return diskBytesResult(r.status, r.bytes, r.mime, r.filename, file.name, file.mime)
}

/**
 * Where a system document (F-2, F-3, nakopitelniy ...) was made. [module] is the id of the page in the shared navigation model (QNav) - the host opens it
 * when it has that screen; otherwise it opens [webPath] on the website. Null target = no source known (user files, publications, photos).
 */
data class DiskSystemTarget(val module: String?, val webPath: String, val objectId: Long?)

private fun musbat(n: Long?) = n != null && n > 0
private fun query(vararg p: Pair<String, Any?>): String {
    val s = p.filter { it.second != null && it.second.toString().isNotEmpty() }.joinToString("&") { "${it.first}=${URLEncoder.encode(it.second.toString(), "UTF-8")}" }
    return if (s.isEmpty()) "" else "?$s"
}

fun diskSystemTarget(f: DiskFile): DiskSystemTarget? {
    val tur = f.sourceType.orEmpty().lowercase()
    if (tur.isEmpty()) return null
    val o = f.objectId?.takeIf { musbat(it) }
    val oy = f.key?.let { Regex("(\\d{4}-\\d{2})$").find(it)?.groupValues?.get(1) }
    fun t(module: String?, path: String) = DiskSystemTarget(module, path, o)
    return when (tur) {
        "f2" -> if (musbat(f.sourceId) && o != null) t("f2", "/admin/f2-tayyorlash" + query("obyekt" to o, "akt" to f.sourceId)) else t("f2", "/admin/f2-tarix" + query("obyekt" to o))
        "f2_akt" -> t("f2", "/admin/f2-tarix" + query("obyekt" to o))
        "forma3" -> if (musbat(f.sourceId)) t("nakop", "/admin/nakopitelniy" + query("obyekt" to o, "f3" to "shartnoma")) else t("nakop", "/admin/nakopitelniy" + query("obyekt" to o, "f3" to 1, "davr" to oy))
        "nakopitelniy" -> t("nakop", "/admin/nakopitelniy" + query("obyekt" to o))
        "m29" -> t("m29", "/admin/m29" + query("obyekt" to o))
        "slichitelniy", "ostatka" -> t("smeta", if (o != null) "/admin/holat/$o#slichitelniy" else "/admin/holat")
        "aosr" -> t(null, "/admin/aosr" + query("obyekt" to o))
        "smeta", "smeta_lrv", "smeta_res", "sverka_lrv_res" -> t("smeta", "/admin/smeta" + query("obyekt" to o))
        "shartnoma_oylik_paket" -> t("f2", "/admin/f2-reestr")
        "sverka_shartnoma" -> t("nakop", "/admin/nakopitelniy" + query("f3" to "shartnoma"))
        "shartnoma" -> t("tomonlar", "/admin/shartnoma-liniya")
        "naryad" -> t("naryad", "/admin/naryad" + query("obyekt" to o))
        else -> null
    }
}

/** "1,2 MB  ·  v3  ·  14.11.2026" - one text for the file card and for a version row (decimal comma, Uzbek style). */
fun DiskVersion.label(): String = listOfNotNull(formatBytes(bytes).ifBlank { null }, created?.let { uz.anncorp.smeta.core.data.formatDate(it) }, by).joinToString("  \u00B7  ")

fun DiskFile.detailText(): String = listOfNotNull(formatBytes(bytes).ifBlank { null }, version?.let { "v$it" }, updated?.let { uz.anncorp.smeta.core.data.formatDate(it) }).joinToString("  \u00B7  ")
