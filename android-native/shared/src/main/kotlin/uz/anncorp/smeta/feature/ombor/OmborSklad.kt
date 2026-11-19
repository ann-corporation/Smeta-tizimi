package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.qqsBilan
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.core.data.yaxlit2
import java.math.BigDecimal

/*
 * Ombor (Sklad qoldiq) page logic, ported 1:1 from the site: frontend/src/lib/ombor-kunlik/sklad-birinchi.ts, lib/kompaniya-ops-korinish.ts (skladXulosa),
 * lib/ombor-moslash/narx.ts, components/ombor/ombor-xato.ts and the wire of OmborKiritish / MarkaziyBerdimForm. Pure and testable; the server decides everything
 * that matters (permission, stock, QQS conversion on write, idempotency by operation_id).
 */

/** Initial warehouse choice (site boshSkladTanlovi): one warehouse -> it; otherwise "all" (null). The previous choice is kept while it still exists. */
fun pickWarehouse(list: List<Warehouse>, previousAll: Boolean, previous: Long?): Long? = when {
    previousAll && list.size > 1 -> null
    previous != null && list.any { it.id == previous } -> previous
    list.size == 1 -> list[0].id
    else -> null
}

/** One company stock position (t2_sklad_qoldiq). Unlike [StockRow] zero rows are KEPT: the KPI «Tugagan (0)» counts them. */
data class SkladRow(val obyektId: Long?, val qty: Double?, val last: String?)

fun parseSkladRows(rows: List<JsonObject>): List<SkladRow> = rows.map { SkladRow(it["obyekt_id"].num()?.toLong(), it["qoldiq"].num(), it["oxirgi_harakat"].str()) }

data class SkladSummary(val positions: Int, val negative: Int, val zero: Int, val last: String?)

/** Site skladXulosa: negative < 0, zero == 0, latest `oxirgi_harakat` (string compare, ISO). */
fun skladSummary(rows: List<SkladRow>): SkladSummary {
    var neg = 0; var zero = 0; var last: String? = null
    for (r in rows) {
        if (r.qty != null && r.qty < 0) neg++ else if (r.qty == 0.0) zero++
        if (!r.last.isNullOrEmpty() && (last == null || r.last > last)) last = r.last
    }
    return SkladSummary(rows.size, neg, zero, last)
}

// ---------- price (site lib/ombor-moslash/narx.ts) ----------
const val QQS_DEFAULT = 12.0
enum class PriceMode(val wire: String) { WITH("bilan"), WITHOUT("siz") }

/** Entered price (by mode) -> canonical QQS siz; invalid -> null. */
fun priceNet(value: Double?, mode: PriceMode, percent: Double = QQS_DEFAULT): Double? {
    if (value == null || !value.isFinite() || value <= 0) return null
    return yaxlit2(if (mode == PriceMode.WITH) value / (1 + percent / 100) else value)
}
fun priceGross(net: Double?, percent: Double = QQS_DEFAULT): Double? = if (net == null) null else qqsBilan(net, percent)

// ---------- suggestions (/api/ombor-buyruq taklif) ----------
data class Suggest(
    val name: String, val unit: String, val qtyMedian: Double?, val priceLast: Double?, val priceLastGross: Double?, val supplier: String?, val balance: Double?,
)
data class SupplierSuggest(val name: String)
data class SuggestResult(val vat: Double, val items: List<Suggest>, val suppliers: List<SupplierSuggest>)

fun suggestRequest(companyId: Long, skladId: Long, q: String, kind: String, supplier: String?): JsonObject = buildJsonObject {
    put("amal", "taklif"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("q", q.trim().take(120)); put("tur", if (kind == "chiqim") "chiqim" else "prixod")
    if (!supplier.isNullOrBlank()) put("yetkazuvchi", supplier.trim().take(200)); put("limit", 6)
}

fun parseSuggestResult(body: JsonElement?): SuggestResult? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val items = o["takliflar"].arr().orEmpty().mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        val n = r["nomi"].str()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        Suggest(n, r["birligi"].str().orEmpty(), r["miqdor_median"].num(), r["narx_oxirgi"].num(), r["narx_oxirgi_qqs"].num(), r["kontragent"].str(), r["qoldiq"].num())
    }
    val sup = o["kontragentlar"].arr().orEmpty().mapNotNull { e -> e.obj()?.get("nomi").str()?.takeIf { it.isNotBlank() }?.let { SupplierSuggest(it) } }
    return SuggestResult(o["qqs_foiz"].num() ?: QQS_DEFAULT, items, sup)
}

// ---------- write (site omborYoz) ----------
data class KirimInput(
    val kind: String, val name: String, val unit: String, val qty: String, val price: String?, val mode: PriceMode, val date: String, val party: String?, val operationId: String,
)

/** Same fields as the site YozInput; the price travels with its mode and the SERVER converts it to QQS siz. */
fun yozBody(companyId: Long, skladId: Long, i: KirimInput): JsonObject = buildJsonObject {
    put("amal", "yoz"); put("kompaniya_id", companyId); put("sklad_id", skladId)
    put("operatsiya", if (i.kind == "chiqim") "chiqim" else "prixod"); put("nomi", i.name.trim()); put("birligi", i.unit.trim()); put("miqdor", i.qty)
    if (i.kind != "chiqim" && !i.price.isNullOrBlank()) { put("narx", i.price); put("narx_rejim", i.mode.wire) }
    put("sana", i.date)
    if (!i.party.isNullOrBlank()) put("kontragent", i.party.trim())
    put("operation_id", i.operationId)
}

enum class KirimIssue { REQUIRED, PRICE }

/** Site saqla() checks: name, unit and quantity > 0 are required; a filled price must be > 0. */
fun checkKirim(name: String, unit: String, qty: String, price: String): KirimIssue? {
    val m = qty.replace(',', '.').trim().toDoubleOrNull()
    if (name.isBlank() || unit.isBlank() || m == null || !(m > 0)) return KirimIssue.REQUIRED
    val p = price.replace(',', '.').replace(Regex("\\s"), "").trim()
    if (p.isNotEmpty() && !((p.toDoubleOrNull() ?: 0.0) > 0)) return KirimIssue.PRICE
    return null
}

/** `{ok:true, takror?, harakat_id}` -> null; else the server code. */
fun omborCode(r: ApiResult): String? {
    if (r.networkError) return "NETWORK"
    val o = r.body.obj()
    return if (r.ok && (o?.get("ok") as? JsonPrimitive)?.booleanOrNull != false) null else r.code ?: o?.get("code").str() ?: "HTTP ${r.status}"
}

// ---------- BERDIM (site MarkaziyBerdimForm) ----------
/** Site berdimMiqdor: a positive number, comma or dot; else null. */
fun berdimQty(input: String): BigDecimal? {
    val t = input.trim().replace(" ", "").replace(',', '.')
    if (t.isEmpty() || !Regex("^\\d*\\.?\\d+$").matches(t)) return null
    return runCatching { BigDecimal(t) }.getOrNull()?.takeIf { it.signum() > 0 }
}

/** Same operation id for the same data (a second tap never writes twice); a changed form gets a new one (site op.current logic). */
class BerdimOp(private val newId: () -> String) {
    private var key: String? = null; private var id: String? = null
    fun idFor(company: Long, sklad: Long, objectId: Long, name: String, unit: String, qty: String, date: String, to: String): String {
        val k = listOf(company, sklad, objectId, name, unit, qty, date, to.trim()).joinToString("|")
        if (key != k) { key = k; id = newId() }
        return id!!
    }
    fun done() { key = null; id = null }
}
