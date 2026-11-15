package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.QatorEntity

/*
 * Wire contracts of the three server calls used in P1, parsed defensively (numbers may arrive as strings from
 * Postgres numerics, NULL is "unknown" and never becomes 0). Shapes mirror the web code:
 *   /api/sb              -> { ok, qatorlar:[...], soni, toliq }                 (frontend/functions/api/sb.ts)
 *   /api/obyekt-paket    -> { format:'t2-paket/1', q:{...}, h:{...}, lugat }    (frontend/src/ombor/paket.ts)
 *   /api/sb-yoz fakt_yoz_v2 -> FaktNatija                                       (frontend/src/api/t2-fakt.ts)
 */

internal fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content?.toDoubleOrNull()
internal fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content
internal fun JsonElement?.obj(): JsonObject? = this as? JsonObject
internal fun JsonElement?.arr(): JsonArray? = this as? JsonArray

// ---------- /api/sb ----------

data class SbRows(val rows: List<JsonObject>, val complete: Boolean)

/** `{ok:true, qatorlar:[...]}` -> rows; anything else (ok:false, wrong shape) -> null. */
fun parseSb(body: JsonElement?): SbRows? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val rows = o["qatorlar"].arr()?.mapNotNull { it.obj() } ?: return null
    val complete = (o["toliq"] as? JsonPrimitive)?.booleanOrNull ?: true
    return SbRows(rows, complete)
}

const val OBYEKT_COLUMNS = "id,nom,tur,kompaniya_id,qator_soni,jami,narxsiz,yangilandi"
const val HOLAT_COLUMNS = "qator_id,tur,kod,nom,birlik,smeta_hajm,smeta_summa,fakt_hajm,fakt_summa,f2_hajm,f2_summa"

fun objectsRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_obyekt_jami")
    put("filtr", "kompaniya_id=eq.$companyId")
    put("ustunlar", OBYEKT_COLUMNS)
    put("tartib", "nom.asc")
    put("limit", 5000)
}

fun holatRequest(obyektId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_qator_holat")
    put("filtr", "obyekt_id=eq.$obyektId&tur=eq.bl")
    put("ustunlar", HOLAT_COLUMNS)
    put("tartib", "qator_id.asc")
    put("limit", 200000)
}

fun parseObjects(rows: List<JsonObject>, fallbackCompany: Long): List<ObyektEntity> = rows.mapNotNull { r ->
    val id = r["id"].num()?.toLong() ?: return@mapNotNull null
    ObyektEntity(
        id = id, companyId = r["kompaniya_id"].num()?.toLong() ?: fallbackCompany,
        nom = r["nom"].str().orEmpty(), tur = r["tur"].str(),
        qatorSoni = r["qator_soni"].num()?.toInt(), jami = r["jami"].num(),
        narxsiz = r["narxsiz"].num()?.toInt(), yangilandi = r["yangilandi"].str(),
    )
}

/** `t2_qator_holat` rows -> work rows (only `bl`, i.e. things that can be done on site). Used when the packet is forbidden. */
fun parseHolatRows(obyektId: Long, rows: List<JsonObject>): List<QatorEntity> = rows.mapNotNull { r ->
    val id = r["qator_id"].num()?.toLong() ?: return@mapNotNull null
    if (r["tur"].str().let { it != null && it != "bl" }) return@mapNotNull null
    QatorEntity(
        obyektId = obyektId, qatorId = id, kod = r["kod"].str(), nom = r["nom"].str().orEmpty(), birlik = r["birlik"].str(),
        smetaHajm = r["smeta_hajm"].num(), narx = null, smetaSumma = r["smeta_summa"].num(),
        faktHajm = r["fakt_hajm"].num() ?: 0.0, faktSumma = r["fakt_summa"].num() ?: 0.0,
        f2Hajm = r["f2_hajm"].num() ?: 0.0, f2Summa = r["f2_summa"].num() ?: 0.0, almashtirilgan = 0.0,
    )
}

// ---------- /api/obyekt-paket ----------

data class PaketData(val obyektId: Long, val nom: String?, val rows: List<QatorEntity>)

const val PAKET_FORMAT = "t2-paket/1"

/** Column-oriented packet -> `bl` rows. Wrong format or misaligned columns -> null (never half data). */
fun parsePaket(body: JsonElement?): PaketData? {
    val o = body.obj() ?: return null
    if (o["format"].str() != PAKET_FORMAT) return null
    val obyektId = o["obyekt_id"].num()?.toLong() ?: return null
    val n = o["soni"].num()?.toInt() ?: return null
    val q = o["q"].obj() ?: return null
    val h = o["h"].obj() ?: return null
    val lugat = o["lugat"].obj() ?: return null
    val ids = q["id"].arr() ?: return null
    if (ids.size != n) return null
    fun col(owner: JsonObject, key: String): JsonArray? = owner[key].arr()?.takeIf { it.size == n }
    val tur = col(q, "tur") ?: return null
    val kod = col(q, "kod") ?: return null
    val nom = col(q, "nom") ?: return null
    val birlik = col(q, "birlik") ?: return null
    val hajm = col(q, "hajm") ?: return null
    val narx = col(q, "narx") ?: return null
    val summa = col(q, "summa") ?: return null
    val fh = col(h, "fakt_hajm") ?: return null
    val fs = col(h, "fakt_summa") ?: return null
    val f2h = col(h, "f2_hajm") ?: return null
    val f2s = col(h, "f2_summa") ?: return null
    fun dict(key: String): List<String> = lugat[key].arr()?.map { it.str().orEmpty() } ?: emptyList()
    val dTur = dict("tur"); val dKod = dict("kod"); val dNom = dict("nom"); val dBirlik = dict("birlik")
    fun lookup(d: List<String>, e: JsonElement): String? = e.num()?.toInt()?.let { d.getOrNull(it) }
    val smetaOverride = h["smeta_hajm"].obj()
    val replaced = h["almashtirilgan_hajm"].obj()
    // Section name for the section filter: nearest ancestor of kind `rz` (razdel), else the top-most ancestor. Optional column.
    val ota = col(q, "ota_id")
    val indexById: Map<Long, Int> = if (ota == null) emptyMap() else HashMap<Long, Int>(n * 2).also { m -> for (i in 0 until n) ids[i].num()?.toLong()?.let { m[it] = i } }
    fun sectionOf(start: Int): String? {
        if (ota == null) return null
        var cur = start; var top: String? = null
        for (hop in 0 until 12) {
            val parent = indexById[ota[cur].num()?.toLong() ?: return top] ?: return top
            val name = lookup(dNom, nom[parent])?.trim()?.takeIf { it.isNotEmpty() }
            if (lookup(dTur, tur[parent]) == "rz" && name != null) return name
            if (name != null) top = name
            cur = parent
        }
        return top
    }
    val out = ArrayList<QatorEntity>(n)
    for (i in 0 until n) {
        if (lookup(dTur, tur[i]) != "bl") continue
        val id = ids[i].num()?.toLong() ?: return null
        out += QatorEntity(
            obyektId = obyektId, qatorId = id, kod = lookup(dKod, kod[i]), nom = lookup(dNom, nom[i]).orEmpty(),
            birlik = lookup(dBirlik, birlik[i]),
            smetaHajm = smetaOverride?.get(id.toString()).num() ?: hajm[i].num(),
            narx = narx[i].num(), smetaSumma = summa[i].num(),
            faktHajm = fh[i].num() ?: 0.0, faktSumma = fs[i].num() ?: 0.0,
            f2Hajm = f2h[i].num() ?: 0.0, f2Summa = f2s[i].num() ?: 0.0,
            almashtirilgan = replaced?.get(id.toString()).num() ?: 0.0,
            bolim = sectionOf(i),
        )
    }
    return PaketData(obyektId, o["obyekt_nom"].str(), out)
}

/** Object-level sums derived from the work rows (the unit prices are QQS-free, so these are QQS-free too). */
@kotlinx.serialization.Serializable
data class Totals(val smeta: Double?, val fakt: Double?, val f2: Double?, val rows: Int, val unpriced: Int) {
    val faktPercent: Double? get() = percentOf(fakt, smeta)
    val f2Percent: Double? get() = percentOf(f2, smeta)
}

fun computeTotals(rows: List<QatorEntity>): Totals {
    if (rows.isEmpty()) return Totals(null, null, null, 0, 0)
    var smeta = 0.0; var fakt = 0.0; var f2 = 0.0; var unpriced = 0
    for (r in rows) {
        if (r.smetaSumma == null) { if ((r.smetaHajm ?: 0.0) > 0.0) unpriced++ } else smeta += r.smetaSumma
        fakt += r.faktSumma; f2 += r.f2Summa
    }
    return Totals(smeta, fakt, f2, rows.size, unpriced)
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

