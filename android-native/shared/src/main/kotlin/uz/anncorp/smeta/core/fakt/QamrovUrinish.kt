package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.floor

/*
 * Port of frontend/src/lib/fakt-qamrov-urinish.ts - the ATTEMPT (immutable snapshot + per-chunk receipts) behind every multi-row fakt write ("Qamrov %", "Tuzatish", "Fakt = F2").
 * `fakt_yoz_v2` may lose its answer (timeout / network) while the server HAS written the document; re-sending the same operation_id returns the old act (no duplicate).
 *  1) BEFORE the first request the attempt is frozen: chunks (rows + volumes), one UUID per chunk, date, note;
 *  2) every chunk gets a receipt: confirmed (act id) / failed (the server refused clearly) / unknown (answer lost);
 *  3) while an attempt is unresolved NO new attempt starts: the same snapshot is re-sent with the same UUIDs;
 *  4) a CONFIRMED write is remembered (JQA-09) until the journal shows the written fakt: otherwise a plan computed from the old remainder would write it twice.
 * Storage: process-wide registry (the site keeps the same in a module registry + localStorage; the desktop app keeps it for the app session).
 */

enum class BolakHolat(val kod: String) { Kutmoqda("kutmoqda"), Confirmed("confirmed"), Failed("failed"), Unknown("unknown") }

class UrinishBolak(
    val operationId: String, val qatorlar: List<FaktF2PaketQator>, val izoh: String, val holat: BolakHolat = BolakHolat.Kutmoqda, val aktId: Long? = null, val xato: String? = null,
    /** Each row's fakt when the attempt was created (parallel to `qatorlar`): later "is the written fakt visible in the table" check. */
    val asos: List<Double> = emptyList(),
)

class QamrovUrinish(
    val kalit: String, val kompaniyaId: Long, val obyektId: Long, val sana: String, val sarlavha: String, val foiz: Double,
    /** "qamrov" - percent x open remainder (only raises); "tuzatish" - lowers an over-smeta fakt (separate, with preview); "f2" - Fakt = F2 / tiklash. */
    val tur: String, val bolaklar: List<UrinishBolak>,
)

enum class UrinishHolat { Kutmoqda, Toliq, Nomalum, Xato }

fun urinishKaliti(kompaniyaId: Long, obyektId: Long) = "$kompaniyaId:$obyektId"

/** JS `String(number)` for the percent: 70.0 -> "70", 12.5 -> "12.5". */
fun urinishFoizMatn(x: Double): String = if (x == floor(x) && abs(x) < 1e15) x.toLong().toString() else x.toString()

/** Freeze the snapshot: chunks and UUIDs are frozen here (never change later). */
fun urinishYarat(
    kompaniyaId: Long, obyektId: Long, sana: String, sarlavha: String, foiz: Double, bolaklar: List<List<FaktF2PaketQator>>, yangiId: () -> String,
    izohBosh: String? = null, tur: String = "qamrov", faktOl: (Long) -> Double = { 0.0 },
): QamrovUrinish {
    val n = bolaklar.size
    return QamrovUrinish(urinishKaliti(kompaniyaId, obyektId), kompaniyaId, obyektId, sana, sarlavha, foiz, tur, bolaklar.mapIndexed { i, q ->
        UrinishBolak(yangiId(), q.toList(), "${izohBosh ?: "Qamrov ${urinishFoizMatn(foiz)}%"}: $sarlavha".take(480) + (if (n > 1) " (${i + 1}/$n)" else ""), asos = q.map { faktOl(it.qatorId) })
    })
}

fun urinishHolati(u: QamrovUrinish): UrinishHolat = when {
    u.bolaklar.all { it.holat == BolakHolat.Confirmed } -> UrinishHolat.Toliq
    u.bolaklar.any { it.holat == BolakHolat.Unknown } -> UrinishHolat.Nomalum
    u.bolaklar.any { it.holat == BolakHolat.Failed } -> UrinishHolat.Xato
    else -> UrinishHolat.Kutmoqda
}
/** Unresolved = not every chunk is confirmed. */
fun urinishOchiqmi(u: QamrovUrinish?): Boolean = u != null && urinishHolati(u) != UrinishHolat.Toliq
fun urinishAktlari(u: QamrovUrinish): List<Long> = u.bolaklar.mapNotNull { it.aktId }

/** yozAmali transport texts: the server may have done the action - the result is UNKNOWN. */
private val TRANSPORT = Regex("serverda bajarilgan bo‘lishi mumkin|Internet aloqasi uzildi|Server vaqtincha javob bermadi|^HTTP 5\\d\\d")

/** Answer classification: no HTTP answer / 5xx -> unknown; ok -> confirmed; ok:false + server `code` -> failed; ok:false + transport text -> unknown; other refusal -> failed. */
fun javobTasnifi(r: ApiResult): BolakHolat {
    if (r.networkError) return BolakHolat.Unknown
    val o = r.body.obj()
    val ok = (o?.get("ok") as? JsonPrimitive)?.booleanOrNull
    if (ok == true) return BolakHolat.Confirmed
    if (o == null) return if (r.status >= 500) BolakHolat.Unknown else BolakHolat.Failed
    if (o["code"].str() != null || r.code != null) return BolakHolat.Failed
    if (r.status >= 500) return BolakHolat.Unknown
    return if (TRANSPORT.containsMatchIn(o["error"].str().orEmpty())) BolakHolat.Unknown else BolakHolat.Failed
}

private fun JsonElement?.aktId(): Long? = obj()?.get("akt_id").num()?.toLong()

/** The attempt with chunk [i]'s receipt written (pure; the snapshot body never changes). */
fun urinishReceipt(u: QamrovUrinish, i: Int, r: ApiResult?): QamrovUrinish {
    val holat = if (r == null) BolakHolat.Unknown else javobTasnifi(r)
    val o = r?.body.obj()
    return QamrovUrinish(u.kalit, u.kompaniyaId, u.obyektId, u.sana, u.sarlavha, u.foiz, u.tur, u.bolaklar.mapIndexed { k, b ->
        if (k != i) b else UrinishBolak(b.operationId, b.qatorlar, b.izoh, holat, if (holat == BolakHolat.Confirmed) r?.body.aktId() ?: b.aktId else b.aktId,
            if (holat == BolakHolat.Confirmed) null else o?.get("error").str() ?: o?.get("xabar").str() ?: o?.get("code").str() ?: r?.code ?: "javob yo‘q", b.asos)
    })
}

// ---- JQA-09: the record of CONFIRMED writes (kept after the attempt ends or is dropped) ----

class YozilganTekshir(val qatorId: Long, val kutilgan: Double, val ishora: Int)
class QamrovYozilgan(val kalit: String, val sarlavha: String, val foiz: Double, val aktlar: List<Long>, val tekshir: List<YozilganTekshir>)

/** Expected fakt per row: the base (fakt when the attempt was created) + ALL volumes written for that row (a 1:1 copy makes one row several fakt rows). */
private fun tekshirYig(tasdiq: List<UrinishBolak>): List<YozilganTekshir> {
    class Acc(val asos: Double, var jami: Double)
    val m = LinkedHashMap<Long, Acc>()
    for (b in tasdiq) b.qatorlar.forEachIndexed { i, q ->
        val x = m[q.qatorId]
        if (x != null) x.jami += q.hajm else m[q.qatorId] = Acc(b.asos.getOrNull(i) ?: 0.0, q.hajm)
    }
    return m.map { (id, x) -> YozilganTekshir(id, floor((x.asos + x.jami) * 1e6 + 0.5) / 1e6, if (x.jami < 0) -1 else 1) }
}

/** A record from the attempt's confirmed chunks (none confirmed -> null). */
fun yozilganYasa(u: QamrovUrinish): QamrovYozilgan? {
    val tasdiq = u.bolaklar.filter { it.holat == BolakHolat.Confirmed }
    if (tasdiq.isEmpty()) return null
    return QamrovYozilgan(u.kalit, u.sarlavha, u.foiz, tasdiq.mapNotNull { it.aktId }, tekshirYig(tasdiq))
}

/** Does the journal (state fakt_hajm) show the written volumes? An unknown row state = not yet. */
fun yozilganKorinadimi(y: QamrovYozilgan, faktOl: (Long) -> Double?): Boolean = y.tekshir.all { x ->
    val f = faktOl(x.qatorId)
    if (f == null || !f.isFinite()) false else if (x.ishora > 0) f >= x.kutilgan - 1e-6 else f <= x.kutilgan + 1e-6
}

/** Process-wide registry (key = company:object, one for every kind of write). */
object UrinishDokoni {
    private val urinishlar = ConcurrentHashMap<String, QamrovUrinish>()
    private val yozilganlar = ConcurrentHashMap<String, QamrovYozilgan>()
    fun urinishOl(kompaniyaId: Long, obyektId: Long): QamrovUrinish? = urinishlar[urinishKaliti(kompaniyaId, obyektId)]
    fun urinishSaqla(u: QamrovUrinish) { urinishlar[u.kalit] = u }
    fun urinishOchir(kompaniyaId: Long, obyektId: Long) { urinishlar.remove(urinishKaliti(kompaniyaId, obyektId)) }
    fun yozilganOl(kompaniyaId: Long, obyektId: Long): QamrovYozilgan? = yozilganlar[urinishKaliti(kompaniyaId, obyektId)]
    fun yozilganSaqla(y: QamrovYozilgan) { yozilganlar[y.kalit] = y }
    fun yozilganOchir(kompaniyaId: Long, obyektId: Long) { yozilganlar.remove(urinishKaliti(kompaniyaId, obyektId)) }
    fun tozala() { urinishlar.clear(); yozilganlar.clear() }
}
