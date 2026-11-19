package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/*
 * «Daraxt» tab of the Fakt page = the site's SmetaTree (umumiy/daraxt/SmetaTree.tsx, utils.ts, smetaTreeFiltr.ts) as used by FaktNative: the RZ -> BL -> RS/MAT/OB tree with
 * volumes (smeta / fakt / F2 / F2 mumkin / qoldiq), the completion % and the money columns, search, quick filters with counts, expand/collapse, and the per-row fakt write
 * (`jami` = fakt_belgila_v2 with the expected value, `qoshish` = fakt_yoz_v2). Built from the object packet (rows + states) already loaded for the journal.
 * Section (RZ) money = the sum of its descendants' sums (NULL is not 0: all unknown -> unknown).
 */

class DaraxtNode(
    val id: Long, val tur: String, val kod: String?, val nom: String, val birlik: String?, val kat: String?, val qosh: Boolean, val zamena: Boolean, val versiya: Int,
    val smetaHajm: Double?, val fakt: Double?, val f2ol: Double?, val f2mum: Double?, val qoldiq: Double?, val narx: Double?,
    val smeta: Double?, val stFakt: Double?, val stF2: Double?, val stOst: Double?,
    val children: List<DaraxtNode>,
) {
    val key: Long get() = id
    /** The change group of the site (`ozgarishGuruh`): additional / replacement / original estimate. */
    val guruh: String get() = if (zamena) "zamena" else if (qosh) "qoshimcha" else "asl"
}

private fun son(v: Double?): Double? = if (v == null || !v.isFinite()) null else v

/** Packet -> tree (packet order kept; a row whose parent is missing becomes a root). */
fun daraxtQur(rows: List<T2Qator>, states: List<JurnalHolat>): List<DaraxtNode> {
    val h = states.associateBy { it.qatorId }; val ids = rows.map { it.id }.toHashSet()
    val bolalar = HashMap<Long?, MutableList<T2Qator>>()
    for (r in rows) bolalar.getOrPut(if (r.otaId != null && r.otaId in ids) r.otaId else null) { ArrayList() }.add(r)
    fun yigma(xs: List<Double?>): Double? { val k = xs.filterNotNull(); return if (k.isEmpty()) null else yaxlit2(k.sum()) }
    fun qur(r: T2Qator, chuqurlik: Int): DaraxtNode {
        val kids = if (chuqurlik > 80) emptyList() else bolalar[r.id].orEmpty().map { qur(it, chuqurlik + 1) }
        val s = h[r.id]
        val rz = r.tur == "rz"
        fun sum(own: Double?, f: (DaraxtNode) -> Double?): Double? = if (rz) yigma(kids.map(f)) else son(own)
        return DaraxtNode(
            r.id, r.tur ?: "bl", r.kod, r.nom ?: "", r.birlik, r.kat, r.qoshimcha, r.zamena, r.versiya,
            if (rz) null else son(s?.smetaHajm) ?: son(r.hajm), if (rz) null else son(s?.faktHajm), if (rz) null else son(s?.f2Hajm), if (rz) null else son(s?.f2MumkinHajm), if (rz) null else son(s?.qoldiqHajm),
            if (rz) null else son(s?.smetaNarx) ?: son(r.narx),
            sum(s?.smetaSumma) { it.smeta }, sum(s?.faktSumma) { it.stFakt }, sum(s?.f2Summa) { it.stF2 }, sum(s?.qoldiqSumma) { it.stOst }, kids,
        )
    }
    return bolalar[null].orEmpty().map { qur(it, 0) }
}

class DaraxtSatr(val node: DaraxtNode, val depth: Int, val hasChildren: Boolean, val isExpanded: Boolean, val yol: List<String>)

/** Visible rows (iterative, like the site's flattenTree): a node's children follow it when it is expanded. */
fun daraxtTekis(nodes: List<DaraxtNode>, ochiq: Set<Long>): List<DaraxtSatr> {
    val out = ArrayList<DaraxtSatr>()
    class Kadr(val n: DaraxtNode, val d: Int, val yol: List<String>)
    val stack = ArrayDeque<Kadr>(); for (n in nodes.asReversed()) stack.addLast(Kadr(n, 0, emptyList()))
    while (stack.isNotEmpty()) {
        val c = stack.removeLast(); val open = c.n.id in ochiq; val yol = c.yol + c.n.nom.ifEmpty { "Nomsiz" }
        out.add(DaraxtSatr(c.n, c.d, c.n.children.isNotEmpty(), open, yol))
        if (open) for (k in c.n.children.asReversed()) stack.addLast(Kadr(k, c.d + 1, yol))
    }
    return out
}

/** Only the nodes that HAVE children (an expand-all needs no leaf keys). */
fun daraxtBolaliKalitlar(nodes: List<DaraxtNode>): Set<Long> {
    val out = HashSet<Long>(); val st = ArrayDeque(nodes)
    while (st.isNotEmpty()) { val n = st.removeLast(); if (n.children.isNotEmpty()) { out.add(n.id); st.addAll(n.children) } }
    return out
}

enum class TezFiltr(val kalit: String, val nom: String) {
    Hammasi("all", "Hammasi"), Asl("asl", "Asl smeta"), Qosh("qosh", "Qo‘shimcha"), Zamena("zamena", "Zamena"), F2("f2", "F2 olish mumkin"), Bl("bl", "Faqat BL"), Mat("mat", "Materiallar"),
}

private fun tezMos(n: DaraxtNode, f: TezFiltr): Boolean = when (f) {
    TezFiltr.Hammasi -> true
    TezFiltr.F2 -> (n.f2mum ?: 0.0) > 0
    TezFiltr.Asl -> n.tur != "rz" && n.guruh == "asl"
    TezFiltr.Qosh -> n.tur != "rz" && n.qosh
    TezFiltr.Zamena -> n.tur != "rz" && n.zamena
    TezFiltr.Bl -> n.tur == "bl"
    TezFiltr.Mat -> n.tur == "mat"
}

/**
 * Search + quick filter: a matching node and its WHOLE ancestor chain stay (else the found resource's section is invisible); a matching node keeps its children
 * (the change-group filters cut the children by their own group).
 */
fun daraxtSuz(nodes: List<DaraxtNode>, qidiruv: String, tez: TezFiltr): List<DaraxtNode> {
    val s = qidiruv.trim().lowercase()
    if (s.isEmpty() && tez == TezFiltr.Hammasi) return nodes
    val qatiy = tez == TezFiltr.Asl || tez == TezFiltr.Qosh || tez == TezFiltr.Zamena
    fun mos(n: DaraxtNode) = (s.isEmpty() || n.nom.lowercase().contains(s) || (n.kod ?: "").lowercase().contains(s)) && tezMos(n, tez)
    fun suz(xs: List<DaraxtNode>): List<DaraxtNode> {
        val chiq = ArrayList<DaraxtNode>()
        for (n in xs) {
            val b = if (n.children.isNotEmpty()) suz(n.children) else emptyList()
            if (mos(n)) chiq.add(if (qatiy && n.children.isNotEmpty()) n.withChildren(b) else n)
            else if (b.isNotEmpty()) chiq.add(n.withChildren(b))
        }
        return chiq
    }
    return suz(nodes)
}

private fun DaraxtNode.withChildren(c: List<DaraxtNode>) = DaraxtNode(id, tur, kod, nom, birlik, kat, qosh, zamena, versiya, smetaHajm, fakt, f2ol, f2mum, qoldiq, narx, smeta, stFakt, stF2, stOst, c)

/** Quick-filter badges (over the WHOLE tree, independent of the search). */
fun daraxtTezSoni(nodes: List<DaraxtNode>): Map<TezFiltr, Int> {
    val c = TezFiltr.entries.associateWith { 0 }.toMutableMap()
    val st = ArrayDeque(nodes)
    while (st.isNotEmpty()) {
        val n = st.removeLast()
        if ((n.f2mum ?: 0.0) > 0) c[TezFiltr.F2] = c.getValue(TezFiltr.F2) + 1
        if (n.tur != "rz" && n.guruh == "asl") c[TezFiltr.Asl] = c.getValue(TezFiltr.Asl) + 1
        if (n.tur == "bl") c[TezFiltr.Bl] = c.getValue(TezFiltr.Bl) + 1
        if (n.tur == "mat") c[TezFiltr.Mat] = c.getValue(TezFiltr.Mat) + 1
        if (n.tur != "rz" && n.qosh) c[TezFiltr.Qosh] = c.getValue(TezFiltr.Qosh) + 1
        if (n.tur != "rz" && n.zamena) c[TezFiltr.Zamena] = c.getValue(TezFiltr.Zamena) + 1
        st.addAll(n.children)
    }
    return c
}

/** The row's completion %: the bar's formula; unknown smeta or a section -> blank (not 0). */
fun daraxtFoizi(n: DaraxtNode): Int? {
    val sm = n.smetaHajm
    if (sm == null || !(sm > 0) || n.tur == "rz") return null
    val fk = max(n.fakt ?: 0.0, 0.0); val f2 = max(n.f2ol ?: 0.0, 0.0)
    return floor(max(fk, f2) / sm * 100 + 0.5).toInt()
}

class DaraxtOlchov(val f2Ulush: Double, val faktUlush: Double, val foiz: Int, val oshdi: Boolean)
/** The progress bar: F2 taken + fakt above it, smeta = 100%. Unknown smeta -> null (shown as a dash). */
fun daraxtOlchov(sm: Double?, fk: Double?, f2: Double?): DaraxtOlchov? {
    if (sm == null || !(sm > 0)) return null
    val fakt = max(fk ?: 0.0, 0.0); val f2v = max(f2 ?: 0.0, 0.0)
    val f2u = min(1.0, f2v / sm); val fu = min(1.0, max(fakt, f2v) / sm); val pct = floor(max(fakt, f2v) / sm * 100 + 0.5).toInt()
    return DaraxtOlchov(f2u, max(0.0, fu - f2u), pct, pct > 100)
}

/** Fakt is typed by hand only into a work / material / equipment row (the site's faktQoldaKiritiladimi). */
fun daraxtFaktKiritiladi(tur: String) = tur == "bl" || tur == "mat" || tur == "ob"

/** fakt_belgila_v2: set the TOTAL fakt; the server compares `expected_fakt_hajm` with the stored value (FAKT_CONFLICT when it changed). */
fun faktBelgilaV2Payload(companyId: Long, obyektId: Long, qatorId: Long, kutilgan: Double, yangi: Double, sana: String, operationId: String, izoh: String): JsonObject = buildJsonObject {
    put("amal", "fakt_belgila_v2"); put("kompaniya_id", companyId); put("obyekt_id", obyektId); put("qator_id", qatorId)
    put("expected_fakt_hajm", kutilgan); put("yangi_fakt_hajm", yangi); put("sana", sana); put("operation_id", operationId); put("izoh", izoh)
}
