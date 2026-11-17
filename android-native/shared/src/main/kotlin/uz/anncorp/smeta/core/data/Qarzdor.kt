package uz.anncorp.smeta.core.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * Boss: customer debt drill-down ("qarzdorlar"). Same server read as the web Qarzdorlik page for what the customers owe the company:
 * /api/sb `qarz_svod_v1` (frontend/src/api/t2-qarzdorlik.ts `qarzSvodOl`, rows with yonalish = debitor): per contract the contract value,
 * the F-3 sale, what was paid and the debt. A value the server could not know is null and is shown as a dash, never as 0. The per-object
 * panel (accepted F-2 package, paid, debt, percentages) is the object's line of the boss package `rahbar_panel_v1` that the app already
 * keeps ([RahbarObject]); nothing is added up per object on the device. Supplier / subcontractor debts (kreditor) stay on the website.
 */

@Serializable
data class DebtObject(val id: Long, val name: String)

@Serializable
data class DebtLine(
    val contractId: Long, val number: String?, val name: String?, val counterparty: String?,
    val contractSum: Double?, val f3Sale: Double?, val paid: Double?, val debt: Double?, val lastPayment: String?, val objects: List<DebtObject>,
)

fun debtRequest(companyId: Long): JsonObject = buildJsonObject { put("soro", "qarz_svod_v1"); put("kompaniya_id", companyId) }

/** `{ok:true, natija:{ok:true, qatorlar:[...]}}` -> customer (debitor) lines only. Null for any other shape. */
fun parseDebts(body: JsonElement?): List<DebtLine>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val natija = root["natija"].obj() ?: return null
    if ((natija["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val list = natija["qatorlar"].arr() ?: return null
    return list.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        if (o["yonalish"].str().let { it != null && it != "debitor" }) return@mapNotNull null
        DebtLine(
            o["shartnoma_id"].num()?.toLong() ?: return@mapNotNull null, o["raqam"].str(), o["nom"].str(), o["kontragent"].str(),
            o["shartnoma_summa"].num(), o["f3_sotuv"].num(), o["tolangan"].num(), o["qarz"].num(), o["oxirgi_tolov_sana"].str(),
            o["obyektlar"].arr().orEmpty().mapNotNull { x -> x.obj()?.let { p -> DebtObject(p["id"].num()?.toLong() ?: return@mapNotNull null, p["nom"].str().orEmpty()) } },
        )
    }
}

enum class DebtFilter { OWED, ALL, NO_PAYMENT }

/** Biggest debt first; unknown debts last. Search: counterparty, contract number / name, object name. */
fun filterDebts(lines: List<DebtLine>, filter: DebtFilter, query: String): List<DebtLine> {
    val q = normalizeSearch(query.trim())
    return lines.filter { l ->
        (q.isEmpty() || normalizeSearch(listOfNotNull(l.counterparty, l.number, l.name).joinToString(" ") + " " + l.objects.joinToString(" ") { it.name }).contains(q)) && when (filter) {
            DebtFilter.ALL -> true
            DebtFilter.OWED -> (l.debt ?: 0.0) > 0.0
            DebtFilter.NO_PAYMENT -> (l.paid ?: 0.0) <= 0.0 && (l.f3Sale ?: 0.0) > 0.0
        }
    }.sortedWith(compareByDescending<DebtLine> { it.debt != null }.thenByDescending { it.debt ?: 0.0 }.thenBy { it.counterparty.orEmpty().lowercase() })
}

/** Total of the known debts; null when no line has a known debt (not 0) plus how many lines are unknown. */
data class DebtTotal(val value: Double?, val unknown: Int, val lines: Int)

fun debtTotal(lines: List<DebtLine>): DebtTotal {
    val known = lines.mapNotNull { it.debt }
    return DebtTotal(if (known.isEmpty()) null else known.sum(), lines.count { it.debt == null }, lines.size)
}

