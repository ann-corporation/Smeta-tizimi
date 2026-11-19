package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import kotlin.math.abs
import kotlin.math.floor

/*
 * "Bajarilmaydi / qilib bo'lmaydi" (site frontend/src/api/t2-bajarilmadi.ts + lib/fakt-studio.ts bajarilmadiHajmlar/bajarilmadiTaklif + lib/resurs-amal.ts chiqarilganmi
 * + ish-varaq/model.ts chiqarilganlarOl): the estimate row NEVER changes; the not-done volume, reason, date live in their own table. List = RPC bajarilmadi_royxat_v1,
 * write/cancel = /api/sb-yoz (amal bajarilmadi_belgila / bajarilmadi_bekor). A resource whose active marks cover its WHOLE smeta volume is "taken out" of the job (not in F2).
 */

class BajarilmadiSabab(val kod: String, val nom: String)

val BAJARILMADI_SABABLAR = listOf(
    BajarilmadiSabab("buyurtmachi_chiqardi", "Buyurtmachi loyihadan chiqardi"), BajarilmadiSabab("loyiha_ozgardi", "Loyiha o‘zgardi"),
    BajarilmadiSabab("boshqa_pudratchi", "Boshqa pudratchiga berildi"), BajarilmadiSabab("texnik_sabab", "Texnik sabab"), BajarilmadiSabab("zamena", "Zamena qilindi"),
    BajarilmadiSabab("material_yoq", "Material/uskuna yetkazilmadi"), BajarilmadiSabab("boshqa", "Boshqa (izoh majburiy)"),
)

class BajarilmadiYozuv(val id: Long, val qatorId: Long, val bajarilmaganHajm: Double, val sabab: String, val holat: String, val sana: String?)

fun bajarilmadiRoyxatSoro(kompaniyaId: Long, obyektId: Long) = buildJsonObject { put("soro", "bajarilmadi_royxat_v1"); put("kompaniya_id", kompaniyaId); put("obyekt_id", obyektId) }

/** `{ok, natija:{ok:true, qatorlar:[...]}}` -> records; anything else -> null (unreadable: nothing is hidden by guessing). */
fun parseBajarilmadiRoyxat(body: JsonElement?): List<BajarilmadiYozuv>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val n = o["natija"].obj() ?: return null
    if ((n["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return (n["qatorlar"].arr() ?: JsonArray(emptyList())).mapNotNull { e ->
        val q = e.obj() ?: return@mapNotNull null
        BajarilmadiYozuv(
            q["id"].num()?.toLong() ?: return@mapNotNull null, q["qator_id"].num()?.toLong() ?: return@mapNotNull null, q["bajarilmagan_hajm"].num() ?: 0.0,
            q["sabab_kod"].str().orEmpty(), q["holat"].str().orEmpty(), q["sana"].str(),
        )
    }
}

/** Active marks summed per row. */
fun bajarilmadiHajmlar(royxat: List<BajarilmadiYozuv>): Map<Long, Double> {
    val m = LinkedHashMap<Long, Double>()
    for (b in royxat) if (b.holat == "faol") m[b.qatorId] = (m[b.qatorId] ?: 0.0) + b.bajarilmaganHajm
    return m
}

private const val EPS = 1e-9

/** The marks cover the WHOLE smeta volume (unknown or 0 smeta -> not taken out; NULL is not 0). */
fun chiqarilganmi(smeta: Double?, bajarilmaydi: Double?): Boolean {
    if (smeta == null || !smeta.isFinite() || bajarilmaydi == null || !bajarilmaydi.isFinite()) return false
    val s = abs(smeta)
    return s > EPS && bajarilmaydi >= s - EPS
}

/** Resources (rs / mat / ob) taken out of their job. */
fun chiqarilganlarOl(rows: List<T2Qator>, states: List<JurnalHolat>, baj: Map<Long, Double>): Set<Long> {
    val sm = states.associate { it.qatorId to it.smetaHajm }
    val s = LinkedHashSet<Long>()
    for (r in rows) if ((r.tur == "rs" || r.tur == "mat" || r.tur == "ob") && baj.containsKey(r.id) && chiqarilganmi(sm[r.id] ?: r.hajm, baj[r.id])) s.add(r.id)
    return s
}

/** Suggested volume = the OPEN remainder (never negative); unknown smeta -> null (typed by hand). */
fun bajarilmadiTaklif(smeta: Double?, fakt: Double, belgilangan: Double, almashtirilgan: Double? = null): Double? {
    val q = ochiqQoldiq(QoldiqKirish(smeta, fakt, null, almashtirilgan, belgilangan), QoldiqRejim.Fakt) ?: return null
    return if (q > 1e-9) floor(q * 1e6 + 0.5) / 1e6 else 0.0
}

fun bajarilmadiXato(code: String?, error: String? = null): String = when (code) {
    "SABAB_IZOH_MAJBURIY" -> "Sabab «Boshqa» bo‘lsa izoh yozish shart."
    "QATOR_SCOPE_MISMATCH" -> "Tanlangan qator bu obyektga tegishli emas."
    "HUJJAT_SCOPE_MISMATCH" -> "Dalil hujjat topilmadi yoki boshqa kompaniyaniki."
    "TOPILMADI_YOKI_BEKOR" -> "Yozuv topilmadi yoki allaqachon bekor qilingan."
    else -> error ?: code ?: "Amal bajarilmadi"
}

/** /api/sb-yoz body (same shape as the site's bajarilmadiBelgila); a null volume = the whole remainder (server rule). */
fun bajarilmadiBelgilaPayload(kompaniyaId: Long, obyektId: Long, qatorId: Long, hajm: Double?, sabab: String, izoh: String?, sana: String, operationId: String): JsonObject = buildJsonObject {
    put("amal", "bajarilmadi_belgila"); put("kompaniya_id", kompaniyaId); put("obyekt_id", obyektId)
    put("qatorlar", buildJsonArray { add(buildJsonObject { put("qator_id", qatorId); put("hajm", if (hajm != null) JsonPrimitive(hajm) else JsonNull) }) })
    put("sabab_kod", sabab); if (!izoh.isNullOrBlank()) put("sabab_izoh", izoh)
    put("hujjat_id", JsonNull); put("sana", sana); put("zamena_qator_id", JsonNull); put("operation_id", operationId)
}

fun bajarilmadiBekorPayload(kompaniyaId: Long, id: Long, operationId: String): JsonObject = buildJsonObject {
    put("amal", "bajarilmadi_bekor"); put("kompaniya_id", kompaniyaId); put("id", id); put("operation_id", operationId)
}
