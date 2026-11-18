package uz.anncorp.smeta.feature.ombor

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

/*
 * Warehouse: the server's clarifying question, the period report (kirim-chiqim) and the balance on a date.
 * Wire (POST /api/ombor-buyruq through the BFF; the server computes everything, the device only shows it):
 *   tahlil  -> { ok, holat: "savol", savol, variantlar:[{ yorliq, tanlov:{ amal?, kontragent?, nomi?, birligi? } }] }   a question with buttons;
 *              the answer is the SAME request again with `tanlov` = the tapped button's choice (no new text is invented on the device).
 *   hisobot -> { amal:"hisobot", filtr:{ davr | dan,gacha, qidir, operatsiya } } -> { ok, davr:{dan,gacha}, jami:{...}, chetlatilgan, jami_qator, qatorlar:[...] }
 *   qoldiq  -> { amal:"qoldiq", sana:"YYYY-MM-DD", filtr:{ qidir } } -> { ok, sana, jami, qatorlar:[{ nomi, birligi, qoldiq, kirim, chiqim, oxirgi_sana }] }
 * Pure and tolerant; reused by the Windows app.
 */

/** One answer button of the question. Only the fields the server sent are set. */
data class AskOption(val label: String, val amal: String? = null, val kontragent: String? = null, val nomi: String? = null, val birligi: String? = null)

/** [text] is the question, [options] its buttons (possibly empty: then the user simply types more), [heard] the text it refers to. */
data class AskQuestion(val text: String, val options: List<AskOption>, val heard: String?)

/** `holat: "savol"` -> the question; any other answer -> null. A question without text still gets a neutral one (null text -> empty string, the UI shows its own hint). */
fun parseAskQuestion(root: JsonObject): AskQuestion? {
    if (root["holat"].str() != "savol") return null
    val options = root["variantlar"].arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val label = o["yorliq"].str()?.trim().orEmpty()
        val t = o["tanlov"].obj() ?: return@mapNotNull null
        val amal = t["amal"].str()?.takeIf { it == "prixod" || it == "chiqim" }
        val party = t["kontragent"].str()?.trim()?.takeIf { it.isNotEmpty() }
        val name = t["nomi"].str()?.trim()?.takeIf { it.isNotEmpty() }
        if (label.isEmpty() || (amal == null && party == null && name == null)) null else AskOption(label, amal, party, name, t["birligi"].str()?.trim()?.takeIf { it.isNotEmpty() })
    }.take(6)
    return AskQuestion(root["savol"].str()?.trim().orEmpty(), options, root["matn"].str()?.takeIf { it.isNotBlank() })
}

/** The retry request of a tapped button: the original text plus `tanlov` (server-side `tanlov` = amal / kontragent / nomi / birligi). */
fun askAnswerBody(companyId: Long, skladId: Long, lang: String, text: String, choice: AskOption): JsonObject = buildJsonObject {
    put("amal", "tahlil"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("til", if (lang.lowercase().startsWith("ru")) "rus" else "uzb"); put("matn", text.trim().take(500))
    put("tanlov", buildJsonObject {
        choice.amal?.let { put("amal", it) }
        choice.kontragent?.let { put("kontragent", it.take(200)) }
        choice.nomi?.let { put("nomi", it.take(500)) }
        choice.birligi?.let { put("birligi", it.take(100)) }
    })
}

// ---------- period report ----------

/** Period shortcuts the server understands (`filtr.davr`). */
enum class ReportPeriod(val wire: String) { TODAY("bugun"), YESTERDAY("kecha"), WEEK("hafta"), MONTH("oy"), LAST_MONTH("otgan_oy"), YEAR("yil") }

data class ReportRow(
    val id: Long, val date: String, val income: Boolean, val name: String, val unit: String, val qty: Double?, val party: String?, val objectName: String?,
    val price: Double?, val sum: Double?, val sumVat: Double?, val note: String?,
)
data class UnitTotal(val unit: String, val income: Double, val expense: Double)
data class ReportTotals(
    val incomeCount: Int, val expenseCount: Int, val units: List<UnitTotal>, val incomeSum: Double?, val incomeSumVat: Double?, val expenseSum: Double?, val expenseSumVat: Double?, val unpriced: Int,
)
data class Report(val from: String?, val to: String?, val totals: ReportTotals, val rows: List<ReportRow>, val totalRows: Int)

/** Either a preset ([period]) or an explicit range ([from]/[to], ISO dates, either side may be open). */
fun reportBody(companyId: Long, skladId: Long, period: ReportPeriod?, from: String?, to: String?, query: String?, expenseOnly: Boolean?, limit: Int = 200): JsonObject = buildJsonObject {
    put("amal", "hisobot"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("limit", limit)
    put("filtr", buildJsonObject {
        if (period != null) put("davr", period.wire) else { put("davr", "ixtiyoriy"); from?.let { put("dan", it) }; to?.let { put("gacha", it) } }
        query?.trim()?.takeIf { it.isNotEmpty() }?.let { put("qidir", it.take(120)) }
        when (expenseOnly) { true -> put("operatsiya", "chiqim"); false -> put("operatsiya", "kirim"); null -> {} }
    })
}

fun parseReport(body: JsonElement?): Report? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val j = root["jami"].obj() ?: return null
    val davr = root["davr"].obj()
    val rows = root["qatorlar"].arr().orEmpty().mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val name = o["nomi"].str()?.trim().orEmpty().ifEmpty { return@mapNotNull null }
        ReportRow(
            o["id"].num()?.toLong() ?: 0L, o["sana"].str().orEmpty().take(10), o["operatsiya"].str() == "prixod", name, o["birligi"].str().orEmpty(), o["obyomi"].num(),
            o["kontragent"].str()?.takeIf { it.isNotBlank() }, o["obyekt"].str()?.takeIf { it.isNotBlank() }, o["narx"].num(), o["summa"].num(), o["summa_qqs"].num(), o["izoh"].str()?.takeIf { it.isNotBlank() },
        )
    }
    val units = j["birliklar"].arr().orEmpty().mapNotNull { it.obj() }.map { UnitTotal(it["birligi"].str().orEmpty(), it["kirim"].num() ?: 0.0, it["chiqim"].num() ?: 0.0) }
    return Report(
        davr?.get("dan").str(), davr?.get("gacha").str(),
        ReportTotals(j["kirim_soni"].num()?.toInt() ?: 0, j["chiqim_soni"].num()?.toInt() ?: 0, units, j["kirim_summa"].num(), j["kirim_summa_qqs"].num(), j["chiqim_summa"].num(), j["chiqim_summa_qqs"].num(), j["narxsiz_soni"].num()?.toInt() ?: 0),
        rows, root["jami_qator"].num()?.toInt() ?: rows.size,
    )
}

// ---------- balance on a date ----------

data class DateBalanceRow(val name: String, val unit: String, val qty: Double?, val income: Double?, val expense: Double?, val lastDate: String?)

fun stockOnDateBody(companyId: Long, skladId: Long, date: String, query: String?, limit: Int = 300): JsonObject = buildJsonObject {
    put("amal", "qoldiq"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("sana", date); put("limit", limit)
    put("filtr", buildJsonObject { query?.trim()?.takeIf { it.isNotEmpty() }?.let { put("qidir", it.take(120)) } })
}

fun parseStockOnDate(body: JsonElement?): List<DateBalanceRow>? {
    val root = body.obj() ?: return null
    if ((root["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return root["qatorlar"].arr()?.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val name = o["nomi"].str()?.trim().orEmpty().ifEmpty { return@mapNotNull null }
        DateBalanceRow(name, o["birligi"].str().orEmpty(), o["qoldiq"].num(), o["kirim"].num(), o["chiqim"].num(), o["oxirgi_sana"].str())
    }
}
