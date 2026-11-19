package uz.anncorp.smeta.core.fakt

import kotlin.math.abs
import kotlin.math.floor

/*
 * Port of frontend/src/lib/fakt-f2-tenglash.ts + the pure part of api/t2-f2-narx.ts: "Fakt = F2". Where the approved F2 volume exceeds the fakt, the DIFFERENCE (f2 - fakt)
 * is written to the fakt document as a delta - at the F2's own unit price (certified_unit_price ?? narx; several F2 -> volume-weighted), with its source
 * (narx_manba='f2_sertifikat', narx_manba_id, narx_izoh). An unknown F2 price is never invented. The approved F2 is a sealed document: each row is copied 1:1 with its sign
 * (minus rows too); rows where the fakt already exceeds F2 are not changed (signal only). The estimate rows (t2_qator) NEVER change; only the fakt table is written.
 */

private fun son(v: Double?): Double? = if (v == null || !v.isFinite()) null else v
private fun yaxlit6(x: Double): Double = floor(x * 1e6 + 0.5) / 1e6

/** Approved F2 act row (t2_akt_qator). */
class F2AktQator(
    val id: Long?, val aktId: Long, val qatorId: Long, val hajm: Double?, val narx: Double?, val summa: Double?,
    val certifiedQuantity: Double?, val certifiedUnitPrice: Double?, val certifiedAmount: Double?,
)

/** Row -> F2 price: null price = unknown in F2; `aralash` = partially priced (price = sum of priced amounts / sum of ALL volume). */
class F2Narx(val narx: Double?, val aktlar: List<Long>, val aralash: Boolean, val soni: Int = 0, val narxsizSoni: Int = 0, val qatorIdlar: List<Long> = emptyList())

fun f2NarxYigish(qatorlar: List<F2AktQator>): Map<Long, F2Narx> {
    val guruh = LinkedHashMap<Long, MutableList<F2AktQator>>()
    for (x in qatorlar) guruh.getOrPut(x.qatorId) { ArrayList() }.add(x)
    val out = LinkedHashMap<Long, F2Narx>()
    for ((id, xs) in guruh) {
        val aktlar = xs.map { it.aktId }.distinct().sorted()
        val qatorIdlar = xs.mapNotNull { it.id }.filter { it > 0 }.sorted()
        val birlik = xs.map { son(it.certifiedUnitPrice) ?: son(it.narx) }
        val narxli = birlik.filterNotNull()
        val soni = xs.size; val narxsizSoni = soni - narxli.size
        if (narxli.isEmpty()) { out[id] = F2Narx(null, aktlar, false, soni, narxsizSoni, qatorIdlar); continue }
        var qty = 0.0; var amt = 0.0
        xs.forEachIndexed { i, x ->
            val h = son(x.certifiedQuantity) ?: son(x.hajm) ?: 0.0; qty += h
            val b = birlik[i]; if (b != null) amt += son(x.certifiedAmount) ?: son(x.summa) ?: (h * b)
        }
        val aralash = narxsizSoni > 0
        val bitta = narxli.toSet().size == 1
        val narx: Double? = if (!aralash && bitta && abs(qty * narxli[0] - amt) < 0.005) narxli[0]
        else if (abs(qty) > 1e-12) amt / qty else if (!aralash && bitta) narxli[0] else null
        out[id] = F2Narx(narx, aktlar, aralash && narx != null, soni, narxsizSoni, qatorIdlar)
    }
    return out
}

class EskiF2Akt(val id: Long, val raqam: String?, val sana: String?, val jami: Double?)
class FaktAkt(val id: Long, val raqam: String?, val sana: String?, val izoh: String?, val hujjatJami: Double?)
class FaktAktQator(val aktId: Long, val qatorId: Long, val hajm: Double?, val narxManba: String?, val manbaAktQatorId: Long?)

class FaktManba(
    val directFakt: Map<Long, Double>, val qolda: Map<Long, Double>, val f2Delta: Map<Long, Double>, val nusxalangan: Set<Long>, val eskiAktlar: List<EskiF2Akt>,
)

/** Own fakt (total / by hand / unsourced f2_sertifikat), the F2 rows already copied, and the old "Fakt = F2" documents (no row is a 1:1 copy). */
fun faktManbaYigish(aktlar: List<FaktAkt>, qatorlar: List<FaktAktQator>): FaktManba {
    val directFakt = LinkedHashMap<Long, Double>(); val qolda = LinkedHashMap<Long, Double>(); val f2Delta = LinkedHashMap<Long, Double>()
    val nusxalangan = LinkedHashSet<Long>(); val nusxali = HashSet<Long>()
    fun qosh(m: MutableMap<Long, Double>, k: Long, v: Double) { m[k] = yaxlit6((m[k] ?: 0.0) + v) }
    for (q in qatorlar) {
        val h = q.hajm ?: 0.0
        if (!h.isFinite()) continue
        qosh(directFakt, q.qatorId, h)
        if (q.manbaAktQatorId != null) { nusxalangan.add(q.manbaAktQatorId); nusxali.add(q.aktId) }
        else if (q.narxManba == "f2_sertifikat") qosh(f2Delta, q.qatorId, h) else qosh(qolda, q.qatorId, h)
    }
    val eski = aktlar.filter { Regex("Fakt = F2").containsMatchIn(it.izoh ?: "") && it.id !in nusxali }.map { EskiF2Akt(it.id, it.raqam, it.sana, it.hujjatJami) }
    return FaktManba(directFakt, qolda, f2Delta, nusxalangan, eski)
}

class TenglashKontekst(
    val f2Narx: Map<Long, F2Narx>? = null, val smetaNarx: ((Long) -> Double?)? = null, val directFakt: Map<Long, Double>? = null,
    val f2Satrlar: Map<Long, List<F2AktQator>>? = null, val nusxalangan: Set<Long>? = null, val qolda: Map<Long, Double>? = null, val f2Delta: Map<Long, Double>? = null,
)

class NusxaSatr(val manba: Long, val akt: Long, val hajm: Double, val summa: Double?)
class QismanNarx(val soni: Int, val narxsizSoni: Int)
class RsHosila(var soni: Int, var summa: Double?)

class TenglashQator(
    val id: Long, val tur: String, val nom: String, val birlik: String?, val fakt: Double, val f2: Double, val delta: Double, val narx: Double?, val summa: Double?,
    val avtomatik: Int, val bolim: String?, val kesim: Kesim, val narxManba: String, val aktlar: List<Long>? = null, val f2Qatorlar: List<Long>? = null,
    val narxYoq: Boolean = false, val rsHosila: RsHosila? = null, val nusxa: List<NusxaSatr>? = null, val qisman: QismanNarx? = null,
)

/** One fakt_yoz_v2 line: with the F2 price -> narx + source; no F2 price (bl/rs) -> narx_yoq; 1:1 copy -> manba_akt_qator_id. */
class FaktF2PaketQator(
    val qatorId: Long, val hajm: Double, val manbaAktQatorId: Long? = null, val narx: Double? = null, val narxYoq: Boolean = false,
    val narxManba: String? = null, val narxManbaId: Long? = null, val narxIzoh: String? = null,
)

class TenglashReja(
    val qatorlar: List<TenglashQator>, val paket: List<FaktF2PaketQator>, val jamiSumma: Double, val narxsiz: Int,
    val manfiyReja: Int, val f2Yoq: Int, val faktOrtiq: List<Pair<Long, Double?>>,
)

fun paketQator(q: TenglashQator): FaktF2PaketQator {
    val f2Narxli = q.narxManba == "f2" && q.narx != null
    if (!f2Narxli && !q.narxYoq) return FaktF2PaketQator(q.id, q.delta)
    val aktlar = q.aktlar.orEmpty()
    val nomer = aktlar.joinToString(", ") { "№$it" }
    val iz = if (!q.f2Qatorlar.isNullOrEmpty()) " [qator: ${q.f2Qatorlar.joinToString(", ")}]" else ""
    val asos = when {
        q.narxYoq -> "Fakt = F2: F2 $nomer da narx yo'q"
        q.qisman != null -> "Fakt = F2: F2 $nomer — qisman narxli F2: ${q.qisman.soni} qatordan ${q.qisman.narxsizSoni} tasida narx yo'q"
        aktlar.size > 1 -> "Fakt = F2: F2 $nomer — hajm bo'yicha o'rtacha narx"
        else -> "Fakt = F2: F2 $nomer narxi"
    }
    return FaktF2PaketQator(q.id, q.delta, null, if (f2Narxli) q.narx else null, !f2Narxli, "f2_sertifikat", if (aktlar.size == 1) aktlar[0] else null, (asos + iz).take(480))
}

fun paketQatorlar(q: TenglashQator): List<FaktF2PaketQator> {
    val n = q.nusxa
    if (n.isNullOrEmpty()) return listOf(paketQator(q))
    return n.map { FaktF2PaketQator(q.id, it.hajm, it.manba, null, false, "f2_sertifikat", it.akt, "Fakt = F2: F2 №${it.akt} qatori #${it.manba}") }
}

/** F2 side difference with its sign: a positive F2 raises, a negative F2 (minus norm) is written negative; fakt above F2 is left alone (null). */
private fun farqOl(f2: Double, fakt: Double): Double? {
    val d = yaxlit6(f2 - fakt)
    return if ((d > 1e-9 && f2 > 1e-9) || (d < -1e-9 && f2 < -1e-9)) d else null
}

private class SummaNatija(
    val narx: Double?, val summa: Double?, val kesim: Kesim, val narxManba: String, val aktlar: List<Long>?, val f2Qatorlar: List<Long>?, val narxYoq: Boolean,
    val rsHosila: RsHosila?, val qisman: QismanNarx?,
)

/** The row's sum (no markup, no VAT), exactly the rule the server writes. */
private fun summaHisob(q: JurnalQator, ish: JurnalIsh?, delta: Double, holat: Map<Long, JurnalHolat>, ktx: TenglashKontekst, ozgacha: (JurnalQator) -> Boolean): SummaNatija {
    val kesim = bosKesim()
    fun smetaNarx(id: Long): Double? = ktx.smetaNarx?.invoke(id) ?: son(holat[id]?.smetaNarx)
    val f2 = ktx.f2Narx?.get(q.id)
    val f2n = f2?.narx
    val narxYoq = f2 != null && f2n == null && (q.tur == "bl" || q.tur == "rs")
    val narx = if (narxYoq) null else f2n ?: smetaNarx(q.id)
    val oz = narx?.let { yaxlit6(delta * it) }
    val f2Manbali = f2n != null || narxYoq
    fun norma(r: JurnalQator): Double? = r.norma ?: if (r.smeta != null && ish?.q?.smeta != null && ish.q.smeta != 0.0) r.smeta / ish.q.smeta else null
    val ergash = if (ish != null && !f2Manbali) ish.avtomatik.filter { it.otaId == ish.id && norma(it) != null && !ozgacha(it) } else emptyList()
    var summa: Double? = oz
    var rsHosila: RsHosila? = null
    if (ergash.isNotEmpty()) {
        if (oz != null) kesimgaQosh(kesim, q.kat, oz)
        rsHosila = RsHosila(0, null)
        for (r in ergash) {
            val rn = smetaNarx(r.id)
            val v = rn?.let { yaxlit6(delta * norma(r)!! * it) }
            kesimgaQosh(kesim, r.kat, v)
            rsHosila.soni += 1
            if (v != null) { summa = (summa ?: 0.0) + v; rsHosila.summa = yaxlit6((rsHosila.summa ?: 0.0) + v) }
        }
    } else if (!narxYoq) kesimgaQosh(kesim, q.kat, oz)
    val narxManba = if (f2n != null) "f2" else if (narxYoq) "narxsiz" else if (summa != null) "smeta" else "narxsiz"
    return SummaNatija(narx, summa?.let { yaxlit6(it) }, kesim, narxManba, f2?.aktlar, f2?.qatorIdlar?.takeIf { it.isNotEmpty() }, narxYoq, rsHosila,
        if (f2n != null && f2?.aralash == true) QismanNarx(f2.soni, f2.narxsizSoni) else null)
}

private fun rejaYasa(qatorlar: List<TenglashQator>, manfiyReja: Int, f2Yoq: Int, faktOrtiq: List<Pair<Long, Double?>>) = TenglashReja(
    qatorlar, qatorlar.flatMap(::paketQatorlar), yigindi2(qatorlar.map { it.summa }), qatorlar.count { it.summa == null }, manfiyReja, f2Yoq, faktOrtiq,
)

fun faktF2Reja(ishlar: List<JurnalIsh>, holat: Map<Long, JurnalHolat>, bolim: String? = null, ktx: TenglashKontekst = TenglashKontekst()): TenglashReja {
    val qatorlar = ArrayList<TenglashQator>(); var manfiyReja = 0; var f2Yoq = 0
    val faktOrtiq = ArrayList<Pair<Long, Double?>>(); val korildi = HashSet<Long>()
    fun smetaHajm(q: JurnalQator) = son(holat[q.id]?.smetaHajm) ?: q.smeta ?: 0.0
    fun faktOl(q: JurnalQator) = if (q.tur == "rs") ktx.directFakt?.get(q.id) ?: 0.0 else son(holat[q.id]?.faktHajm) ?: 0.0
    fun rsOzgacha(r: JurnalQator): Boolean {
        val d = ktx.directFakt ?: return false
        if (abs(d[r.id] ?: 0.0) > 1e-9) return true
        if (!ktx.f2Satrlar?.get(r.id).isNullOrEmpty()) return true
        return farqOl(son(holat[r.id]?.f2Hajm) ?: 0.0, 0.0) != null
    }
    for (ish in ishlar) {
        val rsLar = if (ktx.directFakt != null) ish.avtomatik else emptyList()
        for (q in listOf(ish.q) + ish.resurslar + rsLar) {
            if (!korildi.add(q.id)) continue
            val h = holat[q.id]
            val f2 = son(h?.f2Hajm) ?: 0.0
            val fakt = faktOl(q)
            val manfiy = smetaHajm(q) < 0
            val oz0 = q === ish.q
            if (ktx.f2Satrlar != null && abs(ktx.qolda?.get(q.id) ?: 0.0) <= 1e-9 && abs(ktx.f2Delta?.get(q.id) ?: 0.0) <= 1e-9) {
                val nusxa = ArrayList<NusxaSatr>()
                for (x in ktx.f2Satrlar[q.id].orEmpty()) {
                    val id = x.id ?: continue
                    if (id <= 0 || ktx.nusxalangan?.contains(id) == true) continue
                    val hj = son(x.certifiedQuantity) ?: son(x.hajm) ?: 0.0; val sm = son(x.certifiedAmount) ?: son(x.summa)
                    if (abs(hj) <= 1e-12 && (sm == null || sm == 0.0)) continue
                    nusxa.add(NusxaSatr(id, x.aktId, hj, sm))
                }
                if (nusxa.isEmpty()) { if (manfiy) manfiyReja++; if (abs(f2) <= 1e-9) f2Yoq++; continue }
                val malum = nusxa.filter { it.summa != null }
                val summa = if (malum.isNotEmpty()) yaxlit6(malum.sumOf { it.summa!! }) else null
                val kesim = bosKesim(); kesimgaQosh(kesim, q.kat, summa)
                val f2n = ktx.f2Narx?.get(q.id)
                qatorlar.add(TenglashQator(q.id, q.tur, q.nom, q.birlik, fakt, f2, yaxlit6(nusxa.sumOf { it.hajm }), f2n?.narx, summa, if (oz0) ish.avtomatik.size else 0, bolim, kesim,
                    if (summa != null) "f2" else "narxsiz", nusxa.map { it.akt }.distinct().sorted(), nusxa = nusxa, qisman = if (f2n?.aralash == true) QismanNarx(f2n.soni, f2n.narxsizSoni) else null))
                continue
            }
            val delta = farqOl(f2, fakt)
            if (delta == null) {
                if (manfiy) manfiyReja++
                if (abs(f2 - fakt) > 1e-9 && abs(fakt) > 1e-9) { val fs = son(h?.faktSumma); val f2s = son(h?.f2Summa); faktOrtiq.add(q.id to (fs?.let { yaxlit6(it - (f2s ?: 0.0)) })) }
                if (abs(f2) <= 1e-9) f2Yoq++
                continue
            }
            val s = summaHisob(q, if (oz0 && ish.q.tur == "bl") ish else null, delta, holat, ktx, ::rsOzgacha)
            qatorlar.add(TenglashQator(q.id, q.tur, q.nom, q.birlik, fakt, f2, delta, s.narx, s.summa, if (oz0) ish.avtomatik.size else 0, bolim, s.kesim, s.narxManba, s.aktlar, s.f2Qatorlar, s.narxYoq, s.rsHosila, null, s.qisman))
        }
    }
    return rejaYasa(qatorlar, manfiyReja, f2Yoq, faktOrtiq)
}

/** Whole object: each section's OWN works (each work once) + works without a section; rows carry the section name. */
fun obyektF2Reja(guruhlar: List<Pair<String, List<JurnalIsh>>>, holat: Map<Long, JurnalHolat>, ktx: TenglashKontekst = TenglashKontekst()): TenglashReja {
    val qatorlar = ArrayList<TenglashQator>(); var manfiy = 0; var f2Yoq = 0; val bor = HashSet<Long>()
    val faktOrtiq = ArrayList<Pair<Long, Double?>>(); val bor2 = HashSet<Long>()
    for ((nom, ishlar) in guruhlar) {
        val r = faktF2Reja(ishlar, holat, nom, ktx)
        for (q in r.qatorlar) if (bor.add(q.id)) qatorlar.add(q)
        manfiy += r.manfiyReja; f2Yoq += r.f2Yoq
        for (x in r.faktOrtiq) if (bor2.add(x.first)) faktOrtiq.add(x)
    }
    return rejaYasa(qatorlar, manfiy, f2Yoq, faktOrtiq)
}

class TenglashBolimJami(val nom: String, var soni: Int = 0, var ustamasiz: Double? = null, val kesim: Kesim = bosKesim(), var narxsiz: Int = 0)
class TenglashJami(
    val paket: List<FaktF2PaketQator>, val ustamasiz: Double?, val kesim: Kesim, val narxsiz: Int, val f2Narxli: Int, val smetaNarxli: Int, val rsHosila: RsHosila, val qisman: Int,
    val rsIstisno: RsHosila, val nusxaSoni: Int, val manfiySoni: Int, val faktOrtiqSoni: Int, val faktOrtiqSumma: Double?, val bolimlar: List<TenglashBolimJami>,
)

private fun kesimQosh(a: Kesim, b: Kesim?) {
    if (b == null) return
    for ((k, v) in b.summalar) a.summalar[k] = (a.summalar[k] ?: 0.0) + v
    a.nomalum += b.nomalum; a.nomalumSoni += b.nomalumSoni; a.summasizSoni += b.summasizSoni
}

/** The package and totals after the exclusions (row ids or section names). */
fun tenglashJami(reja: TenglashReja, chiqQator: Set<Long>, chiqBolim: Set<String>): TenglashJami {
    val paket = ArrayList<FaktF2PaketQator>(); val kesim = bosKesim(); var ustamasiz: Double? = null; var narxsiz = 0; var f2Narxli = 0; var smetaNarxli = 0
    val rsHosila = RsHosila(0, null); var qisman = 0; var nusxaSoni = 0; val rsIstisno = RsHosila(0, null)
    val bm = LinkedHashMap<String, TenglashBolimJami>()
    for (q in reja.qatorlar) {
        val nom = q.bolim ?: ""
        val b = bm.getOrPut(nom) { TenglashBolimJami(nom) }
        if (q.id in chiqQator || nom in chiqBolim) {
            if (q.tur == "rs") { rsIstisno.soni++; if (q.summa != null) rsIstisno.summa = yaxlit6((rsIstisno.summa ?: 0.0) + q.summa) }
            continue
        }
        if (q.qisman != null && q.narxManba == "f2") qisman++
        paket.addAll(paketQatorlar(q))
        b.soni++
        if (q.summa == null) { narxsiz++; b.narxsiz++ } else { ustamasiz = (ustamasiz ?: 0.0) + q.summa; b.ustamasiz = (b.ustamasiz ?: 0.0) + q.summa }
        if (q.nusxa != null) nusxaSoni += q.nusxa.size
        if (q.narxManba == "f2" && (q.narx != null || q.nusxa != null)) f2Narxli++ else if (q.summa != null) smetaNarxli++
        if (q.rsHosila != null) { rsHosila.soni += q.rsHosila.soni; if (q.rsHosila.summa != null) rsHosila.summa = yaxlit6((rsHosila.summa ?: 0.0) + q.rsHosila.summa!!) }
        kesimQosh(kesim, q.kesim); kesimQosh(b.kesim, q.kesim)
    }
    for (b in bm.values) b.ustamasiz = b.ustamasiz?.let { yaxlit6(it) }
    val ortiq = reja.faktOrtiq.mapNotNull { it.second }
    return TenglashJami(paket, ustamasiz?.let { yaxlit6(it) }, kesim, narxsiz, f2Narxli, smetaNarxli, rsHosila, qisman, rsIstisno, nusxaSoni, paket.count { it.hajm < 0 },
        reja.faktOrtiq.size, if (ortiq.isEmpty()) null else ortiq.fold(0.0) { a, v -> yaxlit6(a + v) }, bm.values.toList())
}
