package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.OutboxDao
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.media.ImageMath
import uz.anncorp.smeta.core.media.ProcessedPhoto
import java.io.File
import java.time.LocalDate
import java.util.UUID

/*
 * Photo evidence in the outbox. Same sequence as the Telegram bot (functions/_shared/telegram-bot.ts + telegram-bot-oqim.ts):
 *   1. upload bytes  POST /api/mobil/yukla?kompaniya_id&obyekt_id  (multipart: fayl, kompaniya_id, obyekt_id, turi=foto_dalil,
 *      operation_id, sha256, size)        -> { ok, document_id }          (canonical upload: reserve -> R2 -> finalize)
 *   2. link          POST /api/foto-dalil { amal:'bogla', manba_turi:'umumiy', document_id, operation_id, ... } -> { ok, id }
 *   3. optional row  POST /api/foto-dalil { amal:'yangila', id, manba_ozgar:true, manba_turi:'qator', manba_id }
 * operation_id is the outbox id and is reused on every retry; sha256 is the content hash, so a replay can never create a second
 * document. Progress (document_id / foto id / linked) is persisted in the entry, so a retry resumes where it stopped.
 */

const val KIND_PHOTO = "foto_dalil_v1"
const val PHOTO_TYPE = "foto_dalil"

data class PhotoJob(
    val file: String, val sha256: String, val size: Int, val companyId: Long, val obyektId: Long, val qatorId: Long?,
    val sana: String, val lat: Double?, val lng: Double?, val izoh: String?,
    val documentId: Long? = null, val fotoId: Long? = null, val linked: Boolean = false,
    /** Evidence of a work-order (naryad) report: the photo is linked to that naryad instead of being a general object photo. */
    val naryadId: Long? = null,
) {
    fun toJson(): JsonObject = buildJsonObject {
        put("file", file); put("sha256", sha256); put("size", size); put("kompaniya_id", companyId); put("obyekt_id", obyektId)
        qatorId?.let { put("qator_id", it) }; put("sana", sana)
        lat?.let { put("lat", it) }; lng?.let { put("lng", it) }; izoh?.let { put("izoh", it) }
        documentId?.let { put("document_id", it) }; fotoId?.let { put("foto_id", it) }; put("linked", linked)
        naryadId?.let { put("naryad_id", it) }
    }
}

fun parsePhotoJob(payload: String): PhotoJob? = runCatching {
    val o = kotlinx.serialization.json.Json.parseToJsonElement(payload).obj() ?: return null
    PhotoJob(
        file = o["file"].str() ?: return null, sha256 = o["sha256"].str() ?: return null, size = o["size"].num()?.toInt() ?: return null,
        companyId = o["kompaniya_id"].num()?.toLong() ?: return null, obyektId = o["obyekt_id"].num()?.toLong() ?: return null,
        qatorId = o["qator_id"].num()?.toLong(), sana = o["sana"].str() ?: return null, lat = o["lat"].num(), lng = o["lng"].num(), izoh = o["izoh"].str(),
        documentId = o["document_id"].num()?.toLong(), fotoId = o["foto_id"].num()?.toLong(),
        linked = (o["linked"] as? JsonPrimitive)?.booleanOrNull ?: false, naryadId = o["naryad_id"].num()?.toLong()?.takeIf { it > 0 },
    )
}.getOrNull()

/** Multipart form of the canonical upload. Text fields first, the file part last (the server reads fields by name). */
fun uploadBody(bytes: ByteArray, fileName: String, job: PhotoJob, operationId: String): MultipartBody = MultipartBody.Builder().setType(MultipartBody.FORM)
    .addFormDataPart("kompaniya_id", job.companyId.toString())
    .addFormDataPart("obyekt_id", job.obyektId.toString())
    .addFormDataPart("turi", PHOTO_TYPE)
    .addFormDataPart("operation_id", operationId)
    .addFormDataPart("sha256", job.sha256)
    .addFormDataPart("size", bytes.size.toString())
    .addFormDataPart("fayl", fileName, bytes.toRequestBody("image/jpeg".toMediaType()))
    .build()

fun linkPayload(job: PhotoJob, operationId: String): JsonObject = buildJsonObject {
    put("amal", "bogla"); put("kompaniya_id", job.companyId); put("obyekt_id", job.obyektId)
    put("document_id", job.documentId ?: 0L); put("manba_turi", if (job.naryadId != null) "naryad" else "umumiy"); put("sana", job.sana)
    job.naryadId?.let { put("manba_id", it) }
    job.lat?.let { put("lat", it) }; job.lng?.let { put("lng", it) }; job.izoh?.let { put("izoh", it) }
    put("operation_id", operationId)
}

fun rowLinkPayload(job: PhotoJob): JsonObject = buildJsonObject {
    put("amal", "yangila"); put("kompaniya_id", job.companyId); put("id", job.fotoId ?: 0L)
    put("manba_ozgar", true); put("manba_turi", "qator"); put("manba_id", job.qatorId ?: 0L)
}

private fun failure(status: Int, code: String) = ApiResult(status, buildJsonObject { put("ok", false); put("code", code); put("error", code) }, code)

/** Sends one queued photo; resumable. Returns the result of the failing step, or a synthetic 200 when everything is done. */
class PhotoSender(
    private val api: BffApi, private val dao: OutboxDao,
    private val readFile: (String) -> ByteArray?, private val deleteFile: (String) -> Unit,
) {
    suspend fun send(e: OutboxEntity): ApiResult {
        var job = parsePhotoJob(e.payloadJson) ?: return failure(422, "BAD_PAYLOAD")
        suspend fun save() { dao.upsert(dao.get(e.id)?.copy(payloadJson = job.toJson().toString()) ?: e.copy(payloadJson = job.toJson().toString())) }

        if (job.documentId == null) {
            val bytes = readFile(job.file) ?: return failure(422, "FILE_MISSING")
            if (ImageMath.sha256Hex(bytes) != job.sha256) return failure(422, "FILE_CORRUPT")
            val r = api.upload(job.companyId, job.obyektId, uploadBody(bytes, "foto-${e.id.take(8)}.jpg", job, e.id))
            if (!r.ok) return r
            if (r.body.obj()?.get("ok")?.let { (it as? JsonPrimitive)?.booleanOrNull } == false) return r
            val doc = r.body.obj()?.get("document_id").num()?.toLong()?.takeIf { it > 0 } ?: return failure(502, "BAD_SHAPE")
            job = job.copy(documentId = doc); save()
        }
        if (job.fotoId == null) {
            val r = api.bff("/api/foto-dalil", "POST", linkPayload(job, e.id))
            if (!r.ok) return r
            if (r.body.obj()?.get("ok")?.let { (it as? JsonPrimitive)?.booleanOrNull } == false) return r
            val id = r.body.obj()?.get("id").num()?.toLong()?.takeIf { it > 0 } ?: return failure(502, "BAD_SHAPE")
            job = job.copy(fotoId = id); save()
        }
        if (job.qatorId != null && !job.linked) {
            val r = api.bff("/api/foto-dalil", "POST", rowLinkPayload(job))
            if (!r.ok) return r
            if (r.body.obj()?.get("ok")?.let { (it as? JsonPrimitive)?.booleanOrNull } == false) return r
            job = job.copy(linked = true); save()
        }
        deleteFile(job.file)
        return ApiResult(200, buildJsonObject { put("ok", true) })
    }
}

/** Puts a processed photo into the outbox (file in app-private storage, entry idempotent by its id). */
class PhotoRepository(
    private val outbox: OutboxRepository, private val dir: File,
    private val now: () -> Long = System::currentTimeMillis, private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    suspend fun enqueue(photo: ProcessedPhoto, companyId: Long, obyektId: Long, obyektNom: String, qatorId: Long?, note: String?, date: LocalDate = LocalDate.now(), naryadId: Long? = null): String {
        val id = newId()
        dir.mkdirs()
        val file = File(dir, "$id.jpg")
        file.writeBytes(photo.jpeg)
        val job = PhotoJob(file.absolutePath, photo.sha256, photo.jpeg.size, companyId, obyektId, qatorId, date.toString(), photo.lat, photo.lng, note?.trim()?.take(500)?.ifBlank { null }, naryadId = naryadId)
        outbox.enqueue(OutboxEntity(id, KIND_PHOTO, job.toJson().toString(), obyektId, obyektNom, 1, OutboxState.PENDING, 0, null, null, now()))
        return id
    }

    companion object {
        fun cleanup(e: OutboxEntity) {
            if (e.kind == KIND_PHOTO) parsePhotoJob(e.payloadJson)?.let { runCatching { File(it.file).delete() } }
        }
    }
}
