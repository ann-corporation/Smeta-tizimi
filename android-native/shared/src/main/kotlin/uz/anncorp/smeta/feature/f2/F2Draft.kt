package uz.anncorp.smeta.feature.f2

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.SumPack
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.parseSumPack
import uz.anncorp.smeta.core.data.parseVolume
import uz.anncorp.smeta.core.data.str

/*
 * F-2 draft workbench: wire contract + pure logic shared by Android and Windows (additive; no UI here).
 * Every number comes from the server: rows and the three sums (QQS bilan / ustamali / ustamasiz) from the `f2` tool, the effect of an edit from
 * the server dry-run preview (/api/f2-buyruq `vosita` f2_qoralama_tahrir -> token), the write only with `tasdiq` (token + tasdiqlayman).
 * The device never computes QQS, markup or totals; a missing figure stays null (not 0). Same wire as the site (frontend/src/api/f2-buyruq.ts,
 * lib/tekshiruv/pto.ts). Texnadzor suggestions: /api/tekshiruv?amal=akt and the PTO decision amal=qaror.
 */

const val F2_PAGE = 300
private const val F2_MAX_PAGES = 40

data class DraftRow(val qatorId: Long, val kod: String?, val nom: String, val birlik: String?, val hajm: Double?, val narx: Double?, val summa: Double?)

data class DraftHead(
    val aktId: Long, val obyektId: Long?, val raqam: String?, val oy: String?, val holat: String?, val lifecycle: String?, val versiya: Int?,
) {
    /** The server edits only a draft or a rejected F-2 (f2_qoralama_tahrir); everything else is read-only here. */
    val editable: Boolean get() = (lifecycle ?: holat) in EDITABLE
    private companion object { val EDITABLE = setOf("draft", "rejected", "qoralama", "rad_etilgan") }
}

/** [sums] = the server's package of the whole act; [unpriced] = rows without a price (server count). [next] = offset of the next page or null. */
data class DraftPage(val head: DraftHead, val rows: List<DraftRow>, val sums: SumPack?, val unpriced: Int?, val next: Int?)

fun f2ToolBody(companyId: Long, tool: String, args: JsonObject): JsonObject = buildJsonObject {
    put("amal", "vosita"); put("kompaniya_id", companyId); put("nom", tool); put("args", args)
}

fun f2ReadBody(companyId: Long, aktId: Long, offset: Int = 0, limit: Int = F2_PAGE): JsonObject =
    f2ToolBody(companyId, "f2", buildJsonObject { put("akt_id", aktId); put("limit", limit); put("offset", offset) })

fun f2ConfirmBody(companyId: Long, token: String): JsonObject = buildJsonObject {
    put("amal", "tasdiq"); put("kompaniya_id", companyId); put("token", token); put("tasdiqlayman", true)
}

private fun JsonElement?.ok(): Boolean = (this as? JsonObject)?.get("ok").let { it !is JsonPrimitive || it.booleanOrNull != false }

/** `{ok, akt:{...}, summa:{qqs_bilan,ustamali,ustamasiz,narxsiz_soni}, qatorlar:[...], keyingi_offset}` -> a page. Null for any other shape. */
fun parseF2Page(body: JsonElement?): DraftPage? {
    val o = body.obj() ?: return null
    if (!body.ok()) return null
    val akt = o["akt"].obj() ?: return null
    val id = akt["id"].num()?.toLong() ?: return null
    val head = DraftHead(id, akt["obyekt_id"].num()?.toLong(), akt["raqam"].str(), akt["oy"].str(), akt["holat"].str(), akt["lifecycle_status"].str(), akt["versiya"].num()?.toInt())
    val rows = (o["qatorlar"].arr() ?: return null).mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        val qid = r["qator_id"].num()?.toLong() ?: return@mapNotNull null
        DraftRow(qid, r["kod"].str(), r["nom"].str() ?: "#$qid", r["birlik"].str(), r["hajm"].num(), r["narx"].num(), r["summa"].num())
    }
    val sum = o["summa"]
    return DraftPage(head, rows, parseSumPack(sum), sum.obj()?.get("narxsiz_soni").num()?.toInt(), o["keyingi_offset"].num()?.toInt())
}

/** Edit of ONE row: a new volume (minus allowed, never 0) and/or a new price (QQS siz, never negative). [removed] rows leave the draft. */
data class DraftEdits(val changes: Map<Long, RowChange> = emptyMap(), val removed: Set<Long> = emptySet()) {
    val isEmpty: Boolean get() = changes.isEmpty() && removed.isEmpty()
    val count: Int get() = changes.size + removed.size
    fun change(id: Long, c: RowChange?): DraftEdits = copy(changes = if (c == null || c.isEmpty) changes - id else changes + (id to c), removed = removed - id)
    fun remove(id: Long): DraftEdits = copy(changes = changes - id, removed = removed + id)
    fun restore(id: Long): DraftEdits = copy(removed = removed - id)
}
data class RowChange(val hajm: Double? = null, val narx: Double? = null) { val isEmpty: Boolean get() = hajm == null && narx == null }

enum class FieldIssue { EMPTY, FORMAT, ZERO, NEGATIVE }

/** Volume field: a number, minus allowed (normaga keltirish), zero never. */
fun checkVolume(text: String): Pair<Double?, FieldIssue?> {
    if (text.isBlank()) return null to FieldIssue.EMPTY
    val v = parseVolume(text) ?: return null to FieldIssue.FORMAT
    return if (v == 0.0) null to FieldIssue.ZERO else v to null
}

/** Price field (QQS siz): a number, never negative. Empty = leave the price as it is. */
fun checkPrice(text: String): Pair<Double?, FieldIssue?> {
    if (text.isBlank()) return null to FieldIssue.EMPTY
    val v = parseVolume(text) ?: return null to FieldIssue.FORMAT
    return if (v < 0.0) null to FieldIssue.NEGATIVE else v to null
}

/** Args of f2_qoralama_tahrir (server limits: <=100 changes, <=200 removals). [version] = optimistic lock, null when unknown. */
fun f2EditArgs(aktId: Long, edits: DraftEdits, version: Int?): JsonObject = buildJsonObject {
    put("akt_id", aktId)
    if (edits.changes.isNotEmpty()) put("ozgartir", buildJsonArray {
        edits.changes.forEach { (id, c) -> add(buildJsonObject { put("qator_id", id); c.hajm?.let { put("hajm", it) }; c.narx?.let { put("narx", it) } }) }
    })
    if (edits.removed.isNotEmpty()) put("olib_tashla", buildJsonArray { edits.removed.sorted().forEach { add(JsonPrimitive(it)) } })
    if (version != null) put("kutilgan_versiya", version)
}

/** Does the edit fit the server limits? (one call carries <=100 changed and <=200 removed rows) */
fun editFits(edits: DraftEdits): Boolean = edits.changes.size <= 100 && edits.removed.size <= 200

data class PreviewChange(val field: String, val before: Double?, val after: Double?)
data class PreviewRow(val qatorId: Long, val kod: String?, val nom: String?, val birlik: String?, val changes: List<PreviewChange>, val removed: Boolean, val added: Boolean)
data class PreviewTotals(val before: SumPack?, val after: SumPack?, val diff: SumPack?)

/** A server dry-run: nothing is written until [token] is confirmed. [rejected] = the server refused the plan (text in [message]). */
data class DraftPreview(
    val token: String?, val title: String?, val rows: List<PreviewRow>, val totals: PreviewTotals, val warnings: List<String>,
    val rejected: Boolean, val message: String?,
)

sealed interface ToolResult {
    data class Preview(val value: DraftPreview) : ToolResult
    data class Error(val code: String?, val text: String?, val offline: Boolean = false) : ToolResult
}

/** `{ok:true, holat:'tasdiq_kerak'|'rad', tavsif, token, preview:{qatorlar,jami,natijalar}, ogohlantirish}`. */
fun parseToolPreview(r: ApiResult): ToolResult {
    if (r.networkError) return ToolResult.Error(null, null, offline = true)
    val o = r.body.obj()
    if (!r.ok || o == null || !r.body.ok()) return ToolResult.Error(r.code ?: o?.get("code").str() ?: "HTTP ${r.status}", o?.get("xabar").str())
    val p = o["preview"].obj()
    val rows = p?.get("qatorlar").arr().orEmpty().mapNotNull { e ->
        val q = e.obj() ?: return@mapNotNull null
        val id = q["qator_id"].num()?.toLong() ?: return@mapNotNull null
        PreviewRow(
            id, q["kod"].str(), q["nom"].str(), q["birlik"].str(),
            q["ozgarish"].arr().orEmpty().mapNotNull { c -> c.obj()?.let { PreviewChange(it["maydon"].str() ?: "", it["oldin"].num(), it["keyin"].num()) } },
            (q["olib_tashlandi"] as? JsonPrimitive)?.booleanOrNull == true, (q["yangi"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }
    val jami = p?.get("jami").obj()
    val totals = PreviewTotals(parseSumPack(jami?.get("oldin")), parseSumPack(jami?.get("keyin")), parseSumPack(jami?.get("farq")))
    val rejected = o["holat"].str() == "rad"
    val warnings = o["ogohlantirish"].arr().orEmpty().mapNotNull { it.str() }
    return ToolResult.Preview(DraftPreview(o["token"].str()?.takeIf { it.isNotBlank() }, o["tavsif"].str(), rows, totals, warnings, rejected, if (rejected) o["xabar"].str() else null))
}

/** Outcome of the confirm call: null = written. */
fun parseConfirm(r: ApiResult): ToolResult.Error? {
    if (r.networkError) return ToolResult.Error(null, null, offline = true)
    val o = r.body.obj()
    return if (r.ok && r.body.ok()) null else ToolResult.Error(r.code ?: o?.get("code").str() ?: "HTTP ${r.status}", o?.get("xabar").str())
}

/** Uzbek text of a failed preview / confirm; the server's own sentence wins. */
fun draftErrorText(e: ToolResult.Error): String = when {
    e.offline -> "Internet yo'q: o'zgarish faqat onlayn ko'rib chiqiladi va tasdiqlanadi."
    !e.text.isNullOrBlank() -> e.text
    else -> when (e.code) {
        "PERMISSION_DENIED" -> "Bu amal uchun ruxsatingiz yo'q."
        "STALE_VERSION", "VERSIYA_ESKIRGAN" -> "Hujjat boshqa joyda yangilangan. Qayta oching."
        "TOKEN_YAROQSIZ", "TOKEN_ESKIRGAN" -> "Tasdiq muddati tugagan. Qayta ko'rib chiqing."
        "DRY_RUN_YOQ" -> "Server hali bu amalni qo'llamaydi."
        null, "" -> "Noma'lum xato"
        else -> "Server xatosi: ${e.code}"
    }
}

/** Reads every page of the act (<= 40 x 300 rows). Pure of UI; null = the read failed. */
suspend fun loadF2Draft(api: BffApi, companyId: Long, aktId: Long): DraftPage? {
    var offset = 0; var first: DraftPage? = null; val rows = ArrayList<DraftRow>()
    repeat(F2_MAX_PAGES) {
        val p = parseF2Page(api.bff("/api/f2-buyruq", "POST", f2ReadBody(companyId, aktId, offset)).body) ?: return null
        if (first == null) first = p
        rows += p.rows
        offset = p.next ?: return first!!.copy(rows = rows)
    }
    return first?.copy(rows = rows, next = offset)
}

// ---------- texnadzor suggestions (PTO side) ----------

enum class SuggestFlag(val wire: String) { REMOVE("olib_tashlansin"), WRONG_VOLUME("hajm_notogri"), NEEDS_DOC("hujjat_kerak"), OK("qabul") }
enum class SuggestDecision(val wire: String) { PENDING("kutilmoqda"), ACCEPTED("qabul"), REJECTED("rad"), LATER("keyinroq") }

data class Suggestion(
    val id: Long, val qatorId: Long, val kod: String?, val nom: String?, val birlik: String?, val flag: SuggestFlag?, val note: String?, val suggestedVolume: Double?,
    val currentVolume: Double?, val addRow: Boolean, val decision: SuggestDecision, val decisionReason: String?, val docId: Long?, val stale: Boolean,
) { val pending: Boolean get() = decision == SuggestDecision.PENDING }

fun suggestionsPath(companyId: Long, aktId: Long) = "/api/tekshiruv?amal=akt&kompaniya_id=$companyId&akt_id=$aktId"

fun parseSuggestions(body: JsonElement?): List<Suggestion>? {
    val o = body.obj() ?: return null
    if (!body.ok()) return null
    return (o["takliflar"].arr() ?: return null).mapNotNull { e ->
        val t = e.obj() ?: return@mapNotNull null
        Suggestion(
            t["id"].num()?.toLong() ?: return@mapNotNull null, t["qator_id"].num()?.toLong() ?: return@mapNotNull null, t["kod"].str(), t["nom"].str(), t["birlik"].str(),
            SuggestFlag.entries.firstOrNull { it.wire == t["bayroq"].str() }, t["izoh"].str()?.takeIf { it.isNotBlank() }, t["taklif_hajm"].num(), t["joriy_hajm"].num(),
            (t["qosh"] as? JsonPrimitive)?.booleanOrNull == true, SuggestDecision.entries.firstOrNull { it.wire == t["qaror"].str() } ?: SuggestDecision.PENDING,
            t["qaror_sabab"].str(), t["hujjat_id"].num()?.toLong(), (t["eskirgan"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }
}

/** Header line of the block: N takliflar, M hal qilingan (+ documents still awaited). */
data class SuggestionSummary(val total: Int, val resolved: Int, val docsAwaited: Int)
fun summarize(list: List<Suggestion>) = SuggestionSummary(list.size, list.count { !it.pending }, list.count { it.flag == SuggestFlag.NEEDS_DOC && it.docId == null && it.decision != SuggestDecision.REJECTED })

/** One server tool call of the accept path: a preview that the PTO confirms before the next step. Mirror of lib/tekshiruv/pto.ts qabulQadamlari. */
data class AcceptStep(val tool: String, val args: JsonObject)

/** [draft] false (submitted / approved F-2): no write step, only the decision is recorded. Adding a row is done by hand in the editor. */
fun acceptSteps(s: Suggestion, aktId: Long, objectId: Long, version: Int?, draft: Boolean): List<AcceptStep> {
    if (!draft || s.addRow) return emptyList()
    if (s.flag == SuggestFlag.REMOVE) return listOf(
        AcceptStep("f2_qoralama_tahrir", buildJsonObject {
            put("akt_id", aktId); put("olib_tashla", buildJsonArray { add(JsonPrimitive(s.qatorId)) }); if (version != null) put("kutilgan_versiya", version)
        }),
        AcceptStep("bajarilmadi", buildJsonObject {
            put("obyekt_id", objectId); put("amal", "belgila"); put("qatorlar", buildJsonArray { add(buildJsonObject { put("qator_id", s.qatorId) }) })
            put("sabab_kod", "texnik_sabab"); put("sabab_izoh", "Texnadzor taklifi")
        }),
    )
    val v = s.suggestedVolume ?: return emptyList()
    return listOf(AcceptStep("f2_qoralama_tahrir", buildJsonObject {
        put("akt_id", aktId)
        put("ozgartir", buildJsonArray { add(buildJsonObject { put("qator_id", s.qatorId); put("hajm", v) }) })
        if (version != null) put("kutilgan_versiya", version)
    }))
}

const val REASON_MIN = 3
const val REASON_MAX = 1000

fun decisionBody(suggestionId: Long, d: SuggestDecision, reason: String?): JsonObject = buildJsonObject {
    put("amal", "qaror"); put("taklif_id", suggestionId); put("qaror", d.wire)
    if (d == SuggestDecision.REJECTED) put("sabab", reason?.trim()?.take(REASON_MAX)) else put("sabab", JsonNull)
}

/** Rejecting needs a reason of at least 3 characters (server SABAB_KERAK). */
fun reasonValid(d: SuggestDecision, reason: String): Boolean = d != SuggestDecision.REJECTED || reason.trim().length >= REASON_MIN

fun suggestionErrorText(code: String?): String = when (code) {
    "QAROR_QOYILGAN" -> "PTO bu taklifni allaqachon hal qilgan."
    "SABAB_KERAK" -> "Rad etish sababini kiriting."
    "RUXSAT_YOQ", "PERMISSION_DENIED" -> "Bu amal uchun ruxsatingiz yo'q."
    "TOPILMADI" -> "Taklif topilmadi."
    null, "" -> "Noma'lum xato"
    else -> "Server xatosi: $code"
}

/** Section a row belongs to, given a cached estimate tree (child id -> parent id, id -> (tur, nom)). Rows with no known section go to [null]. */
fun sectionOf(qatorId: Long, parent: Map<Long, Long?>, kind: Map<Long, Pair<String, String>>): String? {
    var cur: Long? = qatorId; var hops = 0
    while (cur != null && hops++ < 64) {
        val k = kind[cur]
        if (k != null && k.first == "rz") return k.second.takeIf { it.isNotBlank() }
        cur = parent[cur]
    }
    return null
}

/** Rows grouped in their original order by section name (null = no section, shown first without a header). */
fun <T> groupBySection(rows: List<T>, id: (T) -> Long, section: (Long) -> String?): List<Pair<String?, List<T>>> {
    val out = LinkedHashMap<String?, MutableList<T>>()
    rows.forEach { out.getOrPut(section(id(it))) { ArrayList() } += it }
    return out.entries.map { it.key to it.value }
}
