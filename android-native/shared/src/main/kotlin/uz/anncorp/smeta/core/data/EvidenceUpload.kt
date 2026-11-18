package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.time.LocalDate
import java.util.UUID

/*
 * Direct (online) upload of a photo or a file, used by the Windows app (Android queues photos in its outbox but sends them with the same
 * wire, see PhotoQueue.kt). Same sequence as Android and the Telegram bot:
 *   1. POST /api/mobil/yukla?kompaniya_id&obyekt_id  (multipart: kompaniya_id, obyekt_id, turi, operation_id, sha256, size, fayl) -> { ok, document_id }
 *   2. photo only: POST /api/foto-dalil { amal:'bogla', manba_turi:'umumiy', document_id, ... } -> { ok, id }
 *   3. photo + row: POST /api/foto-dalil { amal:'yangila', id, manba_ozgar:true, manba_turi:'qator', manba_id }
 * operation_id and sha256 make a retry idempotent (the server never creates a second document). Size limit is the mobile gateway's 12 MB.
 */
const val UPLOAD_MAX_BYTES = 12 * 1024 * 1024

fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

fun guessMime(fileName: String): String = when (fileName.substringAfterLast('.', "").lowercase()) {
    "jpg", "jpeg" -> "image/jpeg"; "png" -> "image/png"; "webp" -> "image/webp"; "heic" -> "image/heic"
    "pdf" -> "application/pdf"; "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; "xls" -> "application/vnd.ms-excel"
    "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; "doc" -> "application/msword"
    "dwg" -> "application/acad"; "zip" -> "application/zip"; "txt" -> "text/plain"
    else -> "application/octet-stream"
}

fun isImageName(fileName: String) = guessMime(fileName).startsWith("image/")

fun uploadForm(companyId: Long, obyektId: Long, turi: String, operationId: String, fileName: String, bytes: ByteArray): MultipartBody =
    MultipartBody.Builder().setType(MultipartBody.FORM)
        .addFormDataPart("kompaniya_id", companyId.toString()).addFormDataPart("obyekt_id", obyektId.toString())
        .addFormDataPart("turi", turi).addFormDataPart("operation_id", operationId)
        .addFormDataPart("sha256", sha256Hex(bytes)).addFormDataPart("size", bytes.size.toString())
        .addFormDataPart("fayl", safeFileName(fileName, "fayl"), bytes.toRequestBody(guessMime(fileName).toMediaType()))
        .build()

sealed interface UploadResult {
    data class Done(val documentId: Long) : UploadResult
    data class Error(val message: String) : UploadResult
}

private fun uploadErrorText(r: ApiResult): String = when {
    r.networkError -> OFFLINE_WRITE_MESSAGE
    r.status == 403 || r.code == "PERMISSION_DENIED" -> "Bu obyektga fayl yuklash uchun ruxsatingiz yo'q."
    r.status == 413 || r.code == "FILE_TOO_LARGE" -> "Fayl juda katta (eng ko'pi 12 MB)."
    r.status == 415 -> "Bu turdagi faylni yuklab bo'lmaydi."
    else -> "Yuklab bo'lmadi: ${r.code ?: "HTTP ${r.status}"}"
}

class EvidenceUploader(private val api: BffApi, private val newId: () -> String = { UUID.randomUUID().toString() }) {
    /** A fact photo of an object, optionally tied to a smeta row ([qatorId]). Returns the document id. */
    suspend fun uploadPhoto(companyId: Long, obyektId: Long, fileName: String, bytes: ByteArray, qatorId: Long? = null, note: String? = null, date: String = LocalDate.now().toString()): UploadResult {
        if (bytes.isEmpty()) return UploadResult.Error("Fayl bo'sh.")
        if (bytes.size > UPLOAD_MAX_BYTES) return UploadResult.Error("Fayl juda katta (eng ko'pi 12 MB).")
        val op = newId()
        val up = api.upload(companyId, obyektId, uploadForm(companyId, obyektId, "foto_dalil", op, fileName, bytes))
        if (!up.ok || (up.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull == false) return UploadResult.Error(uploadErrorText(up))
        val doc = up.body.obj()?.get("document_id").num()?.toLong()?.takeIf { it > 0 } ?: return UploadResult.Error("Server javobi noto'g'ri.")
        val link = api.bff("/api/foto-dalil", "POST", photoLinkPayload(companyId, obyektId, doc, date, note, op))
        if (!link.ok || (link.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull == false) return UploadResult.Error(uploadErrorText(link))
        if (qatorId != null) {
            val fid = link.body.obj()?.get("id").num()?.toLong() ?: link.body.obj()?.get("natija").obj()?.get("id").num()?.toLong()
            if (fid != null) api.bff("/api/foto-dalil", "POST", buildJsonObject {
                put("amal", "yangila"); put("kompaniya_id", companyId); put("id", fid); put("manba_ozgar", true); put("manba_turi", "qator"); put("manba_id", qatorId)
            })
        }
        return UploadResult.Done(doc)
    }

    /** A general object document (drawing, scan, contract ...). */
    suspend fun uploadDocument(companyId: Long, obyektId: Long, fileName: String, bytes: ByteArray): UploadResult {
        if (bytes.isEmpty()) return UploadResult.Error("Fayl bo'sh.")
        if (bytes.size > UPLOAD_MAX_BYTES) return UploadResult.Error("Fayl juda katta (eng ko'pi 12 MB).")
        val up = api.upload(companyId, obyektId, uploadForm(companyId, obyektId, "hujjat", newId(), fileName, bytes))
        if (!up.ok || (up.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull == false) return UploadResult.Error(uploadErrorText(up))
        val doc = up.body.obj()?.get("document_id").num()?.toLong()?.takeIf { it > 0 } ?: return UploadResult.Error("Server javobi noto'g'ri.")
        return UploadResult.Done(doc)
    }
}

fun photoLinkPayload(companyId: Long, obyektId: Long, documentId: Long, date: String, note: String?, operationId: String): JsonObject = buildJsonObject {
    put("amal", "bogla"); put("kompaniya_id", companyId); put("obyekt_id", obyektId); put("document_id", documentId)
    put("manba_turi", "umumiy"); put("sana", date); note?.takeIf { it.isNotBlank() }?.let { put("izoh", it.take(500)) }; put("operation_id", operationId)
}