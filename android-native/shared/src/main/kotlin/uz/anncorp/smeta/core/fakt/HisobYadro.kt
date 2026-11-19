package uz.anncorp.smeta.core.fakt

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.floor

/*
 * Port of the parts of frontend/src/lib/hisob-yadro (files) that the fakt journal sums use: yaxlit.ts (ROUND 2), kategoriya.ts (cost-category cut),
 * yaxlit-svod.ts (round-sum svod), korinish.ts (faktSummaF2Narxda, yaxlitQoldiqF2). The kaskad / podval / nds (ustamali) part is NOT here yet.
 * Same rounding, same null rules (unknown is null, never 0).
 */

private fun fin(x: Double?): Boolean = x != null && x.isFinite()
private fun son2(x: Double?): Double? = if (x == null || !x.isFinite()) null else x

// ---------- yaxlit.ts ----------

/** The ONE money rounding: Excel ROUND(x;2) - half away from zero, symmetric, immune to binary error (cleaned to 15 significant digits: 1.005 -> 1.01, -2.675 -> -2.68). */
fun yaxlit2(x: Double): Double {
    if (!x.isFinite()) return x
    val a = BigDecimal(abs(x) * 100).round(MathContext(15, RoundingMode.HALF_UP)).toDouble()   // JS Number((|x|*100).toPrecision(15))
    val r = floor(a + 0.5) / 100                                                               // JS Math.round(a) / 100
    if (r == 0.0) return 0.0
    return if (x < 0) -r else r
}

fun yaxlit2N(x: Double?): Double? = if (!fin(x)) null else yaxlit2(x!!)

/** Row sum = ROUND(volume x price, 2); volume or price unknown -> null. */
fun qatorSumma(hajm: Double?, narx: Double?): Double? = if (!fin(hajm) || !fin(narx)) null else yaxlit2(hajm!! * narx!!)

/** Sum (ROUND 2); nulls are skipped ("sums are always visible"). */
fun yigindi2(xs: Iterable<Double?>): Double { var t = 0.0; for (x in xs) if (fin(x)) t += x!!; return yaxlit2(t) }
fun yigindi2(vararg xs: Double?): Double = yigindi2(xs.asIterable())

/** Strict sum: any unknown -> null (NULL is not 0). Empty -> 0. */
fun yigindi2Qatiy(xs: Iterable<Double?>): Double? { var t = 0.0; for (x in xs) { if (!fin(x)) return null; t += x!! }; return yaxlit2(t) }

/** Difference (ROUND 2) only when both are known. */
fun ayirma2(a: Double?, b: Double?): Double? = if (a == null || b == null) null else yaxlit2(a - b)

// ---------- kategoriya.ts ----------

enum class Kat(val kod: String) {
    CHEL("ЧЕЛ"), MASH("МАШ"), MAT("МАТ"), OB("ОБ"), KAB("КАБ"), MK("М/К"), BEZ("БЕЗ СКЛАД"),
}

private val bezSklad = setOf("БЕЗСКЛАД", "БЕЗ_СКЛАД", "BEZ_SKLAD")
private val boshliq = Regex("\\s+")

/** Text -> category; unknown / empty -> null (no guessing). */
fun katAniqla(kat: String?): Kat? {
    val k = (kat ?: "").trim().uppercase().replace(boshliq, " ")
    if (k in bezSklad) return Kat.BEZ
    return Kat.entries.firstOrNull { it.kod == k }
}

/** In an approved F2 the contractor's OWN labour (CHEL / MASH) inside a svod section is NOT a round sum: it is an ordinary category with the estimate's own markup. */
fun f2YaxlitdanChiqadi(kat: String?): Boolean { val k = katAniqla(kat); return k == Kat.CHEL || k == Kat.MASH }

class YaxlitQism(val qqssiz: Double, val barglar: Double, val svodQqsBilan: Double? = null, val svodQqssiz: Double? = null)

/** Category cut: exact category sums + unknown part + round (svod) part. */
class Kesim(
    var summalar: MutableMap<Kat, Double> = LinkedHashMap(), var nomalum: Double = 0.0, var nomalumSoni: Int = 0, var summasizSoni: Int = 0,
    var yaxlit: YaxlitQism? = null, var yaxlitQator: Double? = null,
) {
    fun copy(): Kesim = Kesim(LinkedHashMap(summalar), nomalum, nomalumSoni, summasizSoni, yaxlit, yaxlitQator)
}

fun bosKesim() = Kesim()

fun kesimgaQosh(k: Kesim, kat: String?, summa: Double?, yaxlitmi: Boolean = false): Kesim {
    if (!fin(summa)) { k.summasizSoni++; return k }
    if (yaxlitmi) { k.yaxlitQator = (k.yaxlitQator ?: 0.0) + summa!!; return k }
    val nk = katAniqla(kat)
    if (nk == null) { k.nomalum += summa!!; k.nomalumSoni++; return k }
    k.summalar[nk] = (k.summalar[nk] ?: 0.0) + summa!!
    return k
}

fun <T> kesimYigish(qatorlar: Iterable<T>, kat: (T) -> String?, summa: (T) -> Double?, yaxlitmi: ((T) -> Boolean)? = null): Kesim {
    val k = bosKesim()
    for (q in qatorlar) kesimgaQosh(k, kat(q), summa(q), yaxlitmi?.invoke(q) ?: false)
    return k
}

/** Copy of the cut + the unknown-category difference (nothing added when ~0). */
fun kesimNomalumBilan(k: Kesim, farq: Double?): Kesim {
    val n = k.copy()
    if (farq != null && farq.isFinite() && abs(farq) >= 0.005) { n.nomalum += farq; n.nomalumSoni += 1 }
    return n
}

/** Exact categories total (the direct cost the markup applies to). */
fun katJami(s: Map<Kat, Double>): Double = Kat.entries.fold(0.0) { t, k -> t + (s[k] ?: 0.0) }

// ---------- yaxlit-svod.ts ----------

fun yaxlitMasshtab(yaxlit: Double?, bolalarSumma: Double?): Double? = if (yaxlit == null || bolalarSumma == null || abs(bolalarSumma) < 1e-9) null else yaxlit / bolalarSumma

/** View value of a round-sum section = round x (view children / smeta children). F2 view is not scaled (see korinish). */
fun yaxlitKorinish(yaxlit: Double?, smetaBolalar: Double?, korinishBolalar: Double?): Double? {
    val k = yaxlitMasshtab(yaxlit, smetaBolalar)
    return if (k == null || korinishBolalar == null) null else yaxlit2(korinishBolalar * k)
}

/** Round row "to pay" (QQS bilan): no markup, only VAT: x (1 + rate/100). */
fun yaxlitKOplate(summa: Double?, ndsFoiz: Double?): Double? = if (summa == null || ndsFoiz == null || !summa.isFinite()) null else yaxlit2(summa * (1 + ndsFoiz / 100))

/** Svod (round) section remainder for F2 = round - F2 EXACTLY (F2 is not scaled). */
fun yaxlitQoldiqF2(yaxlit: Double?, f2Jami: Double?): Double? = if (!fin(yaxlit)) null else yaxlit2(yaxlit!! - (son2(f2Jami) ?: 0.0))

// ---------- korinish.ts ----------

/** `manba`: "f2" (approved F2 price) or "fakt" (ordinary fakt sum). */
data class FaktSummaNatija(val summa: Double?, val manba: String, val narx: Double?)

/**
 * PRICE RULE (owner, single): fakt VOLUME as written (nothing is subtracted for F2; fakt < F2 is normal). A row with approved F2: fakt SUM at the F2
 * unit price = ROUND(fakt x F2sum / F2vol, 2). F2 sum unknown -> not invented (null); `f2SummaYoq` > 0 -> fakt sum as before. No F2 -> ordinary fakt sum.
 */
fun faktSummaF2Narxda(faktHajm: Double?, f2Hajm: Double?, f2Summa: Double?, faktSummaAsl: Double?, f2SummaYoq: Double? = null): FaktSummaNatija {
    val fk = son2(faktHajm); val f2h = son2(f2Hajm); val f2s = son2(f2Summa)
    if (f2h == null || f2h == 0.0) return FaktSummaNatija(son2(faktSummaAsl), "fakt", null)
    if (f2SummaYoq != null && f2SummaYoq > 0) return FaktSummaNatija(son2(faktSummaAsl), "fakt", null)
    if (f2s == null) return FaktSummaNatija(null, "f2", null)
    return FaktSummaNatija(if (fk == null) null else yaxlit2((fk * f2s) / f2h), "f2", f2s / f2h)
}
