package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.NodeEntity
import uz.anncorp.smeta.core.db.QatorEntity

/*
 * Wire contracts of the three server calls used in P1, parsed defensively (numbers may arrive as strings from
 * Postgres numerics, NULL is "unknown" and never becomes 0). Shapes mirror the web code:
 *   /api/sb              -> { ok, qatorlar:[...], soni, toliq }                 (frontend/functions/api/sb.ts)
 *   /api/obyekt-paket    -> { format:'t2-paket/1', q:{...}, h:{...}, lugat }    (frontend/src/ombor/paket.ts)
 *   /api/sb-yoz fakt_yoz_v2 -> FaktNatija                                       (frontend/src/api/t2-fakt.ts)
 */


fun parseObjects(rows: List<JsonObject>, fallbackCompany: Long): List<ObyektEntity> = rows.mapNotNull { r ->
    val id = r["id"].num()?.toLong() ?: return@mapNotNull null
    ObyektEntity(
        id = id, companyId = r["kompaniya_id"].num()?.toLong() ?: fallbackCompany,
        nom = r["nom"].str().orEmpty(), tur = r["tur"].str(),
        qatorSoni = r["qator_soni"].num()?.toInt(), jami = r["jami"].num(),
        narxsiz = r["narxsiz"].num()?.toInt(), yangilandi = r["yangilandi"].str(),
    )
}

/** `t2_qator_holat` rows -> work rows (only `bl`, i.e. things that can be done on site). Used when the packet is forbidden. */
fun parseHolatRows(obyektId: Long, rows: List<JsonObject>): List<QatorEntity> = rows.mapNotNull { r ->
    val id = r["qator_id"].num()?.toLong() ?: return@mapNotNull null
    if (r["tur"].str().let { it != null && it != "bl" }) return@mapNotNull null
    QatorEntity(
        obyektId = obyektId, qatorId = id, kod = r["kod"].str(), nom = r["nom"].str().orEmpty(), birlik = r["birlik"].str(),
        smetaHajm = r["smeta_hajm"].num(), narx = null, smetaSumma = r["smeta_summa"].num(),
        faktHajm = r["fakt_hajm"].num() ?: 0.0, faktSumma = r["fakt_summa"].num() ?: 0.0,
        f2Hajm = r["f2_hajm"].num() ?: 0.0, f2Summa = r["f2_summa"].num() ?: 0.0, almashtirilgan = 0.0,
    )
}

// ---------- /api/obyekt-paket ----------

data class PaketData(val obyektId: Long, val nom: String?, val rows: List<QatorEntity>, val nodes: List<NodeEntity> = emptyList())


/** Column-oriented packet -> `bl` rows. Wrong format or misaligned columns -> null (never half data). */
fun parsePaket(body: JsonElement?): PaketData? {
    val o = body.obj() ?: return null
    if (o["format"].str() != PAKET_FORMAT) return null
    val obyektId = o["obyekt_id"].num()?.toLong() ?: return null
    val n = o["soni"].num()?.toInt() ?: return null
    val q = o["q"].obj() ?: return null
    val h = o["h"].obj() ?: return null
    val lugat = o["lugat"].obj() ?: return null
    val ids = q["id"].arr() ?: return null
    if (ids.size != n) return null
    fun col(owner: JsonObject, key: String): JsonArray? = owner[key].arr()?.takeIf { it.size == n }
    val tur = col(q, "tur") ?: return null
    val kod = col(q, "kod") ?: return null
    val nom = col(q, "nom") ?: return null
    val birlik = col(q, "birlik") ?: return null
    val hajm = col(q, "hajm") ?: return null
    val narx = col(q, "narx") ?: return null
    val summa = col(q, "summa") ?: return null
    val fh = col(h, "fakt_hajm") ?: return null
    val fs = col(h, "fakt_summa") ?: return null
    val f2h = col(h, "f2_hajm") ?: return null
    val f2s = col(h, "f2_summa") ?: return null
    fun dict(key: String): List<String> = lugat[key].arr()?.map { it.str().orEmpty() } ?: emptyList()
    val dTur = dict("tur"); val dKod = dict("kod"); val dNom = dict("nom"); val dBirlik = dict("birlik")
    fun lookup(d: List<String>, e: JsonElement): String? = e.num()?.toInt()?.let { d.getOrNull(it) }
    val smetaOverride = h["smeta_hajm"].obj()
    val replaced = h["almashtirilgan_hajm"].obj()
    // Section name for the section filter: nearest ancestor of kind `rz` (razdel), else the top-most ancestor. Optional column.
    val ota = col(q, "ota_id")
    val indexById: Map<Long, Int> = if (ota == null) emptyMap() else HashMap<Long, Int>(n * 2).also { m -> for (i in 0 until n) ids[i].num()?.toLong()?.let { m[it] = i } }
    fun sectionOf(start: Int): String? {
        if (ota == null) return null
        var cur = start; var top: String? = null
        for (hop in 0 until 12) {
            val parent = indexById[ota[cur].num()?.toLong() ?: return top] ?: return top
            val name = lookup(dNom, nom[parent])?.trim()?.takeIf { it.isNotEmpty() }
            if (lookup(dTur, tur[parent]) == "rz" && name != null) return name
            if (name != null) top = name
            cur = parent
        }
        return top
    }
    val out = ArrayList<QatorEntity>(n)
    for (i in 0 until n) {
        if (lookup(dTur, tur[i]) != "bl") continue
        val id = ids[i].num()?.toLong() ?: return null
        out += QatorEntity(
            obyektId = obyektId, qatorId = id, kod = lookup(dKod, kod[i]), nom = lookup(dNom, nom[i]).orEmpty(),
            birlik = lookup(dBirlik, birlik[i]),
            smetaHajm = smetaOverride?.get(id.toString()).num() ?: hajm[i].num(),
            narx = narx[i].num(), smetaSumma = summa[i].num(),
            faktHajm = fh[i].num() ?: 0.0, faktSumma = fs[i].num() ?: 0.0,
            f2Hajm = f2h[i].num() ?: 0.0, f2Summa = f2s[i].num() ?: 0.0,
            almashtirilgan = replaced?.get(id.toString()).num() ?: 0.0,
            bolim = sectionOf(i),
        )
    }
    // The whole tree (RZ -> BL -> RS/MAT/OB) in web order: children sorted by tartib then id, depth-first.
    val tartib = col(q, "tartib"); val norma = col(q, "norma"); val katCol = col(q, "kat"); val dKat = dict("kat")
    val kids = HashMap<Int, MutableList<Int>>(); val roots = ArrayList<Int>()
    for (i in 0 until n) {
        val p = if (ota == null) null else ota[i].num()?.toLong()?.let { indexById[it] }
        if (p == null || p == i) roots += i else kids.getOrPut(p) { ArrayList() } += i
    }
    val byOrder = Comparator<Int> { a, b -> (tartib?.get(a).num() ?: a.toDouble()).compareTo(tartib?.get(b).num() ?: b.toDouble()).let { c -> if (c != 0) c else (ids[a].num() ?: 0.0).compareTo(ids[b].num() ?: 0.0) } }
    roots.sortWith(byOrder); kids.values.forEach { it.sortWith(byOrder) }
    val order = IntArray(n) { -1 }; val depthOf = IntArray(n); var next = 0
    val seen = BooleanArray(n)
    fun walk(start: Int, startDepth: Int) {
        val stack = ArrayDeque<Int>(); stack.addLast(start); depthOf[start] = startDepth
        while (stack.isNotEmpty()) {
            val i = stack.removeLast()
            if (seen[i]) continue
            seen[i] = true; order[i] = next++
            kids[i]?.asReversed()?.forEach { c -> if (!seen[c]) { depthOf[c] = depthOf[i] + 1; stack.addLast(c) } }
        }
    }
    roots.forEach { walk(it, 0) }
    for (i in 0 until n) if (!seen[i]) walk(i, 0)   // a cycle / orphan loop is still shown, never dropped
    val nodes = arrayOfNulls<NodeEntity>(n)
    for (i in 0 until n) {
        val id = ids[i].num()?.toLong() ?: return null
        val t = lookup(dTur, tur[i]) ?: return null
        val parentIdx = if (ota == null) null else ota[i].num()?.toLong()?.let { indexById[it] }?.takeIf { it != i }
        nodes[order[i]] = NodeEntity(
            obyektId, id, parentIdx?.let { ids[it].num()?.toLong() }, order[i], depthOf[i], t,
            katCol?.let { lookup(dKat, it[i]) }, lookup(dKod, kod[i]), lookup(dNom, nom[i]).orEmpty(), lookup(dBirlik, birlik[i]),
            smetaOverride?.get(id.toString()).num() ?: hajm[i].num(), narx[i].num(), summa[i].num(), norma?.get(i).num(),
            fh[i].num() ?: 0.0, fs[i].num() ?: 0.0, f2h[i].num() ?: 0.0, f2s[i].num() ?: 0.0,
            replaced?.get(id.toString()).num() ?: 0.0, kids[i]?.isNotEmpty() == true,
        )
    }
    return PaketData(obyektId, o["obyekt_nom"].str(), out, nodes.filterNotNull())
}

/** Object-level sums derived from the work rows (the unit prices are QQS-free, so these are QQS-free too). */
@kotlinx.serialization.Serializable
data class Totals(val smeta: Double?, val fakt: Double?, val f2: Double?, val rows: Int, val unpriced: Int) {
    val faktPercent: Double? get() = percentOf(fakt, smeta)
    val f2Percent: Double? get() = percentOf(f2, smeta)
}

fun computeTotals(rows: List<QatorEntity>): Totals {
    if (rows.isEmpty()) return Totals(null, null, null, 0, 0)
    var smeta = 0.0; var fakt = 0.0; var f2 = 0.0; var unpriced = 0
    for (r in rows) {
        if (r.smetaSumma == null) { if ((r.smetaHajm ?: 0.0) > 0.0) unpriced++ } else smeta += r.smetaSumma
        fakt += r.faktSumma; f2 += r.f2Summa
    }
    return Totals(smeta, fakt, f2, rows.size, unpriced)
}

