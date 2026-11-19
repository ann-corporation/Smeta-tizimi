package uz.anncorp.smeta.core.fakt

import kotlin.math.abs
import kotlin.math.floor

/*
 * Port of frontend/src/lib/fakt-qamrov.ts (coverage % - "Tiklash rejimi") and lib/fakt-material-taklif.ts (separate-material suggestion) + bolimIshlariYigish
 * of fakt-f2-tenglash.ts. Pure: nothing is written; the plan is only computed. Exceptions are MARKED, never dropped automatically; nothing is invented (no price -> sum NULL).
 * Not ported here: `ishMateriallari` (depends on the estimate-anatomy link detector).
 */

enum class QamrovIstisno(val kod: String) { Faktli("faktli"), Zamenalangan("zamenalangan"), Zamena("zamena"), Bajarilmaydi("bajarilmaydi"), Narxsiz("narxsiz"), Chegirma("chegirma") }

class QamrovQator(
    val id: Long, val tur: String, val kod: String?, val nom: String, val birlik: String?,
    /** A resource inside a work: the parent work id (when the work is dropped, it goes too). */
    val otaIshId: Long?, val smeta: Double?, val fakt: Double, val ochiq: Double,
    /** The fakt delta ("+" mode): percent x open remainder. */
    val hajm: Double,
    /** Sum WITHOUT VAT; unknown price -> null. */
    val summa: Double?, val kesim: Kesim, val istisnolar: List<QamrovIstisno>,
)

class QamrovReja(
    val foiz: Double, val qatorlar: List<QamrovQator>,
    /** No open remainder (already closed / fully not-done): nothing to write. */
    val yopiq: Int,
    /** Smeta unknown (NULL): the percent is not computed. */
    val smetasiz: Int,
    /** Rows OVER the smeta: the percent / 100 NEVER lowers them (JQA-03: 120 -> 100 is not done); `hajm` is only a suggestion for the separate "Tuzatish" action. */
    val oshganlar: List<QamrovQator>,
)

class QamrovOpsiya(val ichkiResurslar: Boolean = true, val narxOl: ((Long) -> Double?)? = null)

private fun son(v: Double?): Double? = if (v == null || !v.isFinite()) null else v
private fun yaxlit(x: Double): Double = floor(x * 1e6 + 0.5) / 1e6

/** Refresh the coverage snapshot with the CURRENT state: fakt written since the window opened lowers the open remainder by the fakt difference. */
fun ishlarniYangila(ishlar: List<JurnalIsh>, holat: Map<Long, JurnalHolat>): List<JurnalIsh> {
    fun q1(q: JurnalQator): JurnalQator {
        val f = son(holat[q.id]?.faktHajm)
        if (f == null || abs(f - q.fakt) < 1e-9) return q
        return q.copy(fakt = f, qoldiq = q.qoldiq?.let { yaxlit(it - (f - q.fakt)) })
    }
    return ishlar.map { it.copy(q = q1(it.q), resurslar = it.resurslar.map(::q1)) }
}

/** Marking (t2_qator.kat) coverage: works with this kat (with only the inner resources of this kat) and matching resources whose work does not match - as separate rows. */
fun markirovkaIshlari(bolimIshlari: Map<Long, List<JurnalIsh>>, marker: String, ildizIshlari: List<JurnalIsh> = emptyList()): List<JurnalIsh> {
    val m = marker.trim()
    fun mos(q: JurnalQator) = (q.kat ?: "").trim() == m
    val out = ArrayList<JurnalIsh>(); val bor = HashSet<Long>()
    fun qosh(x: JurnalIsh) { if (bor.add(x.id)) out.add(x) }
    for (ishlar in bolimIshlari.values.toList() + listOf(ildizIshlari)) for (ish in ishlar) {
        if (ish.q.tur != "bl") { if (mos(ish.q)) qosh(ish); continue }
        val ichki = ish.resurslar.filter(::mos)
        if (mos(ish.q)) qosh(ish.copy(resurslar = ichki)) else for (r in ichki) qosh(JurnalIsh(r, emptyList(), emptyList()))
    }
    return out
}

private class SummaHisob(val summa: Double?, val kesim: Kesim, val narxsiz: Boolean)

/** Coverage plan (pure). [ishlar] = the journal works in the coverage (with the section's descendants). */
fun qamrovReja(ishlar: List<JurnalIsh>, foiz: Double, holat: Map<Long, JurnalHolat>, op: QamrovOpsiya = QamrovOpsiya()): QamrovReja {
    val narxOl = op.narxOl ?: { id: Long -> son(holat[id]?.smetaNarx) }
    val out = ArrayList<QamrovQator>(); val oshganlar = ArrayList<QamrovQator>()
    var yopiq = 0; var smetasiz = 0
    val korildi = HashSet<Long>()
    val f = if (foiz.isFinite()) foiz else 0.0

    fun qosh(q: JurnalQator, otaIshId: Long?, summaHisob: (Double) -> SummaHisob) {
        if (!korildi.add(q.id)) return
        val smeta = q.smeta; val qoldiq = q.qoldiq
        if (smeta == null || qoldiq == null) { smetasiz += 1; return }
        val ochiqBor = if (smeta < 0) qoldiq < -1e-9 else qoldiq > 1e-9
        if (!ochiqBor) {
            if (abs(qoldiq) > 1e-9) {   // over: unchanged, only a correction suggestion
                val hajm = yaxlit(qoldiq); val s = summaHisob(hajm)
                oshganlar.add(QamrovQator(q.id, q.tur, q.kod, q.nom, q.birlik, otaIshId, smeta, q.fakt, qoldiq, hajm, s.summa, s.kesim, if (s.narxsiz) listOf(QamrovIstisno.Narxsiz) else emptyList()))
            } else yopiq += 1
            return
        }
        val hajm = yaxlit(qoldiq * f / 100)
        if (abs(hajm) < 1e-9) return
        val s = summaHisob(hajm)
        val ist = ArrayList<QamrovIstisno>()
        if (abs(q.fakt) > 1e-9) ist.add(QamrovIstisno.Faktli)
        if ((q.almashtirilgan ?: 0.0) > 0) ist.add(QamrovIstisno.Zamenalangan)
        if (q.zamena) ist.add(QamrovIstisno.Zamena)
        if ((q.bajarilmaydi ?: 0.0) > 0) ist.add(QamrovIstisno.Bajarilmaydi)
        if (s.narxsiz) ist.add(QamrovIstisno.Narxsiz)
        if (smeta < 0) ist.add(QamrovIstisno.Chegirma)
        out.add(QamrovQator(q.id, q.tur, q.kod, q.nom, q.birlik, otaIshId, smeta, q.fakt, qoldiq, hajm, s.summa, s.kesim, ist))
    }
    /** Resource (mat/ob): volume x price; unknown price -> sum NULL. */
    fun resursSumma(q: JurnalQator): (Double) -> SummaHisob = { hajm ->
        val kesim = bosKesim(); val narx = narxOl(q.id)
        if (narx == null) { kesimgaQosh(kesim, q.kat, null); SummaHisob(null, kesim, true) }
        else { val summa = yaxlit(hajm * narx); kesimgaQosh(kesim, q.kat, summa); SummaHisob(summa, kesim, false) }
    }
    /** Work (bl): no own price - the following rs rows' smeta sum share (mat/ob count as separate rows). */
    fun ishSumma(ish: JurnalIsh): (Double) -> SummaHisob = { hajm ->
        val kesim = bosKesim(); var summa: Double? = null; var narxsiz = false
        val smeta = ish.q.smeta
        val ulush = if (smeta != null && smeta != 0.0) hajm / smeta else 0.0
        for (r in ish.avtomatik) {
            val ss = son(holat[r.id]?.smetaSumma)
            if (ss == null) { narxsiz = true; kesimgaQosh(kesim, r.kat, null); continue }
            val v = yaxlit(ss * ulush); kesimgaQosh(kesim, r.kat, v); summa = (summa ?: 0.0) + v
        }
        if (ish.avtomatik.isEmpty()) summa = 0.0
        SummaHisob(summa?.let { yaxlit(it) }, kesim, narxsiz)
    }
    for (ish in ishlar) {
        if (ish.q.tur == "bl") {
            qosh(ish.q, null, ishSumma(ish))
            if (op.ichkiResurslar) for (r in ish.resurslar) qosh(r, ish.id, resursSumma(r))
        } else if (ish.q.tur == "mat" || ish.q.tur == "ob") qosh(ish.q, null, resursSumma(ish.q))
    }
    return QamrovReja(f, out, yopiq, smetasiz, oshganlar)
}

class PaketQator(val qatorId: Long, val hajm: Double)
class QamrovJami(val paket: List<PaketQator>, val ustamasiz: Double?, val kesim: Kesim, val narxsiz: Int, val istisnoSoni: Map<QamrovIstisno, Int>)

private fun kesimQosh(a: Kesim, b: Kesim) {
    for ((k, v) in b.summalar) a.summalar[k] = (a.summalar[k] ?: 0.0) + v
    a.nomalum += b.nomalum; a.nomalumSoni += b.nomalumSoni; a.summasizSoni += b.summasizSoni
}

/** The package and totals after the removed ones. A removed work drops its inner resources too. */
fun qamrovJami(reja: QamrovReja, chiqarilgan: Set<Long>): QamrovJami {
    val paket = ArrayList<PaketQator>()
    val kesim = bosKesim(); var ustamasiz: Double? = null; var narxsiz = 0
    val istisnoSoni = QamrovIstisno.entries.associateWith { 0 }.toMutableMap()
    for (q in reja.qatorlar) {
        if (q.id in chiqarilgan || (q.otaIshId != null && q.otaIshId in chiqarilgan)) continue
        paket.add(PaketQator(q.id, q.hajm))
        for (i in q.istisnolar) istisnoSoni[i] = istisnoSoni.getValue(i) + 1
        if (QamrovIstisno.Narxsiz in q.istisnolar) narxsiz += 1
        if (q.summa != null) ustamasiz = (ustamasiz ?: 0.0) + q.summa
        kesimQosh(kesim, q.kesim)
    }
    return QamrovJami(paket, ustamasiz?.let { yaxlit(it) }, kesim, narxsiz, istisnoSoni)
}

/** Rows per fakt document: the write gateway checks <= 2000 row owners per request (a bigger chunk is refused); 1500 with a reserve. */
const val QAMROV_BOLAK = 1500
fun <T> qamrovBolaklari(paket: List<T>, hajm: Int = QAMROV_BOLAK): List<List<T>> = paket.chunked(hajm)

/** Percent text: "70", "70%", "12,5" -> number (0 < x <= 1000); otherwise null. (Not the journal's `foizOqi`: that one is "50%" of the smeta volume.) */
fun qamrovFoizOqi(v: String): Double? {
    val t = v.trim().replace("%", "").replace(',', '.').replace(Regex("\\s"), "")
    if (!Regex("^\\d+(\\.\\d+)?$").matches(t)) return null
    val n = t.toDouble()
    return if (n > 0 && n <= 1000) n else null
}

/** State map (qator_id -> state): for open remainder and price. */
fun holatXarita(states: List<JurnalHolat>): Map<Long, JurnalHolat> = states.associateBy { it.qatorId }

/** Section works (and optionally inner sections'). [bolimIshlari] = the journal model; [bolalar] = section id -> inner section ids. */
fun bolimIshlariYigish(bolimId: Long, bolimIshlari: Map<Long, List<JurnalIsh>>, bolalar: Map<Long, List<Long>>, ichkiBilan: Boolean): List<JurnalIsh> {
    val out = ArrayList<JurnalIsh>()
    fun yur(id: Long) { out.addAll(bolimIshlari[id].orEmpty()); if (ichkiBilan) for (c in bolalar[id].orEmpty()) yur(c) }
    yur(bolimId)
    return out
}

// ---------- fakt-material-taklif.ts ----------

class TaklifQator(val id: Long, val otaId: Long?, val tur: String?, val tartib: Double? = null, val qoshimcha: Boolean = false, val zamena: Boolean = false)

/** Work (bl) id -> the separate mat/ob rows that follow it in the same section (up to the next work or inner section). The work's own children and earlier material do not count. */
fun ishKeyingiMateriallari(rows: List<TaklifQator>): Map<Long, List<Long>> {
    val byId = rows.associateBy { it.id }
    val bolalar = LinkedHashMap<Long, MutableList<TaklifQator>>()
    for (r in rows) { val o = r.otaId ?: continue; if (byId[o]?.tur != "rz") continue; bolalar.getOrPut(o) { ArrayList() }.add(r) }
    val out = LinkedHashMap<Long, MutableList<Long>>()
    for (arr in bolalar.values) {
        val tartibli = arr.sortedWith(compareBy<TaklifQator> { it.tartib ?: Double.MAX_VALUE }.thenBy { it.id })
        var joriy: Long? = null
        for (r in tartibli) {
            if (r.qoshimcha || r.zamena) continue
            if (r.tur == "bl") { joriy = r.id; continue }
            if (r.tur == "rz") { joriy = null; continue }
            if (joriy != null && (r.tur == "mat" || r.tur == "ob")) out.getOrPut(joriy) { ArrayList() }.add(r.id)
        }
    }
    return out
}

/**
 * "Today" suggestion for a material: target at the work's share (workFakt / workSmeta x (matSmeta - closed)) - the material's fakt. [yopiq] = replaced + not-done volume.
 * Unknown / negative (deduction) smeta or a suggestion <= 0 -> null. The volume is not blocked: if the work exceeds the smeta, the suggestion follows at that share.
 */
fun materialTaklifi(ishFakt: Double, ishSmeta: Double?, matSmeta: Double?, matFakt: Double, yopiq: Double = 0.0): Double? {
    if (ishSmeta == null || matSmeta == null || !(ishSmeta > 0) || !(matSmeta > 0) || !(ishFakt > 0)) return null
    val asos = matSmeta - maxOf(yopiq, 0.0)
    if (!(asos > 0)) return null
    val maqsad = ishFakt / ishSmeta * asos
    val d = floor((maqsad - matFakt) * 1e6 + 0.5) / 1e6
    return if (d > 1e-9) d else null
}
