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
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import java.math.BigDecimal
import kotlin.math.floor

/*
 * "Kichik ABC" (site frontend/src/lib/ish-abc.ts + api/t2-ish-abc.ts): an additional (out-of-estimate) work / a work replacement / a resource replacement in the SHNK structure.
 * Resource volume = norma x work volume; sum = volume x unit price (ROUND 2, like Postgres numeric); work sum = sum of its resources; a resource with no price has a NULL sum
 * (never 0) and is counted as "narxsiz". Reads go through /api/sb (soro RPC), the write through /api/sb-yoz `ish_abc_saqla_v1` / `qator_ish_abc_tahrir_v*`.
 * The estimate rows are never changed: the new row points at the old one. NOT ported: the normative catalog (R2 /api/norm-library is not reachable through the device BFF).
 */

val ABC_KATLAR: List<String> = listOf("ЧЕЛ", "МАШ", "МАТ", "ОБ")
val ABC_KAT_NOMI: Map<String, String> = mapOf("ЧЕЛ" to "Mehnat", "МАШ" to "Mashina", "МАТ" to "Material", "ОБ" to "Uskuna")
val ABC_MANBA_NOMI: Map<String, String> = mapOf("smeta_obyekt" to "shu smeta", "smeta_shartnoma" to "shu shartnoma", "smeta" to "boshqa shartnoma", "katalog" to "katalog", "qolda" to "qo‘lda")

private val SON_RE = Regex("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$")

/** JS `son`: whitespace removed, the FIRST comma -> point, finite number or null. */
fun abcSon(v: String?): Double? {
    if (v == null) return null
    val t = v.filterNot { it.isWhitespace() }.replaceFirst(',', '.')
    if (t.isEmpty() || !SON_RE.matches(t)) return null
    return t.toDoubleOrNull()?.takeIf { it.isFinite() }
}

private fun y6(x: Double): Double = floor(x * 1e6 + 0.5) / 1e6

/** Same rounding as Postgres numeric: float noise cleaned at 6 places, then decimal half-away-from-zero to 2 places (sign symmetric, never -0). */
fun pulYaxlit(x: Double): Double {
    val t = y6(x)
    if (t < 0) { val r = -pulYaxlit(-t); return if (r == 0.0) 0.0 else r }
    val a = BigDecimal(t.toString()).movePointRight(2).toDouble()
    return floor(a + 0.5) / 100
}

/** Category of an estimate composition line (kat / tur / unit -> ЧЕЛ / МАШ / МАТ / ОБ). */
fun abcKatAniqla(kat: String?, tur: String? = null, birlik: String? = null): String {
    val k = (kat ?: "").uppercase()
    if (k in ABC_KATLAR) return k
    if (tur == "ob") return "ОБ"
    val b = (birlik ?: "").uppercase()
    if (Regex("ЧЕЛ").containsMatchIn(b)) return "ЧЕЛ"
    if (Regex("МАШ").containsMatchIn(b)) return "МАШ"
    return "МАТ"
}

class NarxVariant(val manba: String, val narx: Double, val izoh: String)

/** A resource line of the form. `norma` empty = the exact spent volume in `hajm` (a normless resource). */
data class AbcResurs(
    val kat: String, val kod: String, val nom: String, val birlik: String, val norma: String, val hajm: String = "", val narx: String, val manba: String, val variantlar: List<NarxVariant> = emptyList(),
)

class AbcQatorHisob(val hajm: Double?, val summa: Double?)
class AbcHisob(val qatorlar: List<AbcQatorHisob>, val jamiKat: Map<String, Double>, val jami: Double, val narxsiz: Int, val ishNarxi: Double?)

fun abcHisobla(ishHajm: String?, resurslar: List<AbcResurs>): AbcHisob {
    val h = abcSon(ishHajm)
    val jamiKat = linkedMapOf("ЧЕЛ" to 0.0, "МАШ" to 0.0, "МАТ" to 0.0, "ОБ" to 0.0)
    var jami = 0.0; var narxsiz = 0
    val qatorlar = resurslar.map { r ->
        val n = abcSon(r.norma); val p = abcSon(r.narx)
        val hajm = if (n != null && n > 0) (if (h != null) y6(n * h) else null) else abcSon(r.hajm)
        val summa = if (hajm != null && p != null && p >= 0) pulYaxlit(hajm * p) else null
        if (summa == null) narxsiz++ else { jamiKat[r.kat] = (jamiKat[r.kat] ?: 0.0) + summa; jami += summa }
        AbcQatorHisob(hajm, summa)
    }
    jami = pulYaxlit(jami)
    return AbcHisob(qatorlar, jamiKat, jami, narxsiz, if (h != null && h > 0 && resurslar.isNotEmpty() && narxsiz == 0) pulYaxlit(jami / h) else null)
}

data class AbcIsh(val kod: String, val nom: String, val birlik: String, val hajm: String)
class AbcXato(val joy: String, val matn: String)

fun abcTekshir(rejimIsh: Boolean, ish: AbcIsh?, resurslar: List<AbcResurs>, sabab: String, fakt: String? = null): List<AbcXato> {
    val x = ArrayList<AbcXato>()
    if (rejimIsh) {
        if (ish == null || ish.nom.isBlank()) x.add(AbcXato("ish", "Ish turi nomi kiritilmagan"))
        if (ish == null || ish.birlik.isBlank()) x.add(AbcXato("ish", "Ish birligi kiritilmagan"))
        // Minus is normal (closing / correcting a wrongly taken volume) - only 0 is refused.
        val h = abcSon(ish?.hajm); if (h == null || h == 0.0) x.add(AbcXato("ish", "Ish hajmi 0 dan farqli bo‘lishi kerak (minus ham mumkin)"))
        val f = abcSon(fakt); if (!fakt.isNullOrBlank() && f == null) x.add(AbcXato("fakt", "Bajarilgan hajm noto‘g‘ri"))
    } else if (resurslar.size != 1) x.add(AbcXato("resurs", "Bitta yangi resurs tanlang"))
    resurslar.forEachIndexed { i, r ->
        if (r.nom.isBlank() || r.birlik.isBlank()) x.add(AbcXato("r$i", "${i + 1}-resurs: nom va birlik kerak"))
        val n = abcSon(r.norma); val hj = abcSon(r.hajm)
        if (!((n != null && n > 0) || (hj != null && hj != 0.0))) x.add(AbcXato("r$i", "${i + 1}-resurs: norma (> 0) yoki aniq hajm (0 dan farqli) bo‘lishi kerak"))
        val pr = abcSon(r.narx); if (r.narx.isNotBlank() && (pr == null || pr < 0)) x.add(AbcXato("r$i", "${i + 1}-resurs: narx noto‘g‘ri"))
    }
    if (sabab.isBlank()) x.add(AbcXato("sabab", "Sabab majburiy"))
    return x
}

/** Automatic choice: this estimate (RES) -> this contract's estimates -> other contracts. The catalogue is NEVER put automatically (offered as a separate variant). */
fun abcEngYaxshiNarx(v: List<NarxVariant>): NarxVariant? {
    for (m in listOf("smeta_obyekt", "smeta_shartnoma", "smeta")) v.firstOrNull { it.manba == m && it.narx > 0 }?.let { return it }
    return null
}

// ---------- modes (site AbcRejim / AbcTahrir) ----------

class AbcEskiIsh(val id: Long, val kod: String?, val nom: String, val birlik: String?, val otaId: Long?, val otaVersiya: Int?, val hajm: Double?)
class AbcEskiResurs(val id: Long, val nom: String, val birlik: String?, val kat: String?, val norma: Double?, val kod: String? = null, val hajm: Double? = null, val ishNom: String? = null)

/** `additional` = out-of-estimate work (optionally into a section); `replacement` = work replacement; `resursZamena` = resource replacement inside a work (ishHajm = parent work volume, null = a lone resource). */
sealed interface AbcRejim {
    class Additional(val bolimId: Long? = null) : AbcRejim
    class Replacement(val eski: AbcEskiIsh) : AbcRejim
    class ResursZamena(val eski: AbcEskiResurs, val ishHajm: Double?) : AbcRejim
}

/** Editing an existing added work / replacement in place (one transaction). */
class AbcTahrir(val qatorId: Long, val kutilganVersiya: Int? = null, val oldAmount: Double? = null, val ish: AbcIsh? = null, val resurslar: List<AbcResurs> = emptyList(), val fakt: String? = null)
/** Prefill of a new additional work (e.g. from "Xotiradan fakt": the text's name, volume and fakt). */
class AbcBoshlang(val ish: AbcIsh? = null, val fakt: String? = null, val sabab: String? = null)

val AbcRejim.command: String get() = when (this) { is AbcRejim.Additional -> "additional"; is AbcRejim.Replacement -> "replacement"; is AbcRejim.ResursZamena -> "resurs_zamena" }

// ---------- library reads (RPC through /api/sb) ----------

class IshTuriSostav(val tur: String, val kat: String?, val kod: String?, val nom: String, val birlik: String?, val norma: Double?, val narx: Double?)
class IshTuriVariant(val manba: String, val qatorId: Long?, val kod: String?, val nom: String, val birlik: String?, val soni: Int?, val shuObyekt: Boolean, val narx: Double?, val sostav: List<IshTuriSostav>)
class ResursVariant(val manba: String, val kat: String?, val kod: String?, val nom: String, val birlik: String?, val narx: Double?, val narxManba: String, val soni: Int?, val shuObyekt: Boolean, val manbaNom: String?)

private fun JsonElement?.d(): Double? = num()?.takeIf { it.isFinite() }

fun parseIshTuriRoyxat(natija: JsonElement?): List<IshTuriVariant> = natija.arr()?.mapNotNull { e ->
    val o = e.obj() ?: return@mapNotNull null
    IshTuriVariant(
        o["manba"].str() ?: "smeta", o["qator_id"].num()?.toLong(), o["kod"].str(), o["nom"].str() ?: return@mapNotNull null, o["birlik"].str(), o["soni"].num()?.toInt(),
        (o["shu_obyekt"] as? JsonPrimitive)?.booleanOrNull == true, o["narx"].d(),
        o["sostav"].arr()?.mapNotNull { s -> s.obj()?.let { IshTuriSostav(it["tur"].str() ?: "rs", it["kat"].str(), it["kod"].str(), it["nom"].str() ?: return@mapNotNull null, it["birlik"].str(), it["norma"].d(), it["narx"].d()) } }.orEmpty(),
    )
}.orEmpty()

fun parseResursRoyxat(natija: JsonElement?): List<ResursVariant> = natija.arr()?.mapNotNull { e ->
    val o = e.obj() ?: return@mapNotNull null
    ResursVariant(o["manba"].str() ?: "smeta", o["kat"].str(), o["kod"].str(), o["nom"].str() ?: return@mapNotNull null, o["birlik"].str(), o["narx"].d(), o["narx_manba"].str() ?: "qolda",
        o["soni"].num()?.toInt(), (o["shu_obyekt"] as? JsonPrimitive)?.booleanOrNull == true, o["manba_nom"].str())
}.orEmpty()

/** natija = [{i, variantlar:[{manba, narx, izoh}]}] -> variants by item index (empty where the server gave none). */
fun parseNarxTakliflari(natija: JsonElement?, n: Int): List<List<NarxVariant>> {
    val out = MutableList(n) { emptyList<NarxVariant>() }
    for (e in natija.arr().orEmpty()) {
        val o = e.obj() ?: continue
        val i = o["i"].num()?.toInt() ?: continue
        if (i !in 0 until n) continue
        out[i] = o["variantlar"].arr()?.mapNotNull { v -> v.obj()?.let { x -> NarxVariant(x["manba"].str() ?: return@let null, x["narx"].d() ?: return@let null, x["izoh"].str().orEmpty()) } }.orEmpty()
    }
    return out
}

private suspend fun soroNatija(api: BffApi, body: JsonObject): JsonElement? {
    val o = api.bff("/api/sb", "POST", body).body.obj() ?: return null
    return if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == true) o["natija"] else null
}

suspend fun ishTuriQidir(api: BffApi, obyektId: Long, q: String): List<IshTuriVariant> =
    parseIshTuriRoyxat(soroNatija(api, buildJsonObject { put("soro", "ish_turi_qidir_v1"); put("obyekt_id", obyektId); put("q", q) }))

suspend fun resursQidir(api: BffApi, obyektId: Long, q: String, kat: String?): List<ResursVariant> =
    parseResursRoyxat(soroNatija(api, buildJsonObject { put("soro", "resurs_qidir_v1"); put("obyekt_id", obyektId); put("q", q); put("kat", kat.orEmpty()) }))

suspend fun narxTakliflari(api: BffApi, obyektId: Long, items: List<Pair<String, String>>): List<List<NarxVariant>> {
    if (items.isEmpty()) return emptyList()
    val body = buildJsonObject {
        put("soro", "resurs_narx_taklif_v1"); put("obyekt_id", obyektId)
        put("items", buildJsonArray { for ((nom, birlik) in items) add(buildJsonObject { put("nom", nom); put("birlik", birlik) }) })
    }
    return parseNarxTakliflari(soroNatija(api, body), items.size)
}

// ---------- write (/api/sb-yoz) ----------

class AbcSaqlaResurs(val kat: String, val kod: String?, val nom: String, val birlik: String, val norma: Double?, val hajm: Double?, val narx: Double?, val narxManba: String)
class AbcSaqlaIsh(val kod: String?, val nom: String, val birlik: String, val hajm: Double)

private fun JsonObjectBuilderNum(b: kotlinx.serialization.json.JsonObjectBuilder, key: String, v: Double?) { if (v != null) b.put(key, v) else b.put(key, JsonNull) }
private fun JsonObjectBuilderStr(b: kotlinx.serialization.json.JsonObjectBuilder, key: String, v: String?) { if (v != null) b.put(key, v) else b.put(key, JsonNull) }

private fun resurslarJson(rs: List<AbcSaqlaResurs>): JsonArray = buildJsonArray {
    for (r in rs) add(buildJsonObject {
        put("kat", r.kat); JsonObjectBuilderStr(this, "kod", r.kod); put("nom", r.nom); put("birlik", r.birlik)
        JsonObjectBuilderNum(this, "norma", r.norma); JsonObjectBuilderNum(this, "hajm", r.hajm); JsonObjectBuilderNum(this, "narx", r.narx); put("narx_manba", r.narxManba)
    })
}
private fun ishJson(i: AbcSaqlaIsh?): JsonElement = if (i == null) JsonNull else buildJsonObject { JsonObjectBuilderStr(this, "kod", i.kod); put("nom", i.nom); put("birlik", i.birlik); put("hajm", i.hajm) }

/** `ish_abc_saqla_v1` (new additional work / replacement / resource replacement). */
fun abcSaqlaPayload(
    kompaniyaId: Long, obyektId: Long, command: String, otaQatorId: Long?, almashtirilayotganQatorId: Long?, kutilganVersiya: Int?, ish: AbcSaqlaIsh?, resurslar: List<AbcSaqlaResurs>,
    faktHajm: Double?, sana: String?, sabab: String, operationId: String,
): JsonObject = buildJsonObject {
    put("amal", "ish_abc_saqla_v1"); put("kompaniya_id", kompaniyaId); put("obyekt_id", obyektId); put("command", command)
    if (otaQatorId != null) put("ota_qator_id", otaQatorId) else put("ota_qator_id", JsonNull)
    if (almashtirilayotganQatorId != null) put("almashtirilayotgan_qator_id", almashtirilayotganQatorId) else put("almashtirilayotgan_qator_id", JsonNull)
    if (kutilganVersiya != null) put("kutilgan_versiya", kutilganVersiya) else put("kutilgan_versiya", JsonNull)
    put("ish", ishJson(ish)); put("resurslar", resurslarJson(resurslar))
    JsonObjectBuilderNum(this, "fakt_hajm", faktHajm); JsonObjectBuilderStr(this, "sana", sana); put("sabab", sabab); put("operation_id", operationId)
}

/** Edit in place = replace in one transaction (`qator_ish_abc_tahrir_v2` with the expected version, else v1). */
fun abcTahrirPayload(
    kompaniyaId: Long, obyektId: Long, qatorId: Long, kutilganVersiya: Int?, ish: AbcSaqlaIsh?, resurslar: List<AbcSaqlaResurs>, faktHajm: Double?, sana: String?, sabab: String, operationId: String,
): JsonObject = buildJsonObject {
    put("amal", if (kutilganVersiya != null) "qator_ish_abc_tahrir_v2" else "qator_ish_abc_tahrir_v1")
    if (kutilganVersiya != null) put("kutilgan_versiya", kutilganVersiya)
    put("kompaniya_id", kompaniyaId); put("obyekt_id", obyektId); put("qator_id", qatorId); put("ish", ishJson(ish)); put("resurslar", resurslarJson(resurslar))
    JsonObjectBuilderNum(this, "fakt_hajm", faktHajm); JsonObjectBuilderStr(this, "sana", sana); put("sabab", sabab); put("operation_id", operationId)
}

/** "How much of the original resource this replacement covers" (unit differs): `zamena_almashtirish_belgila_v1`. */
fun zamenaAlmashtirishPayload(kompaniyaId: Long, qatorId: Long, hajm: Double?): JsonObject = buildJsonObject {
    put("amal", "zamena_almashtirish_belgila_v1"); put("kompaniya_id", kompaniyaId); put("qator_id", qatorId); JsonObjectBuilderNum(this, "hajm", hajm)
}

class AbcNatija(val ok: Boolean, val error: String?, val xabar: String?, val code: String?, val qatorId: Long?)

fun parseAbcNatija(body: JsonElement?): AbcNatija? {
    val o = body.obj() ?: return null
    return AbcNatija((o["ok"] as? JsonPrimitive)?.booleanOrNull == true, o["error"].str(), o["xabar"].str(), o["code"].str(), o["qator_id"].num()?.toLong())
}

fun abcXato(code: String?, error: String? = null, xabar: String? = null): String {
    val m = "${code ?: ""} ${error ?: ""} ${xabar ?: ""}"
    fun has(p: String) = Regex(p).containsMatchIn(m)
    return when {
        has("QATOR_TARIXDA|TASDIQLANGAN_OZGARISH") -> "Bu qator hujjat tarixida ishlatilgan. Asl tarix saqlanadi — tuzatish hujjati kerak."
        has("OPERATION_SCOPE_MISMATCH") -> "Bu amal boshqa ma’lumot bilan yuborilgan. Jadvalni yangilab, qayta tekshiring."
        has("ZAMENA_JOYI") -> "Zamena o‘zi almashtirgan qator yonida turadi — faqat shu bo‘lim ichida tartibini o‘zgartirish mumkin."
        has("TUZILMA_NOTOGRI|JOY_NOTOGRI") -> "Bu joyga ko‘chirib bo‘lmaydi: ish — faqat bo‘limga, resurs — ishga yoki bo‘limga."
        has("RESURS_QOSHILGAN") -> "Bu resursni o‘zingiz qo‘shgansiz — uni tahrirlang yoki o‘chiring."
        has("RESURS_ISHSIZ|BOLIM_NOT_FOUND") -> "Resursning ishi yoki bo‘limi topilmadi — ish zamenasi uchun joy aniqlanmadi."
        has("SMETA_QATORI_OZGARMAS") -> "Smetaning asl qatori o‘chirilmaydi va o‘zgartirilmaydi."
        has("F2_DA") -> "Bu qator F2 aktida — avval F2 ni bekor qiling."
        has("BOGLANGAN") -> "Qatorga АОСР / laboratoriya / narx dalili bog‘langan — avval ularni yeching."
        has("STALE_VERSION") -> "Smeta shu orada o‘zgargan — jadvalni yangilab qayta urinib ko‘ring."
        has("RESURS_INVALID") -> "Har resursda nom, birlik va norma (> 0) yoki aniq hajm (0 dan farqli) bo‘lishi shart."
        has("ISH_HAJM_REQUIRED") -> "Ish hajmi kiritilmagan yoki 0 (minus ham mumkin)."
        has("TREE_STRUCTURE_INVALID|REPLACEMENT_SCOPE_INVALID") -> "Tanlangan bo‘lim yoki qator bu amal uchun mos emas."
        has("WRITE_ROLE_REQUIRED") -> "Bu amal uchun PTO, rahbar yoki admin roli kerak."
        else -> error?.takeIf { it.isNotEmpty() } ?: xabar?.takeIf { it.isNotEmpty() } ?: code?.takeIf { it.isNotEmpty() } ?: "Saqlab bo‘lmadi."
    }
}

/** The form -> server resources: norma > 0 -> volume comes from the norm (hajm null), else the exact volume. Resource-replacement ignores norma when the parent work volume is unknown. */
fun abcSaqlaResurslari(hisobRes: List<AbcResurs>): List<AbcSaqlaResurs> = hisobRes.map { r ->
    val n = abcSon(r.norma)
    AbcSaqlaResurs(r.kat, r.kod.trim().ifEmpty { null }, r.nom.trim(), r.birlik.trim(), if (n != null && n > 0) n else null, if (n != null && n > 0) null else abcSon(r.hajm), abcSon(r.narx), r.manba)
}

// ---------- source name shown to the user (site lib/manba-nomi.ts manbaKorinishi) ----------

private const val BREND = "QURAI"
private val TASHQI = Regex("(?<![\\p{L}\\p{N}])(?:(?:ABC|АВС|АБС)(?:\\s*(?:Base|База))?(?:\\s*\\d+)?|TNQ|ТНҚ|ТНК|TN|Construct|NormRepository|PTO[-\\s]?UZ|ПТО[-\\s]?УЗ|Fo2\\s*Studio|pomoshnik\\s*PTO|00-(?:ppr|amen))(?![\\p{L}\\p{N}])", RegexOption.IGNORE_CASE)
private val SHNQ = Regex("(?:ШНҚ|ШНК|ShNQ|SHNQ|КМК|KMK)\\s*([0-9]+(?:\\.[0-9]+)+(?:-[0-9]+)?)", RegexOption.IGNORE_CASE)
private val YIL = Regex("\\b(20\\d{2})\\b")

/** A catalogue / document source name as the user may see it (an external program name never appears: only our own brand). */
fun manbaKorinishi(raw: String?): String {
    val s = (raw ?: "").trim()
    if (s.isEmpty()) return "$BREND katalogi"
    val shnq = SHNQ.find(s)
    if (!TASHQI.containsMatchIn(s)) return s
    if (shnq != null) return "$BREND · ШНҚ ${shnq.groupValues[1]} asosida"
    return "$BREND katalogi ${YIL.find(s)?.groupValues?.get(1) ?: "2026"}"
}