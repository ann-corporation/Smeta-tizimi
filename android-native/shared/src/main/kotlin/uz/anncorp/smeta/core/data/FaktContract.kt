package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/* Moved mechanically from :app Contract.kt (pure wire contracts: no Android, no Room). */

const val PAKET_FORMAT = "t2-paket/1"

const val HOLAT_COLUMNS = "qator_id,tur,kod,nom,birlik,smeta_hajm,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa"

fun holatRequest(obyektId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_qator_holat")
    put("filtr", "obyekt_id=eq.$obyektId&tur=eq.bl")
    put("ustunlar", HOLAT_COLUMNS)
    put("tartib", "qator_id.asc")
    put("limit", 200000)
}

// ---------- /api/sb-yoz : fakt_yoz_v2 / usta_fakt_qoralama_v1 ----------

const val AMAL_FAKT = "fakt_yoz_v2"
const val AMAL_USTA_DRAFT = "usta_fakt_qoralama_v1"

data class FaktLine(val qatorId: Long, val hajm: Double)

/** The write payload. The same operation id is reused on every retry, so a replay can never create a second document. */
fun faktPayload(amal: String, companyId: Long, obyektId: Long, sana: String, lines: List<FaktLine>, operationId: String): JsonObject = buildJsonObject {
    put("amal", amal)
    put("kompaniya_id", companyId)
    put("obyekt_id", obyektId)
    put("sana", sana)
    put("qatorlar", buildJsonArray {
        lines.forEach { add(buildJsonObject { put("qator_id", it.qatorId); put("hajm", it.hajm) }) }
    })
    put("operation_id", operationId)
}

data class OverWarning(val qatorId: Long, val nom: String, val bor: Double?, val qoshilmoqda: Double?, val chegara: Double?)
data class FaktResult(
    val ok: Boolean, val error: String?, val raqam: String?, val jami: Double?, val lineCount: Int?,
    val over: List<OverWarning>, val unpricedCount: Int, val unpricedNote: String?, val replay: Boolean,
) {
    val hasWarnings get() = over.isNotEmpty() || unpricedCount > 0
}

fun parseFaktResult(body: JsonElement?): FaktResult? {
    val o = body.obj() ?: return null
    val ok = (o["ok"] as? JsonPrimitive)?.booleanOrNull ?: false
    val over = o["ogohlantirish"].arr()?.mapNotNull { e ->
        val w = e.obj() ?: return@mapNotNull null
        OverWarning(w["qator_id"].num()?.toLong() ?: return@mapNotNull null, w["nom"].str().orEmpty(), w["bor"].num(), w["qoshilmoqda"].num(), w["chegara"].num())
    }.orEmpty()
    val unpriced = o["narxsiz_soni"].num()?.toInt() ?: o["narxsiz"].num()?.toInt() ?: 0
    return FaktResult(
        ok = ok, error = o["error"].str(), raqam = o["raqam"].str(), jami = o["jami"].num(), lineCount = o["qator_soni"].num()?.toInt(),
        over = over, unpricedCount = unpriced, unpricedNote = o["narxsiz_ogohlantirish"].str(),
        replay = (o["takror"] as? JsonPrimitive)?.booleanOrNull ?: false,
    )
}

