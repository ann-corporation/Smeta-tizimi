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


// ---------- yaxlit-svod.ts (the rest) ----------

/** Section round WITHOUT VAT: from the svod amount (with VAT) and the rate; otherwise the children's sum. Unknown rate -> null. */
fun yaxlitQqssiz(svodSumma: Double?, qqsStavka: Double?, bolalarSumma: Double?): Double? {
    if (svodSumma != null && svodSumma.isFinite()) { if (qqsStavka == null || !qqsStavka.isFinite()) return null; return yaxlit2(svodSumma / (1 + qqsStavka / 100)) }
    return bolalarSumma?.let { yaxlit2(it) }
}

class IdSumma<I>(val id: I, val summa: Double?)

/** Children distributed into the round sum to the kopeck (largest remainder): sum of results == round exactly. Unknown child / zero total -> null. */
fun <I> yaxlitTaqsim(yaxlit: Double, bolalar: List<IdSumma<I>>): Map<I, Double>? {
    if (bolalar.isEmpty() || bolalar.any { it.summa == null || !it.summa.isFinite() }) return null
    val jami = bolalar.sumOf { it.summa!! }
    if (kotlin.math.abs(jami) < 1e-9) return null
    val maqsad = Math.floor(yaxlit2(yaxlit) * 100 + 0.5)                       // JS Math.round
    val xom = bolalar.map { (it.summa!! * maqsad) / jami }
    val past = xom.map { Math.floor(it + 1e-9) }.toMutableList()
    var qoldiq = (maqsad - past.sum()).toLong()
    val tartib = xom.mapIndexed { i, x -> i to (x - past[i]) }.sortedWith(Comparator { a, b -> val c = b.second.compareTo(a.second); if (c != 0) c else a.first.compareTo(b.first) })
    var j = 0
    while (qoldiq > 0 && tartib.isNotEmpty()) { past[tartib[j].first] = past[tartib[j].first] + 1; j = (j + 1) % tartib.size; qoldiq-- }
    j = 0
    while (qoldiq < 0 && tartib.isNotEmpty()) { val idx = tartib[tartib.size - 1 - j].first; past[idx] = past[idx] - 1; j = (j + 1) % tartib.size; qoldiq++ }
    val out = LinkedHashMap<I, Double>()
    bolalar.forEachIndexed { i, b -> out[b.id] = past[i] / 100 }
    return out
}

class YaxlitSvodSumma(val qqsBilan: Double?, val qqssiz: Double?, val qqs: Double?)

/** Round svod amount (after VAT): `svodSumma` is WITH VAT and FINAL; VAT = svod - without-VAT (a difference, the sum returns exactly). */
fun yaxlitSvodSumma(svodSumma: Double?, qqsStavka: Double?, bolalarSumma: Double?, ndsFoiz: Double?): YaxlitSvodSumma {
    if (svodSumma != null && svodSumma.isFinite()) {
        val qqsBilan = yaxlit2(svodSumma)
        val st = qqsStavka ?: ndsFoiz
        val qqssiz = if (st == null || !st.isFinite()) null else yaxlit2(svodSumma / (1 + st / 100))
        return YaxlitSvodSumma(qqsBilan, qqssiz, qqssiz?.let { yaxlit2(qqsBilan - it) })
    }
    if (bolalarSumma == null) return YaxlitSvodSumma(null, null, null)
    val qqssiz = yaxlit2(bolalarSumma)
    val qqsBilan = yaxlitKOplate(qqssiz, ndsFoiz)
    return YaxlitSvodSumma(qqsBilan, qqssiz, qqsBilan?.let { yaxlit2(it - qqssiz) })
}

class Yakun(val itogo4: Double?, val nds: Double?, val vsego: Double?)

/** Works result (ITOGO-4, NDS, VSEGO) + the round svod (with VAT, exact) -> header. No round -> null. */
fun yaxlitBilanYakun(itogo4: Double, nds: Double?, vsego: Double?, qqsBilan: Double?, qqssiz: Double?): Yakun? {
    if (qqsBilan == null || !qqsBilan.isFinite()) return null
    val v = if (vsego == null) null else yaxlit2(vsego + qqsBilan)
    if (qqssiz == null) return Yakun(null, null, v)
    return Yakun(yaxlit2(itogo4 + qqssiz), nds?.let { yaxlit2(it + qqsBilan - qqssiz) }, v)
}

/** Distribute `jami` over the KNOWN rows (to the kopeck); unknown rows stay out (null). All zero and jami 0 -> each 0. */
fun <I> yaxlitQatorlarga(jami: Double, qatorlar: List<IdSumma<I>>): Map<I, Double>? {
    val malum = qatorlar.filter { it.summa != null && it.summa.isFinite() }
    if (malum.isEmpty()) return null
    yaxlitTaqsim(jami, malum)?.let { return it }
    if (kotlin.math.abs(jami) < 0.005) return malum.associate { it.id to 0.0 }
    return null
}

// ---------- korinish.ts (the rest) ----------

enum class Korinish { Smeta, Fakt, F2, F2Qoralama, Qoldiq, Oy, Jamlanma }

class KorinishQator(
    val id: Long, val kat: String?, val narx: Double?, val smetaHajm: Double?, val faktHajm: Double? = null, val f2Summa: Double? = null, val f2Hajm: Double? = null,
    val f2QoralamaSumma: Double? = null, val almashtirilganSumma: Double? = null, val davrHajm: Double? = null,
)

/** Remainder = smeta - F2 - replaced (ROUND 2). Smeta unknown -> null. F2 / replaced missing -> 0. */
fun qoldiq(smeta: Double?, f2: Double?, almashtirilgan: Double? = null): Double? = if (smeta == null || !smeta.isFinite()) null else yaxlit2(smeta - (f2 ?: 0.0) - (almashtirilgan ?: 0.0))

/** A row's direct cost (no markup, no VAT) in the view. null = unknown. */
fun korinishSummasi(q: KorinishQator, k: Korinish, f2Narx: Boolean = false): Double? = when (k) {
    Korinish.Smeta -> qatorSumma(q.smetaHajm, q.narx)
    Korinish.Fakt -> if (f2Narx) faktSummaF2Narxda(q.faktHajm, q.f2Hajm, q.f2Summa, qatorSumma(q.faktHajm, q.narx)).summa else qatorSumma(q.faktHajm, q.narx)
    Korinish.F2 -> q.f2Summa
    Korinish.F2Qoralama -> q.f2QoralamaSumma
    Korinish.Qoldiq -> qoldiq(qatorSumma(q.smetaHajm, q.narx), q.f2Summa, q.almashtirilganSumma)
    Korinish.Oy, Korinish.Jamlanma -> qatorSumma(q.davrHajm, q.narx)
}

fun korinishKesim(qatorlar: Iterable<KorinishQator>, k: Korinish, f2Narx: Boolean = false, yaxlitIdlar: Set<Long>? = null): Kesim {
    val kes = bosKesim()
    val f2m = k == Korinish.F2 || k == Korinish.F2Qoralama
    for (q in qatorlar) kesimgaQosh(kes, q.kat, korinishSummasi(q, k, f2Narx), yaxlitIdlar?.contains(q.id) == true && !(f2m && f2YaxlitdanChiqadi(q.kat)))
    return kes
}

/** Excel formula of the fakt sum at the F2 price (cache = `faktSummaF2Narxda`). */
fun faktSummaF2NarxFormula(fakt: String, f2Hajm: String, f2Summa: String, asl: String): String =
    "IF(AND(ISNUMBER($f2Hajm),$f2Hajm<>0),IF(AND(ISNUMBER($f2Summa),$fakt<>\"\"),ROUND($fakt*$f2Summa/$f2Hajm,2),\"\"),$asl)"

class ServerCats(val chel: Double, val mash: Double, val mat: Double, val ob: Double, val mk: Double, val kab: Double, val bez: Double)

/** Server `cats` (mat = the WHOLE basket) -> category sums (MAT = pure material). */
fun serverCatsdan(c: ServerCats): KatSummalar = mapOf(Kat.CHEL to c.chel, Kat.MASH to c.mash, Kat.MAT to c.mat - c.kab - c.mk - c.bez, Kat.OB to c.ob, Kat.KAB to c.kab, Kat.MK to c.mk, Kat.BEZ to c.bez)

/** Server cats -> cut (+ svod round part, exact). */
fun katKesimServerdan(c: ServerCats, yaxlit: SvodYaxlit? = null): Kesim {
    val k = bosKesim()
    k.summalar = LinkedHashMap(serverCatsdan(c))
    if (yaxlit != null) k.yaxlit = svodKesimYaxlit(yaxlit)
    return k
}
