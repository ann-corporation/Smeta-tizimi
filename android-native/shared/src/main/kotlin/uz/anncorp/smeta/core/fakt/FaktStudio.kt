package uz.anncorp.smeta.core.fakt

/*
 * Port of lib/fakt-studio.ts faktYigindiHisobla: the object totals shown on the cards of the Fakt page (fakt so far, works missing from the smeta, not-done volumes, the F2-price rule).
 * Only reads; estimate rows never change. Prices are without VAT; money is never invented: a row with an unknown sum is NOT 0 (counted in the cut's `summasizSoni`).
 */

class FaktYigindi(
    val faktKesim: Kesim, val faktUstamasiz: Double, val yangiSoni: Int, val yangiKesim: Kesim, val yangiUstamasiz: Double,
    val bajarilmadiSoni: Int, val bajarilmadiKesim: Kesim, val bajarilmadiUstamasiz: Double, val bajarilmadiNarxsiz: Int, val faktF2Narxda: Int,
)

private fun fson(v: Double?): Double? = if (v == null || !v.isFinite()) null else v

fun faktYigindiHisobla(rows: List<T2Qator>, states: List<JurnalHolat>, bajarilmadi: List<BajarilmadiYozuv> = emptyList(), svod: SvodYaxlit? = null): FaktYigindi {
    val holat = states.associateBy { it.qatorId }; val byId = rows.associateBy { it.id }
    fun ildiz(r: T2Qator) = r.qoshimcha || r.zamena
    fun yangiMi(r: T2Qator): Boolean { var p: T2Qator? = r; var n = 0; while (p != null && n++ < 50) { if (ildiz(p)) return true; p = p.otaId?.let { byId[it] } }; return false }
    class El(val id: Long, val kat: String?, val summa: Double?, val smeta: Double?)
    val faktEl = ArrayList<El>(); val yangiEl = ArrayList<El>(); var yangiSoni = 0; var faktF2Narxda = 0
    val bajMap = bajarilmadiHajmlar(bajarilmadi)
    for (r in rows) {
        val ota = r.otaId?.let { byId[it] }
        if (ildiz(r) && (r.tur == "bl" || r.tur == "mat" || r.tur == "ob") && !(ota != null && yangiMi(ota))) yangiSoni++
        if (r.tur != "rs" && r.tur != "mat" && r.tur != "ob") continue
        if (bajMap.containsKey(r.id) && chiqarilganmi(fson(holat[r.id]?.smetaHajm), bajMap[r.id])) continue
        val h = holat[r.id]
        val fq = faktSummaF2Narxda(fson(h?.faktHajm), fson(h?.f2Hajm), fson(h?.f2Summa), fson(h?.faktSumma), fson(h?.f2SummaYoq))
        if (fq.manba == "f2" && fq.summa != null) faktF2Narxda++
        val e = El(r.id, r.kat, fq.summa, fson(h?.smetaSumma))
        faktEl.add(e); if (yangiMi(r)) yangiEl.add(e)
    }
    val f = KesimAccessor<El>({ it.id }, { it.kat }, { it.summa }, { it.smeta })
    val faktKesim = svodFaktKesimi(rows, faktEl, f, svod); val yangiKesim = svodFaktKesimi(rows, yangiEl, f, svod)
    fun jami(k: Kesim) = yigindi2(listOf(katJami(k.summalar), k.nomalum, k.yaxlit?.qqssiz))
    val bajKesim = bosKesim(); val bajL = ArrayList<Double?>(); var narxsiz = 0; var soni = 0
    for (b in bajarilmadi) {
        if (b.holat != "faol") continue
        soni++
        val summa = qatorSumma(b.bajarilmaganHajm, fson(holat[b.qatorId]?.smetaNarx))
        if (summa == null) { narxsiz++; continue }
        bajL.add(summa); kesimgaQosh(bajKesim, byId[b.qatorId]?.kat, summa)
    }
    return FaktYigindi(faktKesim, jami(faktKesim), yangiSoni, yangiKesim, jami(yangiKesim), soni, bajKesim, yigindi2(bajL), narxsiz, faktF2Narxda)
}
