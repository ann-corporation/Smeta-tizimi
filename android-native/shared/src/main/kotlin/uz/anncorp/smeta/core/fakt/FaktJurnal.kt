package uz.anncorp.smeta.core.fakt

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.min

/*
 * Port of frontend/src/lib/fakt-jurnal.ts (core: journal model, input parsing, the +/= delta package) with the pieces of
 * lib/zamena-qoldiq.ts (`ochiqQoldiq`) and lib/hisob-yadro/korinish.ts (`hajmMasshtab`) it needs. SAME rules, same order, same rounding.
 * Parity tests: FaktJurnalParityTest ports the site's fakt-jurnal.test.ts / .formula.test.ts / .son.test.ts fixtures.
 * NOT here yet (next PRs): bolimSummalari / nakopitelniyMoslik / bolimMaxraji (sum cuts, svod).
 */

/** A row of the estimate tree (t2_qator) - only the fields the journal reads. */
data class T2Qator(
    val id: Long, val otaId: Long? = null, val daraja: Int? = 0, val tur: String? = null, val kod: String? = null, val nom: String? = null,
    val birlik: String? = null, val hajm: Double? = null, val kat: String? = null, val qoshimcha: Boolean = false, val zamena: Boolean = false,
    val versiya: Int = 1, val norma: Double? = null,
)

/** t2_qator_holat (what the server says about a row). */
data class JurnalHolat(
    val qatorId: Long, val smetaHajm: Double? = null, val faktHajm: Double? = null, val faktManbasi: String? = null,
    val smetaSumma: Double? = null, val faktSumma: Double? = null, val f2MumkinHajm: Double? = null, val f2Hajm: Double? = null,
    val smetaNarx: Double? = null, val f2Narx: Double? = null, val almashtirilganHajm: Double? = null, val qoldiqHajm: Double? = null,
    val f2Summa: Double? = null, val qoldiqSumma: Double? = null, val f2SummaYoq: Double? = null,
)

/** Replacement links (read separately): replacement row -> original row; original -> volume covered by replacements. */
data class ZamenaBoglanish(val almashtiradi: Map<Long, Long>, val almashtirilgan: Map<Long, Double>)

enum class Rejim(val belgi: Char) { Plus('+'), Teng('=') }
data class Kiritma(val rejim: Rejim, val qiymat: String)

enum class HolatTur { Yangi, Qisman, Tugadi, Oshdi, Smetasiz }

data class JurnalQator(
    val id: Long, val tur: String, val kod: String?, val nom: String, val birlik: String?, val smeta: Double?, val fakt: Double,
    /** OPEN remainder (fakt mode) = smeta - fakt - replaced - not-done; no smeta -> null. */
    val qoldiq: Double?, val f2Mumkin: Double,
    val bajarilmaydi: Double?, val ulush: Double?, val holat: HolatTur, val norma: Double?, val qoshimcha: Boolean, val zamena: Boolean,
    val otaId: Long?, val otaVersiya: Int?, val kat: String?, val almashtiradi: Long?, val aslNom: String?, val almashtirilgan: Double?,
)

data class JurnalIsh(val q: JurnalQator, val resurslar: List<JurnalQator>, val avtomatik: List<JurnalQator>) { val id: Long get() = q.id }
data class JurnalBolim(val id: Long, val otaId: Long?, val daraja: Int, val nom: String, val versiya: Int, val ulush: Double?, val ishSoni: Int, val tugaganSoni: Int)
data class JurnalModel(val bolimlar: List<JurnalBolim>, val bolimIshlari: Map<Long, List<JurnalIsh>>, val ildizIshlari: List<JurnalIsh>)

// ---------- hisob-yadro / zamena-qoldiq pieces ----------

private fun son(v: Double?): Double? = if (v == null || !v.isFinite()) null else v
private fun yaxlit(x: Double): Double = floor(x * 1e6 + 0.5) / 1e6          // JS Math.round(x * 1e6) / 1e6

/** Volume x share, up to 6 decimals; unknown -> null (hisob-yadro `hajmMasshtab`). */
fun hajmMasshtab(hajm: Double?, ulush: Double?): Double? =
    if (hajm == null || ulush == null || !hajm.isFinite() || !ulush.isFinite()) null else floor(hajm * ulush * 1e6 + 0.5) / 1e6

enum class QoldiqRejim { Fakt, F2 }
data class QoldiqKirish(val smeta: Double?, val fakt: Double? = null, val f2: Double? = null, val almashtirilgan: Double? = null, val bajarilmaydi: Double? = null)

/**
 * The ONE open-remainder formula (`ochiqQoldiq`): fakt mode open = smeta - fakt - replaced - not-done; F2 mode = smeta - F2 - replaced.
 * Smeta NULL -> NULL (not 0). In a deduction row (negative smeta) the closed volumes are subtracted with the smeta's sign.
 */
fun ochiqQoldiq(k: QoldiqKirish, rejim: QoldiqRejim = QoldiqRejim.Fakt): Double? {
    val smeta = k.smeta ?: return null
    if (!smeta.isFinite()) return null
    val bajarilgan = if (rejim == QoldiqRejim.Fakt) (k.fakt ?: 0.0) else (k.f2 ?: 0.0)
    val yopiq = (k.almashtirilgan ?: 0.0) + (if (rejim == QoldiqRejim.Fakt) (k.bajarilmaydi ?: 0.0) else 0.0)
    return smeta - bajarilgan - (if (smeta < 0) -yopiq else yopiq)
}

// ---------- journal model ----------

fun holatTur(smeta: Double?, fakt: Double): HolatTur {
    // Deduction work (negative plan): by absolute value.
    if (smeta != null && smeta < 0) return holatTur(-smeta, -fakt)
    if (smeta == null || smeta <= 0) return if (fakt > 0) HolatTur.Smetasiz else HolatTur.Yangi
    if (fakt <= 0) return HolatTur.Yangi
    if (fakt > smeta + 1e-9) return HolatTur.Oshdi
    if (fakt >= smeta - 1e-9) return HolatTur.Tugadi
    return HolatTur.Qisman
}

private fun qatorQur(r: T2Qator, h: JurnalHolat?, byId: Map<Long, T2Qator>, zb: ZamenaBoglanish?, baj: Map<Long, Double>?): JurnalQator {
    val smeta = son(h?.smetaHajm) ?: son(r.hajm)
    val fakt = son(h?.faktHajm) ?: 0.0
    val ota = r.otaId?.let { byId[it] }
    val aslId = if (r.zamena) zb?.almashtiradi?.get(r.id) else null
    val asl = aslId?.let { byId[it] }
    val alm = son(h?.almashtirilganHajm) ?: zb?.almashtirilgan?.get(r.id)
    val bj = baj?.get(r.id)
    val ochiq = ochiqQoldiq(QoldiqKirish(smeta, fakt, null, if (alm != null && alm > 0) alm else null, bj), QoldiqRejim.Fakt)
    return JurnalQator(
        id = r.id, tur = r.tur ?: "", kod = r.kod, nom = r.nom?.takeIf { it.isNotEmpty() } ?: "Nomsiz", birlik = r.birlik,
        smeta = smeta, fakt = fakt, qoldiq = ochiq?.let { yaxlit(it) }, f2Mumkin = son(h?.f2MumkinHajm) ?: 0.0,
        bajarilmaydi = if (bj != null && bj > 0) bj else null,
        ulush = if (smeta != null && smeta != 0.0) fakt / smeta else null, holat = holatTur(smeta, fakt), norma = son(r.norma),
        qoshimcha = r.qoshimcha && !r.zamena, zamena = r.zamena, otaId = r.otaId, otaVersiya = ota?.versiya,
        kat = r.kat?.trim()?.takeIf { it.isNotEmpty() },
        almashtiradi = aslId, aslNom = asl?.let { listOfNotNull(it.kod?.takeIf { s -> s.isNotEmpty() }, it.nom?.takeIf { s -> s.isNotEmpty() }).joinToString(" ").ifEmpty { null } },
        almashtirilgan = if (alm != null && alm > 0) alm else null,
    )
}

/** Puts a replacement row right AFTER its original (when the original is in the list); the rest keeps its order; nothing is ever lost. */
fun <T> zamenaTartibla(arr: List<T>, id: (T) -> Long, almashtiradi: (T) -> Long?): List<T> {
    val ids = arr.map(id).toSet()
    val ergashuvchi = LinkedHashMap<Long, MutableList<T>>()
    for (x in arr) { val a = almashtiradi(x); if (a != null && a != id(x) && a in ids) ergashuvchi.getOrPut(a) { ArrayList() }.add(x) }
    val out = ArrayList<T>(); val qoyildi = HashSet<Long>()
    fun qoy(x: T) { if (!qoyildi.add(id(x))) return; out.add(x); for (z in ergashuvchi[id(x)].orEmpty()) qoy(z) }
    for (x in arr) { val a = almashtiradi(x); if (!(a != null && a in ids && a != id(x))) qoy(x) }
    for (x in arr) qoy(x)   // a cyclic link still loses nothing
    return out
}

/** Journal model of an object: sections (with done-share), section -> own works, and works without a section. [baj] = active "not done" volumes. */
fun jurnalQur(rows: List<T2Qator>, states: List<JurnalHolat>, zb: ZamenaBoglanish? = null, baj: Map<Long, Double>? = null): JurnalModel {
    val byId = rows.associateBy { it.id }
    val holat = states.associateBy { it.qatorId }
    val bolalar = LinkedHashMap<Long?, MutableList<T2Qator>>()
    for (r in rows) bolalar.getOrPut(r.otaId) { ArrayList() }.add(r)
    fun qq(c: T2Qator) = qatorQur(c, holat[c.id], byId, zb, baj)

    fun ishQur(r: T2Qator): JurnalIsh {
        val q = qq(r)
        val resurslar = ArrayList<JurnalQator>(); val avtomatik = ArrayList<JurnalQator>()
        fun yur(ota: Long) {
            for (c in bolalar[ota].orEmpty()) {
                if (c.tur == "mat" || c.tur == "ob") resurslar.add(qq(c)) else if (c.tur == "rs") avtomatik.add(qq(c))
                if (c.tur != "bl") yur(c.id)
            }
        }
        yur(r.id)
        return JurnalIsh(q, zamenaTartibla(resurslar, { it.id }, { it.almashtiradi }), zamenaTartibla(avtomatik, { it.id }, { it.almashtiradi }))
    }
    fun mustaqil(c: T2Qator) = JurnalIsh(qq(c), emptyList(), emptyList())

    val bolimIshlari = LinkedHashMap<Long, List<JurnalIsh>>()
    for (r in rows) {
        if (r.tur != "rz") continue
        val ishlar = ArrayList<JurnalIsh>()
        for (c in bolalar[r.id].orEmpty()) { if (c.tur == "bl") ishlar.add(ishQur(c)) else if (c.tur == "mat" || c.tur == "ob") ishlar.add(mustaqil(c)) }
        bolimIshlari[r.id] = zamenaTartibla(ishlar, { it.id }, { it.q.almashtiradi })
    }
    // Works without a section and stand-alone mat/ob: not in the journal view, but marking / coverage must not skip them.
    val ildiz = ArrayList<JurnalIsh>()
    for (c in bolalar[null].orEmpty()) { if (c.tur == "bl") ildiz.add(ishQur(c)) else if (c.tur == "mat" || c.tur == "ob") ildiz.add(mustaqil(c)) }

    // Section share = each work's VOLUME completion (0..1), weighted by the work's smeta sum (works without a sum get the average weight).
    class Acc(var w: Double = 0.0, var wu: Double = 0.0, var n: Int = 0, var t: Int = 0)
    val yigindi = HashMap<Long, Acc>()
    fun hisobla(id: Long): Acc {
        yigindi[id]?.let { return it }
        val acc = Acc()
        val ishlar = bolimIshlari[id].orEmpty()
        val summalar = ishlar.map { son(holat[it.id]?.smetaSumma) }
        val ortacha = run { val m = summalar.filter { it != null && it > 0 }.map { it!! }; if (m.isNotEmpty()) m.sum() / m.size else 1.0 }
        ishlar.forEachIndexed { i, ish ->
            val u = ish.q.ulush
            if (u != null) {
                val vazn = if (summalar[i] != null && summalar[i]!! > 0) summalar[i]!! else ortacha
                acc.w += vazn; acc.wu += vazn * min(u, 1.0)
            }
            acc.n += 1; if (ish.q.holat == HolatTur.Tugadi || ish.q.holat == HolatTur.Oshdi) acc.t += 1
        }
        for (c in bolalar[id].orEmpty()) if (c.tur == "rz") { val ich = hisobla(c.id); acc.w += ich.w; acc.wu += ich.wu; acc.n += ich.n; acc.t += ich.t }
        yigindi[id] = acc
        return acc
    }
    val bolimlar = ArrayList<JurnalBolim>()
    fun tartibla(ota: Long?) {
        for (r in bolalar[ota].orEmpty()) {
            if (r.tur != "rz") continue
            val a = hisobla(r.id)
            bolimlar.add(JurnalBolim(r.id, r.otaId, r.daraja ?: 0, listOfNotNull(r.kod?.takeIf { it.isNotEmpty() }, r.nom?.takeIf { it.isNotEmpty() }).joinToString(" ").ifEmpty { "Bo‘lim" }, r.versiya, if (a.w > 0) a.wu / a.w else null, a.n, a.t))
            tartibla(r.id)
        }
    }
    tartibla(null)
    return JurnalModel(bolimlar, bolimIshlari, ildiz)
}

data class BolimBolak(val bolim: JurnalBolim, val nisbiy: Int, val ishlar: List<JurnalIsh>)

/** The chosen section and ALL its descendant sections (tree order), each with its works; branches with no works at all are dropped (the chosen one is always first). */
fun bolimTarkibi(bolimId: Long, bolimlar: List<JurnalBolim>, bolimIshlari: Map<Long, List<JurnalIsh>>): List<BolimBolak> {
    val i0 = bolimlar.indexOfFirst { it.id == bolimId }
    if (i0 < 0) return emptyList()
    val chuqur = hashMapOf(bolimId to 0)
    val out = arrayListOf(BolimBolak(bolimlar[i0], 0, bolimIshlari[bolimId].orEmpty()))
    for (b in bolimlar) {
        if (b.id == bolimId || b.otaId == null || b.otaId !in chuqur) continue
        val n = chuqur[b.otaId]!! + 1; chuqur[b.id] = n
        out.add(BolimBolak(b, n, bolimIshlari[b.id].orEmpty()))
    }
    val toliq = HashSet<Long>()
    for (i in out.indices.reversed()) {
        val x = out[i]
        if (x.ishlar.isNotEmpty() || x.bolim.id in toliq) { toliq.add(x.bolim.id); x.bolim.otaId?.let { toliq.add(it) } }
    }
    return out.filterIndexed { i, x -> i == 0 || x.bolim.id in toliq }
}

// ---------- input parsing ----------

data class SonTahlil(val son: Double?, val noaniq: Boolean)

private val sonBosh = Regex("^([+-]?\\d[\\d\\s\\u00A0'\\u2019.,]*)(.*)$", RegexOption.DOT_MATCHES_ALL)
private val birlikYozuvi = Regex("^[A-Za-z\\u0410-\\u042F\\u0430-\\u044F\\u0401\\u0451\\u040E\\u045E\\u049A\\u049B\\u0492\\u0493\\u04B2\\u04B3\\u00B2\\u00B3./\\s]+\\d?$")
private val bo = Regex("[\\s\\u00A0'\\u2019]")
private val oxirNuqta = Regex("[.,]+$")
private val yakun = Regex("^[+-]?\\d+(\\.\\d+)?$")
private val NAN = Double.NaN

/**
 * "12,35 m2" / "1 234,5" / "1.234,5" / "12 m2": number + optional unit text (dropped). Thousands separators: space / ' / dot (comma decimal) /
 * comma (dot decimal); both present -> the LAST one is the decimal. One separator + exactly 3 digits + 1-3 integer digits ("1.234") is AMBIGUOUS: not guessed.
 */
fun sonTahlil(v: String): SonTahlil {
    val bosh = v.trim()
    if (bosh.isEmpty()) return SonTahlil(null, false)
    val m = sonBosh.find(bosh) ?: return SonTahlil(NAN, false)
    val tail = m.groupValues[2].trim()
    if (tail.isNotEmpty() && !birlikYozuvi.matches(tail)) return SonTahlil(NAN, false)
    var t = m.groupValues[1].replace(bo, "").replace(oxirNuqta, "")
    val nuqta = t.count { it == '.' }; val vergul = t.count { it == ',' }
    if (nuqta > 0 && vergul > 0) {
        val oxirgi = maxOf(t.lastIndexOf('.'), t.lastIndexOf(','))
        val ming = if (t[oxirgi] == ',') '.' else ','
        val butun = t.substring(0, oxirgi); val kasr = t.substring(oxirgi + 1)
        if (butun.contains(t[oxirgi]) || kasr.isEmpty()) return SonTahlil(NAN, false)
        t = butun.split(ming).joinToString("") + "." + kasr
    } else if (nuqta + vergul > 1) {
        val bolak = t.split(if (nuqta > 0) '.' else ',')
        if (!Regex("^\\d{1,3}$").matches(bolak[0]) || !bolak.drop(1).all { Regex("^\\d{3}$").matches(it) }) return SonTahlil(NAN, false)
        t = bolak.joinToString("")
    } else if (nuqta + vergul == 1) {
        val parts = t.split(Regex("[.,]"), limit = 2)
        val butun = parts[0]; val kasr = parts.getOrElse(1) { "" }
        if (kasr.length == 3 && Regex("^[+-]?[1-9]\\d{0,2}$").matches(butun)) return SonTahlil(NAN, true)
        t = "$butun.$kasr"
    }
    return if (yakun.matches(t)) SonTahlil(t.toDouble(), false) else SonTahlil(NAN, false)
}

fun sonOqi(v: String): Double? = sonTahlil(v).son

/** "50%" / "12,5 %": percent of the smeta volume; no percent text -> null. */
fun foizOqi(v: String): Double? {
    val m = Regex("^(-?\\d+(?:\\.\\d+)?)%$").find(v.trim().replace(Regex("\\s"), "").replaceFirst(',', '.'))
    return m?.groupValues?.get(1)?.toDouble()
}

/** Result of [kiritmaSoni]: a number (possibly NaN = invalid), nothing typed, or a percent without a smeta volume. */
sealed interface KiritmaSoni {
    data class Num(val value: Double) : KiritmaSoni
    data object Bosh : KiritmaSoni
    data object Smetasiz : KiritmaSoni
}
private fun KiritmaSoni.isNaNValue() = this is KiritmaSoni.Num && value.isNaN()

/** Typed text -> number: formula (`=SMETA-FAKT`), plain number, or percent of the smeta (volume = smeta x percent, 6 decimals). */
fun kiritmaSoni(v: String, smeta: Double?, kontekst: FormulaContext? = null): KiritmaSoni {
    if (formulaMi(v)) {
        val ctx = HashMap<String, Double?>(); kontekst?.forEach { (k, x) -> ctx[k] = x }; ctx["SMETA"] = smeta
        return when (val r = numberFormula(v, ctx)) { is FormulaResult.Ok -> KiritmaSoni.Num(yaxlit(r.value)); is FormulaResult.Err -> KiritmaSoni.Num(NAN) }
    }
    val f = foizOqi(v) ?: return sonOqi(v)?.let { KiritmaSoni.Num(it) } ?: KiritmaSoni.Bosh
    if (smeta == null || !smeta.isFinite() || smeta == 0.0) return KiritmaSoni.Smetasiz
    return KiritmaSoni.Num(hajmMasshtab(smeta, f / 100)!!)
}

fun formulaXatosi(v: String, smeta: Double?, kontekst: FormulaContext? = null): FormulaError? {
    if (!formulaMi(v)) return null
    val ctx = HashMap<String, Double?>(); kontekst?.forEach { (k, x) -> ctx[k] = x }; ctx["SMETA"] = smeta
    return (numberFormula(v, ctx) as? FormulaResult.Err)?.error
}

/** Formula names of a row: SMETA, FAKT, QOLDIQ, F2_MUMKIN (unknown -> null, not 0). */
fun faktFormulaKonteksti(smeta: Double?, fakt: Double, qoldiq: Double?, f2Mumkin: Double): FormulaContext =
    mapOf("SMETA" to smeta, "FAKT" to fakt, "QOLDIQ" to qoldiq, "F2_MUMKIN" to f2Mumkin)
fun faktFormulaKonteksti(q: JurnalQator): FormulaContext = faktFormulaKonteksti(q.smeta, q.fakt, q.qoldiq, q.f2Mumkin)

enum class JurnalXato { SON_EMAS, NOANIQ, MANFIY, NOL, ISHORA, FOIZ_SMETASIZ, FORMULA_XATO }

/** Texts of the errors; the KEYS are the site's `t()` keys (translated through SiteI18n). */
val JURNAL_XATO_MATN: Map<JurnalXato, String> = mapOf(
    JurnalXato.SON_EMAS to "Son emas",
    JurnalXato.NOANIQ to "Noaniq: «1.234» ming yoki o‘nli? 1234 yoki 1,234 deb yozing (o‘nli uchun vergul, ming uchun bo‘shliq)",
    JurnalXato.MANFIY to "Jami fakt manfiy bo‘lib qoladi",
    JurnalXato.ISHORA to "Chegirma ishi: fakt smeta kabi manfiy bo‘lishi kerak",
    JurnalXato.NOL to "0 qo‘shilmaydi",
    JurnalXato.FOIZ_SMETASIZ to "Foiz uchun smeta hajmi kerak",
    JurnalXato.FORMULA_XATO to "Formula noto‘g‘ri",
)

data class FaktQatorHajm(val qatorId: Long, val hajm: Double)
data class JurnalPaket(val qatorlar: List<FaktQatorHajm>, val xatolar: Map<Long, JurnalXato>) { val ok: Boolean get() = xatolar.isEmpty() && qatorlar.isNotEmpty() }

/**
 * All typed cells -> ONE delta package: "+" -> n; "=" -> n - current fakt (unchanged rows are dropped). [faktlar] = current server values.
 * Same checks as the site: not 0 in "+", total never negative on a positive plan, never positive on a deduction row, formulas fail closed.
 */
fun jurnalPaket(
    kiritmalar: Map<Long, Kiritma>, faktlar: Map<Long, Double>, smetalar: Map<Long, Double?>? = null, kontekstlar: Map<Long, FormulaContext>? = null,
): JurnalPaket {
    val qatorlar = ArrayList<FaktQatorHajm>(); val xatolar = LinkedHashMap<Long, JurnalXato>()
    for ((id, v) in kiritmalar) {
        val joriy = faktlar[id] ?: continue
        when (val n = kiritmaSoni(v.qiymat, smetalar?.get(id), kontekstlar?.get(id))) {
            KiritmaSoni.Smetasiz -> { xatolar[id] = JurnalXato.FOIZ_SMETASIZ; continue }
            KiritmaSoni.Bosh -> continue
            is KiritmaSoni.Num -> {
                if (!n.value.isFinite()) { xatolar[id] = if (formulaMi(v.qiymat)) JurnalXato.FORMULA_XATO else if (sonTahlil(v.qiymat).noaniq) JurnalXato.NOANIQ else JurnalXato.SON_EMAS; continue }
                val delta = if (v.rejim == Rejim.Plus) n.value else yaxlit(n.value - joriy)
                if (v.rejim == Rejim.Plus && n.value == 0.0) { xatolar[id] = JurnalXato.NOL; continue }
                val manfiyReja = (smetalar?.get(id) ?: 0.0) < 0
                if (!manfiyReja && joriy + delta < -1e-9) { xatolar[id] = JurnalXato.MANFIY; continue }
                if (manfiyReja && joriy + delta > 1e-9) { xatolar[id] = JurnalXato.ISHORA; continue }
                if (delta == 0.0) continue
                qatorlar.add(FaktQatorHajm(id, delta))
            }
        }
    }
    return JurnalPaket(qatorlar, xatolar)
}

/** Open remainder left (in the smeta's sign, > 1e-9)? Unknown smeta -> true (never hidden). The "only unfinished" filter. */
fun ochiqBor(qoldiq: Double?, smeta: Double? = null): Boolean = if (qoldiq == null) true else if ((smeta ?: 0.0) < 0) qoldiq < -1e-9 else qoldiq > 1e-9

/** Share (25/50/100 %) of the OPEN remainder as the "+" value (replaced and not-done already deducted); none left -> null. */
fun qoldiqUlushi(qoldiq: Double?, smeta: Double?, foiz: Double): String? {
    if (!ochiqBor(qoldiq, smeta) || qoldiq == null) return null
    return jsNumberString(yaxlit(qoldiq * foiz / 100))
}

/** JS `String(number)` for the values this module produces (integers without ".0", otherwise shortest repr). */
fun jsNumberString(x: Double): String = if (x == floor(x) && abs(x) < 1e15) x.toLong().toString() else x.toString()
