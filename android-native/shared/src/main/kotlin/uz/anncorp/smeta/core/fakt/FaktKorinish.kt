package uz.anncorp.smeta.core.fakt

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/*
 * Port of frontend/src/lib/fakt-korinish.ts: the visual calculations of the fakt journal (progress bar shares, status stamp, summary, object completion).
 * No new business formula: only the journal model and the state rows. NULL is not 0: unknown smeta -> unknown percent.
 */

private const val EPS = 1e-9
private fun qis(x: Double, mx: Double = 1.0) = min(mx, max(0.0, x))

class FaktMeter(
    /** fakt / smeta x 100 (also positive for a deduction row); smeta unknown or 0 -> null. */
    val foiz: Double?,
    /** Shares to draw (0..1, sum <= 1): approved in F2, fakt not yet taken into F2, today's entry. */
    val f2Ulush: Double, val faktUlush: Double, val yangiUlush: Double,
    val yangiFoiz: Double?, val oshdi: Boolean, val yangiOshdi: Boolean,
    /** Approved F2 volume exceeds fakt ("Fakt = F2" may be needed). */
    val f2Oldinda: Boolean,
)

/** A row's progress bar. [f2] unknown -> the segment is absent (not drawn as 0); [yangiFakt] = the total fakt after the entry (no entry -> null). A deduction row reads in the smeta's sign. */
fun faktMeter(smeta: Double?, fakt: Double, f2: Double?, yangiFakt: Double? = null): FaktMeter {
    val bos = FaktMeter(null, 0.0, 0.0, 0.0, null, false, false, false)
    if (smeta == null || !smeta.isFinite() || smeta == 0.0) return bos
    val ish = if (smeta < 0) -1.0 else 1.0
    val s = abs(smeta)
    val fk = fakt * ish
    val f2v = if (f2 == null || !f2.isFinite()) 0.0 else f2 * ish
    val yv = if (yangiFakt == null || !yangiFakt.isFinite()) null else yangiFakt * ish
    val f2Ulush = qis(min(f2v, fk) / s)
    val faktUlush = qis((fk - max(0.0, min(f2v, fk))) / s, 1 - f2Ulush)
    val yangiUlush = if (yv == null) 0.0 else qis((yv - max(fk, 0.0)) / s, 1 - f2Ulush - faktUlush)
    return FaktMeter(fk / s * 100, f2Ulush, faktUlush, yangiUlush, yv?.let { it / s * 100 }, fk > s + EPS, yv != null && yv > s + EPS, f2v > fk + EPS)
}

/** Percent text: 0.4% -> "<1%", 99.6% -> "99%" (an unfinished work never shows 100%), unknown -> the dash. */
fun foizMatn(foiz: Double?): String {
    if (foiz == null || !foiz.isFinite()) return "—"
    if (foiz > 0 && foiz < 1) return "<1%"
    if (foiz < 100 && foiz > 99) return "99%"
    return "${foiz.roundToLong()}%"
}

/** Status stamp keys (translated through the site dictionary): always a word, never colour alone. */
val HOLAT_MUHR: Map<HolatTur, String> = mapOf(
    HolatTur.Yangi to "Boshlanmagan", HolatTur.Qisman to "Jarayonda", HolatTur.Tugadi to "Bajarildi", HolatTur.Oshdi to "Smetadan oshdi", HolatTur.Smetasiz to "Smetasiz",
)

class JurnalXulosa(val ishlar: Map<HolatTur, Int>, val ishJami: Int, val bolimJami: Int, val bolimTugagan: Int)

fun bolimTugadimi(b: JurnalBolim): Boolean = b.ulush != null && b.ulush >= 1 - EPS

/** Works by status (per section, no duplicates) and the finished top-level sections. */
fun jurnalXulosa(bolimlar: List<JurnalBolim>, bolimIshlari: Map<Long, List<JurnalIsh>>): JurnalXulosa {
    val ishlar = HolatTur.entries.associateWith { 0 }.toMutableMap(); var jami = 0
    for (b in bolimlar) for (ish in bolimIshlari[b.id].orEmpty()) { ishlar[ish.q.holat] = ishlar.getValue(ish.q.holat) + 1; jami += 1 }
    val top = bolimlar.filter { it.otaId == null }
    return JurnalXulosa(ishlar, jami, top.size, top.count { bolimTugadimi(it) })
}

class ObyektUlushi(val ulush: Double?, val usul: String?)

/**
 * Object completion: the WEIGHTED average of the top sections' shares: all sections' smeta sums known (> 0) -> by smeta sum (method "summa"); otherwise by the
 * number of works ("ish"). Sections with an unknown share are not counted; none left -> null.
 */
fun obyektUlushi(bolimlar: List<JurnalBolim>, smetaSumma: (Long) -> Double?): ObyektUlushi {
    val top = bolimlar.filter { it.otaId == null && it.ulush != null }
    if (top.isEmpty()) return ObyektUlushi(null, null)
    val summalar = top.map { smetaSumma(it.id) }
    val hammasi = summalar.all { it != null && it.isFinite() && it > 0 }
    fun vazn(i: Int): Double = if (hammasi) summalar[i]!! else top[i].ishSoni.toDouble()
    val w = top.indices.sumOf { vazn(it) }
    if (!(w > 0)) return ObyektUlushi(null, null)
    return ObyektUlushi(top.withIndex().sumOf { (i, b) -> vazn(i) * min(b.ulush ?: 0.0, 1.0) } / w, if (hammasi) "summa" else "ish")
}

/** "To take into F2" (server: positive row max(fakt - F2, 0), MINUS row min(fakt - F2, 0)); missing in the state -> unknown (null), not 0. */
fun f2OlishMumkin(h: JurnalHolat?): Double? = h?.f2MumkinHajm?.takeIf { it.isFinite() }

// ---------- fakt-klaviatura.ts (pure part) ----------

enum class HolatFiltr(val nom: String, val tugma: String) { Hammasi("Hammasi", "alt+1"), Kiritilgan("Kiritilganlar", "alt+2"), Boshlanmagan("Boshlanmagan", "alt+3"), Chala("Chala", "alt+4") }

/** Is the row matched by the status filter? "Kiritilganlar" = the unsaved entries frozen when the filter was switched on. */
fun holatFiltrMos(f: HolatFiltr, id: Long, holat: HolatTur, kiritilgan: Set<Long>): Boolean = when (f) {
    HolatFiltr.Hammasi -> true
    HolatFiltr.Kiritilgan -> id in kiritilgan
    HolatFiltr.Boshlanmagan -> holat == HolatTur.Yangi
    HolatFiltr.Chala -> holat == HolatTur.Qisman
}

/** The next / previous search match index (cyclic). [moslar] ascending; [joriy] null -> forward the first, backward the last. */
fun keyingiMoslik(moslar: List<Int>, joriy: Int?, yon: Int): Int? {
    if (moslar.isEmpty()) return null
    if (joriy == null) return if (yon > 0) moslar.first() else moslar.last()
    if (yon > 0) return moslar.firstOrNull { it > joriy } ?: moslar.first()
    return moslar.lastOrNull { it < joriy } ?: moslar.last()
}
