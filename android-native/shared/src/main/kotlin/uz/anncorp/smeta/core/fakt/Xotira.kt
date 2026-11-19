package uz.anncorp.smeta.core.fakt

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/*
 * Port of frontend/src/lib/xotira-fakt/{lugat,parse,moslash,tanlash,savat}.ts + the small parts of qidiruv.ts / f2-match-engine (normBir) / qurilish-lugat they use:
 * "Xotiradan fakt" - the owner writes what was done in free text (one job per line), the system finds 3-5 candidates in ALL rows of the object's estimate and the
 * chosen ones go to the fakt basket (one fakt_yoz_v2 document). Deterministic, no paid AI. Volume is never blocked: above the remainder only a mark.
 * NOT ported: the F2 matching engine's bonus (frontend `motorBonusi` -> f2MoslashV3, 1000+ lines): candidate scores here come from the text scoring only.
 */

private fun son(v: Double?): Double? = if (v == null || !v.isFinite()) null else v
private fun yaxlit6(x: Double): Double = floor(x * 1e6 + 0.5) / 1e6

// ---------- normalisers (f2-match-engine normBir, f2-moslash-v3/qidiruv) ----------

private val LAT2CYR = mapOf('A' to 'А', 'B' to 'В', 'C' to 'С', 'E' to 'Е', 'H' to 'Н', 'K' to 'К', 'M' to 'М', 'N' to 'Н', 'O' to 'О', 'P' to 'Р', 'T' to 'Т', 'V' to 'В', 'X' to 'Х', 'Y' to 'У')
private fun lat2Cyr(s: String): String = buildString { for (ch in s) append(LAT2CYR[ch] ?: ch) }

private fun birSinonim(b: String): String {
    Regex("^(\\d*)(ТНКМ|ТКМ|ТОННОКМ|ТОННОКИЛОМЕТР|ТОННОКИЛОМЕТРЫ)$").find(b)?.let { return it.groupValues[1] + "ТКМ" }
    Regex("^(\\d*)(КТ|КОМПТ|КОМПЛ|КОМПЛЕКТ|КОМПЛЕКТА|КОМПЛЕКТОВ)$").find(b)?.let { return it.groupValues[1] + "КОМПЛ" }
    Regex("^(\\d*)(ПМ|ПОГМ|ПОГОННЫЙМЕТР|ПОГОННЫХМЕТРОВ|МЕТР|МЕТРА|МЕТРОВ)$").find(b)?.let { return it.groupValues[1] + "М" }
    Regex("^(\\d*М[23])([А-Я]{3,})$").find(b)?.let { return it.groupValues[1] }
    return b
}

/** Unit key: м³ / m3 / М.3 fold to the same value. */
fun normBir(s: String?): String {
    val raw = (s ?: "").uppercase().replace("³", "3").replace("²", "2").replace("¹", "1").replace("Ё", "Е").replace(Regex("[\\s.,\\-/·•]+"), "")
    return birSinonim(lat2Cyr(raw))
}

private val LOTIN_KIRILL = mapOf('A' to 'А', 'B' to 'В', 'C' to 'С', 'E' to 'Е', 'H' to 'Н', 'K' to 'К', 'M' to 'М', 'O' to 'О', 'P' to 'Р', 'T' to 'Т', 'X' to 'Х', 'Y' to 'У', 'Ё' to 'Е')
private val WS = "[\\s\\u00a0\\ufeff\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]"

fun qidiruvNormal(s: String): String =
    buildString { for (c in s.uppercase()) append(LOTIN_KIRILL[c] ?: c) }.replace(Regex("$WS+"), " ").trim()

private val TRANSLIT = listOf(
    "SHCH" to "Щ", "SH" to "Ш", "CH" to "Ч", "ZH" to "Ж", "KH" to "Х", "TS" to "Ц", "YU" to "Ю", "YA" to "Я", "YO" to "Е",
    "A" to "А", "B" to "Б", "V" to "В", "G" to "Г", "D" to "Д", "E" to "Е", "Z" to "З", "I" to "И", "J" to "Ж", "K" to "К", "L" to "Л",
    "M" to "М", "N" to "Н", "O" to "О", "P" to "П", "R" to "Р", "S" to "С", "T" to "Т", "U" to "У", "F" to "Ф", "H" to "Х",
    "C" to "Ц", "Y" to "Ы", "X" to "КС", "W" to "В", "Q" to "К",
)
fun qidiruvTranslit(soz: String): String {
    val out = StringBuilder(); var i = 0
    while (i < soz.length) {
        val m = TRANSLIT.firstOrNull { soz.startsWith(it.first, i) }
        if (m != null) { out.append(m.second); i += m.first.length } else { out.append(soz[i]); i += 1 }
    }
    return out.toString()
}

// ---------- qurilish lugat (only lugatKengaytir) ----------

private val APOS = Regex("[ʻʼ’‘`´']")
private fun lugatFold(s: String) = s.lowercase().replace(APOS, "").replace("ё", "е").replace("ғ", "г").replace("ў", "у").replace("қ", "к").replace("ҳ", "х")

private val RU_LAT = mapOf(
    'а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ж' to "j", 'з' to "z", 'и' to "i", 'й' to "y", 'к' to "k", 'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o", 'п' to "p", 'р' to "r",
    'с' to "s", 'т' to "t", 'у' to "u", 'ф' to "f", 'х' to "x", 'ц' to "ts", 'ч' to "ch", 'ш' to "sh", 'щ' to "sh", 'ъ' to "", 'ы' to "i", 'ь' to "", 'э' to "e", 'ю' to "yu", 'я' to "ya",
)
private fun ruLotin(s: String) = buildString { for (c in s) append(RU_LAT[c] ?: c.toString()) }

private val KIR_IKKI = listOf("o'" to "ў", "g'" to "ғ", "sh" to "ш", "ch" to "ч", "yo" to "ё", "yu" to "ю", "ya" to "я", "ye" to "е", "ts" to "ц", "ng" to "нг")
private val KIR_BIR = mapOf(
    'a' to "а", 'b' to "б", 'd' to "д", 'e' to "е", 'f' to "ф", 'g' to "г", 'h' to "ҳ", 'i' to "и", 'j' to "ж", 'k' to "к", 'l' to "л", 'm' to "м", 'n' to "н", 'o' to "о", 'p' to "п", 'q' to "қ", 'r' to "р",
    's' to "с", 't' to "т", 'u' to "у", 'v' to "в", 'x' to "х", 'y' to "й", 'z' to "з", 'c' to "с", 'w' to "в",
)

/** Uzbek Latin -> Cyrillic (with ғ, ў, қ, ҳ). Capitalisation kept. */
internal fun uzKirill(s: String): String {
    val t = s.replace(Regex("[ʻʼ’‘`´]"), "'")
    val out = StringBuilder(); var soz0 = true; var i = 0
    while (i < t.length) {
        val low = t.substring(i, min(i + 2, t.length)).lowercase()
        val ikki = KIR_IKKI.firstOrNull { it.first == low }
        val asl = if (ikki != null) t.substring(i, i + 2) else t[i].toString()
        val katta = asl != asl.lowercase()
        val hammaKatta = asl.length > 1 && asl == asl.uppercase()
        val p: String
        if (ikki != null) { p = ikki.second; i += 2 }
        else { val c = t[i].lowercaseChar(); p = if (c == 'e' && soz0) "э" else KIR_BIR[c] ?: (if (c == '\'') "" else t[i].toString()); i += 1 }
        out.append(if (hammaKatta) p.uppercase() else if (katta) p.take(1).uppercase() + p.drop(1) else p)
        soz0 = !Regex("[a-zа-я]", RegexOption.IGNORE_CASE).containsMatchIn(asl)
    }
    return out.toString()
}

private class Term(val t: String, val ex: Boolean)
private class Tushuncha(val terms: List<Term>, val ruTermlar: List<String>)
private val UMUMIY_SOZ = setOf("quyish", "yotqizish", "tayyorlash", "toqish", "boglash", "qilish", "taminoti")
private fun sozlarga(s: String): List<String> = lugatFold(s).split(Regex("[^a-zа-я0-9]+")).filter { it.isNotEmpty() }

private val LUGAT_INDEKS: List<Tushuncha> by lazy {
    QURILISH_LUGAT.map { y ->
        val terms = LinkedHashMap<String, Boolean>(); val ruTermlar = ArrayList<String>()
        fun qo(t: String, ex: Boolean) { if (t.length >= (if (ex) 2 else 3)) { if (!terms.containsKey(t) || !ex) terms[t] = ex } }
        for (r in y.ru) {
            val ex = r.endsWith("$"); val b = lugatFold(r.replace("$", ""))
            qo(b, ex); qo(ruLotin(b), ex)
            if (!ex && b.length >= 4) ruTermlar.add(b)
        }
        for (u in y.uz) for (variant in listOf(u, uzKirill(u))) {
            val w = sozlarga(variant)
            if (w.size == 1) qo(w[0], w[0].length <= 3)
            else for (x in w) { if (x.length >= 4 && x !in UMUMIY_SOZ) qo(x, false) else if (x.length == 3) qo(x, true) }
        }
        Tushuncha(terms.map { Term(it.key, it.value) }, ruTermlar)
    }
}

private fun tokenMos(tok: String, x: Term): Boolean = if (x.ex) tok == x.t else tok.startsWith(x.t) || (tok.length >= 4 && x.t.startsWith(tok))

/** One word -> the Russian estimate stems (UPPER CASE) for the search: «g'isht» -> КИРПИЧ, КЛАДК, КЛАДОЧ. */
fun lugatKengaytir(soz: String): List<String> {
    val tok = lugatFold(soz).trim()
    if (tok.length < 3) return emptyList()
    val out = LinkedHashSet<String>()
    for (t in LUGAT_INDEKS) if (t.terms.any { tokenMos(tok, it) }) for (r in t.ruTermlar) out.add(r.uppercase())
    return out.toList()
}

// ---------- lugat.ts ----------

private val QOSHIMCHA = listOf("lardan", "larga", "larni", "ning", "dan", "ga", "ni", "da", "ka", "qa", "lar", "i", "a")
private val TO_XTATISH_SOZLARI = setOf("НА", "В", "ВО", "ДЛЯ", "ПОД", "И", "С", "ПО", "ИЗ", "ПРИ", "ДО", "ОТ", "ЗА", "К", "ILA", "VA", "BILAN", "UCHUN", "BOYICHA", "HAMDA")
private fun apostrofsiz(s: String) = s.replace(Regex("[ʻʼ`´’‘']"), "")

/** One word -> the estimate's Cyrillic: dictionary -> (suffix cut dictionary) -> general lugat -> transliteration. */
fun sozniOgir(soz: String): String {
    val t = apostrofsiz(soz).lowercase()
    if (t.isEmpty()) return ""
    if (Regex("[а-яё]").containsMatchIn(t)) return t.uppercase().replace("Ё", "Е")
    if (!Regex("[a-z]").containsMatchIn(t)) return t.uppercase()
    if (Regex("\\d").containsMatchIn(t)) return qidiruvNormal(t)
    XOTIRA_LUGAT[t]?.let { return it }
    for (q in QOSHIMCHA) if (t.length > q.length + 2 && t.endsWith(q)) XOTIRA_LUGAT[t.dropLast(q.length)]?.let { return it }
    lugatKengaytir(soz).firstOrNull()?.let { return it }
    return qidiruvTranslit(t.uppercase())
}

private val SOZ_AJRAT = Regex("[^0-9A-Za-zА-Яа-яЁёʻʼ`´’‘']+")
/** Text -> Cyrillic words without stop words: «kanal tubiga beton» -> [КАНАЛ, ДНО, БЕТОН]. */
fun xotiraSozlari(matn: String): List<String> =
    matn.split(SOZ_AJRAT).map(::sozniOgir).flatMap { it.split(Regex("$WS+")) }.filter { it.isNotEmpty() && it !in TO_XTATISH_SOZLARI }

// ---------- parse.ts ----------

enum class MiqdorTuri { Son, Foiz, Hammasi, Yoq }
class XotiraQator(val id: Int, val xom: String, val nom: String, val turi: MiqdorTuri, val qiymat: Double?, val birlik: String?)
class Miqdor(val turi: MiqdorTuri, val qiymat: Double?)

private const val BIRLIKLAR = "(?:m3|м3|м³|m³|kub|куб|m2|м2|м²|m²|kv|кв|pm|п\\.?\\s?м|kg|кг|tn|тн|t|т|dona|dn|sht|шт|ta|литр|l|л|m|м|komplekt|компл|kompl|к-т|soat|час|маш-?ч|чел-?ч)"
private const val SON_RX = "[-+]?\\d+(?:[\\s\\u00a0]?\\d{3})*(?:[.,]\\d+)?"
private val OXIR = Regex("^(.*?)[\\s:=–-]*($SON_RX)\\s*(%|$BIRLIKLAR\\.?)?\\s*$", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
private val BOSH = Regex("^($SON_RX)\\s*(%|$BIRLIKLAR\\.?)?\\s+(.+)$", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
// JS \b is ASCII-only: the Cyrillic alternatives only match next to an ASCII word character (kept as in the site).
private val HAMMASI = Regex("(?<![A-Za-z0-9_])(?:hammasi|barchasi|qoldiq(?:\\s+hammasi)?|hamma|all)(?![A-Za-z0-9_])|(?<=[A-Za-z0-9_])(?:все|остаток|весь)(?=[A-Za-z0-9_])", RegexOption.IGNORE_CASE)

private fun xotiraSon(s: String): Double = s.replace(Regex("[\\s\\u00a0]"), "").replace(',', '.').toDoubleOrNull() ?: Double.NaN

/** Unit text closer to the estimate's style: m3 -> М3, kv -> М2. */
fun birlikNorm(b: String?): String? {
    if (b == null || b.isEmpty()) return null
    val t = b.lowercase().replace(Regex("[\\s.]"), "")
    return when {
        Regex("^(m3|м3|м³|m³|kub|куб)$").matches(t) -> "М3"
        Regex("^(m2|м2|м²|m²|kv|кв)$").matches(t) -> "М2"
        Regex("^(pm|пм)$").matches(t) -> "М"
        Regex("^(m|м)$").matches(t) -> "М"
        Regex("^(kg|кг)$").matches(t) -> "КГ"
        Regex("^(tn|тн|t|т)$").matches(t) -> "Т"
        Regex("^(dona|dn|sht|шт|ta)$").matches(t) -> "ШТ"
        Regex("^(l|л|литр)$").matches(t) -> "Л"
        Regex("^(komplekt|компл|kompl|к-т|кт)$").matches(t) -> "КОМПЛ"
        else -> b.uppercase()
    }
}

fun qatorlarniOqi(matn: String): List<XotiraQator> {
    val out = ArrayList<XotiraQator>(); var id = 0
    for (xom0 in matn.split(Regex("\\r?\\n|;"))) {
        val xom = xom0.replace(Regex("^$WS*(?:[-*••]|\\d{1,3}[.)])$WS+"), "").trim()
        if (xom.isEmpty()) continue
        id += 1
        if (HAMMASI.containsMatchIn(xom)) { out.add(XotiraQator(id, xom, xom.replace(HAMMASI, " ").replace(Regex("$WS+"), " ").trim(), MiqdorTuri.Hammasi, null, null)); continue }
        var nom: String; val son: String; val bir: String?
        val m = OXIR.find(xom)
        if (m != null && m.groupValues[1].trim().isNotEmpty()) { nom = m.groupValues[1]; son = m.groupValues[2]; bir = m.groups[3]?.value }
        else {
            val m2 = BOSH.find(xom)
            if (m2 != null) { son = m2.groupValues[1]; bir = m2.groups[2]?.value; nom = m2.groupValues[3] }
            else { out.add(XotiraQator(id, xom, xom, MiqdorTuri.Yoq, null, null)); continue }
        }
        val q = xotiraSon(son)
        if (!q.isFinite()) { out.add(XotiraQator(id, xom, xom, MiqdorTuri.Yoq, null, null)); continue }
        nom = nom.replace(Regex("[\\s:=–-]+$"), "").trim()
        if (bir == "%") out.add(XotiraQator(id, xom, nom, MiqdorTuri.Foiz, q, null))
        else out.add(XotiraQator(id, xom, nom, MiqdorTuri.Son, q, birlikNorm(bir?.removeSuffix("."))))
    }
    return out
}

/** The quantity field of a row: «120», «50%», «hammasi». */
fun miqdorOqi(s: String): Miqdor {
    val t = s.trim()
    if (t.isEmpty()) return Miqdor(MiqdorTuri.Yoq, null)
    if (HAMMASI.containsMatchIn(t)) return Miqdor(MiqdorTuri.Hammasi, null)
    val m = Regex("^(\\S+?)\\s*(%)?$").find(t) ?: return Miqdor(MiqdorTuri.Yoq, null)
    val q = xotiraSon(m.groupValues[1])
    if (!q.isFinite()) return Miqdor(MiqdorTuri.Yoq, null)
    return if (m.groups[2] != null) Miqdor(MiqdorTuri.Foiz, q) else Miqdor(MiqdorTuri.Son, q)
}

// ---------- moslash.ts ----------

class XotiraNomzod(
    val qatorId: Long, val ball: Int, val tur: String, val kod: String?, val nom: String, val birlik: String?, val yol: String,
    val smetaHajm: Double?, val faktHajm: Double, val f2Hajm: Double, val qoldiq: Double?, val narx: Double?,
    /** Does the query unit match the estimate unit (null: the query has no unit). */
    val birlikMos: Boolean?, /** Query quantity in the estimate unit (120 м3 -> 1.2 [100М3]). */ val miqdor: Double?,
    /** Does the quantity fit the remainder (null unknown). DISPLAY only: volume is never blocked. */ val sigadi: Boolean?,
)
enum class XotiraHolatTuri { Aniq, Taklif, Topilmadi }
class XotiraNatija(val qator: XotiraQator, val holat: XotiraHolatTuri, val nomzodlar: List<XotiraNomzod>)

internal class Satr(val q: T2Qator, val toklar: List<String>, val yolToklar: List<String>, val yol: String, val fakt: Double, val f2: Double, val smeta: Double?, val narx: Double?)
class XotiraIndeks internal constructor(internal val satrlar: List<Satr>)

private val MOSLASH_TURLAR = setOf("bl", "mat", "ob")
private fun oraliqQism(a: String, b: String): Int { var i = 0; while (i < a.length && i < b.length && a[i] == b[i]) i++; return i }

/** Two words equal or of one stem (Russian ending differences): common prefix >= max(4, shorter - 2). */
fun sozMos(a: String, b: String): Boolean {
    if (a == b) return true
    val m = min(a.length, b.length)
    if (m < 4 || Regex("\\d").containsMatchIn(a) || Regex("\\d").containsMatchIn(b)) return false
    return oraliqQism(a, b) >= max(4, m - 2)
}

private fun tokenlar(s: String?): List<String> = xotiraSozlari(s ?: "")
class BirlikTahlil(val koef: Double, val baza: String)

/** Unit: «100М3» -> (100, 'М3'). */
fun birlikTahlil(b: String?): BirlikTahlil? {
    val t = (b ?: "").trim()
    if (t.isEmpty()) return null
    val m = Regex("^(\\d+(?:[.,]\\d+)?)\\s*(.*)$").find(t)
    val koef = if (m != null) m.groupValues[1].replace(',', '.').toDouble() else 1.0
    val baza = normBir(if (m != null) m.groupValues[2] else t)
    return if (baza.isNotEmpty()) BirlikTahlil(if (koef > 0) koef else 1.0, baza) else null
}

fun xotiraIndeks(rows: List<T2Qator>, states: List<JurnalHolat>): XotiraIndeks {
    val st = states.associateBy { it.qatorId }; val byId = rows.associateBy { it.id }
    val yolKesh = HashMap<Long, String>()
    fun yolOl(id: Long?): String {
        if (id == null) return ""
        yolKesh[id]?.let { return it }
        val r = byId[id] ?: return ""
        val o = yolOl(r.otaId)
        val v = if (r.tur == "rz") listOf(o, (r.nom ?: "").replace(Regex("^РАЗДЕЛ:\\s*", RegexOption.IGNORE_CASE), "")).filter { it.isNotEmpty() }.joinToString(" › ") else o
        yolKesh[id] = v; return v
    }
    val satrlar = ArrayList<Satr>()
    for (q in rows) {
        if ((q.tur ?: "") !in MOSLASH_TURLAR) continue
        val h = st[q.id]; val yol = yolOl(q.otaId)
        satrlar.add(Satr(q, tokenlar(q.nom ?: ""), tokenlar(yol), yol, son(h?.faktHajm) ?: 0.0, son(h?.f2Hajm) ?: 0.0, son(h?.smetaHajm) ?: son(q.hajm), son(h?.f2Narx) ?: son(h?.smetaNarx) ?: son(q.narx)))
    }
    return XotiraIndeks(satrlar)
}

private fun nomzodQur(s: Satr, ball: Int, birlik: String?, miqdor: Double?): XotiraNomzod {
    val so = birlikTahlil(birlik); val sm = birlikTahlil(s.q.birlik)
    val birlikMos = if (so != null && sm != null) so.baza == sm.baza else null
    val miq = if (miqdor == null) null else if (so != null && sm != null && so.baza == sm.baza) miqdor / sm.koef * so.koef else miqdor
    val qoldiq = s.smeta?.let { it - s.fakt }
    val sigadi = if (miq == null || qoldiq == null || birlikMos == false) null else if (qoldiq >= 0) miq <= qoldiq * 1.001 + 1e-9 else miq >= qoldiq * 1.001 - 1e-9
    return XotiraNomzod(s.q.id, ball, s.q.tur ?: "bl", s.q.kod, s.q.nom ?: "", s.q.birlik, s.yol, s.smeta, s.fakt, s.f2, qoldiq, s.narx, birlikMos, miq, sigadi)
}

/** Query words vs an estimate row, 0..100. */
private fun ballHisobla(sor: List<String>, s: Satr, birlik: String?): Int {
    if (sor.isEmpty() || s.toklar.isEmpty()) return 0
    val ishlatilgan = HashSet<Int>(); var topildi = 0; var yolTopildi = 0
    for (w in sor) {
        val i = s.toklar.indices.firstOrNull { k -> k !in ishlatilgan && sozMos(w, s.toklar[k]) } ?: -1
        if (i >= 0) { ishlatilgan.add(i); topildi++ } else if (s.yolToklar.any { sozMos(w, it) }) yolTopildi++
    }
    if (topildi == 0 && yolTopildi == 0) return 0
    val qamrov = (topildi + 0.6 * yolTopildi) / sor.size
    val aniqlik = topildi.toDouble() / s.toklar.size
    val so = birlikTahlil(birlik); val sm = birlikTahlil(s.q.birlik)
    val bir = if (so != null && sm != null) (if (so.baza == sm.baza) 10 else -15) else 0
    val tur = if (s.q.tur == "bl") 4 else 2
    return max(0, floor(62 * min(1.0, qamrov) + 24 * aniqlik + bir + tur + 0.5).toInt())
}

private const val CH_ANIQ = 78; private const val CH_TAKLIF = 38; private const val CH_KORSAT = 22

private fun tartibla(ind: XotiraIndeks, sor: List<String>, birlik: String?, miqdor: Double?, limit: Int): List<XotiraNomzod> {
    val out = ArrayList<XotiraNomzod>()
    for (s in ind.satrlar) { val b = ballHisobla(sor, s, birlik); if (b >= CH_KORSAT) out.add(nomzodQur(s, min(100, b), birlik, miqdor)) }
    return out.sortedWith { a, b -> if (a.ball != b.ball) b.ball - a.ball else a.nom.length - b.nom.length }.take(limit)
}

fun xotiraMosla(qatorlar: List<XotiraQator>, ind: XotiraIndeks, limit: Int = 5): List<XotiraNatija> = qatorlar.map { qator ->
    val sor = tokenlar(qator.nom)
    val birlik = qator.birlik?.let { birlikNorm(it) }
    val nz = tartibla(ind, sor, birlik, if (qator.turi == MiqdorTuri.Son) qator.qiymat else null, limit)
    val a = nz.getOrNull(0); val b = nz.getOrNull(1)
    val holat = if (a == null || a.ball < CH_TAKLIF) XotiraHolatTuri.Topilmadi else if (a.ball >= CH_ANIQ && (b == null || a.ball - b.ball >= 12)) XotiraHolatTuri.Aniq else XotiraHolatTuri.Taklif
    XotiraNatija(qator, holat, nz)
}

/** One search box: name / code / section across the whole estimate (no quantity). */
fun xotiraQidiruv(ind: XotiraIndeks, soz: String, limit: Int = 12): List<XotiraNomzod> {
    val q = soz.trim()
    if (q.length < 2) return emptyList()
    val kodSoz = q.uppercase().replace(Regex("$WS+"), "")
    val kodMos = ind.satrlar.filter { s -> s.q.kod != null && s.q.kod.uppercase().replace(Regex("$WS+"), "").contains(kodSoz) }
    val nom = tartibla(ind, tokenlar(q), null, null, limit)
    val kodN = kodMos.take(limit).map { nomzodQur(it, 95, null, null) }
    val korildi = HashSet<Long>()
    return (kodN + nom).filter { korildi.add(it.qatorId) }.take(limit)
}

// ---------- tanlash.ts ----------

/** The starting text of the quantity field (no unit): «120», «50%», «hammasi». */
fun miqdorBoshlang(q: XotiraQator): String = when {
    q.turi == MiqdorTuri.Son && q.qiymat != null -> numStr(q.qiymat)
    q.turi == MiqdorTuri.Foiz && q.qiymat != null -> numStr(q.qiymat) + "%"
    q.turi == MiqdorTuri.Hammasi -> "hammasi"
    else -> ""
}
/** JS String(number): integers without ".0". */
fun numStr(x: Double): String = if (x == floor(x) && abs(x) < 1e15) x.toLong().toString() else x.toString()

/** The field quantity + the chosen candidate -> fakt volume in the estimate unit; null = cannot be computed. */
fun nomzodHajmi(q: XotiraQator, n: XotiraNomzod, maydon: String): Double? {
    val m = miqdorOqi(maydon)
    if (m.turi == MiqdorTuri.Son && m.qiymat != null) {
        val nisbat = if (q.turi == MiqdorTuri.Son && q.qiymat != null && q.qiymat != 0.0 && n.miqdor != null) n.miqdor / q.qiymat else 1.0
        return yaxlit6(m.qiymat * nisbat)
    }
    return hajmniHisobla(m.turi, m.qiymat, n.qoldiq, n.miqdor)
}

// ---------- savat.ts ----------

/** Query quantity -> volume in the estimate unit. Percent = of the remainder; hammasi = the whole remainder. */
fun hajmniHisobla(turi: MiqdorTuri, qiymat: Double?, qoldiq: Double?, miqdor: Double?): Double? = when (turi) {
    MiqdorTuri.Hammasi -> if (qoldiq != null && qoldiq > 0) yaxlit6(qoldiq) else null
    MiqdorTuri.Foiz -> if (qiymat == null || qoldiq == null) null else yaxlit6(qoldiq * qiymat / 100)
    MiqdorTuri.Son -> if (miqdor != null) yaxlit6(miqdor) else if (qiymat != null) yaxlit6(qiymat) else null
    MiqdorTuri.Yoq -> null
}

class SavatQator(
    val qatorId: Long, val tur: String, val kod: String?, val nom: String, val birlik: String?, val hajm: Double, val smetaHajm: Double?, val qoldiq: Double?, val narx: Double?, val kat: String?,
    /** Group: the work row id the resource belongs to, or null. */
    val guruh: Long?, /** The operator changed the volume by hand: not recomputed when the work's volume changes. */ val qolda: Boolean,
    val manba: String, val oshdi: Boolean, /** For a work: the category sums of 1 unit (markup). */ val birlikKat: Map<Kat, Double>? = null,
) {
    fun copy(hajm: Double = this.hajm, oshdi: Boolean = this.oshdi, qolda: Boolean = this.qolda, narx: Double? = this.narx, birlikKat: Map<Kat, Double>? = this.birlikKat) =
        SavatQator(qatorId, tur, kod, nom, birlik, hajm, smetaHajm, qoldiq, narx, kat, guruh, qolda, manba, oshdi, birlikKat)
}

private fun oshdiMi(qoldiq: Double?, hajm: Double) = qoldiq != null && (if (qoldiq >= 0) hajm > qoldiq * 1.001 + 1e-9 else hajm < qoldiq * 1.001 - 1e-9)

class BirlikKatNatija(val narx: Double?, val kat: Map<Kat, Double>)

/** Under a work: per-category sums of 1 unit (all resources). [summa] = the row's smeta sum (the packet's smeta_summa). */
fun birlikKatSummalari(rows: List<T2Qator>, ishId: Long, summa: (Long) -> Double?): BirlikKatNatija {
    val ish = rows.firstOrNull { it.id == ishId }
    val h = son(ish?.hajm)
    val kat = LinkedHashMap<Kat, Double>()
    if (ish == null || h == null || h == 0.0) return BirlikKatNatija(null, kat)
    val bolalar = HashMap<Long, MutableList<T2Qator>>()
    for (r in rows) if (r.otaId != null) bolalar.getOrPut(r.otaId) { ArrayList() }.add(r)
    var jami = 0.0
    fun yur(id: Long) {
        for (c in bolalar[id].orEmpty()) {
            if (c.tur == "rs" || c.tur == "mat" || c.tur == "ob") {
                val s = son(summa(c.id))
                if (s != null) { jami += s; val k = katAniqla(c.kat) ?: (if (c.tur == "ob") Kat.OB else if (c.tur == "mat") Kat.MAT else null); if (k != null) kat[k] = (kat[k] ?: 0.0) + s / h }
            }
            if (c.tur == "rz") yur(c.id)
        }
    }
    yur(ishId)
    return BirlikKatNatija(if (jami != 0.0) jami / h else null, kat)
}

private fun savatQatori(r: T2Qator, hajm: Double, manba: String, guruh: Long?, n: XotiraNomzod?): SavatQator {
    val qoldiq = n?.qoldiq
    return SavatQator(r.id, r.tur ?: "bl", r.kod, r.nom ?: "", r.birlik, hajm, n?.smetaHajm ?: son(r.hajm), qoldiq, n?.narx ?: son(r.narx), r.kat, guruh, false, manba, oshdiMi(qoldiq, hajm))
}

/** Add to the basket. A work brings its mat/ob resources as a group with proportional volume; the same row twice adds the volume. */
fun savatgaQosh(savat: List<SavatQator>, rows: List<T2Qator>, n: XotiraNomzod, hajm: Double, manba: String, summa: (Long) -> Double?): List<SavatQator> {
    val r = rows.firstOrNull { it.id == n.qatorId }
    if (r == null || !hajm.isFinite() || hajm == 0.0) return savat.toList()
    val out = ArrayList(savat)
    fun qosh(q: SavatQator) {
        val i = out.indexOfFirst { it.qatorId == q.qatorId }
        if (i < 0) { out.add(q); return }
        val yangi = yaxlit6(out[i].hajm + q.hajm)
        out[i] = out[i].copy(hajm = yangi, oshdi = oshdiMi(out[i].qoldiq, yangi))
    }
    var ish = savatQatori(r, hajm, manba, null, n)
    if (r.tur == "bl") { val b = birlikKatSummalari(rows, r.id, summa); ish = ish.copy(birlikKat = b.kat, narx = b.narx) }
    qosh(ish)
    if (r.tur == "bl") {
        val ishSmeta = son(r.hajm)
        if (ishSmeta != null && ishSmeta != 0.0) for (c in rows) {
            if (c.otaId != r.id || (c.tur != "mat" && c.tur != "ob")) continue
            val ch = son(c.hajm); if (ch == null || ch == 0.0) continue
            qosh(savatQatori(c, yaxlit6(ch * hajm / ishSmeta), manba, r.id, null))
        }
    }
    return out
}

fun savatdanOlish(savat: List<SavatQator>, qatorId: Long): List<SavatQator> = savat.filter { it.qatorId != qatorId && it.guruh != qatorId }

/** Change a volume by hand; a work's change re-proportions the resources not touched by hand. */
fun savatHajmi(savat: List<SavatQator>, rows: List<T2Qator>, qatorId: Long, hajm: Double): List<SavatQator> {
    val bor = savat.firstOrNull { it.qatorId == qatorId } ?: return savat.toList()
    val ishSmeta = if (bor.tur == "bl") son(rows.firstOrNull { it.id == qatorId }?.hajm) else null
    return savat.map { x ->
        when {
            x.qatorId == qatorId -> x.copy(hajm = yaxlit6(hajm), qolda = if (x.guruh != null) true else x.qolda, oshdi = oshdiMi(x.qoldiq, hajm))
            x.guruh == qatorId && !x.qolda && ishSmeta != null && ishSmeta != 0.0 -> {
                val ch = son(rows.firstOrNull { it.id == x.qatorId }?.hajm)
                if (ch != null && ch != 0.0) x.copy(hajm = yaxlit6(ch * hajm / ishSmeta)) else x
            }
            else -> x
        }
    }
}

class SavatPaketQator(val qatorId: Long, val hajm: Double)
fun savatPaketi(savat: List<SavatQator>): List<SavatPaketQator> = savat.filter { it.hajm != 0.0 }.map { SavatPaketQator(it.qatorId, it.hajm) }

class SavatJami(val asos: Double, val ustamali: Double?, val narxsiz: Int)

/** Basket total: base = direct cost; markup = by the category coefficients (the contract's). A work counts by its resources; the group's mat/ob are not added twice. */
fun savatJami(savat: List<SavatQator>, nk: Map<String, Double?>?): SavatJami {
    val kat = Kat.entries.associateWith { 0.0 }.toMutableMap()
    var asos = 0.0; var narxsiz = 0; var ustamaBor = true
    for (x in savat) {
        if (x.guruh != null) continue
        if (x.tur == "bl") {
            val bk = x.birlikKat.orEmpty()
            if (bk.isEmpty()) { narxsiz += 1; continue }
            for ((k, v) in bk) { val s = v * x.hajm; kat[k] = kat.getValue(k) + s; asos += s }
            continue
        }
        if (x.narx == null) { narxsiz += 1; continue }
        val s = x.narx * x.hajm; asos += s
        val k = katAniqla(x.kat) ?: (if (x.tur == "ob") Kat.OB else if (x.tur == "mat") Kat.MAT else null)
        if (k != null) kat[k] = kat.getValue(k) + s else ustamaBor = false
    }
    var ustamali: Double? = null
    if (nk != null && ustamaBor) {
        val kf = kategoriyaKf(standartPodval(nk))
        ustamali = if (Kat.entries.any { kat.getValue(it) != 0.0 && kf[it] == null }) null else Kat.entries.fold(0.0) { t, k -> t + (if (kat.getValue(k) == 0.0) 0.0 else kat.getValue(k) * kf.getValue(k)!!) }
    }
    return SavatJami(yaxlit2(asos), ustamali?.let { yaxlit2(it) }, narxsiz)
}
