package uz.anncorp.smeta.core.fakt

import kotlin.math.abs

/*
 * Port of bolimSummalari / nakopitelniyMoslik / bolimMaxraji of frontend/src/lib/fakt-jurnal.ts: section and whole-object sums (smeta / F2 / fakt / remainder)
 * from the resource rows' t2_qator_holat. Money is never invented: a row whose sum is NULL is not 0 (counted in `summasizSoni`); all NULL -> the total is NULL.
 * Smeta = original estimate rows only (additional / replacement rows go to `qoshimcha`). Key 0 = the whole object.
 */

class SummaKesim(var ustamasiz: Double? = null, var kesim: Kesim = bosKesim())

class BolimSumma(
    val smeta: SummaKesim = SummaKesim(), val f2: SummaKesim = SummaKesim(), val fakt: SummaKesim = SummaKesim(), val qoldiq: SummaKesim = SummaKesim(),
    /** Additional / replacement works' smeta (leaves) - NOT in "smeta"; Nakopitelniy smeta = smeta + qoshimcha. */
    val qoshimcha: SummaKesim = SummaKesim(),
    /** Price rule: how many positions have the fakt sum valued at the approved F2 unit price (volume unchanged). */
    var f2Narxda: Int = 0,
)

private val BARG = setOf("rs", "mat", "ob")

private class Element(val id: Long, val kat: String?, val summa: Double?, val smeta: Double?, val f2: Double?)

fun bolimSummalari(rows: List<T2Qator>, states: List<JurnalHolat>, chiqarilgan: Set<Long>? = null, svod: SvodYaxlit? = null): Map<Long, BolimSumma> {
    val byId = rows.associateBy { it.id }
    val holat = states.associateBy { it.qatorId }
    val out = LinkedHashMap<Long, BolimSumma>()
    // Values are collected first; the cut and the total come from the CORE at the end (svodKorinishKesimi + yigindi2).
    val elementlar = java.util.IdentityHashMap<SummaKesim, MutableList<Element>>()
    val masshtabsiz = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<SummaKesim, Boolean>())
    val qoldiqlar = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<SummaKesim, Boolean>())
    val faktlar = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<SummaKesim, Boolean>())
    val yaxlitIds = yaxlitQatorIdlari(rows, svod)
    fun ol(id: Long): BolimSumma = out.getOrPut(id) { BolimSumma().also { masshtabsiz.add(it.f2); qoldiqlar.add(it.qoldiq); faktlar.add(it.fakt) } }
    fun qosh(s: SummaKesim, kat: String?, v: Double?, id: Long = 0, smeta: Double? = null, f2: Double? = null) { elementlar.getOrPut(s) { ArrayList() }.add(Element(id, kat, v, smeta, f2)) }
    fun v(x: Double?): Double? = if (x == null || !x.isFinite()) null else x
    /** Fakt sum - core price rule: a row with approved F2 at the F2 unit price; volume as written, NULL stays NULL. */
    fun faktOl(h: JurnalHolat?) = faktSummaF2Narxda(v(h?.faktHajm), v(h?.f2Hajm), v(h?.f2Summa), v(h?.faktSumma), v(h?.f2SummaYoq))
    fun belgi(x: BolimSumma, q: FaktSummaNatija) { if (q.manba == "f2" && q.summa != null) x.f2Narxda++ }
    /** Ancestors: is it new (additional / replacement) and its sections (0 = object). */
    fun yol(r: T2Qator): Pair<Boolean, List<Long>> {
        var yangi = r.qoshimcha || r.zamena; val bolimlar = arrayListOf(0L)
        var p = r.otaId?.let { byId[it] }; var n = 0
        while (p != null && n++ < 60) { if (p.qoshimcha || p.zamena) yangi = true; if (p.tur == "rz") bolimlar.add(p.id); p = p.otaId?.let { byId[it] } }
        return yangi to bolimlar
    }
    // A work's OWN fakt is not added when its resources are derived from it (BL_NORMA) or when it has children (server sums leaves only).
    val otalar = HashSet<Long>()
    for (r in rows) if (r.otaId != null && holat[r.id]?.faktManbasi == "BL_NORMA") otalar.add(r.otaId)
    val bolaliIsh = HashSet<Long>()
    for (r in rows) if (r.otaId != null) bolaliIsh.add(r.otaId)
    for (r in rows) {
        if (r.tur == "bl") {
            val h = holat[r.id]
            val f2 = v(h?.f2Summa); val fq = faktOl(h); val fakt = if (r.id in otalar || r.id in bolaliIsh) null else fq.summa
            if ((f2 == null || f2 == 0.0) && (fakt == null || fakt == 0.0)) continue
            for (b in yol(r).second) {
                val x = ol(b)
                if (f2 != null && f2 != 0.0) { qosh(x.f2, r.kat, f2, r.id); qosh(x.qoldiq, r.kat, -f2, r.id, null, f2) }
                if (fakt != null && fakt != 0.0) { qosh(x.fakt, r.kat, fakt, r.id); belgi(x, fq) }
            }
            continue
        }
        if (r.tur !in BARG) continue
        val h = holat[r.id]
        val (yangi, bolimlar) = yol(r)
        val fq = faktOl(h)
        val sm = v(h?.smetaSumma)
        val chiq = chiqarilgan?.contains(r.id) == true
        for (b in bolimlar) {
            val x = ol(b)
            qosh(if (yangi) x.qoshimcha else x.smeta, r.kat, sm, r.id, sm)
            qosh(x.f2, r.kat, v(h?.f2Summa), r.id, sm)
            // A withdrawn resource's fakt is not added; in a svod section it counts as 0 against its smeta (for the share).
            if (!chiq) { qosh(x.fakt, r.kat, fq.summa, r.id, sm); belgi(x, fq) } else if (r.id in yaxlitIds) qosh(x.fakt, r.kat, 0.0, r.id, sm)
            qosh(x.qoldiq, r.kat, v(h?.qoldiqSumma), r.id, sm, v(h?.f2Summa))
        }
    }
    val f = KesimAccessor<Element>({ it.id }, { it.kat }, { it.summa }, { it.smeta })
    // The svod section's WHOLE smeta (all its leaves) - an inner section's share is relative to it.
    val bolimSmeta = HashMap<Long, Double>()
    for (b in svod?.bolimlar.orEmpty()) {
        val ids = yaxlitQatorIdlari(rows, SvodYaxlit(svod!!.qqssiz, svod.barglar, svod.summasiz, listOf(b)))
        bolimSmeta[b.qatorId] = yigindi2(rows.filter { it.id in ids && it.tur in BARG }.map { v(holat[it.id]?.smetaSumma) })
    }
    for ((s, l) in elementlar) {
        // FAKT - same way as F2 (svodFaktKesimi, one rule); F2 exact; remainder in a svod section = round - F2 exact; smeta / additional = round x (view / smeta).
        s.kesim = if (s in faktlar) svodFaktKesimi(rows, l, f, svod, bolimSmeta)
        else svodKorinishKesimi(
            rows, l, f, svod,
            KesimOpsiya(masshtab = s !in masshtabsiz, f2 = s in masshtabsiz && s !in qoldiqlar, bolimSmeta = bolimSmeta),
            if (s in qoldiqlar) { e: Element -> e.f2 } else null,
        )
        if (l.none { it.summa != null && it.summa.isFinite() }) { s.ustamasiz = null; continue }
        s.ustamasiz = yigindi2(katJami(s.kesim.summalar), s.kesim.nomalum, s.kesim.yaxlit?.qqssiz)
    }
    return out
}

/** Tree total <-> Nakopitelniy: smeta = tree (original) + additional / replacement; F2 = total approved. Difference (|d| > 1) is a warning; NULL: no comparison. */
class NakMoslik(val smetaJami: Double?, val smetaFarq: Double?, val f2Farq: Double?, val mos: Boolean)

fun nakopitelniyMoslik(j: BolimSumma, nakSmeta: Double?, nakTasdiqlangan: Double?, nakBor: Boolean = true): NakMoslik {
    val s = j.smeta.ustamasiz; val q = j.qoshimcha.ustamasiz
    val smetaJami = if (s == null && q == null) null else yigindi2(s, q)
    fun farq(a: Double?, b: Double?): Double? = if (b == null || !b.isFinite()) null else ayirma2(a, b)
    val smetaFarq = if (nakBor) farq(smetaJami, nakSmeta) else null
    val f2Farq = if (nakBor) farq(j.f2.ustamasiz ?: 0.0, nakTasdiqlangan) else null
    return NakMoslik(smetaJami, smetaFarq, f2Farq, abs(smetaFarq ?: 0.0) <= 1 && abs(f2Farq ?: 0.0) <= 1)
}

/** Completion denominator of a section = original smeta + additional / replacement (without markup). NULL is not 0. */
fun bolimMaxraji(s: BolimSumma?): Double? {
    if (s == null) return null
    val a = s.smeta.ustamasiz; val q = s.qoshimcha.ustamasiz
    return if (a == null && q == null) null else yigindi2(a, q)
}
