package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import java.math.BigDecimal
import java.time.LocalDate
import java.time.OffsetDateTime

/*
 * Warehouse («Ombor») wire contracts. Everything here is pure (no Android) so it is unit-tested on the JVM.
 * Shapes mirror the web code, which is the source of truth:
 *   read  /api/sb  jadval t2_sklad_qoldiq          per-object stock       (frontend/src/api/supabase.ts sbSkladQoldiqOl)
 *   read  /api/sb  jadval t2_sklad_royxat          central warehouses     (frontend/src/api/t2-resurs.ts)
 *   read  /api/sb  soro sklad_markaziy_qoldiq_v1   central stock (qoldiq > 0), reply under `natija`
 *                                                  (frontend/src/api/t2-sklad-kirim.ts sbSkladMarkaziyQoldiq)
 *   write /api/sb-yoz amal skladga_yozish          object receive (prixod) / issue (rasxod), RPC t2_skladga_yozish
 *   write /api/sb-yoz amal sklad_berdim_v1         central warehouse -> object, RPC t2_sklad_markaziy_berdim_v1
 * No prices anywhere on this path (NULL = unknown, never 0). The server stays the only authority: a 403 is shown, never bypassed.
 */

const val AMAL_OMBOR_OBYEKT = "skladga_yozish"
const val AMAL_OMBOR_BERDIM = "sklad_berdim_v1"

/** Outbox kinds written by this module. */
fun isOmborKind(kind: String): Boolean = kind == AMAL_OMBOR_OBYEKT || kind == AMAL_OMBOR_BERDIM

// ---------- role gating ----------

/**
 * What the module shows for a role. The bottom-bar entry needs `warehouse.read`; the write buttons need `warehouse.write` OR `document.write`,
 * because the server accepts either for both write commands (frontend/functions/_shared/write-command-policy.ts:
 * skladga_yozish / sklad_berdim_v1 -> warehouse.write|document.write; PR #530). The sets mirror ROLE_PERMISSIONS in
 * frontend/src/lib/company-authorization/effective-authorization.ts (the mobile BFF exposes the role, not the permission list).
 * Per-member extra permissions are not visible to the app, so the server may still answer 403: that is shown as-is.
 */
data class OmborAccess(val read: Boolean, val write: Boolean) {
    companion object {
        private val FULL = setOf("superadmin", "admin", "boss")
        private val READ_ROLES = FULL + setOf("rahbar", "bugalter", "pto", "prorab", "omborchi", "mexanik", "taminotchi")
        // warehouse.write (omborchi) OR document.write (pto, prorab); the server accepts either for both write commands.
        private val WRITE_ROLES = FULL + setOf("pto", "prorab", "omborchi")
        val None = OmborAccess(false, false)
        fun forRole(role: String?): OmborAccess {
            val r = role.orEmpty().trim().lowercase()
            return OmborAccess(read = r in READ_ROLES, write = r in WRITE_ROLES)
        }
    }
}

// ---------- quantity ----------

/**
 * Quantity typed on a decimal keypad: digits with at most one «,» or «.» separator and at most 6 decimals (the server's
 * precision, same rule as frontend/src/lib/ombor-kunlik/berdim.ts). Spaces/NBSP are grouping and ignored. Zero, negative,
 * exponent, mixed separators («1,234.5»), more than 6 decimals and anything else are null: never silently corrected.
 */
fun parseQuantity(input: String): BigDecimal? {
    val t = input.filterNot { it == ' ' || it == ' ' || it == ' ' }
    if (!Regex("^(\\d+([.,]\\d{1,6})?|[.,]\\d{1,6})$").matches(t)) return null
    val norm = t.replace(',', '.').let { if (it.startsWith(".")) "0$it" else it }
    return BigDecimal(norm).takeIf { it.signum() > 0 }
}

/** Canonical wire form: plain decimal with a dot, no trailing zeros, no exponent («12.5», «10»). */
fun BigDecimal.wire(): String = stripTrailingZeros().toPlainString()

/** Display form «1 234,5» (comma decimal, NBSP grouping), up to 6 decimals. Null (unknown) is an em dash, never 0. */
fun formatQty(v: Double?): String {
    if (v == null || v.isNaN() || v.isInfinite()) return "—"
    val bd = BigDecimal.valueOf(v).setScale(6, java.math.RoundingMode.HALF_UP).stripTrailingZeros()
    val plain = (if (bd.scale() < 0) bd.setScale(0) else bd).abs().toPlainString()
    val dot = plain.indexOf('.')
    val i = if (dot < 0) plain else plain.substring(0, dot)
    val f = if (dot < 0) "" else plain.substring(dot + 1)
    val g = StringBuilder()
    i.forEachIndexed { k, c -> if (k > 0 && (i.length - k) % 3 == 0) g.append(' '); g.append(c) }
    return (if (bd.signum() < 0) "-" else "") + g + if (f.isEmpty()) "" else ",$f"
}

// ---------- search ----------

private val CYR = mapOf(
    'а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ё' to "yo", 'ж' to "j", 'з' to "z", 'и' to "i", 'й' to "y",
    'к' to "k", 'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o", 'п' to "p", 'р' to "r", 'с' to "s", 'т' to "t", 'у' to "u", 'ф' to "f",
    'х' to "x", 'ц' to "s", 'ч' to "ch", 'ш' to "sh", 'щ' to "sh", 'ъ' to "", 'ы' to "i", 'ь' to "", 'э' to "e", 'ю' to "yu", 'я' to "ya",
    'ў' to "o", 'қ' to "q", 'ғ' to "g", 'ҳ' to "h",
)

/** One comparison key for Latin and Cyrillic spellings of the same word («Цемент» and «sement» both give «sement»). */
fun searchKey(s: String): String {
    val sb = StringBuilder()
    for (ch in s.lowercase()) when {
        ch in CYR -> sb.append(CYR.getValue(ch))
        ch == '\'' || ch == '\u2019' || ch == '\u2018' || ch == '\u02bb' || ch == '\u02bc' || ch == '`' -> {}
        ch.isLetterOrDigit() -> sb.append(ch)
        else -> sb.append(' ')
    }
    return sb.toString().replace(Regex("\\s+"), " ").trim()
}

/** Every typed token must occur in the material name (AND), in either script. Blank query matches everything. */
fun matchesQuery(name: String, query: String): Boolean {
    val tokens = searchKey(query).split(' ').filter { it.isNotEmpty() }
    if (tokens.isEmpty()) return true
    val key = searchKey(name)
    return tokens.all { key.contains(it) }
}

/** What a scanned barcode/QR becomes in the search field. There is no code column in the stock data, so it only fills the search. */
fun scanToQuery(raw: String): String = raw.filterNot { it.isISOControl() }.trim().replace(Regex("\\s+"), " ").take(60)

// ---------- stock ----------

@Serializable
data class StockRow(
    val obyektId: Long? = null,
    val nomi: String,
    val birligi: String,
    val qoldiq: Double?,
    val oxirgi: String? = null,
    val turi: String? = null,
)

@Serializable
data class Warehouse(val id: Long, val nomi: String, val manzil: String? = null)

/** Where the list looks: every object of the company, one object, or one central warehouse. */
sealed interface OmborScope {
    data object AllObjects : OmborScope
    data class Obyekt(val id: Long, val nom: String) : OmborScope
    data class Central(val id: Long, val nom: String) : OmborScope
}

fun filterStock(rows: List<StockRow>, scope: OmborScope, query: String): List<StockRow> {
    val scoped = if (scope is OmborScope.Obyekt) rows.filter { it.obyektId == scope.id } else rows
    return scoped.filter { matchesQuery(it.nomi, query) }
        .sortedWith(compareBy({ searchKey(it.nomi) }, { it.birligi }, { it.obyektId ?: 0L }))
}

/** `31.12.2026` from a Postgres timestamptz («2026-12-31T09:30:00.123+00:00») or a plain date; null when unreadable. */
fun formatMovement(iso: String?): String? {
    val s = iso?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val d = runCatching { OffsetDateTime.parse(s).toLocalDate() }.getOrNull()
        ?: runCatching { LocalDate.parse(s.take(10)) }.getOrNull() ?: return null
    return "%02d.%02d.%04d".format(d.dayOfMonth, d.monthValue, d.year)
}

// ---------- reads ----------

const val OMBOR_STOCK_COLUMNS = "obyekt_id,turi,nomi,birligi,qoldiq,oxirgi_harakat"

fun objectStockRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_sklad_qoldiq")
    put("filtr", "kompaniya_id=eq.$companyId")
    put("ustunlar", OMBOR_STOCK_COLUMNS)
    put("tartib", "nomi.asc")
    put("limit", 20000)
}

fun warehousesRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_sklad_royxat")
    put("filtr", "kompaniya_id=eq.$companyId")
    put("ustunlar", "id,nomi,manzil")
    put("tartib", "nomi.asc")
    put("limit", 500)
}

/** Central stock RPC: only rows with qoldiq > 0; the search runs on the server too, the app also filters its cache. */
fun centralStockRequest(companyId: Long, skladId: Long): JsonObject = buildJsonObject {
    put("soro", "sklad_markaziy_qoldiq_v1")
    put("kompaniya_id", companyId)
    put("sklad_id", skladId)
    put("qidir", "")
    put("limit", 200)
}

/** Rows with exactly zero stock are hidden; a negative balance is data worth showing, an unknown one stays unknown. */
fun parseObjectStock(rows: List<JsonObject>): List<StockRow> = rows.mapNotNull { r ->
    val nomi = r["nomi"].str()?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
    val q = r["qoldiq"].num()
    if (q == 0.0) return@mapNotNull null
    StockRow(r["obyekt_id"].num()?.toLong(), nomi, r["birligi"].str().orEmpty(), q, r["oxirgi_harakat"].str(), r["turi"].str())
}

fun parseWarehouses(rows: List<JsonObject>): List<Warehouse> = rows.mapNotNull { r ->
    val id = r["id"].num()?.toLong() ?: return@mapNotNull null
    Warehouse(id, r["nomi"].str().orEmpty().ifBlank { "#$id" }, r["manzil"].str())
}

/** `{ok:true, natija:{ok:true, qatorlar:[{nomi,birligi,qoldiq}]}}` -> rows; anything else -> null. */
fun parseCentralStock(body: JsonElement?): List<StockRow>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val n = o["natija"].obj() ?: return null
    if ((n["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return n["qatorlar"].arr()?.mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        val nomi = r["nomi"].str()?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        StockRow(null, nomi, r["birligi"].str().orEmpty(), r["qoldiq"].num())
    }
}

// ---------- writes ----------

/** Receiver kinds the web form offers (frontend KirimKunlikForm TUR_TAKLIFLARI); wire codes as the server stores them. */
val RECEIVER_TYPES = listOf("usta", "brigada", "prarab", "boshqa")

fun isIsoDate(s: String): Boolean = Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(s) && runCatching { LocalDate.parse(s) }.isSuccess

private fun blankToNull(s: String?, max: Int): String? = s?.trim()?.takeIf { it.isNotEmpty() }?.take(max)

/** Receive into an object's stock. `obyomi` is a JSON number as the web sends it; the same operation id is reused on every retry. */
fun receivePayload(
    companyId: Long, obyektId: Long, nomi: String, birligi: String, qty: BigDecimal, sana: String,
    supplier: String?, note: String?, operationId: String,
): JsonObject = buildJsonObject {
    put("amal", AMAL_OMBOR_OBYEKT)
    put("kompaniya_id", companyId)
    put("operatsiya", "prixod")
    put("obyekt_id", obyektId)
    put("turi", "mat")
    put("sana", sana)
    put("nomi", nomi.trim().take(300))
    put("birligi", birligi.trim().take(50))
    put("obyomi", BigDecimal(qty.wire()))
    blankToNull(supplier, 200)?.let { put("postavshik", it) }
    blankToNull(note, 500)?.let { put("izoh", it) }
    put("operation_id", operationId)
}

/** Issue from an object's stock to a person/crew. */
fun issueFromObjectPayload(
    companyId: Long, obyektId: Long, nomi: String, birligi: String, qty: BigDecimal, sana: String,
    receiver: String?, receiverType: String?, note: String?, operationId: String,
): JsonObject = buildJsonObject {
    put("amal", AMAL_OMBOR_OBYEKT)
    put("kompaniya_id", companyId)
    put("operatsiya", "rasxod")
    put("obyekt_id", obyektId)
    put("turi", "mat")
    put("sana", sana)
    put("nomi", nomi.trim().take(300))
    put("birligi", birligi.trim().take(50))
    put("obyomi", BigDecimal(qty.wire()))
    blankToNull(receiver, 200)?.let { put("qabul_qiluvchi", it) }
    receiverType?.takeIf { it in RECEIVER_TYPES }?.let { put("qabul_turi", it) }
    blankToNull(note, 500)?.let { put("izoh", it) }
    put("operation_id", operationId)
}

/** Central warehouse -> object. `miqdor` is a string with a dot and at most 6 decimals (the gateway's exact regex). */
fun transferPayload(
    companyId: Long, skladId: Long, obyektId: Long, nomi: String, birligi: String, qty: BigDecimal, sana: String,
    receiver: String?, note: String?, operationId: String,
): JsonObject = buildJsonObject {
    put("amal", AMAL_OMBOR_BERDIM)
    put("kompaniya_id", companyId)
    put("sklad_id", skladId)
    put("obyekt_id", obyektId)
    put("nomi", nomi.trim().take(500))
    put("birligi", birligi.trim().take(100))
    put("miqdor", qty.wire())
    put("sana", sana)
    blankToNull(receiver, 300)?.let { put("qabul_qiluvchi", it) }
    blankToNull(note, 1000)?.let { put("izoh", it) }
    put("operation_id", operationId)
}

enum class OmborOp { RECEIVE, ISSUE }

enum class EntryError { NAME, UNIT, QUANTITY, SOURCE, TARGET, DATE }

/** Form validation, shared by the screen and the tests. An empty list means the entry can be queued. */
fun validateEntry(
    op: OmborOp, name: String, unit: String, quantity: String, date: String,
    source: OmborScope?, target: Long?,
): List<EntryError> = buildList {
    if (name.isBlank()) add(EntryError.NAME)
    if (unit.isBlank()) add(EntryError.UNIT)
    if (parseQuantity(quantity) == null) add(EntryError.QUANTITY)
    if (!isIsoDate(date)) add(EntryError.DATE)
    when (op) {
        OmborOp.RECEIVE -> if (target == null) add(EntryError.TARGET)
        OmborOp.ISSUE -> {
            if (source == null || source is OmborScope.AllObjects) add(EntryError.SOURCE)
            // A central warehouse hands over to an object; an object's stock goes to a person, so no target object is needed.
            if (source is OmborScope.Central && target == null) add(EntryError.TARGET)
        }
    }
}

/** True when the typed quantity is more than the (cached) balance: a warning, not a block, because the server decides. */
fun exceedsStock(qty: BigDecimal?, stock: Double?): Boolean = qty != null && stock != null && qty.toDouble() > stock + 1e-9

/** Human summary of a queued entry, read back from its payload for the outbox list. Null for payloads that are not ours. */
data class OmborSummary(val op: String, val nomi: String, val qty: String, val unit: String)

fun summarizePayload(payload: String): OmborSummary? = runCatching {
    val o = kotlinx.serialization.json.Json.parseToJsonElement(payload).obj() ?: return null
    when (o["amal"].str()) {
        AMAL_OMBOR_BERDIM -> OmborSummary("berdim", o["nomi"].str().orEmpty(), o["miqdor"].str().orEmpty(), o["birligi"].str().orEmpty())
        AMAL_OMBOR_OBYEKT -> OmborSummary(
            if (o["operatsiya"].str() == "rasxod") "rasxod" else "prixod",
            o["nomi"].str().orEmpty(), o["obyomi"].num()?.let { BigDecimal.valueOf(it).wire() }.orEmpty(), o["birligi"].str().orEmpty(),
        )
        else -> null
    }
}.getOrNull()
