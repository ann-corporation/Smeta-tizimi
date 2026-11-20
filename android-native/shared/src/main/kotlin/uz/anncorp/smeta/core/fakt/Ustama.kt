package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Markup ("ustamali") context of an object, exactly the site's useUstamaliSumma + qiymatUchligi (frontend/src/umumiy/ui/useUstamaliSumma.ts, lib/ustamali-summa.ts):
 * the object's markup coefficients + the round-svod summary (RPC obyekt_nakrutka_v1) and the company's podval list (t2_nakrutka_podval_royxat; the object's own podval,
 * else the contract's, else the company's, else null = the standard cascade from the coefficients). The money is NEVER recomputed on the client by a new formula:
 * the cut -> `hisob` (ported cascade). A failed / partial read makes the markup UNKNOWN (null), never a guessed number.
 */

class UstamaMalumot(val koef: Map<String, Double?>, val svod: SvodYaxlit?, val podval: Podval?, val podvalXato: Boolean = false)

fun nakrutkaSoro(obyektId: Long, shartnomaId: Long? = null) = buildJsonObject { put("soro", "obyekt_nakrutka_v1"); put("obyekt_id", obyektId); if (shartnomaId != null) put("shartnoma_id", shartnomaId) }
fun podvalRoyxatSoro(kompaniyaId: Long) = buildJsonObject { put("jadval", "t2_nakrutka_podval_royxat"); put("filtr", "kompaniya_id=eq.$kompaniyaId"); put("tartib", "yangilandi.desc"); put("limit", 500) }

private fun JsonElement?.d(): Double? = num()?.takeIf { it.isFinite() }

/** `{ok, natija:{ok:true, koeffitsientlar, svod_yaxlit}}` -> coefficients + svod; anything else -> null (the markup read failed). */
fun parseNakrutka(body: JsonElement?): Pair<Map<String, Double?>, SvodYaxlit?>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val n = o["natija"].obj() ?: return null
    if ((n["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val kf = n["koeffitsientlar"].obj() ?: return null
    val koef = kf.entries.associate { (k, v) -> k to v.d() }
    val sv = n["svod_yaxlit"].obj()?.let { s ->
        val bolimlar = s["bolimlar"].arr()?.mapNotNull { e ->
            val b = e.obj() ?: return@mapNotNull null
            SvodYaxlitBolim(b["qator_id"].num()?.toLong() ?: return@mapNotNull null, b["nom"].str(), b["svod_summa"].d(), b["qqs_stavka"].d(), b["qqssiz"].d() ?: 0.0, b["barglar"].d() ?: 0.0)
        }.orEmpty()
        SvodYaxlit(s["qqssiz"].d() ?: 0.0, s["barglar"].d() ?: 0.0, s["summasiz"].d() ?: 0.0, bolimlar)
    }
    return koef to sv
}

private fun parsePodvalQator(e: JsonElement?): PodvalQator? {
    val q = e.obj() ?: return null
    val tur = when (q["tur"].str()) { "foiz" -> PodvalTur.Foiz; "summa" -> PodvalTur.Summa; "jami" -> PodvalTur.Jami; else -> return null }
    val baza = q["baza"].arr()?.map { h ->
        val x = h.obj() ?: return null
        val k = x["k"].d() ?: 1.0
        val kat = x["kat"].str()
        if (kat != null) KatHad(katAniqla(kat) ?: return null, k) else QatorHad(x["qator"].str() ?: return null, k)
    }
    return PodvalQator(q["kod"].str() ?: return null, q["nom"].str().orEmpty(), tur, q["foiz"].d(), baza, q["summa"].d(), q["koefKod"].str(), q["manba"].str(), q["amal"].str(), q["merosIzoh"].str())
}

/** The list answer -> the podval by scope (object, else contract, else company-wide) or null (standard); a partial list / unreadable podval -> `xato`. */
class PodvalTanlov(val podval: Podval?, val xato: Boolean)

fun parsePodvalTanlov(body: JsonElement?, obyektId: Long, shartnomaId: Long? = null): PodvalTanlov {
    val o = body.obj() ?: return PodvalTanlov(null, true)
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true || (o["toliq"] as? JsonPrimitive)?.booleanOrNull == false) return PodvalTanlov(null, true)
    val list = o["qatorlar"].arr()?.mapNotNull { it.obj() } ?: return PodvalTanlov(null, true)
    fun id(r: kotlinx.serialization.json.JsonObject, k: String) = r[k].num()?.toLong()
    val tanlangan = list.firstOrNull { id(it, "obyekt_id") == obyektId }
        ?: shartnomaId?.let { sid -> list.firstOrNull { id(it, "shartnoma_id") == sid && id(it, "obyekt_id") == null } }
        ?: list.firstOrNull { id(it, "obyekt_id") == null && id(it, "shartnoma_id") == null }
        ?: return PodvalTanlov(null, false)
    val qs = tanlangan["qatorlar"].arr()?.map { parsePodvalQator(it) ?: return PodvalTanlov(null, true) } ?: return PodvalTanlov(null, true)
    return PodvalTanlov(Podval(qs, tanlangan["nom"].str()), false)
}

/** Reads the markup context (two BFF reads). Null = the coefficients could not be read (the markup stays unknown). */
suspend fun ustamaOqi(api: BffApi, kompaniyaId: Long, obyektId: Long, shartnomaId: Long? = null): UstamaMalumot? {
    val nk = parseNakrutka(api.bff("/api/sb", "POST", nakrutkaSoro(obyektId, shartnomaId)).body) ?: return null
    val pt = parsePodvalTanlov(api.bff("/api/sb", "POST", podvalRoyxatSoro(kompaniyaId)).body, obyektId, shartnomaId)
    return UstamaMalumot(nk.first, nk.second, pt.podval, pt.xato)
}

/** The value TRIPLE of a cut (site `qiymatUchligi`): with VAT (main) / markup total without VAT / direct. */
fun qiymatUchligi(h: HisobNatija?, ustamasiz: Double?): QiymatUchlik {
    val asos = if (ustamasiz != null && ustamasiz.isFinite()) ustamasiz else null
    if (asos == null) return QiymatUchlik(null, null, null, false, 0.0, "SUMMA_YOQ")
    if (h == null) return QiymatUchlik(null, null, asos, false, 0.0, "HISOBLANMADI")
    if (h.sabab != null) return QiymatUchlik(null, null, asos, false, 0.0, h.sabab)
    if (h.ustamali == null) return QiymatUchlik(null, null, asos, false, 0.0, "HISOBLANMADI")
    val nomalumBor = h.nomalumSoni > 0 || h.nomalumSumma != 0.0
    // `ustamasiz` of the core includes the unknown part; the site compares the KNOWN part with 0.
    if (nomalumBor && kotlin.math.abs(h.ustamasiz - h.nomalumSumma) < 0.005) return QiymatUchlik(null, null, asos, false, h.nomalumSumma, "KAT_NOMALUM")
    if (!nomalumBor) return QiymatUchlik(h.qqsBilan, h.ustamali, asos, false, 0.0, if (h.qqsBilan == null) "HISOBLANMADI" else null)
    // Unknown-category part: the core result (ITOGO-4 with the direct part added, VAT once).
    val y = h.kaskad
    val ustamali = y?.itogo4 ?: yaxlit2(h.ustamali + h.nomalumSumma)
    val qqs = y?.qqsBilan
    return QiymatUchlik(qqs, ustamali, asos, true, h.nomalumSumma, if (qqs == null) "QQS_STAVKA_YOQ" else null)
}

/** A cut -> triple through the object's markup context (null context / unreadable podval -> markup unknown, direct cost stays). */
fun UstamaMalumot?.uchlik(kesim: Kesim, ustamasiz: Double?): QiymatUchlik {
    if (this == null) return qiymatUchligi(null, ustamasiz)
    if (podvalXato) return QiymatUchlik(null, null, ustamasiz?.takeIf { it.isFinite() }, false, 0.0, if (ustamasiz == null || !ustamasiz.isFinite()) "SUMMA_YOQ" else "PODVAL_TOLIQ_EMAS")
    return qiymatUchligi(hisob(kesim, podval, koef), ustamasiz)
}

/** A journal row's fakt cut + total (site `taxminKesim`): a work has no price of its own - its resources' sum; a resource without a smeta price falls to the F2 unit price. */
class QatorFaktKesimi(val fakt: Kesim, val faktSumma: Double)

fun qatorFaktKesimi(q: JurnalQator, bolalar: List<JurnalQator>, holat: Map<Long, JurnalHolat>, rows: Map<Long, T2Qator>, chiqarilgan: (JurnalQator) -> Boolean = { false }): QatorFaktKesimi? {
    fun sm(x: JurnalQator): Double? = holat[x.id]?.smetaSumma?.takeIf { it.isFinite() }
    val qismlar = if (q.tur == "bl") bolalar else listOf(q)
    val asos = yigindi2(qismlar.map(::sm))
    if (!(asos > 0) && q.tur != "bl") {
        val h = holat[q.id]
        val f = faktSummaF2Narxda(q.fakt, h?.f2Hajm, h?.f2Summa, h?.faktSumma, h?.f2SummaYoq).summa ?: return null
        val k = bosKesim(); kesimgaQosh(k, rows[q.id]?.kat, f)
        return QatorFaktKesimi(k, f)
    }
    val ulush = q.ulush
    if (!(asos > 0) || ulush == null) return null
    val fakt = bosKesim(); val qism = ArrayList<Double?>()
    for (x in qismlar) {
        val s = sm(x)
        if (q.tur == "bl" && chiqarilgan(x)) continue
        val f = if (s == null) null else yaxlit2(s * ulush)
        kesimgaQosh(fakt, rows[x.id]?.kat, f); qism.add(f)
    }
    return QatorFaktKesimi(fakt, yigindi2(qism))
}