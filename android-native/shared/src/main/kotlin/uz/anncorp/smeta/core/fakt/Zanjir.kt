package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Port of the contractor's work chain (frontend/src/lib/zanjir/qadamlar.ts + lib/pto-markazi/{markaz,oy}.ts + f2-reestr bosqich): the SINGLE "next step" model shown as the 8-step
 * strip on the Fakt page. Pure; the inputs are what the page already read. NULL is not 0: unknown (unread) is never "done" - it is `unknown` and nothing is guessed.
 */

enum class QadamHolat { Done, Current, Blocked, NotStarted, Unknown }

val ZANJIR_TARTIB = listOf("smeta", "fakt", "aosr", "f2", "nakopitelniy", "f3", "tolov", "slichitelniy")

class MarkazAkt(val tur: String, val holat: String, val lifecycleStatus: String?, val oy: String, val yaratildi: String, val hujjatJami: Double?, val yozilganJami: Double?)

fun aktBosqich(holat: String, lifecycle: String?): String {
    val l = lifecycle
    if (l == "approved" || (l == null && (holat == "tasdiqlangan" || holat == "yakunlangan"))) return "tasdiqlangan"
    if (l == "cancelled" || l == "superseded" || holat == "bekor") return "bekor"
    if (l == "rejected") return "rad"
    return "jarayonda"
}

fun aktReestriSoro(obyektId: Long) = buildJsonObject { put("soro", "akt_reestr_obyekt_v1"); put("obyekt_id", obyektId) }

/** `{ok, natija:{ok, qatorlar}}` or `{ok, qatorlar}` -> acts; unreadable -> null (unknown, never an empty list). */
fun parseAktReestri(body: JsonElement?): List<MarkazAkt>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val q = (o["natija"].obj()?.get("qatorlar") ?: o["qatorlar"]).arr() ?: return null
    return q.mapNotNull { e ->
        val x = e.obj() ?: return@mapNotNull null
        MarkazAkt(x["tur"].str() ?: return@mapNotNull null, x["holat"].str().orEmpty(), x["lifecycle_status"].str(), x["oy"].str().orEmpty(), x["yaratildi"].str().orEmpty(), x["hujjat_jami"].num(), x["yozilgan_jami"].num())
    }
}

private val OY_RE = Regex("^(\\d{4})-(0[1-9]|1[0-2])")
fun oyKaliti(oy: String?): String? = OY_RE.find((oy ?: "").trim())?.let { "${it.groupValues[1]}-${it.groupValues[2]}" }

/** The latest month with a non-cancelled fakt or F2 act (a draft too: the work is going on that month). */
fun faolOy(aktlar: List<MarkazAkt>?): String? {
    var eng: String? = null
    for (a in aktlar.orEmpty()) {
        if (a.tur != "fakt" && a.tur != "f2") continue
        if (aktBosqich(a.holat, a.lifecycleStatus) == "bekor") continue
        val k = oyKaliti(a.oy)
        if (k != null && (eng == null || k > eng)) eng = k
    }
    return eng
}

class MarkazHolat(val faktQoralama: Int?, val faktSaqlangan: Int?, val f2Tasdiq: Int?, val f2BuOyda: Boolean?, val f2TasdiqBuOyda: Int?, val f2OxirgiOy: String?)

fun markazHolati(aktlar: List<MarkazAkt>?, oy: String): MarkazHolat {
    if (aktlar == null) return MarkazHolat(null, null, null, null, null, null)
    fun bekor(a: MarkazAkt) = aktBosqich(a.holat, a.lifecycleStatus) == "bekor"
    val fakt = aktlar.filter { it.tur == "fakt" && !bekor(it) }
    val saqlangan = fakt.filter { it.holat != "qoralama" }
    val f2 = aktlar.filter { it.tur == "f2" && !bekor(it) }
    val tasdiq = f2.filter { aktBosqich(it.holat, it.lifecycleStatus) == "tasdiqlangan" }
    val k = oyKaliti(oy)
    return MarkazHolat(fakt.size - saqlangan.size, saqlangan.size, tasdiq.size, f2.any { oyKaliti(it.oy) == k }, tasdiq.count { oyKaliti(it.oy) == k }, tasdiq.mapNotNull { oyKaliti(it.oy) }.maxOrNull())
}

class ZanjirKirish(
    val smetaBor: Boolean?, val narxsiz: Int?, val faktSaqlangan: Int?, val faktQoralama: Int?, val f2BuOyda: Boolean?, val f2TasdiqBuOyda: Int?,
    val f2TasdiqJami: Int?, val f2OxirgiOy: String?, val smetaQator: Int?, val faktQamrov: Int?, val faktHolatda: Boolean?, val oy: String,
    val aosr: Pair<Int, Int>? = null, val aosrReestr: Pair<Int, Int>? = null, val forma3: Int? = null, val tolovYozilgan: Int? = null, val slichitelniy: Pair<Int, Int>? = null,
)

class ZanjirQadam(val id: String, val nom: String, val holat: QadamHolat, val izoh: String, val amal: String)
class ZanjirTavsiya(val id: String, val amal: String, val sabab: String, val eslatma: String?, val aniq: Boolean)
class ZanjirNatija(val qadamlar: List<ZanjirQadam>, val keyingi: ZanjirTavsiya?, val tugallandi: Boolean)

private enum class Own { Done, Todo, Unknown, Idle }
private fun musbat(n: Int?) = n != null && n > 0
private fun f2Jami(k: ZanjirKirish): Int? = k.f2TasdiqJami ?: k.f2TasdiqBuOyda
private fun oydaYoq(k: ZanjirKirish) = !musbat(k.f2TasdiqBuOyda) && musbat(k.f2TasdiqJami)

private class Ozi(val own: Own, val izoh: String, val amal: String)

fun zanjirHisobla(k: ZanjirKirish, t: (String, Map<String, Any>) -> String): ZanjirNatija {
    fun tt(s: String) = t(s, emptyMap())
    val nomalum = tt("Noma’lum")
    fun oydaYoqIzoh(): String = if (k.f2OxirgiOy != null) t("Bu oyda yo‘q · jami {n} ta tasdiqlangan F-2 (oxirgisi {oy})", mapOf("n" to (k.f2TasdiqJami ?: 0), "oy" to k.f2OxirgiOy)) else t("Bu oyda yo‘q · jami {n} ta tasdiqlangan F-2", mapOf("n" to (k.f2TasdiqJami ?: 0)))
    fun ozi(id: String): Ozi = when (id) {
        "smeta" -> when {
            k.smetaBor == null -> Ozi(Own.Unknown, nomalum, tt("Smetani tekshiring"))
            !k.smetaBor -> Ozi(Own.Todo, tt("Smeta yuklanmagan"), tt("Smetani yuklang"))
            k.narxsiz == null -> Ozi(Own.Unknown, tt("Narxsiz qatorlar soni noma’lum"), tt("Smetani tekshiring"))
            k.narxsiz > 0 -> Ozi(Own.Todo, t("{n} qator narxsiz", mapOf("n" to k.narxsiz)), tt("Smetani narxlang"))
            else -> Ozi(Own.Done, if (musbat(k.smetaQator)) t("{n} ish qatori, hammasi narxlangan", mapOf("n" to k.smetaQator!!)) else tt("Smeta yuklangan va narxlangan"), tt("Smetani ko‘ring"))
        }
        "fakt" -> when {
            k.faktHolatda == true && !(musbat(k.faktSaqlangan) && !musbat(k.faktQoralama)) -> Ozi(Own.Done, if (k.faktQamrov != null) t("Obyektda fakt bor, qamrov {p}%", mapOf("p" to k.faktQamrov)) else tt("Obyektda fakt bor"), tt("Faktni ko‘ring"))
            k.faktSaqlangan == null -> Ozi(Own.Unknown, nomalum, tt("Faktni tekshiring"))
            musbat(k.faktQoralama) -> Ozi(Own.Todo, if (k.faktSaqlangan > 0) t("{n} ta fakt qoralamada · {m} ta saqlangan", mapOf("n" to k.faktQoralama!!, "m" to k.faktSaqlangan)) else t("{n} ta fakt qoralamada", mapOf("n" to k.faktQoralama!!)), tt("Faktni yakunlang"))
            k.faktSaqlangan == 0 -> Ozi(Own.Todo, tt("Bajarilgan ish kiritilmagan"), tt("Fakt kiriting"))
            else -> Ozi(Own.Done, if (k.faktQamrov != null) t("{n} ta fakt akti, qamrov {p}%", mapOf("n" to k.faktSaqlangan, "p" to k.faktQamrov)) else t("{n} ta fakt akti", mapOf("n" to k.faktSaqlangan)), tt("Faktni ko‘ring"))
        }
        "aosr" -> {
            val a = k.aosr; val r = k.aosrReestr
            when {
                a == null && r != null -> when {
                    r.first <= 0 -> Ozi(Own.Todo, tt("Hali АОСР yo‘q"), tt("АОСР tayyorlang"))
                    r.second > 0 -> Ozi(Own.Todo, t("{j} ta АОСР, {b} tasi ishga bog‘lanmagan", mapOf("j" to r.first, "b" to r.second)), tt("АОСР ni bog‘lang"))
                    else -> Ozi(Own.Done, t("{j} ta АОСР, hammasi ishga bog‘langan", mapOf("j" to r.first)), tt("АОСР ni ko‘ring"))
                }
                a == null -> Ozi(Own.Unknown, nomalum, tt("АОСР ni tekshiring"))
                a.second > 0 -> Ozi(Own.Todo, t("{n} ta yashirin ish АОСР siz", mapOf("n" to a.second)), tt("АОСР tayyorlang"))
                else -> Ozi(Own.Done, if (a.first > 0) t("{a}/{y} yashirin ish АОСР bilan yopilgan", mapOf("a" to (a.first - a.second), "y" to a.first)) else tt("Yashirin ish yo‘q"), tt("АОСР ni ko‘ring"))
            }
        }
        "f2" -> when {
            musbat(k.f2TasdiqBuOyda) -> Ozi(Own.Done, t("{oy} uchun F2 tasdiqlangan", mapOf("oy" to k.oy)), tt("F2 ni ko‘ring"))
            k.f2BuOyda == null -> Ozi(Own.Unknown, nomalum, tt("F2 ni tekshiring"))
            k.f2BuOyda -> Ozi(Own.Todo, t("{oy} F2 qoralamada — tasdiqlang", mapOf("oy" to k.oy)), tt("F2 ni tasdiqlang"))
            oydaYoq(k) -> Ozi(Own.Idle, oydaYoqIzoh(), tt("F2 ni ko‘ring"))
            else -> Ozi(Own.Todo, t("{oy} uchun F2 hali yo‘q", mapOf("oy" to k.oy)), tt("F2 tayyorlang"))
        }
        "nakopitelniy" -> {
            val j = f2Jami(k)
            when {
                j == null -> Ozi(Own.Unknown, nomalum, tt("Nakopitelniyni tekshiring"))
                j > 0 -> { val o = k.f2OxirgiOy ?: if (musbat(k.f2TasdiqBuOyda)) k.oy else null; Ozi(Own.Done, if (o != null) t("{oy} gacha tasdiqlangan F-2 lar asosida tayyor", mapOf("oy" to o)) else tt("Tasdiqlangan F-2 lar asosida tayyor"), tt("Nakopitelniyni ko‘ring")) }
                else -> Ozi(Own.Todo, tt("Tasdiqlangan F-2 yo‘q — nakopitelniy bo‘sh"), tt("Nakopitelniyni ko‘ring"))
            }
        }
        "f3" -> when {
            musbat(k.forma3) -> Ozi(Own.Done, tt("Forma 3 tuzilgan"), tt("Forma 3 ni ko‘ring"))
            oydaYoq(k) -> Ozi(Own.Idle, oydaYoqIzoh(), tt("Forma 3 ni ko‘ring"))
            k.forma3 == null -> Ozi(Own.Unknown, nomalum, tt("Forma 3 ni tekshiring"))
            else -> Ozi(Own.Todo, tt("Forma 3 hali yo‘q"), tt("Forma 3 tayyorlang"))
        }
        "slichitelniy" -> {
            val s = k.slichitelniy
            if (s == null) Ozi(Own.Unknown, nomalum, tt("Slichitelniyni tekshiring"))
            else { val f2n = if (musbat(k.f2TasdiqJami)) t(" · {m} ta tasdiqlangan F-2", mapOf("m" to k.f2TasdiqJami!!)) else ""
                if (s.first > 0) Ozi(Own.Todo, t("{n} qatorda farq bor", mapOf("n" to s.first)) + f2n, tt("Slichitelniyni oching")) else Ozi(Own.Done, tt("Smetadan farq yo‘q") + f2n, tt("Slichitelniyni ko‘ring")) }
        }
        else -> when {   // tolov
            musbat(k.tolovYozilgan) -> Ozi(Own.Done, tt("To‘lov yozilgan"), tt("To‘lovni ko‘ring"))
            k.tolovYozilgan == null -> Ozi(Own.Unknown, tt("To‘lov holati noma’lum"), tt("To‘lov va akt-sverkani tekshiring"))
            else -> Ozi(Own.Todo, tt("To‘lov hali yozilmagan"), tt("To‘lov va akt-sverka"))
        }
    }
    fun bloklovchi(id: String, tugamagan: Set<String>): String? = when (id) {
        "fakt" -> if (k.smetaBor == false) tt("Avval smetani yuklang") else null
        "aosr", "f2" -> if ((k.faktSaqlangan == 0 && !musbat(k.faktQoralama) && k.faktHolatda != true) || k.smetaBor == false) tt("Avval fakt kerak") else null
        "nakopitelniy", "f3", "slichitelniy" -> if (f2Jami(k) == 0) tt("Avval F2 tasdiqlanishi kerak") else null
        "tolov" -> if ("f3" in tugamagan) tt("Avval Forma 3 kerak") else null
        else -> null
    }
    val nomlar = mapOf("smeta" to "Smeta", "fakt" to "Fakt", "aosr" to "АОСР", "f2" to "F2", "nakopitelniy" to "Nakopitelniy", "slichitelniy" to "Slichitelniy", "f3" to "Forma 3", "tolov" to "To‘lov")
    val tugamagan = LinkedHashSet<String>(); var joriyBor = false
    val qadamlar = ZANJIR_TARTIB.map { id ->
        val h = ozi(id)
        var holat: QadamHolat; var izoh = h.izoh
        if (h.own == Own.Done) holat = QadamHolat.Done
        else {
            val blok = bloklovchi(id, tugamagan)
            if (blok != null) { holat = QadamHolat.Blocked; izoh = blok }
            else if (h.own == Own.Unknown) holat = QadamHolat.Unknown
            else if (h.own == Own.Idle) holat = QadamHolat.NotStarted
            else if (joriyBor) holat = QadamHolat.NotStarted
            else { holat = QadamHolat.Current; joriyBor = true }
        }
        if (holat == QadamHolat.Blocked || h.own == Own.Todo) tugamagan.add(id)
        ZanjirQadam(id, tt(nomlar.getValue(id)), holat, izoh, h.amal)
    }
    var ind = qadamlar.indexOfFirst { it.holat == QadamHolat.Current }; var aniq = true
    if (ind < 0) { ind = qadamlar.indexOfFirst { it.holat == QadamHolat.Unknown }; aniq = false }
    val q = qadamlar.getOrNull(ind)
    val unk = if (q != null && aniq) qadamlar.take(ind).firstOrNull { it.holat == QadamHolat.Unknown } else null
    return ZanjirNatija(qadamlar, q?.let { ZanjirTavsiya(it.id, it.amal, it.izoh, unk?.let { u -> t("{nom} holati noma’lum — tekshiring", mapOf("nom" to u.nom)) }, aniq) }, qadamlar.all { it.holat == QadamHolat.Done })
}

/** Counts the chain shows from the already-loaded tree/state: leaf works, coverage %, fakt present in state (import / other path). */
class ZanjirDaraxtdan(val smetaQator: Int?, val faktQamrov: Int?, val faktHolatda: Boolean?)
fun zanjirDaraxtdan(rows: List<T2Qator>, states: List<JurnalHolat>): ZanjirDaraxtdan {
    val ishlar = rows.filter { it.tur == "bl" }
    if (ishlar.isEmpty()) return ZanjirDaraxtdan(null, null, null)
    val fakt = states.associate { it.qatorId to (it.faktHajm ?: 0.0) }
    val faktli = ishlar.count { (fakt[it.id] ?: 0.0) > 0 }
    return ZanjirDaraxtdan(ishlar.size, Math.round(faktli.toDouble() / ishlar.size * 100).toInt(), states.any { (it.faktHajm ?: 0.0) > 0 || (it.faktSumma ?: 0.0) > 0 })
}
