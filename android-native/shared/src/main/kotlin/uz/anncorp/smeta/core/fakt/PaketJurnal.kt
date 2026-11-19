package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import kotlin.math.max
import kotlin.math.min

/*
 * Object packet (`/api/obyekt-paket`, format t2-paket/1) -> the rows and states the fakt journal reads, exactly like the site (`ombor/paket.ts`
 * paketDekod + paketdanQatorlar + paketdanHolatlar, derivations of `hisob-yadro/holat.ts`). A broken shape is refused as a whole (never half data).
 */

class JurnalMalumot(val obyektId: Long, val obyektNom: String?, val rows: List<T2Qator>, val states: List<JurnalHolat>)

private val NULL_ELEM = JsonNull
private fun JsonElement?.numOrNull(): Double? = num()?.takeIf { it.isFinite() }

private fun JsonObject.column(key: String, n: Int): JsonArray? = this[key].arr()?.takeIf { it.size == n }

/** Sparse {id: value} reader. */
private fun JsonObject.sparse(key: String): Map<Long, Double?> {
    val o = this[key].obj() ?: return emptyMap()
    return o.entries.associate { (k, v) -> k.toLong() to (if (v is JsonNull) null else v.num()) }
}

private fun qoldiq(smeta: Double?, f2: Double?, almashtirilgan: Double?): Double? =
    if (smeta == null || !smeta.isFinite()) null else yaxlit2(smeta - (f2 ?: 0.0) - (almashtirilgan ?: 0.0))

/** Quantity-only signed availability (`holat.ts mumkinHajm`): positive row max(0, fakt - F2), minus row min(0, fakt - F2); unknown fakt stays unknown. */
fun mumkinHajm(fakt: Double?, f2: Double?, smeta: Double?): Double? {
    if (fakt == null || !fakt.isFinite()) return null
    val f = if (f2 != null && f2.isFinite()) f2 else 0.0
    val manfiy = if (smeta != null && smeta.isFinite() && smeta != 0.0) smeta < 0 else fakt < 0 || f < 0
    val farq = fakt - f
    return if (manfiy) min(0.0, farq) else max(0.0, farq)
}

/** Packet -> rows (packet order) + states (by qator_id, like `sbT2QatorHolatOl`). Wrong format / misaligned column -> null. */
fun parseJurnalPaket(body: JsonElement?): JurnalMalumot? {
    val o = body.obj() ?: return null
    if (o["format"].str() != "t2-paket/1") return null
    val obyektId = o["obyekt_id"].num()?.toLong() ?: return null
    val n = o["soni"].num()?.toInt() ?: return null
    val q = o["q"].obj() ?: return null
    val h = o["h"].obj() ?: return null
    val lugat = o["lugat"].obj() ?: return null
    val ids = q.column("id", n) ?: return null
    fun dict(key: String): List<String> = lugat[key].arr()?.map { it.str().orEmpty() } ?: emptyList()
    val dTur = dict("tur"); val dKat = dict("kat"); val dKod = dict("kod"); val dNom = dict("nom"); val dBirlik = dict("birlik")
    fun lk(d: List<String>, e: JsonElement?): String? = if (e == null || e is JsonNull) null else e.num()?.toInt()?.let { d.getOrNull(it) }
    val ota = q.column("ota_id", n) ?: return null; val daraja = q.column("daraja", n) ?: return null; val tartib = q.column("tartib", n) ?: return null
    val tur = q.column("tur", n) ?: return null; val kat = q.column("kat", n) ?: return null; val kod = q.column("kod", n) ?: return null
    val nom = q.column("nom", n) ?: return null; val birlik = q.column("birlik", n) ?: return null; val hajm = q.column("hajm", n) ?: return null
    val summa = q.column("summa", n) ?: return null; val narx = q.column("narx", n) ?: return null; val norma = q.column("norma", n) ?: return null; val versiya = q.column("versiya", n) ?: return null
    val qosh = q.column("qoshimcha", n) ?: return null; val zam = q.column("zamena", n) ?: return null
    val fh = h.column("fakt_hajm", n) ?: return null; val fs = h.column("fakt_summa", n) ?: return null; val f2h = h.column("f2_hajm", n) ?: return null; val f2s = h.column("f2_summa", n) ?: return null
    val f2yoq = h.column("f2_summa_yoq", n)
    val manba = h.column("fakt_manbasi", n) ?: return null
    val alH = h.sparse("almashtirilgan_hajm"); val alS = h.sparse("almashtirilgan_summa")
    val rows = ArrayList<T2Qator>(n); val states = ArrayList<JurnalHolat>(n)
    val seen = HashSet<Long>(n * 2)
    for (i in 0 until n) {
        val id = ids[i].num()?.toLong() ?: return null
        if (!seen.add(id)) return null
        val turText = lk(dTur, tur[i]) ?: return null            // the type is never silently null
        rows.add(T2Qator(
            id = id, otaId = ota[i].numOrNull()?.toLong(), daraja = daraja[i].numOrNull()?.toInt(), tur = turText, kod = lk(dKod, kod[i]), nom = lk(dNom, nom[i]), birlik = lk(dBirlik, birlik[i]),
            hajm = hajm[i].numOrNull(), kat = lk(dKat, kat[i]), qoshimcha = qosh[i].num() == 1.0, zamena = zam[i].num() == 1.0, versiya = versiya[i].num()?.toInt() ?: 1, norma = norma[i].numOrNull(), narx = narx[i].numOrNull(),
        ))
        val hj = hajm[i].numOrNull(); val sm = summa[i].numOrNull(); val faktH = fh[i].numOrNull(); val faktS = fs[i].numOrNull(); val f2H = f2h[i].numOrNull(); val f2S = f2s[i].numOrNull()
        val aH = alH[id] ?: 0.0
        val aS: Double? = if (alS.containsKey(id)) alS[id] else 0.0
        val yoq = f2yoq?.get(i)?.numOrNull()
        states.add(JurnalHolat(
            qatorId = id, smetaHajm = hj, faktHajm = faktH, faktManbasi = if (manba[i].num() == 1.0) "BL_NORMA" else "DIRECT", smetaSumma = sm, faktSumma = faktS,
            f2MumkinHajm = mumkinHajm(faktH, f2H, hj), f2Hajm = f2H, almashtirilganHajm = aH, qoldiqHajm = if (hj == null) null else hj - (f2H ?: 0.0) - aH,
            f2Summa = f2S, qoldiqSumma = qoldiq(sm, f2S, aS), f2SummaYoq = yoq,
        ))
    }
    return JurnalMalumot(obyektId, o["obyekt_nom"].str(), rows, states.sortedBy { it.qatorId })
}
