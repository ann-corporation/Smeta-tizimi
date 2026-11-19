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
import java.math.BigDecimal
import java.math.MathContext
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

/*
 * "Egizaklarga ham yozish" (twin objects): the same fakt written to the other objects of one project whose names are "<root> №N". Port of frontend/src/lib/fakt-egizak.ts +
 * lib/f2-moslash-v3/egizak.ts (the matching part: aslXarita / aslMoslash / opId / candidates) + lib/fakt-foiz-grid.ts (CAS) + lib/fakt-tuzatish.ts +
 * lib/smeta-anatomiya/tuzatish.ts (correction rows follow their main work) + lib/fakt-birlik-ogoh.ts (unit-mistake warning) + api/t2-egizak.ts (reads).
 * Laws: the ORIGINAL estimate is CONST (the map is only by structure); the percent comes from each twin's OWN smeta; '+' / '=' modes are kept; NULL is not 0; minus volume is allowed;
 * every twin has its OWN operation_id; '=' rows are re-read on the server (CAS): a difference stops THAT twin only. Approved F2 is never touched.
 */

// ------------------------------------------------------------------ f2-moslash-v3/egizak.ts (matching part)

/** t2_qator columns the matching needs (original + additional rows). */
class EgizakQator(
    val id: Long, val otaId: Long?, val daraja: Int?, val tartib: Double?, val tur: String?, val kod: String?, val nom: String?, val birlik: String?, val hajm: Double?,
    val qoshimcha: Boolean = false, val replacesLineId: Long? = null, val operationId: String? = null,
)

const val EGIZAK_USTUNLAR = "id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,qoshimcha,replaces_line_id,operation_id"

private fun matn(x: String?): String = (x ?: "").replace(Regex("\\s+"), " ").trim()
private fun son(x: Double?): Double? = if (x == null || !x.isFinite()) null else x

/** Equal inside float noise (1e-9 relative / absolute). */
fun sonTeng(a: Double?, b: Double?): Boolean {
    val x = son(a); val y = son(b)
    if (x == null || y == null) return x == null && y == null
    return abs(x - y) <= max(1e-9, abs(y) * 1e-9)
}

private fun hajmMatn(h: Double?): String { val n = son(h) ?: return ""; return BigDecimal(n).round(MathContext(12)).toDouble().toString() }
private val tartibla = Comparator<EgizakQator> { a, b -> val d = (a.tartib ?: 0.0).compareTo(b.tartib ?: 0.0); if (d != 0) d else a.id.compareTo(b.id) }

/** Original estimate rows (not additional / replacement), by id. */
fun aslQatorlar(rows: List<EgizakQator>): List<EgizakQator> = rows.filter { !it.qoshimcha }.sortedBy { it.id }

/** Signature of the original structure (FNV-1a 32): level|type|code|name|unit|volume + parent position, by id. */
fun aslImzo(rows: List<EgizakQator>): String {
    val asl = aslQatorlar(rows)
    val orin = asl.withIndex().associate { it.value.id to it.index }
    var h = 0x811c9dc5L
    for (q in asl) {
        val s = "${q.daraja ?: ""}|${q.tur ?: ""}|${matn(q.kod)}|${matn(q.nom)}|${matn(q.birlik)}|${hajmMatn(q.hajm)}|${if (q.otaId == null) "" else orin[q.otaId]?.toString() ?: "?"}\n"
        for (ch in s) { h = h xor ch.code.toLong(); h = (h * 0x01000193L) and 0xFFFFFFFFL }
    }
    return "${asl.size}:${h.toString(16).padStart(8, '0')}"
}

class AslFarq(val orin: Int, val aId: Long, val bId: Long?, val maydon: String)
sealed interface AslXarita {
    class Ok(val map: Map<Long, Long>, val soni: Int, val imzo: String) : AslXarita
    class Rad(val aSoni: Int, val bSoni: Int, val imzoA: String, val imzoB: String, val farqlar: List<AslFarq>) : AslXarita
}

/** A original row -> B original row (by position). Every pair and the parent are checked; one difference = refused. */
fun aslXarita(a: List<EgizakQator>, b: List<EgizakQator>): AslXarita {
    val A = aslQatorlar(a); val B = aslQatorlar(b)
    val imzoA = aslImzo(a); val imzoB = aslImzo(b)
    if (A.size != B.size) return AslXarita.Rad(A.size, B.size, imzoA, imzoB, listOf(AslFarq(0, A.firstOrNull()?.id ?: 0, B.firstOrNull()?.id, "soni")))
    val map = LinkedHashMap<Long, Long>(); A.forEachIndexed { i, q -> map[q.id] = B[i].id }
    val farqlar = ArrayList<AslFarq>()
    A.forEachIndexed { i, x ->
        val y = B[i]
        fun f(m: String) { farqlar.add(AslFarq(i + 1, x.id, y.id, m)) }
        if ((x.tur ?: "") != (y.tur ?: "")) f("tur")
        else if ((x.daraja ?: -1) != (y.daraja ?: -1)) f("daraja")
        else if (matn(x.kod) != matn(y.kod)) f("kod")
        else if (matn(x.nom) != matn(y.nom)) f("nom")
        else if (matn(x.birlik) != matn(y.birlik)) f("birlik")
        else if (!sonTeng(x.hajm, y.hajm)) f("hajm")
        else if ((if (x.otaId == null) null else map[x.otaId] ?: -1L) != y.otaId) f("ota")
    }
    if (farqlar.isNotEmpty() || imzoA != imzoB) return AslXarita.Rad(A.size, B.size, imzoA, imzoB, farqlar)
    return AslXarita.Ok(map, A.size, imzoA)
}

class AslMoslik(val map: Map<Long, Long>, val qatiy: Boolean, val topilmadi: List<Long>, val hajmFarq: List<Long>, val sabab: Map<Long, String>? = null)

/**
 * Soft matching (for fakt twins): same structure -> `aslXarita` (strict); otherwise by the type|code|name|unit key + repeat order (the parent must match).
 * Not found -> `topilmadi`, different volume -> `hajmFarq`; NOT refused: fakt is written row by row (percent from each twin's own smeta).
 */
fun aslMoslash(a: List<EgizakQator>, b: List<EgizakQator>): AslMoslik {
    val x = aslXarita(a, b)
    if (x is AslXarita.Ok) return AslMoslik(x.map, true, emptyList(), emptyList())
    val A = aslQatorlar(a); val B = aslQatorlar(b)
    fun kalit(q: EgizakQator) = "${q.tur ?: ""}|${matn(q.kod)}|${matn(q.nom)}|${matn(q.birlik)}"
    val bRoyxat = LinkedHashMap<String, MutableList<EgizakQator>>()
    for (q in B) bRoyxat.getOrPut(kalit(q)) { ArrayList() }.add(q)
    val korildi = HashMap<String, Int>(); val juft = HashMap<Long, EgizakQator>(); val topilmadi = ArrayList<Long>(); val sabab = HashMap<Long, String>()
    for (q in A) {
        val k = kalit(q); val n = korildi[k] ?: 0; korildi[k] = n + 1
        val y = bRoyxat[k]?.getOrNull(n)
        if (y != null) juft[q.id] = y else { topilmadi.add(q.id); sabab[q.id] = "kalit" }
    }
    val map = LinkedHashMap<Long, Long>(); val hajmFarq = ArrayList<Long>()
    for (q in A) {
        val y = juft[q.id] ?: continue
        val otaMos = if (q.otaId == null) y.otaId == null else juft[q.otaId]?.id == (y.otaId ?: -1L)
        if (!otaMos) { topilmadi.add(q.id); sabab[q.id] = "ota"; continue }
        map[q.id] = y.id
        if (!sonTeng(q.hajm, y.hajm)) hajmFarq.add(q.id)
    }
    return AslMoslik(map, false, topilmadi, hajmFarq, sabab)
}

/** Deterministic operation_id (UUID shape, v5 bits): one A row + one B object -> always the same. */
fun egizakOpId(aQatorId: Long, bObyektId: Long): String {
    val d = MessageDigest.getInstance("SHA-256").digest("f2-egizak|v1|$aQatorId|$bObyektId".toByteArray(Charsets.UTF_8)).copyOf(16)
    d[6] = ((d[6].toInt() and 0x0f) or 0x50).toByte(); d[8] = ((d[8].toInt() and 0x3f) or 0x80).toByte()
    val h = d.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    return "${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}"
}

class EgizakObyekt(val id: Long, val nom: String?, val loyihaId: Long?)

/** The object's twins: the other objects of the same project (the single rule of F2 twin copy and the Fakt journal). */
fun egizakObyektlar(objects: List<EgizakObyekt>, objectId: Long): List<EgizakObyekt> {
    val loyiha = objects.firstOrNull { it.id == objectId }?.loyihaId ?: return emptyList()
    return objects.filter { it.loyihaId == loyiha && it.id != objectId }
}

/** "Osiyo oshxonasi №2" -> "osiyo oshxonasi"; a name without the number mark -> null. */
fun egizakNomIldizi(nom: String?): String? {
    val m = Regex("^(.*?)\\s*(?:№|#)\\s*\\d+$").find((nom ?: "").replace(Regex("\\s+"), " ").trim()) ?: return null
    return m.groupValues[1].trim().lowercase().ifEmpty { null }
}

/** Candidates of "Egizaklarga ham yozish": objects of the same project whose name is the same "<root> №N" (NOT every object of the project: a 26 000-row object would hit the 60 s limit). */
fun egizakJuftlari(objects: List<EgizakObyekt>, objectId: Long): List<EgizakObyekt> {
    val ildiz = egizakNomIldizi(objects.firstOrNull { it.id == objectId }?.nom) ?: return emptyList()
    return egizakObyektlar(objects, objectId).filter { egizakNomIldizi(it.nom) == ildiz }
}

// ------------------------------------------------------------------ smeta-anatomiya/tuzatish.ts + fakt-tuzatish.ts (correction rows follow the main work)

private val LOTIN = mapOf('A' to 'А', 'B' to 'В', 'C' to 'С', 'E' to 'Е', 'H' to 'Н', 'K' to 'К', 'M' to 'М', 'O' to 'О', 'P' to 'Р', 'T' to 'Т', 'X' to 'Х', 'Y' to 'У')
private fun tKalit(s: String?): String = (s ?: "").uppercase().replace('Ё', 'Е').map { LOTIN[it] ?: it }.joinToString("").replace(Regex("\\s+"), " ").trim()
private val OZGARISH = Regex("(НА КАЖДЫ[ЙЕ]|ПРИ ИЗМЕНЕНИИ).*(ИЗМЕНЕНИ|ТОЛЩИН)")
private val QOSH_AYIR_S = "(ДОБАВЛЯ(ТЬ|ЕТСЯ)|ИСКЛЮЧА(ТЬ|ЕТСЯ))"
private val TOLIQ = Regex("${OZGARISH.pattern}.*$QOSH_AYIR_S")
private val VYCHITAETSYA = Regex("ВЫЧИТАЕТСЯ")
private val QOSH_YOKI_AYIR = Regex("ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ")
private val KOEF = Regex("К\\s*=\\s*\\d")

class TuzatishManba(val id: Long, val tur: String?, val kod: String?, val nom: String?, val birlik: String?, val hajm: Double?, val otaId: Long?, val tartib: Double?, val qoshimcha: Boolean, val zamena: Boolean)

/** Is it a correction row and by which rule (null = an ordinary work). Only an original estimate work (bl, not additional / replacement). */
fun tuzatishSababi(q: TuzatishManba): String? {
    if (q.tur != "bl" || q.qoshimcha || q.zamena) return null
    val nom = tKalit(q.nom)
    if (nom.isEmpty()) return null
    if (TOLIQ.containsMatchIn(nom)) return "qalinlik"
    if (VYCHITAETSYA.containsMatchIn(nom)) return "vychitaetsya"
    if (QOSH_YOKI_AYIR.containsMatchIn(nom)) return "qosh_ayir"
    if (KOEF.containsMatchIn(tKalit(q.kod)) && OZGARISH.containsMatchIn(nom)) return "koef_qalinlik"
    return null
}

private fun birlikKalit(b: String?) = tKalit(b).replace(Regex("[\\s.]"), "")
private fun birlikTeng(a: String, b: String): Boolean {
    if (a == b) return true
    val (q, u) = if (a.length <= b.length) a to b else b to a
    return q.length >= 6 && u.startsWith(q)
}
private fun hajmTeng(a: Double?, b: Double?): Boolean {
    if (a == null || b == null) return false
    val x = abs(a); val y = abs(b)
    return abs(x - y) <= 0.01 * max(x, y)
}

class TuzatishXarita(val asos: Map<Long, Long>, val ergashuvchi: Map<Long, List<Long>>)

/** Binding (deterministic): inside one section, the nearest PRECEDING non-correction work with the same unit and |volume| within 1%; else only the same unit; else unbound. */
fun tuzatishBoglanishlari(rows: List<TuzatishManba>): TuzatishXarita {
    val guruh = LinkedHashMap<Long?, MutableList<TuzatishManba>>()
    for (r in rows) { if (r.tur != "bl") continue; guruh.getOrPut(r.otaId) { ArrayList() }.add(r) }
    val asos = LinkedHashMap<Long, Long>(); val ergashuvchi = LinkedHashMap<Long, MutableList<Long>>()
    for (arr in guruh.values) {
        val s = arr.sortedWith(compareBy<TuzatishManba> { it.tartib ?: Long.MAX_VALUE.toDouble() }.thenBy { it.id })
        val sabablar = s.map { tuzatishSababi(it) }
        s.forEachIndexed { i, r ->
            if (sabablar[i] == null) return@forEachIndexed
            val bk = birlikKalit(r.birlik); val h = son(r.hajm)
            var tanlangan: TuzatishManba? = null; var qoida: String? = null; var birlikli: TuzatishManba? = null
            for (j in i - 1 downTo 0) {
                val c = s[j]
                if (sabablar[j] != null || c.qoshimcha || c.zamena || !birlikTeng(birlikKalit(c.birlik), bk)) continue
                if (birlikli == null) birlikli = c
                if (hajmTeng(son(c.hajm), h)) { tanlangan = c; qoida = "hajm"; break }
            }
            if (tanlangan == null && birlikli != null) { tanlangan = birlikli; qoida = "birlik" }
            if (tanlangan == null || qoida == null) return@forEachIndexed
            asos[r.id] = tanlangan.id; ergashuvchi.getOrPut(tanlangan.id) { ArrayList() }.add(r.id)
        }
    }
    return TuzatishXarita(asos, ergashuvchi)
}

/** Correction fakt = correction volume x (main fakt / main volume) (the sign is the correction's). NULL is not 0. Scale = core `hajmMasshtab` (6 decimals). */
fun tuzatishFakti(tuzatishHajm: Double?, asosFakt: Double?, asosHajm: Double?): Double? {
    if (asosFakt == null || !asosFakt.isFinite()) return null
    if (asosHajm == null || !asosHajm.isFinite() || asosHajm == 0.0) return null
    val r = hajmMasshtab(tuzatishHajm, asosFakt / asosHajm) ?: return null
    return if (r == 0.0) 0.0 else r
}

private fun yaxlit6(x: Double) = kotlin.math.floor(x * 1e6 + 0.5) / 1e6

/** Adds the correction deltas to the package; a hand-typed entry of a bound correction is removed (it is derived). Returns the new package and the added correction ids (for CAS). */
fun tuzatishPaketi(paket: List<FaktQatorHajm>, xarita: TuzatishXarita, faktlar: Map<Long, Double?>, smetalar: Map<Long, Double?>): Pair<List<FaktQatorHajm>, List<Long>> {
    val qatorlar = paket.filter { it.qatorId !in xarita.asos }.toMutableList()
    val tuzatishlar = ArrayList<Long>()
    for (x in qatorlar.toList()) {
        val ergash = xarita.ergashuvchi[x.qatorId]
        if (ergash.isNullOrEmpty()) continue
        val joriy = faktlar[x.qatorId]
        val asosFakt = joriy?.let { yaxlit6(it + x.hajm) }
        for (tid in ergash) {
            val maqsad = tuzatishFakti(smetalar[tid], asosFakt, smetalar[x.qatorId]) ?: continue
            val delta = yaxlit6(maqsad - (faktlar[tid] ?: 0.0))
            if (delta == 0.0) continue
            qatorlar.add(FaktQatorHajm(tid, delta)); tuzatishlar.add(tid)
        }
    }
    return qatorlar to tuzatishlar
}

// ------------------------------------------------------------------ fakt-foiz-grid.ts (CAS)

/** '=' entries that produce a number: their delta is computed from the fakt SEEN; the server value is re-read before the write. */
fun jamiIdlari(kiritmalar: Map<Long, Kiritma>, smetalar: Map<Long, Double?>): List<Long> =
    kiritmalar.filter { (id, k) -> k.rejim == Rejim.Teng && k.qiymat.isNotBlank() && kiritmaSoni(k.qiymat, smetalar[id]) is KiritmaSoni.Num }.keys.toList()

class CasZiddiyat(val id: Long, val brauzer: Double, val server: Double?)
fun casZiddiyat(idlar: List<Long>, brauzer: Map<Long, Double>, server: Map<Long, Double>): List<CasZiddiyat> {
    val out = ArrayList<CasZiddiyat>()
    for (id in idlar) { val b = brauzer[id] ?: 0.0; val s = server[id]; if (s == null || abs(s - b) > 1e-9) out.add(CasZiddiyat(id, b, s)) }
    return out
}

// ------------------------------------------------------------------ fakt-birlik-ogoh.ts (unit mistake warning; never blocks)

const val OGOH_CHEGARA = 1.5
private val KOPAYTMALAR = setOf(10, 100, 1000, 10000, 100000, 1000000)

class BirlikKopaytma(val kopaytma: Int, val birlik: String)
/** The multiplier inside a unit: "100М3", "1 000 М3 ГРУНТА" ...; only powers of ten are recognised. */
fun birlikKopaytma(birlik: String?): BirlikKopaytma? {
    if (birlik == null) return null
    val s = java.text.Normalizer.normalize(birlik, java.text.Normalizer.Form.NFKC).replace(Regex("[\\s\\u00A0\\u2000-\\u200B]+"), " ").trim()
    val m = Regex("^(\\d{1,3}(?: \\d{3})+|\\d+) ?([A-Za-zА-Яа-яЁё][^\\s]*)").find(s) ?: return null
    val n = m.groupValues[1].replace(" ", "").toLongOrNull()?.takeIf { it <= Int.MAX_VALUE }?.toInt() ?: return null
    if (n !in KOPAYTMALAR) return null
    return BirlikKopaytma(n, "$n ${m.groupValues[2].replace(Regex("[.,;:]+$"), "")}")
}

class BirlikOgoh(val kiritilgan: Double, val smeta: Double, val yangiFakt: Double, val nisbat: Double, val daraja: Int?, val kopaytma: Int?, val birlikMatn: String?, val gumon: Boolean, val taklif: Double?)

/** Ratio near 10^k (k = 1..3) within +-10% -> k, else null. A negative / 0 ratio -> null. */
fun ongDaraja(nisbat: Double): Int? {
    if (!nisbat.isFinite() || nisbat <= 0) return null
    for (k in 1..3) if (abs(nisbat / Math.pow(10.0, k.toDouble()) - 1) <= 0.1 + 1e-9) return k
    return null
}

fun birlikOgohi(smeta: Double?, joriy: Double?, rejim: Rejim, n: Double?, birlik: String?): BirlikOgoh? {
    if (smeta == null || !smeta.isFinite() || smeta == 0.0) return null
    if (n == null || !n.isFinite()) return null
    val j = if (joriy != null && joriy.isFinite()) joriy else 0.0
    val yangiFakt = if (rejim == Rejim.Plus) j + n else n
    val nisbat = yangiFakt / smeta; val kiritNisbat = n / smeta
    val daraja = ongDaraja(nisbat) ?: ongDaraja(kiritNisbat)
    if (!(nisbat > OGOH_CHEGARA) && daraja == null) return null
    val bk = birlikKopaytma(birlik); val kopaytma = bk?.kopaytma
    val gumon = daraja != null || (kopaytma != null && max(nisbat, kiritNisbat) >= kopaytma / 2.0)
    val taklif = if (kopaytma != null && gumon) yaxlit6(n / kopaytma) else null
    return BirlikOgoh(n, smeta, yangiFakt, nisbat, daraja, kopaytma, bk?.birlik, gumon, taklif)
}

/** Warning by the typed value ("300", "50%"): the single path for the journal row and the twin preview. */
fun qiymatBirlikOgohi(qiymat: String, rejim: Rejim, smeta: Double?, joriy: Double?, birlik: String?): BirlikOgoh? {
    val n = kiritmaSoni(qiymat, smeta)
    return if (n is KiritmaSoni.Num) birlikOgohi(smeta, joriy, rejim, n.value, birlik) else null
}

/** ru-RU number text as `toLocaleString('ru-RU', ...)`. */
fun ogohSon(v: Double, min: Int = 0): String {
    val f = java.text.NumberFormat.getNumberInstance(Locale("ru", "RU")); f.minimumFractionDigits = min; f.maximumFractionDigits = 3
    return f.format(v)
}

// ------------------------------------------------------------------ fakt-egizak.ts

val RAD_SABAB_MATN: Map<String, String> = mapOf(
    "topilmadi" to "egizak smetasida mos qator topilmadi", "qoshimcha_yoq" to "qo‘shimcha qator egizakda yo‘q (F2 egizak nusxasi bilan yarating)", "tur" to "bu qatorga fakt qo‘lda kiritilmaydi",
    "SON_EMAS" to "Son emas", "NOANIQ" to "Noaniq son: «1.234» ming yoki o‘nli? 1234 yoki 1,234 deb yozing", "MANFIY" to "Jami fakt manfiy bo‘lib qoladi",
    "ISHORA" to "Chegirma ishi: fakt smeta kabi manfiy bo‘lishi kerak", "NOL" to "0 qo‘shilmaydi", "FOIZ_SMETASIZ" to "Foiz uchun smeta hajmi kerak", "FORMULA_XATO" to "Formula noto‘g‘ri",
)

class EgizakMos(
    val aId: Long, val bId: Long, val nom: String, val birlik: String?, val rejim: Rejim, val qiymat: String,
    val smeta: Double?, val joriy: Double, val delta: Double, val yangi: Double, val hajmFarq: Boolean,
)
class EgizakRad(val aId: Long, val nom: String, val sabab: String)

class EgizakTomon(val id: Long, val nom: String, val qatorlar: List<EgizakQator>, val smeta: Map<Long, Double?>, val fakt: Map<Long, Double>)

class EgizakReja(
    val obyektId: Long, val nom: String, val qatiy: Boolean, val moslar: List<EgizakMos>, val radlar: List<EgizakRad>, val paket: List<FaktQatorHajm>,
    /** For CAS: the twin's entries and the fakt seen. */
    val kirit: Map<Long, Kiritma>, val faktlar: Map<Long, Double>, val smetalar: Map<Long, Double?>,
)

/** The A draft's additional rows -> their copy in the twin (operation_id = egizakOpId(A row, twin) first; then by the content key, only when UNIQUE on both sides). */
fun qoshimchaXarita(manba: List<EgizakQator>, egizak: List<EgizakQator>, egizakId: Long): Map<Long, Long> {
    val byOp = HashMap<String, Long>()
    for (q in egizak) if (q.qoshimcha && !q.operationId.isNullOrEmpty()) byOp[q.operationId.lowercase()] = q.id
    val out = LinkedHashMap<Long, Long>(); val band = HashSet<Long>(); val qolgan = ArrayList<EgizakQator>()
    for (q in manba) {
        if (!q.qoshimcha) continue
        val b = byOp[egizakOpId(q.id, egizakId).lowercase()]
        if (b != null) { out[q.id] = b; band.add(b) } else qolgan.add(q)
    }
    if (qolgan.isNotEmpty()) {
        fun kalit(q: EgizakQator, byId: Map<Long, EgizakQator>): String {
            val ota = q.otaId?.let { byId[it] }; val h = son(q.hajm)
            return listOf(q.tur ?: "", matn(q.kod), matn(q.nom), matn(q.birlik), if (h == null) "" else String.format(Locale.ROOT, "%.6f", h), if (ota != null) "${matn(ota.kod)}|${matn(ota.nom)}" else "").joinToString("§").uppercase()
        }
        val aById = manba.associateBy { it.id }; val bById = egizak.associateBy { it.id }
        val bKalit = LinkedHashMap<String, MutableList<Long>>()
        for (q in egizak) { if (!q.qoshimcha || q.id in band) continue; bKalit.getOrPut(kalit(q, bById)) { ArrayList() }.add(q.id) }
        val aSoni = HashMap<String, Int>()
        for (q in qolgan) { val k = kalit(q, aById); aSoni[k] = (aSoni[k] ?: 0) + 1 }
        for (q in qolgan) { val k = kalit(q, aById); val bs = bKalit[k]; if (bs != null && bs.size == 1 && aSoni[k] == 1) out[q.id] = bs[0] }
    }
    return out
}

/** The rows' current fakt as '=' entries (section / whole object copy). Only bl/mat/ob and fakt != 0. */
fun faktdanKiritmalar(qatorlar: List<JurnalQator>): Map<Long, Kiritma> {
    val out = LinkedHashMap<Long, Kiritma>()
    for (q in qatorlar) if ((q.tur == "bl" || q.tur == "mat" || q.tur == "ob") && q.fakt.isFinite() && q.fakt != 0.0) out[q.id] = Kiritma(Rejim.Teng, jsNumberString(q.fakt))
    return out
}

private fun faktQoldaKiritiladimi(tur: String) = tur == "bl" || tur == "mat" || tur == "ob"

/** One twin's plan: matching, percent (from the twin's own smeta), '+'/'=' and the package (jurnalPaket - the same rules). */
fun faktEgizakReja(manba: List<EgizakQator>, kirit: Map<Long, Kiritma>, e: EgizakTomon, qoshXarita: Map<Long, Long>): EgizakReja {
    val m = aslMoslash(manba, e.qatorlar)
    val aById = manba.associateBy { it.id }; val bIdlar = e.qatorlar.map { it.id }.toHashSet()
    val radlar = ArrayList<EgizakRad>(); val bKirit = LinkedHashMap<Long, Kiritma>(); val aOf = LinkedHashMap<Long, Long>()
    // JS iterates integer keys ascending: keep the same order.
    for ((aId, v) in kirit.toSortedMap()) {
        if (v.qiymat.isBlank()) continue
        val a = aById[aId]
        val nom = a?.nom?.trim().takeIf { !it.isNullOrEmpty() } ?: "#$aId"
        if (a == null || !faktQoldaKiritiladimi(a.tur ?: "")) { radlar.add(EgizakRad(aId, nom, "tur")); continue }
        val bId = if (a.qoshimcha) qoshXarita[aId] else m.map[aId]
        if (bId == null || bId !in bIdlar) { radlar.add(EgizakRad(aId, nom, if (a.qoshimcha) "qoshimcha_yoq" else "topilmadi")); continue }
        bKirit[bId] = v; aOf[bId] = aId
    }
    val faktlar = LinkedHashMap<Long, Double>(); val smetalar = LinkedHashMap<Long, Double?>()
    for (q in e.qatorlar) { faktlar[q.id] = e.fakt[q.id] ?: 0.0; smetalar[q.id] = e.smeta[q.id] }
    val p0 = jurnalPaket(bKirit.toSortedMap(), faktlar, smetalar)
    val xarita = tuzatishBoglanishlari(e.qatorlar.map { TuzatishManba(it.id, it.tur, it.kod, it.nom, it.birlik, it.hajm, it.otaId, it.tartib, it.qoshimcha, it.replacesLineId != null) })
    val (tzQator, tzIdlar0) = tuzatishPaketi(p0.qatorlar, xarita, faktlar, smetalar)
    val tzIdlar = tzIdlar0.toHashSet()
    val delta = tzQator.associate { it.qatorId to it.hajm }
    val moslar = ArrayList<EgizakMos>(); val bById = e.qatorlar.associateBy { it.id }
    for ((bId, aId) in aOf) {
        if (bId in xarita.asos) continue          // a correction row is derived: its entry is not taken
        val xato = p0.xatolar[bId]; val a = aById.getValue(aId)
        if (xato != null) { radlar.add(EgizakRad(aId, a.nom?.trim().takeIf { !it.isNullOrEmpty() } ?: "#$aId", xato.name)); continue }
        val d = delta[bId] ?: continue           // no change (= current fakt)
        val k = bKirit.getValue(bId); val joriy = faktlar[bId] ?: 0.0; val sm = smetalar[bId]
        val n = kiritmaSoni(k.qiymat, sm)
        val nv = (n as? KiritmaSoni.Num)?.value
        moslar.add(EgizakMos(aId, bId, a.nom?.trim().takeIf { !it.isNullOrEmpty() } ?: "#$aId", bById[bId]?.birlik, k.rejim, k.qiymat, sm, joriy, d,
            if (k.rejim == Rejim.Plus) joriy + (nv ?: 0.0) else (nv ?: joriy), aId in m.hajmFarq))
    }
    return EgizakReja(e.id, e.nom, m.qatiy, moslar, radlar, tzQator.filter { (it.qatorId in aOf && it.qatorId !in xarita.asos) || it.qatorId in tzIdlar }, bKirit, faktlar, smetalar)
}

class EgizakNatija(val obyektId: Long, val nom: String, val holat: String, val qatorSoni: Int, val xabar: String? = null, val ziddiyatIdlar: List<Long>? = null)

/**
 * Write to the twins one by one. Per twin: '=' rows are re-read on the server (CAS) - a difference stops THAT twin only, the others continue; an error also stops only its own twin.
 * Every twin has its own operation_id (re-sending is safe).
 */
suspend fun faktEgizakYoz(
    rejalar: List<EgizakReja>, opIdlar: Map<Long, String>,
    serverFakt: suspend (Long, List<Long>) -> Map<Long, Double>?, yoz: suspend (Long, List<FaktQatorHajm>, String) -> Pair<Boolean, String?>, progress: (EgizakNatija) -> Unit = {},
): List<EgizakNatija> {
    val out = ArrayList<EgizakNatija>()
    for (r in rejalar) {
        val n: EgizakNatija = try {
            val op = opIdlar[r.obyektId]
            if (r.paket.isEmpty()) EgizakNatija(r.obyektId, r.nom, "bosh", 0)
            else if (op == null) EgizakNatija(r.obyektId, r.nom, "xato", 0, "operation_id yo‘q")
            else {
                val jamiIdlar = jamiIdlari(r.kirit, r.smetalar).filter { id -> r.paket.any { it.qatorId == id } }
                var z: List<Long> = emptyList(); var oqilmadi = false
                if (jamiIdlar.isNotEmpty()) { val server = serverFakt(r.obyektId, jamiIdlar); if (server == null) oqilmadi = true else z = casZiddiyat(jamiIdlar, r.faktlar, server).map { it.id } }
                if (oqilmadi) EgizakNatija(r.obyektId, r.nom, "xato", 0, "Joriy faktni tekshirib bo‘lmadi")
                else if (z.isNotEmpty()) EgizakNatija(r.obyektId, r.nom, "ziddiyat", 0, ziddiyatIdlar = z)
                else { val y = yoz(r.obyektId, r.paket, op); if (y.first) EgizakNatija(r.obyektId, r.nom, "yozildi", r.paket.size) else EgizakNatija(r.obyektId, r.nom, "xato", 0, y.second) }
            }
        } catch (e: Exception) { EgizakNatija(r.obyektId, r.nom, "xato", 0, e.message) }
        out.add(n); progress(n)
    }
    return out
}

// ------------------------------------------------------------------ api/t2-egizak.ts (reads)

private fun tableRead(jadval: String, filtr: String, ustunlar: String?, tartib: String) = buildJsonObject {
    put("jadval", jadval); put("filtr", filtr); if (ustunlar != null) put("ustunlar", ustunlar); put("tartib", tartib); put("limit", 50000)
}

/** The read failed: `kod` goes into the message for diagnostics. */
class EgizakOqishXatosi(val kod: String) : Exception("Egizak obyekt ma’lumotlari o‘qilmadi ($kod).")

/** `toliq:false` (the Worker budget) -> continues from the last key with `key=gt.<last>`; never silently returns half data. */
private suspend fun toliqOqi(api: BffApi, jadval: String, filtr: String, ustunlar: String?, kalit: String): List<kotlinx.serialization.json.JsonObject> {
    val hammasi = ArrayList<kotlinx.serialization.json.JsonObject>(); var oxirgi: Long? = null
    for (i in 0 until 12) {
        val r = api.bff("/api/sb", "POST", tableRead(jadval, filtr + (if (oxirgi == null) "" else "&$kalit=gt.$oxirgi"), ustunlar, "$kalit.asc"))
        val o = r.body.obj()
        if (!r.ok || (o?.get("ok") as? JsonPrimitive)?.booleanOrNull != true) throw EgizakOqishXatosi(o?.get("code").str() ?: r.code ?: "UPSTREAM")
        val q = o?.get("qatorlar").arr()?.mapNotNull { it.obj() }.orEmpty()
        hammasi.addAll(q)
        if ((o?.get("toliq") as? JsonPrimitive)?.booleanOrNull != false) return hammasi
        val k = q.lastOrNull()?.get(kalit).num()?.toLong()
        if (k == null || (oxirgi != null && k <= oxirgi)) throw EgizakOqishXatosi("TOLIQ_EMAS")
        oxirgi = k
    }
    throw EgizakOqishXatosi("TOLIQ_EMAS")
}

private fun JsonElement?.flag(): Boolean = this.let { it is JsonPrimitive && (it.booleanOrNull == true || it.content == "1") }

/** The object's t2_qator rows (for twin matching). */
suspend fun egizakQatorlarOl(api: BffApi, oid: Long): List<EgizakQator> =
    toliqOqi(api, "t2_qator", "obyekt_id=eq.$oid", EGIZAK_USTUNLAR, "id").mapNotNull { x ->
        EgizakQator(x["id"].num()?.toLong() ?: return@mapNotNull null, x["ota_id"].num()?.toLong(), x["daraja"].num()?.toInt(), x["tartib"].num(), x["tur"].str(), x["kod"].str(), x["nom"].str(), x["birlik"].str(),
            x["hajm"].num(), x["qoshimcha"].flag(), x["replaces_line_id"].num()?.toLong(), x["operation_id"].str())
    }

/** The object's row states: (row id -> smeta volume, fakt volume). */
suspend fun egizakHolatOl(api: BffApi, oid: Long): Map<Long, Pair<Double?, Double>> =
    toliqOqi(api, "t2_qator_holat", "obyekt_id=eq.$oid", null, "qator_id").mapNotNull { x ->
        val id = x["qator_id"].num()?.toLong() ?: return@mapNotNull null
        id to (x["smeta_hajm"].num() to (x["fakt_hajm"].num() ?: 0.0))
    }.toMap()

/** Partial read of states (the server fakt for CAS). The `obyekt_id=eq.N` filter stays: the gateway checks the tenant boundary with it. */
suspend fun egizakServerFakt(api: BffApi, oid: Long, idlar: List<Long>): Map<Long, Double>? {
    val ids = idlar.filter { it > 0 }
    if (ids.isEmpty()) return emptyMap()
    val r = api.bff("/api/sb", "POST", buildJsonObject { put("jadval", "t2_qator_holat"); put("filtr", "obyekt_id=eq.$oid&qator_id=in.(${ids.joinToString(",")})"); put("limit", max(1, ids.size)) })
    val o = r.body.obj()
    if (!r.ok || (o?.get("ok") as? JsonPrimitive)?.booleanOrNull != true) return null
    return o?.get("qatorlar").arr()?.mapNotNull { it.obj() }?.mapNotNull { x -> (x["qator_id"].num()?.toLong() ?: return@mapNotNull null) to (x["fakt_hajm"].num() ?: 0.0) }?.toMap()
}
