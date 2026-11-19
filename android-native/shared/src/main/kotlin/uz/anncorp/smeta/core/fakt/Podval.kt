package uz.anncorp.smeta.core.fakt

import uz.anncorp.smeta.core.fakt.PodvalTexts.Koef

/*
 * Port of frontend/src/lib/hisob-yadro/podval.ts + nds.ts: the ONE definition of the markup cascade ("podval") and its evaluator. Every row relies only on
 * the rows above it; every step is ROUND 2 (Excel-exact). A percentage comes ONLY from the podval: an unset one is null ("unknown"), never a silent 0.
 * Russian document texts / coefficient codes are in the generated PodvalTexts.kt.
 */

// ---------- nds.ts ----------

/** The legal default VAT rate lives ONLY here; the core never applies it by itself (an unknown rate -> VAT = null). */
const val NDS_SUKUT_FOIZ = 12.0

/** VAT amount = ROUND(base x rate/100, 2); unknown base or rate -> null. */
fun qqsSumma(asos: Double?, foiz: Double?): Double? = if (asos == null || foiz == null || !asos.isFinite() || !foiz.isFinite()) null else yaxlit2(asos * foiz / 100)

/** With VAT = base + ROUND(base x rate/100, 2). */
fun qqsBilan(asos: Double?, foiz: Double?): Double? { val q = qqsSumma(asos, foiz); return if (q == null || asos == null) null else yaxlit2(asos + q) }

/** A valid rate (0 <= rate < 100) or null. */
fun ndsFoizTozala(x: Double?): Double? = if (x != null && x.isFinite() && x >= 0 && x < 100) x else null

// ---------- podval.ts ----------

sealed interface PodvalHad { val k: Double }
data class KatHad(val kat: Kat, override val k: Double = 1.0) : PodvalHad
data class QatorHad(val qator: String, override val k: Double = 1.0) : PodvalHad

enum class PodvalTur { Foiz, Summa, Jami }

data class PodvalQator(
    val kod: String, val nom: String, val tur: PodvalTur,
    /** `Foiz`: the percentage (e.g. 2.5); null = unknown. */
    val foiz: Double? = null,
    /** `Foiz` and `Jami`: base terms. */
    val baza: List<PodvalHad>? = null,
    /** `Summa`: the fixed amount; null = unknown. */
    val summa: Double? = null,
    val koefKod: String? = null,
    /** `smeta` = the percentage is proven by the estimate document; `meros` = inherited (contract / default). */
    val manba: String? = null,
    /** Rows AFTER the grand total (customer's costs): `qoshiladi` (default) / `ayiriladi` / `korsatish`. */
    val amal: String? = null,
    val merosIzoh: String? = null,
)

data class Podval(val qatorlar: List<PodvalQator>, val nom: String? = null)

private fun foizOl(nk: Map<String, Double?>?, kod: String): Double? = nk?.get(kod)?.takeIf { it.isFinite() }

private fun K(kat: Kat, k: Double = 1.0): PodvalHad = KatHad(kat, k)
private fun Q(qator: String, k: Double = 1.0): PodvalHad = QatorHad(qator, k)

/** The standard cascade (server `t2_nakrutka_hisobla_v1` order) as a podval. A missing percentage is null (unknown). */
fun standartPodval(nk: Map<String, Double?>?): Podval {
    fun nom(kod: String) = PodvalTexts.nom.getValue(kod)
    fun q(kod: String, koefKod: String, baza: List<PodvalHad>) = PodvalQator(kod, nom(kod), PodvalTur.Foiz, foizOl(nk, koefKod), baza, koefKod = koefKod)
    fun j(kod: String, baza: List<PodvalHad>) = PodvalQator(kod, nom(kod), PodvalTur.Jami, baza = baza)
    return Podval(
        nom = PodvalTexts.STANDART,
        qatorlar = listOf(
            j("pryamye", Kat.entries.map { K(it) }),
            q("tr_mat", Koef.TRANSPORT_MATERIAL, listOf(K(Kat.MAT), K(Kat.MK), K(Kat.BEZ))),
            q("skl_mat", Koef.SKLADSKIE_MATERIAL, listOf(K(Kat.MAT), K(Kat.KAB))),
            q("skl_mk", Koef.SKLADSKIE_MK, listOf(K(Kat.MK))),
            q("tr_kab", Koef.TRANSPORT_KABEL, listOf(K(Kat.KAB))),
            j("itogo1", listOf(Q("pryamye"), K(Kat.OB, -1.0), Q("tr_mat"), Q("skl_mat"), Q("skl_mk"), Q("tr_kab"))),
            q("prochie", Koef.PROCHIE_PODRYADCHIK, listOf(Q("itogo1"))),
            j("itogo2", listOf(Q("itogo1"), Q("prochie"))),
            q("tr_ob", Koef.TRANSPORT_OBORUD, listOf(K(Kat.OB))),
            q("zag_ob", Koef.ZAGOT_SKLAD_OBORUD, listOf(K(Kat.OB))),
            j("itogo3", listOf(Q("itogo2"), K(Kat.OB), Q("tr_ob"), Q("zag_ob"))),
            q("strax", Koef.STRAXOVANIE, listOf(Q("itogo3"))),
            q("risk", Koef.RISK, listOf(Q("itogo3"))),
            j("itogo4", listOf(Q("itogo3"), Q("strax"), Q("risk"))),
            q("nds", Koef.NDS, listOf(Q("itogo4"))),
            j("vsego", listOf(Q("itogo4"), Q("nds"))),
        ),
    )
}

/**
 * SERVER INHERITANCE mode: server coefficients = default <- company <- contract <- the estimate's podval (only `manba = smeta` percentage rows).
 * The same: `smeta` rows stay; the other `koefKod` percentage rows take the value from [nk] (missing -> null). A caller can never replace a podval percentage otherwise.
 */
fun serverMerosKoefQoy(p: Podval, nk: Map<String, Double?>?, nkManba: String? = null): Podval {
    val izoh = PodvalTexts.merosIzoh[nkManba ?: ""] ?: PodvalTexts.MEROS_DEFAULT
    return p.copy(qatorlar = p.qatorlar.map { q -> if (q.koefKod != null && q.tur == PodvalTur.Foiz && q.manba != "smeta") q.copy(foiz = foizOl(nk, q.koefKod), manba = "meros", merosIzoh = "% $izoh") else q })
}

class PodvalNatija(
    /** Every row's value (null = unknown: percentage / sum not entered, or relying on an unknown). */
    val qiymat: Map<String, Double?>, val vsego: Double?, val vsegoKod: String, val nomalum: List<String>,
)

/** The grand-total row: the `vsego` row, else the last one. Rows AFTER it are the customer's costs. Customer rows without a `vsego` code -> null (explicit error). */
fun podvalVsegoKodi(p: Podval): String? {
    if (p.qatorlar.any { it.kod == "vsego" }) return "vsego"
    if (p.qatorlar.any { it.amal != null }) return null
    return p.qatorlar.lastOrNull()?.kod
}

class PodvalRejim(
    /** Every step ROUND 2 (default true); false only for the linear coefficient. */
    val yaxlit: Boolean = true,
    /** Are the fixed sums added (default true; false from the 2nd column of a multi-column document). */
    val summaQosh: Boolean = true,
    /** After a row is computed, replace its value (cascade: additions to ITOGO-4 / NDS / VSEGO; later rows use this value). */
    val almashtir: Map<String, Double?>? = null,
)

/** The ONE cascade evaluator. No category sum -> 0 so'm (not a percent). */
fun podvalBahola(p: Podval, s: Map<Kat, Double>, r: PodvalRejim = PodvalRejim()): PodvalNatija {
    val yax: (Double) -> Double = if (r.yaxlit) ::yaxlit2 else { v -> v }
    val qiymat = LinkedHashMap<String, Double?>()
    val nomalum = ArrayList<String>()
    fun had(h: PodvalHad): Double? {
        val v = when (h) { is KatHad -> s[h.kat] ?: 0.0; is QatorHad -> qiymat[h.qator] }
        return if (v == null) null else v * h.k
    }
    fun yig(b: List<PodvalHad>?): Double? { var t = 0.0; for (h in b.orEmpty()) { val v = had(h) ?: return null; t += v }; return t }
    for (q in p.qatorlar) {
        var v: Double?
        when (q.tur) {
            PodvalTur.Summa -> v = if (r.summaQosh) (q.summa?.let { yax(it) }) else 0.0
            PodvalTur.Jami -> { val b = yig(q.baza); v = if (b == null) null else yax(b) }
            PodvalTur.Foiz -> {
                // Base exactly 0 -> 0 even with an unknown percentage (mathematically exact, not a guess).
                val b = yig(q.baza)
                val f = q.foiz?.takeIf { it.isFinite() }
                v = if (b == null) null else if (b == 0.0) 0.0 else if (f == null) null else yax(b * f / 100)
            }
        }
        if (r.almashtir != null && r.almashtir.containsKey(q.kod)) v = r.almashtir[q.kod]
        qiymat[q.kod] = v
        if (v == null) nomalum.add(q.kod)
    }
    val vsegoKod = podvalVsegoKodi(p) ?: ""
    if (vsegoKod.isEmpty()) nomalum.add("vsego")
    return PodvalNatija(qiymat, if (vsegoKod.isNotEmpty()) qiymat[vsegoKod] else null, vsegoKod, nomalum)
}

/** Category coefficients (linear part, no rounding, no sum rows). Unknown percentage -> null. */
fun podvalKf(p: Podval): Map<Kat, Double?> = Kat.entries.associateWith { kat -> podvalBahola(p, mapOf(kat to 1.0), PodvalRejim(yaxlit = false, summaQosh = false)).vsego }

/** VAT percentage from the podval's `nds` percentage row; no row or not entered -> null. */
fun podvalNdsFoizi(p: Podval?): Double? = p?.qatorlar?.firstOrNull { it.kod == "nds" && it.tur == PodvalTur.Foiz }?.foiz?.takeIf { it.isFinite() }

/** The given podval, else the standard one from the coefficients; neither -> null. */
fun podvalAniqla(podval: Podval?, koef: Map<String, Double?>?): Podval? = podval ?: if (!koef.isNullOrEmpty()) standartPodval(koef) else null
