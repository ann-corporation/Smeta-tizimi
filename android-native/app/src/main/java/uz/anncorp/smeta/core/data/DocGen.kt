package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * Document GENERATION (Hujjat yaratish). There is exactly ONE document engine - the server (POST /api/hujjat-yarat): it builds the final
 * XLSX/PDF from the system's own modules (the same ones the website uses). The app contains NO template and NO layout: it asks the server
 * which documents exist for this object and this user ("royxat"), requests the file in a chosen format ("yarat"), then only previews /
 * saves / shares the bytes. A future change of any document therefore happens once, on the server, and every client gets it.
 */

/** One generatable document as announced by the server. [params] are opaque to the app: they are sent back unchanged. */
@kotlinx.serialization.Serializable
data class GenItem(
    val key: String, val type: String, val title: String, val state: String, val amount: Double?,
    val params: Map<String, Long>, val formats: List<String>,
) {
    val isF2: Boolean get() = type == "f2"
    val isF3: Boolean get() = type == "forma3"
}

fun genListRequestBody(companyId: Long, objectId: Long) = buildJsonObject { put("amal", "royxat"); put("kompaniya_id", companyId); put("obyekt_id", objectId) }

fun genCreateRequestBody(companyId: Long, objectId: Long, item: GenItem, format: String) = buildJsonObject {
    put("amal", "yarat"); put("tur", item.type); put("format", format); put("kompaniya_id", companyId); put("obyekt_id", objectId)
    item.params.forEach { (k, v) -> put(k, v) }
}

const val GEN_PATH = "/api/hujjat-yarat"

/** `{ok:true, hujjatlar:[{kalit,tur,sarlavha,holat,summa,parametrlar,formatlar}]}` -> items. Null for any other shape. */
fun parseGenList(body: JsonElement?): List<GenItem>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return root["hujjatlar"].arr()?.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val key = o["kalit"].str() ?: return@mapNotNull null
        val params = o["parametrlar"].obj()?.mapNotNull { (k, v) -> v.num()?.toLong()?.let { k to it } }?.toMap().orEmpty()
        GenItem(
            key = key, type = o["tur"].str().orEmpty(), title = o["sarlavha"].str()?.takeIf { it.isNotBlank() } ?: key, state = o["holat"].str().orEmpty(),
            amount = o["summa"].num(), params = params, formats = o["formatlar"].arr()?.mapNotNull { it.str() }.orEmpty(),
        )
    }
}

sealed interface GenResult {
    data class Ready(val name: String, val mime: String, val bytes: ByteArray) : GenResult
    data object Offline : GenResult
    /** 402 TOKEN_YETMAYDI. */
    data object NoTokens : GenResult
    data object Forbidden : GenResult
    /** The server refused because the object data is not complete (F2_QATOR_TOPILMADI, QATOR_YOQ, MALUMOT_OQILMADI ...). */
    data object DataIncomplete : GenResult
    data class Failed(val code: String?) : GenResult
}

fun mapGenError(status: Int, code: String?): GenResult = when {
    status == 0 -> GenResult.Offline
    status == 402 || code == "TOKEN_YETMAYDI" -> GenResult.NoTokens
    status == 401 || status == 403 -> GenResult.Forbidden
    code in DATA_CODES -> GenResult.DataIncomplete
    else -> GenResult.Failed(code ?: "HTTP $status")
}

private val DATA_CODES = setOf("F2_QATOR_TOPILMADI", "QATOR_YOQ", "MALUMOT_OQILMADI", "F3_HISOBLANMADI", "SVOD_OQILMADI", "REESTR_OQILMADI")

class DocGenRepository(private val api: BffApi) {
    /** The list is decided by the server (what exists for this object and what this user may read); `null` = could not load. */
    suspend fun list(companyId: Long, objectId: Long): List<GenItem>? {
        val r = api.bff(GEN_PATH, "POST", genListRequestBody(companyId, objectId))
        return if (r.ok) parseGenList(r.body) else null
    }

    /** Asks the server for the final file. Nothing is built or laid out on the device. */
    suspend fun generate(companyId: Long, objectId: Long, item: GenItem, format: String): GenResult {
        val r = api.bffPostBytes(GEN_PATH, genCreateRequestBody(companyId, objectId, item, format), DocumentsRepository.MAX_BYTES)
        if (!r.ok || r.bytes == null || r.bytes.isEmpty()) return mapGenError(r.status, r.code)
        val mime = r.mime?.takeIf { it.isNotBlank() } ?: if (format == "pdf") "application/pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return GenResult.Ready(r.filename ?: safeFileName(item.title, "hujjat") + "." + format, mime, r.bytes)
    }
}
