package uz.anncorp.smeta.core.fakt

/*
 * Port of frontend/src/lib/svod-yaxlit.ts (round-sum svod sections: no markup on them, VAT only; the whole content sums to the svod amount).
 * Same collection rules and the same scaling as the site; the markup steps themselves live in the hisob core (not ported here).
 */

class SvodYaxlitBolim(
    val qatorId: Long, val nom: String? = null, val svodSumma: Double?, val qqsStavka: Double?,
    /** Not subject to markup, without VAT. */
    val qqssiz: Double,
    /** Direct cost of the section's leaves (no markup). */
    val barglar: Double,
)
class SvodYaxlit(val qqssiz: Double, val barglar: Double, val summasiz: Double, val bolimlar: List<SvodYaxlitBolim>)

/** Section round sum WITH VAT: the svod amount as entered, otherwise (pure content) qqssiz x (1 + VAT). Unknown rate -> null. */
fun bolimQqsBilan(b: SvodYaxlitBolim, ndsFoiz: Double?): Double? = if (b.svodSumma != null) yaxlit2(b.svodSumma) else yaxlitKOplate(b.qqssiz, ndsFoiz)

/** The object's round svod: with VAT (exact, sum of sections) and without VAT. */
fun svodYaxlitQqs(svod: SvodYaxlit?, ndsFoiz: Double?): Pair<Double, Double>? {
    if (svod == null || svod.bolimlar.isEmpty()) return null
    var q = 0.0
    for (b in svod.bolimlar) q += bolimQqsBilan(b, ndsFoiz) ?: return null
    return yaxlit2(q) to yaxlit2(svod.qqssiz)
}

fun svodKesimYaxlit(svod: SvodYaxlit): YaxlitQism {
    var q = 0.0; var s = 0.0
    for (b in svod.bolimlar) if (b.svodSumma != null) { q += b.svodSumma; s += b.qqssiz }
    return YaxlitQism(svod.qqssiz, svod.barglar, yaxlit2(q), yaxlit2(s))
}

/** Marked sections and ALL their descendants (by parent id): the same set as the server recursion. No mark -> empty. */
fun yaxlitQatorIdlari(qatorlar: Iterable<T2Qator>, svod: SvodYaxlit?): Set<Long> {
    val out = HashSet<Long>()
    if (svod == null || svod.bolimlar.isEmpty()) return out
    val bolalar = HashMap<Long, MutableList<Long>>()
    for (q in qatorlar) { val o = q.otaId ?: continue; bolalar.getOrPut(o) { ArrayList() }.add(q.id) }
    val navbat = ArrayDeque(svod.bolimlar.map { it.qatorId })
    while (navbat.isNotEmpty()) {
        val id = navbat.removeLast()
        if (!out.add(id)) continue
        for (c in bolalar[id].orEmpty()) navbat.addLast(c)
    }
    return out
}

class KesimOpsiya(
    val jami: Double? = null, val masshtab: Boolean? = null, val bolimSmeta: Map<Long, Double>? = null, val f2: Boolean = false,
)

/** What the view needs from one leaf: id, category, sum in this view, smeta sum, (F2 remainder view) the F2 sum. */
class KesimAccessor<T>(val id: (T) -> Long?, val kat: (T) -> String?, val summa: (T) -> Double?, val smeta: (T) -> Double?)

/**
 * Screen cut (the same model as the export): ordinary leaves -> category cut; svod-section leaves -> per section `round x (view / smeta)` (in the smeta view the round
 * itself); the svod amount WITH VAT, when entered, follows the same share (exact). `masshtab = false` -> exact-view (F2: with VAT = x(1+VAT)).
 * Unknown rows (null) are not summed. [jami] given -> the difference goes to the unknown-category part (approximate).
 */
fun <T> svodKorinishKesimi(
    daraxt: Iterable<T2Qator>, barglar: List<T>, f: KesimAccessor<T>, svod: SvodYaxlit?, o: KesimOpsiya = KesimOpsiya(), qoldiqF2: ((T) -> Double?)? = null,
): Kesim {
    val bolimOf = HashMap<Long, SvodYaxlitBolim>()
    for (b in svod?.bolimlar.orEmpty()) for (id in yaxlitQatorIdlari(daraxt, SvodYaxlit(svod!!.qqssiz, svod.barglar, svod.summasiz, listOf(b)))) bolimOf[id] = b
    // F2 view: CHEL / MASH inside a svod section are not round (ordinary category, server agg exactly).
    fun yaxlitda(x: T): Boolean { val id = f.id(x); return id != null && id in bolimOf && !(o.f2 && f2YaxlitdanChiqadi(f.kat(x))) }
    val oddiy = barglar.filter { !yaxlitda(it) }
    val k = kesimYigish(oddiy, f.kat, f.summa)
    class A(var sm: Double = 0.0, var kr: Double = 0.0, var f2: Double = 0.0)
    val agg = LinkedHashMap<SvodYaxlitBolim, A>()
    for (x in barglar) {
        val id = f.id(x); val b = if (id == null || !yaxlitda(x)) null else bolimOf[id]
        if (b == null) continue
        val a = agg.getOrPut(b) { A() }
        val f2 = qoldiqF2?.invoke(x); if (f2 != null && f2.isFinite()) a.f2 += f2
        val s = f.smeta(x); val v = f.summa(x)
        if (s != null && s.isFinite()) a.sm += s
        if (v == null || !v.isFinite()) k.summasizSoni++ else a.kr += v
    }
    if (agg.isNotEmpty()) {
        var qqssiz = 0.0; var barg = 0.0; var svQ = 0.0; var svS = 0.0
        for ((b, a) in agg) {
            val toliq = o.bolimSmeta?.get(b.qatorId)
            val qism = a.sm
            if (toliq != null && toliq.isFinite()) a.sm = toliq
            barg += a.kr
            if (qoldiqF2 != null) {
                val lump = yaxlitKorinish(b.qqssiz, a.sm, qism) ?: b.qqssiz
                val s = yaxlitQoldiqF2(lump, a.f2)!!
                qqssiz += s
                val sv = if (b.svodSumma == null) null else yaxlitKorinish(b.svodSumma, a.sm, qism)
                val f2q = yaxlitKOplate(a.f2, b.qqsStavka)
                if (sv != null && f2q != null) { svQ += yaxlit2(sv - f2q); svS += s }
                continue
            }
            val s = if (o.masshtab == false) yaxlit2(a.kr) else yaxlitKorinish(b.qqssiz, a.sm, a.kr) ?: yaxlit2(a.kr)
            qqssiz += s
            if (o.masshtab != false && b.svodSumma != null) { val q = yaxlitKorinish(b.svodSumma, a.sm, a.kr); if (q != null) { svQ += q; svS += s } }
        }
        k.yaxlit = YaxlitQism(yaxlit2(qqssiz), yaxlit2(barg), yaxlit2(svQ), yaxlit2(svS))
    }
    if (o.jami == null) return k
    val bor = katJami(k.summalar) + k.nomalum + (k.yaxlit?.barglar ?: 0.0)
    return kesimNomalumBilan(k, o.jami - bor)
}

/** Fakt in a svod section - ONE rule (F-2 bor qatorda fakt F-2 narxida): same way as F2, NOT distributed to the svod amount. */
fun <T> svodFaktKesimi(daraxt: Iterable<T2Qator>, barglar: List<T>, f: KesimAccessor<T>, svod: SvodYaxlit?, bolimSmeta: Map<Long, Double>? = null): Kesim =
    svodKorinishKesimi(daraxt, barglar, f, svod, KesimOpsiya(bolimSmeta = bolimSmeta, masshtab = false, f2 = true))

/** Svod section remainder (without VAT) = round - fakt (at direct prices, no distribution); unknown -> null. */
fun svodQoldigi(yaxlitQqssiz: Double?, faktJami: Double?): Double? = if (!yaxlitQqssiz.finiteOrNull() || !faktJami.finiteOrNull()) null else yaxlit2(yaxlitQqssiz!! - faktJami!!)
private fun Double?.finiteOrNull(): Boolean = this != null && this.isFinite()
