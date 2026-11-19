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
import kotlin.math.abs
import kotlin.math.floor

/*
 * Port of frontend/src/lib/fakt-tiklash.ts (+ api/t2-fakt-tiklash.ts reads): "Fakt tiklash" proposes the missing fakt row by row FROM EVIDENCE only (an approved F2 -
 * the strong evidence - or a DRAFT F2 on top of it - the weak one). The owner's rules (2026-11-03): no automatic "fakt >= F2"; the user ticks rows and applies ONE confirmation;
 * fakt is never invented (the volume comes from an existing document); minus volume is allowed; NULL is not 0; the approved F2 never changes - only a DELTA is added to the fakt document.
 */

private fun son(v: Double?): Double? = if (v == null || !v.isFinite()) null else v
private fun yaxlit6(x: Double): Double = floor(x * 1e6 + 0.5) / 1e6
private fun yig(xs: List<Double?>): Double? = xs.fold(null as Double?) { a, v -> if (v == null) a else yaxlit6((a ?: 0.0) + v) }

/** Missing volume by evidence (signed): a positive evidence above fakt is positive, a negative evidence (minus norm) negative; otherwise null. */
fun dalilFarqi(dalil: Double, fakt: Double): Double? {
    val d = yaxlit6(dalil - fakt)
    return if ((d > 1e-9 && dalil > 1e-9) || (d < -1e-9 && dalil < -1e-9)) d else null
}

class QoralamaQator(val aktId: Long, val qatorId: Long, val hajm: Double?, val certifiedQuantity: Double?)
class QoralamaYigma(var hajm: Double, val aktlar: MutableList<Long>)

/** Draft F2 rows -> per-row volume sum and act ids. A row whose volume is unknown is dropped (never taken as 0). */
fun qoralamaYigish(qatorlar: List<QoralamaQator>): Map<Long, QoralamaYigma> {
    val out = LinkedHashMap<Long, QoralamaYigma>()
    for (x in qatorlar) {
        val h = son(x.certifiedQuantity) ?: son(x.hajm) ?: continue
        val b = out[x.qatorId]
        if (b != null) { b.hajm = yaxlit6(b.hajm + h); if (x.aktId !in b.aktlar) b.aktlar.add(x.aktId) } else out[x.qatorId] = QoralamaYigma(yaxlit6(h), mutableListOf(x.aktId))
    }
    return out
}

class TiklashMeta(val id: Long, val tur: String, val nom: String, val birlik: String?, val kat: String?, val bolim: String?)

class TiklashSatr(
    /** Selection key: `f2:<id>` / `qoralama:<id>`. */
    val kalit: String, val id: Long, val tur: String, val nom: String, val birlik: String?, val bolim: String?, val manba: String,
    /** Evidence document text (also goes to the note): "F2 №12, №15" / "qoralama F2 №3". */
    val hujjat: String, val aktlar: List<Long>, val fakt: Double, val keyin: Double, val delta: Double, val narx: Double?, val summa: Double?,
    val kesim: Kesim, val narxManba: String, val paket: List<FaktF2PaketQator>,
)

class TiklashKontekst(
    val reja: TenglashReja, val holat: Map<Long, JurnalHolat>, val meta: List<TiklashMeta>, val qoralama: Map<Long, QoralamaYigma>,
    val qoralamaRaqam: Map<Long, String?> = emptyMap(), val smetaNarx: ((Long) -> Double?)? = null,
)

private fun aktBelgi(id: Long) = "№$id"

/** (a) approved F2 + (b) draft F2 proposals. Fakt >= evidence -> no proposal. */
fun tiklashSatrlar(k: TiklashKontekst): List<TiklashSatr> {
    val out = ArrayList<TiklashSatr>(); val aDelta = HashMap<Long, Double>()
    val metaById = k.meta.associateBy { it.id }
    for (q in k.reja.qatorlar) {
        aDelta[q.id] = q.delta
        val m = metaById[q.id]
        out.add(TiklashSatr("f2:${q.id}", q.id, q.tur, q.nom, q.birlik, q.bolim ?: m?.bolim, "f2", if (!q.aktlar.isNullOrEmpty()) "F2 " + q.aktlar.joinToString(", ") { aktBelgi(it) } else "F2", q.aktlar.orEmpty(),
            q.fakt, yaxlit6(q.fakt + q.delta), q.delta, q.narx, q.summa, q.kesim, q.narxManba, paketQatorlar(q)))
    }
    for (m in k.meta) {
        if (m.tur == "rs") continue            // labour/machines come from the work by norm - never written alone on draft evidence
        val y = k.qoralama[m.id]; val h = k.holat[m.id]
        if (y == null || h == null || abs(y.hajm) <= 1e-12) continue
        val f2 = son(h.f2Hajm) ?: 0.0; val fakt = son(h.faktHajm) ?: 0.0
        val faktA = yaxlit6(fakt + (aDelta[m.id] ?: 0.0))
        val delta = dalilFarqi(yaxlit6(f2 + y.hajm), faktA) ?: continue
        var narx: Double? = null; var summa: Double? = null; var narxManba = "narxsiz"
        if (abs(f2) > 1e-12) {
            val r = faktSummaF2Narxda(delta, f2, son(h.f2Summa), null, h.f2SummaYoq)
            summa = r.summa; narx = r.narx; narxManba = if (r.manba == "f2" && r.summa != null) "f2" else "narxsiz"
        } else {
            val sn = k.smetaNarx?.invoke(m.id) ?: son(h.smetaNarx)
            if (sn != null) { narx = sn; summa = yaxlit6(delta * sn); narxManba = "smeta" }
        }
        val kesim = bosKesim(); kesimgaQosh(kesim, m.kat, summa)
        val hujjat = "qoralama F2 " + y.aktlar.joinToString(", ") { a -> k.qoralamaRaqam[a]?.takeIf { it.isNotEmpty() }?.let { "№$it" } ?: aktBelgi(a) }
        out.add(TiklashSatr("qoralama:${m.id}", m.id, m.tur, m.nom, m.birlik, m.bolim, "qoralama", hujjat, y.aktlar, faktA, yaxlit6(faktA + delta), delta, narx, summa, kesim, narxManba,
            listOf(FaktF2PaketQator(m.id, delta, narxIzoh = "Fakt tiklash: $hujjat hajmi".take(480)))))
    }
    return out
}

/** Selected rows -> fakt_yoz_v2 package (delta only). Two unsourced (summary) lines of one row merge into ONE line: the server must not see a row twice in one document. */
fun tiklashPaket(satrlar: List<TiklashSatr>, tanlangan: Set<String>): List<FaktF2PaketQator> {
    val out = ArrayList<FaktF2PaketQator>(); val yigma = HashMap<Long, Int>()
    for (s in satrlar) {
        if (s.kalit !in tanlangan) continue
        for (p in s.paket) {
            if (p.manbaAktQatorId != null) { out.add(p); continue }
            val i = yigma[p.qatorId]
            if (i == null) { yigma[p.qatorId] = out.size; out.add(p); continue }
            val b = out[i]
            val narx = b.narx ?: p.narx
            val yoq = if (b.narxYoq && p.narxYoq) true else b.narxYoq && p.narx == null && b.narx == null
            val manba = b.narxManba ?: p.narxManba
            val manbaId = if (b.narxManba == null && p.narxManba != null) p.narxManbaId else b.narxManbaId
            out[i] = FaktF2PaketQator(b.qatorId, yaxlit6(b.hajm + p.hajm), null, narx, if (narx != null) false else yoq, manba, manbaId, listOfNotNull(b.narxIzoh, p.narxIzoh).joinToString(" | ").take(480))
        }
    }
    return out.filter { abs(it.hajm) > 1e-12 || it.manbaAktQatorId != null }
}

class TiklashManbaJami(var soni: Int = 0, var ustamasiz: Double? = null, val kesim: Kesim = bosKesim(), var narxsiz: Int = 0)
class TiklashJami(val umumiy: TiklashManbaJami, val f2: TiklashManbaJami, val qoralama: TiklashManbaJami, val paket: List<FaktF2PaketQator>, val manfiySoni: Int, val hujjatlar: List<String>)

/** Totals of the selection (also per source): a NULL sum never enters the total, it is counted in `narxsiz`. */
fun tiklashJami(satrlar: List<TiklashSatr>, tanlangan: Set<String>): TiklashJami {
    val j = TiklashManbaJami(); val f2 = TiklashManbaJami(); val qor = TiklashManbaJami(); var manfiy = 0; val hujjatlar = ArrayList<String>()
    for (s in satrlar) {
        if (s.kalit !in tanlangan) continue
        for (x in listOf(j, if (s.manba == "f2") f2 else qor)) {
            x.soni++
            if (s.summa == null) x.narxsiz++ else x.ustamasiz = yig(listOf(x.ustamasiz, s.summa))
            for ((k, v) in s.kesim.summalar) x.kesim.summalar[k] = (x.kesim.summalar[k] ?: 0.0) + v
            x.kesim.nomalum += s.kesim.nomalum; x.kesim.nomalumSoni += s.kesim.nomalumSoni; x.kesim.summasizSoni += s.kesim.summasizSoni
        }
        if (s.delta < 0) manfiy++
        if (s.hujjat !in hujjatlar) hujjatlar.add(s.hujjat)
    }
    return TiklashJami(j, f2, qor, tiklashPaket(satrlar, tanlangan), manfiy, hujjatlar)
}

/** The object's fakt "after": current fakt + the selected proposal (sum and category cut). Current unknown -> only the proposal. */
fun faktKeyin(hozirUstamasiz: Double?, hozirKesim: Kesim?, qosh: TiklashManbaJami): SummaKesim {
    val kesim = bosKesim()
    fun add(b: Kesim?) { if (b == null) return; for ((k, v) in b.summalar) kesim.summalar[k] = (kesim.summalar[k] ?: 0.0) + v; kesim.nomalum += b.nomalum; kesim.nomalumSoni += b.nomalumSoni; kesim.summasizSoni += b.summasizSoni }
    add(hozirKesim); add(qosh.kesim)
    return SummaKesim(yig(listOf(hozirUstamasiz, qosh.ustamasiz)), kesim)
}

fun tiklashSarlavha(obyektNom: String, hujjatlar: List<String>) = "$obyektNom — ${hujjatlar.joinToString("; ")}".take(400)

// ---- read-only sources (site api/t2-fakt-tiklash.ts): draft F2 acts of the object and their rows ----

class QoralamaManba(val yigma: Map<Long, QoralamaYigma>, val raqam: Map<Long, String?>)

private fun tableRead(jadval: String, filtr: String, ustunlar: String) = buildJsonObject { put("jadval", jadval); put("filtr", filtr); put("ustunlar", ustunlar); put("limit", 100000) }
private fun rowsOf(body: JsonElement?): List<kotlinx.serialization.json.JsonObject>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true || (o["toliq"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return o["qatorlar"].arr()?.mapNotNull { it.obj() } ?: emptyList()
}

/** Null = unreadable (the dialog must not open on a partial read). */
suspend fun tiklashQoralamaOqi(api: BffApi, obyektId: Long): QoralamaManba? {
    val a = rowsOf(api.bff("/api/sb", "POST", tableRead("t2_akt", "obyekt_id=eq.$obyektId&tur=eq.f2&holat=eq.qoralama", "id,raqam,oy")).body) ?: return null
    val aktlar = a.mapNotNull { x -> x["id"].num()?.toLong()?.takeIf { it > 0 }?.let { it to x["raqam"].str() } }
    if (aktlar.isEmpty()) return QoralamaManba(emptyMap(), emptyMap())
    val qs = ArrayList<QoralamaQator>()
    for (c in aktlar.map { it.first }.chunked(100)) {
        val r = rowsOf(api.bff("/api/sb", "POST", tableRead("t2_akt_qator", "akt_id=in.(${c.joinToString(",")})", "akt_id,qator_id,hajm,certified_quantity")).body) ?: return null
        for (x in r) qs.add(QoralamaQator(x["akt_id"].num()?.toLong() ?: continue, x["qator_id"].num()?.toLong() ?: continue, x["hajm"].num(), x["certified_quantity"].num()))
    }
    return QoralamaManba(qoralamaYigish(qs), aktlar.toMap())
}
