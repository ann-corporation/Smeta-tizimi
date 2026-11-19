package uz.anncorp.smeta.core.fakt

/*
 * Port of frontend/src/lib/hisob-yadro/kaskad.ts (cascade + result) and the screen layer of lib/ustamali-summa.ts (value triple).
 * Unknown kategoriya sums go to ITOGO-4 WITHOUT markup, VAT after it (server `_t2_summa_paket_hisob_v1`); a round (svod) sum goes AFTER VAT, WITH VAT, exact.
 */

typealias KatSummalar = Map<Kat, Double>

/** Full category sums (a missing category is 0 so'm - a sum, not a percent). */
fun katSummalari(k: Kesim): KatSummalar = Kat.entries.associateWith { k.summalar[it] ?: 0.0 }

class UstamaQadam(val kod: String, val nom: String, val tur: PodvalTur, val foiz: Double?, val summa: Double?)

/** Entry stage of a round (lump-sum) row. */
sealed interface YaxlitKirish {
    /** Default: the sum is WITH VAT, added after NDS; no markup, no extra VAT. */
    data class QqsdanKeyin(val qqsBilan: Double, val qqssiz: Double? = null) : YaxlitKirish
    /** Sum WITHOUT VAT, after the contractor's markups (into ITOGO-4) - takes VAT only. */
    data class QqssizUstamadanKeyin(val qqssiz: Double) : YaxlitKirish
    /** The source estimate's DIRECT cost by category: goes through the full cascade like ordinary works. */
    data class TogriXarajat(val kategoriyalar: Map<Kat, Double?>) : YaxlitKirish
}

class KaskadOpsiya(
    /** false = from the 2nd column of a multi-column document (fixed sums only in the main column). */
    val asosiy: Boolean = true,
    /** Unknown-category sum: into ITOGO-4 without markup, VAT after it. */
    val nomalumQism: Double? = null,
    val yaxlit: YaxlitKirish.QqsdanKeyin? = null,
    val yaxlitlar: List<YaxlitKirish>? = null,
)

class YaxlitN(val qqsBilan: Double, val qqssiz: Double?)
class Buyurtmachi(val kod: String, val nom: String, val summa: Double?, val amal: String)

class KaskadNatija(
    val pryamye: Double, val qiymat: Map<String, Double?>, val qadamlar: List<UstamaQadam>,
    /** HEADER: markup total WITHOUT VAT = works ITOGO-4 + the round svod's VAT-free part. null = unknown. */
    val itogo4: Double?, val kaskadItogo4: Double?,
    val qqs: Double?, val qqsBilan: Double?, val qqsFoiz: Double?, val vsego: Double?, val nomalumQism: Double?, val yaxlit: YaxlitN?,
    val buyurtmachi: List<Buyurtmachi>, val buyurtmachiJami: Double?, val nomalumQatorlar: List<String>,
    val xato: String? = null,
)

private fun raqam(x: Double?): Boolean = x != null && x.isFinite()

/** Category sums + podval -> cascade. Never throws: unknown stays null and goes to `nomalumQatorlar`. */
fun kaskad(s0: Map<Kat, Double>, podval: Podval, o: KaskadOpsiya = KaskadOpsiya()): KaskadNatija {
    val kirish = ArrayList<YaxlitKirish>()
    o.yaxlit?.let { if (raqam(it.qqsBilan)) kirish.add(it) }
    o.yaxlitlar?.let { kirish.addAll(it) }
    val s = HashMap<Kat, Double>(s0)
    var qqssizOldin = 0.0; var qqsBilanKeyin = 0.0; var qqssizKeyin: Double? = 0.0; var keyinBor = false; var togriNomalum = false
    val qqsFoiz = podvalNdsFoizi(podval)
    for (y in kirish) {
        when (y) {
            is YaxlitKirish.TogriXarajat -> for ((k, v) in y.kategoriyalar) { if (v == null || !v.isFinite()) togriNomalum = true else s[k] = (s[k] ?: 0.0) + v }
            is YaxlitKirish.QqssizUstamadanKeyin -> qqssizOldin += y.qqssiz
            is YaxlitKirish.QqsdanKeyin -> {
                keyinBor = true; qqsBilanKeyin += y.qqsBilan
                val siz = if (raqam(y.qqssiz)) y.qqssiz else if (qqsFoiz == null) null else yaxlit2(y.qqsBilan / (1 + qqsFoiz / 100))
                qqssizKeyin = if (qqssizKeyin == null || siz == null) null else qqssizKeyin!! + siz
            }
        }
    }
    val n = podvalBahola(podval, s, PodvalRejim(summaQosh = o.asosiy))
    val q = n.qiymat
    val kodlar = podval.qatorlar.map { it.kod }.toSet()
    val pryamye = q["pryamye"] ?: yaxlit2(katJami(s))
    fun qadamlar(qq: Map<String, Double?>) = podval.qatorlar.map { x -> UstamaQadam(x.kod, x.nom, x.tur, if (x.tur == PodvalTur.Foiz) x.foiz else null, qq[x.kod]) }
    val nomalumQatorlar = n.nomalum.toList()
    val ndsBor = "nds" in kodlar
    val kaskadItogo4 = if ("itogo4" in kodlar) q["itogo4"] else n.vsego
    val nom = if (raqam(o.nomalumQism) && o.nomalumQism != 0.0) yaxlit2(o.nomalumQism!!) else null
    val oldin = yaxlit2((nom ?: 0.0) + qqssizOldin)
    val yaxlitN = if (keyinBor) YaxlitN(yaxlit2(qqsBilanKeyin), qqssizKeyin?.let { yaxlit2(it) }) else null
    val vk = n.vsegoKod
    val vi = podval.qatorlar.indexOfFirst { it.kod == vk }
    if (togriNomalum) return KaskadNatija(pryamye, q, qadamlar(q), null, kaskadItogo4, null, null, qqsFoiz, null, nom, null, emptyList(), null, nomalumQatorlar + "togri_xarajat")
    if (vk.isEmpty()) return KaskadNatija(pryamye, q, qadamlar(q), null, kaskadItogo4, null, null, qqsFoiz, null, nom, null, emptyList(), null, nomalumQatorlar, "VSEGO_KODI_YOQ")
    fun buyurtmachi(qq: Map<String, Double?>, vsego: Double?): Pair<List<Buyurtmachi>, Double?> {
        val b = podval.qatorlar.drop(vi + 1).map { x -> Buyurtmachi(x.kod, x.nom, qq[x.kod], x.amal ?: "qoshiladi") }
        val jami = if (b.isEmpty() || vsego == null) null
        else if (b.any { it.amal != "korsatish" && it.summa == null }) null
        else yaxlit2(b.fold(vsego) { t, x -> t + (if (x.amal == "qoshiladi") x.summa!! else if (x.amal == "ayiriladi") -x.summa!! else 0.0) })
        return b to jami
    }
    if (oldin == 0.0 && yaxlitN == null) {
        val (b, bj) = buyurtmachi(q, n.vsego)
        return KaskadNatija(pryamye, q, qadamlar(q), kaskadItogo4, kaskadItogo4, if (ndsBor) q["nds"] else null, if (ndsBor) n.vsego else null, qqsFoiz, n.vsego, nom, null, b, bj, nomalumQatorlar)
    }
    fun rad(xato: String?, qosh: List<String> = emptyList()) = KaskadNatija(pryamye, q, qadamlar(q), null, kaskadItogo4, null, null, qqsFoiz, null, nom, yaxlitN, emptyList(), null, nomalumQatorlar + qosh, xato)
    // ITOGO-4 must exist and only NDS may lie between it and VSEGO - otherwise the added part is ambiguous: refused explicitly.
    if ("itogo4" !in kodlar) return rad(null, listOf("itogo4"))
    val i4i = podval.qatorlar.indexOfFirst { it.kod == "itogo4" }
    val orada = (if (vi <= i4i + 1) emptyList() else podval.qatorlar.subList(i4i + 1, vi)).filter { it.kod != "nds" }
    if (orada.isNotEmpty() || vi < i4i) return rad("SVOD_YAXLIT_ITOGO4_DAN_KEYIN_QATOR", orada.map { it.kod })
    val i4w = kaskadItogo4?.let { yaxlit2(it + oldin) }
    val ndsW = if (oldin == 0.0) (if (ndsBor) q["nds"] else null) else if (ndsBor) qqsSumma(i4w, qqsFoiz) else null
    val vsegoW: Double? = if (oldin == 0.0) n.vsego else if (i4w == null) null else if (ndsBor) (if (ndsW == null) null else yaxlit2(i4w + ndsW)) else i4w
    val vsego = if (vsegoW == null) null else if (yaxlitN != null) yaxlit2(vsegoW + yaxlitN.qqsBilan) else vsegoW
    // Second pass: the customer rows after VSEGO are computed from the final base (VSEGO with the round part).
    val alm = LinkedHashMap<String, Double?>(); alm["itogo4"] = i4w; if (ndsBor) alm["nds"] = ndsW; alm[vk] = vsego
    val q2 = podvalBahola(podval, s, PodvalRejim(summaQosh = o.asosiy, almashtir = alm)).qiymat
    val qiymat = LinkedHashMap<String, Double?>(q2)
    qiymat["kaskad_itogo4"] = kaskadItogo4; qiymat["nomalum_qism"] = nom; qiymat["yaxlit_oldin"] = if (qqssizOldin != 0.0) yaxlit2(qqssizOldin) else null; qiymat["yaxlit"] = yaxlitN?.qqsBilan
    val itogo4 = if (i4w == null) null else if (yaxlitN != null) (if (yaxlitN.qqssiz == null) null else yaxlit2(i4w + yaxlitN.qqssiz)) else i4w
    val qqs = if (!ndsBor || ndsW == null) null else if (yaxlitN != null) (if (yaxlitN.qqssiz == null) null else yaxlit2(ndsW + yaxlitN.qqsBilan - yaxlitN.qqssiz)) else ndsW
    val (b, bj) = buyurtmachi(qiymat, vsego)
    return KaskadNatija(pryamye, qiymat, qadamlar(qiymat), itogo4, kaskadItogo4, qqs, if (ndsBor) vsego else null, qqsFoiz, vsego, nom, yaxlitN, b, bj, nomalumQatorlar)
}

/** Category coefficients (to pay = direct cost x Kf), unrounded. Unknown percentage -> null. */
fun kategoriyaKf(podval: Podval): Map<Kat, Double?> = podvalKf(podval)

/** Kf TABLE for display: the 2-decimal view. Money uses the UNROUNDED Kf (rounding would err up to 0.5 % on large sums). */
fun kategoriyaKfJadval(podval: Podval): Map<Kat, Double?> = podvalKf(podval).mapValues { (_, v) -> v?.let { yaxlit2(it) } }

/** A row's "to pay" (with VAT): ordinary ROUND(sum x Kf[kat], 2); a round row and a row without a category: no markup, VAT only. Unknown Kf / VAT -> null. */
fun kOplate(summa: Double?, kat: Kat?, kf: Map<Kat, Double?>, yaxlitmi: Boolean = false, ndsFoiz: Double? = null): Double? {
    if (summa == null || !summa.isFinite()) return null
    if (yaxlitmi) return yaxlitKOplate(summa, ndsFoiz)
    if (kat == null) return yaxlitKOplate(summa, ndsFoiz)
    val k = kf[kat] ?: return null
    return yaxlit2(summa * k)
}

class HisobNatija(
    val qqsBilan: Double?, val qqs: Double?, val ustamali: Double?, val itogo4: Double?, val ustamasiz: Double, val ustama: List<UstamaQadam>, val qqsFoiz: Double?,
    val kategoriyalar: KatSummalar, val narxsizSoni: Int, val nomalumSoni: Int, val nomalumSumma: Double, val yaxlit: Double?, val taxminiy: Boolean,
    val kaskad: KaskadNatija?, val sabab: String?,
)

/** Cut -> full result. No podval -> the standard one from the coefficients (server order). */
fun hisob(k: Kesim, podval: Podval? = null, koef: Map<String, Double?>? = null): HisobNatija {
    val kategoriyalar = katSummalari(k)
    val yaxlit: Double? = if (k.yaxlit != null || k.yaxlitQator != null) (k.yaxlit?.qqssiz ?: 0.0) + (k.yaxlitQator ?: 0.0) else null
    val ustamasiz = yaxlit2(katJami(kategoriyalar) + k.nomalum + (k.yaxlit?.barglar ?: 0.0) + (k.yaxlitQator ?: 0.0))
    val taxminiy = k.nomalumSoni > 0 || k.nomalum != 0.0
    fun bosh(kaskad: KaskadNatija? = null, sabab: String? = null) = HisobNatija(null, null, null, null, ustamasiz, emptyList(), null, kategoriyalar, k.summasizSoni, k.nomalumSoni, yaxlit2(k.nomalum), yaxlit?.let { yaxlit2(it) }, taxminiy, kaskad, sabab)
    val p = podvalAniqla(podval, koef) ?: return bosh(sabab = "KOEF_YOQ")
    // Round svod (one model): sections WITH a svod amount -> `qqsdan_keyin` (after VAT, exact); sections without one and the row-level round -> raw content, WITHOUT VAT:
    // `qqssiz_ustamadan_keyin` (into ITOGO-4, one VAT) - the server `_t2_summa_paket_hisob_v1` / `t2_nakrutka_yaxlit_qosh_v2`.
    var yx: YaxlitKirish.QqsdanKeyin? = null
    var oldin: List<YaxlitKirish>? = null
    if (yaxlit != null) {
        val svQ = k.yaxlit?.svodQqsBilan ?: 0.0; val svS = k.yaxlit?.svodQqssiz ?: 0.0
        val qolgan = yaxlit - svS
        if (svQ != 0.0 || svS != 0.0) yx = YaxlitKirish.QqsdanKeyin(yaxlit2(svQ), yaxlit2(svS))
        if (kotlin.math.abs(qolgan) >= 0.005) oldin = listOf(YaxlitKirish.QqssizUstamadanKeyin(qolgan))
    }
    val r = kaskad(kategoriyalar, p, KaskadOpsiya(nomalumQism = k.nomalum, yaxlit = yx, yaxlitlar = oldin))
    val n = HisobNatija(r.qqsBilan, r.qqs, r.itogo4, r.itogo4, ustamasiz, r.qadamlar, r.qqsFoiz, kategoriyalar, k.summasizSoni, k.nomalumSoni, yaxlit2(k.nomalum), yaxlit?.let { yaxlit2(it) }, taxminiy, r, null)
    if (r.itogo4 == null) return HisobNatija(n.qqsBilan, n.qqs, n.ustamali, n.itogo4, n.ustamasiz, n.ustama, n.qqsFoiz, n.kategoriyalar, n.narxsizSoni, n.nomalumSoni, n.nomalumSumma, n.yaxlit, n.taxminiy, r, "PODVAL_TOLIQ_EMAS")
    if (r.qqsBilan == null) return HisobNatija(n.qqsBilan, n.qqs, n.ustamali, n.itogo4, n.ustamasiz, n.ustama, n.qqsFoiz, n.kategoriyalar, n.narxsizSoni, n.nomalumSoni, n.nomalumSumma, n.yaxlit, n.taxminiy, r, "QQS_STAVKA_YOQ")
    return n
}

// ---------- value triple (lib/ustamali-summa.ts) ----------

/** The total value TRIPLE: 1) with VAT (main); 2) markup total WITHOUT VAT; 3) direct (no markup). null = unknown (not 0). */
class QiymatUchlik(val qqsBilan: Double?, val ustamali: Double?, val ustamasiz: Double?, val taxminiy: Boolean = false, val nomalum: Double = 0.0, val sabab: String? = null)

/** Only the direct cost is known (no cut): with VAT and markup are "-" with the reason. */
fun ustamasizUchlik(ustamasiz: Double?, sabab: String = "KESIM_YOQ"): QiymatUchlik {
    val asos = if (ustamasiz != null && ustamasiz.isFinite()) ustamasiz else null
    return QiymatUchlik(null, null, asos, false, 0.0, if (asos == null) "SUMMA_YOQ" else sabab)
}

/** A ready server cascade result + the direct cost -> triple. No calculation. */
fun serverUchligi(itogo4: Double?, vsego: Double?, hasResult: Boolean, ustamasiz: Double?): QiymatUchlik {
    val asos = if (ustamasiz != null && ustamasiz.isFinite()) ustamasiz else null
    val qqs = if (vsego != null && vsego.isFinite()) vsego else null
    val us = if (itogo4 != null && itogo4.isFinite()) itogo4 else null
    return QiymatUchlik(qqs, us, asos, false, 0.0, if (qqs != null) null else if (asos == null && !hasResult) "SUMMA_YOQ" else "HISOBLANMADI")
}

/** Difference of two triples (plus - minus): each value only when both are known. */
fun uchlikAyir(a: QiymatUchlik, b: QiymatUchlik): QiymatUchlik {
    fun ay(x: Double?, y: Double?): Double? = if (x == null || y == null) null else yaxlit2(x - y)
    val qqsBilan = ay(a.qqsBilan, b.qqsBilan)
    return QiymatUchlik(qqsBilan, ay(a.ustamali, b.ustamali), ay(a.ustamasiz, b.ustamasiz), a.taxminiy || b.taxminiy, yaxlit2(a.nomalum - b.nomalum), if (qqsBilan != null) null else a.sabab ?: b.sabab ?: "HISOBLANMADI")
}

/** Portfolio (several objects) triple. Objects with no markup computed are valued at their direct cost - approximate. */
fun portfelUchligi(ustamali: Double?, ndsBilan: Double?, nomalumSoni: Int, hisoblanganUstamasiz: Double, ustamasiz: Double?): QiymatUchlik {
    val asos = if (ustamasiz != null && ustamasiz.isFinite()) ustamasiz else null
    if (ustamali == null) return QiymatUchlik(null, null, asos, false, 0.0, if (asos == null) "SUMMA_YOQ" else "HISOBLANMADI")
    val qisman = nomalumSoni > 0
    val qolgan = if (qisman && asos != null) maxOf(0.0, asos - hisoblanganUstamasiz) else 0.0
    val qqsBilan = if (ndsBilan == null) null else yaxlit2(ndsBilan + qolgan)
    return QiymatUchlik(qqsBilan, yaxlit2(ustamali + qolgan), asos, qisman, qolgan, if (qqsBilan == null) "HISOBLANMADI" else null)
}
