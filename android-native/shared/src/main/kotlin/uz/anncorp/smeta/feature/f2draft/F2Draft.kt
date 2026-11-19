package uz.anncorp.smeta.feature.f2draft

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.parseVolume
import uz.anncorp.smeta.core.data.str

/*
 * F-2 tayyorlash (draft editing) shared by Windows and Android. SAME wire as the website: the single server point POST /api/f2-buyruq
 * (frontend/functions/api/f2-buyruq.ts): `vosita f2` reads the act rows, `vosita f2_qoralama_tahrir` returns a PREVIEW (server dry run, nothing
 * written) + token, `tasdiq` writes. Texnadzor suggestions: /api/tekshiruv (the PTO side). Nothing here computes money: sums are the server's
 * triple (QQS bilan / ustamali / ustamasiz); the app validates only what the site validates (volume not 0 - minus is allowed, price not negative).
 */

data class SumTriple(val qqsBilan: Double?, val ustamali: Double?, val ustamasiz: Double?)

data class DraftAct(val id: Long, val raqam: String?, val versiya: Int?, val holat: String?, val lifecycle: String?) {
    /** Only a draft or a rejected act is editable (server rule; the site says the same). */
    val editable: Boolean get() = (lifecycle ?: holat)?.lowercase() in setOf("draft", "qoralama", "rejected", "rad_etilgan")
}

data class DraftRow(val id: Long, val qatorId: Long, val kod: String?, val nom: String, val birlik: String?, val hajm: Double?, val narx: Double?, val summa: Double?, val izoh: String?) {
    /** A negative volume is a legal "normaga keltirish" row: shown as such, never dropped. */
    val minus: Boolean get() = (hajm ?: 0.0) < 0.0
}

data class DraftSheet(val act: DraftAct, val rows: List<DraftRow>, val total: SumTriple?, val nextOffset: Int?)

/** One edited cell group of a row. null = untouched. [narxsiz] true = the conscious "no price" mark. */
data class RowEdit(val qatorId: Long, val hajm: Double? = null, val narx: Double? = null, val narxsiz: Boolean? = null)

data class Change(val field: String, val old: Double?, val new: Double?)
data class PreviewRow(val qatorId: Long, val kod: String?, val nom: String?, val birlik: String?, val changes: List<Change>, val removed: Boolean, val added: Boolean)
data class DraftPreview(
    val token: String?, val tavsif: String?, val rows: List<PreviewRow>, val before: SumTriple?, val after: SumTriple?, val diff: SumTriple?,
    val warnings: List<String>, val failedSteps: List<String>,
)

sealed interface F2Out<out T> {
    data class Ok<T>(val value: T, val body: JsonObject? = null) : F2Out<T>
    data class Fail(val code: String?, val text: String?, val offline: Boolean = false, val stale: Boolean = false) : F2Out<Nothing>
}

// ---------- parsing ----------

private fun JsonElement?.triple(): SumTriple? = obj()?.let { SumTriple(it["qqs_bilan"].num(), it["ustamali"].num(), it["ustamasiz"].num()) }

/** Reply of `vosita f2`: the act header, its rows (every row is kept, minus included) and the server sum triple. Null for another shape. */
fun parseSheet(body: JsonElement?): DraftSheet? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val a = o["akt"].obj() ?: return null
    val act = DraftAct(a["id"].num()?.toLong() ?: return null, a["raqam"].str(), a["versiya"].num()?.toInt(), a["holat"].str(), a["lifecycle_status"].str())
    val rows = o["qatorlar"].arr()?.mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        DraftRow(
            r["id"].num()?.toLong() ?: return@mapNotNull null, r["qator_id"].num()?.toLong() ?: return@mapNotNull null, r["kod"].str(),
            r["nom"].str() ?: "", r["birlik"].str(), r["hajm"].num(), r["narx"].num(), r["summa"].num(), r["izoh"].str(),
        )
    } ?: return null
    return DraftSheet(act, rows, o["summa"].triple(), o["keyingi_offset"].num()?.toInt())
}

/** Reply of a write tool in preview mode (`holat: tasdiq_kerak`): changed rows old -> new, totals before/after/difference, warnings and the confirm token. */
fun parsePreview(body: JsonElement?): DraftPreview? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    val p = o["preview"].obj()
    val rows = p?.get("qatorlar").arr()?.mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        PreviewRow(
            r["qator_id"].num()?.toLong() ?: return@mapNotNull null, r["kod"].str(), r["nom"].str(), r["birlik"].str(),
            r["ozgarish"].arr()?.mapNotNull { c -> c.obj()?.let { Change(it["maydon"].str() ?: return@mapNotNull null, it["oldin"].num(), it["keyin"].num()) } }.orEmpty(),
            (r["olib_tashlandi"] as? JsonPrimitive)?.booleanOrNull == true, (r["yangi"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }.orEmpty()
    val jami = p?.get("jami").obj()
    val failed = p?.get("natijalar").arr()?.mapNotNull { it.obj() }?.filter { (it["ok"] as? JsonPrimitive)?.booleanOrNull == false }?.map { it["xabar"].str() ?: it["rpc"].str() ?: "?" }.orEmpty()
    return DraftPreview(
        o["token"].str(), o["tavsif"].str(), rows, jami?.get("oldin").triple(), jami?.get("keyin").triple(), jami?.get("farq").triple(),
        o["ogohlantirish"].arr()?.mapNotNull { it.str() }.orEmpty(), failed,
    )
}

/** Server error of an /api/f2-buyruq call -> [F2Out.Fail]. 409 = the data changed after the preview (or a stale version): reload and preview again. */
fun f2Failure(r: ApiResult): F2Out.Fail {
    if (r.networkError) return F2Out.Fail(null, null, offline = true)
    val o = r.body.obj()
    val code = r.code ?: o?.get("code").str()
    return F2Out.Fail(code, o?.get("xabar").str(), stale = r.status == 409 || code == "VERSIYA_ESKIRGAN" || code == "STALE_VERSION")
}

private fun ok(r: ApiResult): Boolean = r.ok && (r.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull != false

// ---------- validation (the same rules as the site: F2TayyorlashNative XATO_MATN) ----------

sealed interface CellCheck {
    data class Valid(val value: Double) : CellCheck
    data class Invalid(val text: String) : CellCheck
}

/** Volume: any non-zero number (minus is allowed: "normaga keltirish"). */
fun checkHajm(text: String): CellCheck {
    val v = parseVolume(text) ?: return CellCheck.Invalid("Hajm son bo'lsin")
    return if (v == 0.0) CellCheck.Invalid("Hajm 0 bo'lmasligi kerak (minus ham mumkin)") else CellCheck.Valid(v)
}

/** Price (QQS siz): a number that is not negative. */
fun checkNarx(text: String): CellCheck {
    val v = parseVolume(text) ?: return CellCheck.Invalid("Narx noto'g'ri (son bo'lsin)")
    return if (v < 0.0) CellCheck.Invalid("Narx manfiy bo'lmasin") else CellCheck.Valid(v)
}

const val MAX_EDITS = 100
const val MAX_REMOVES = 200

// ---------- request bodies ----------

private fun call(companyId: Long, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): JsonObject = buildJsonObject { put("kompaniya_id", companyId); build() }

fun readBody(companyId: Long, aktId: Long, offset: Int = 0): JsonObject = call(companyId) {
    put("amal", "vosita"); put("nom", "f2"); put("args", buildJsonObject { put("akt_id", aktId); put("limit", 300); put("offset", offset) })
}

/** `f2_qoralama_tahrir`: edits [{qator_id, hajm?, narx?, narxsiz?}] (<= 100) and removals (<= 200); [version] is the optimistic lock (`kutilgan_versiya`). */
fun editBody(companyId: Long, aktId: Long, version: Int?, edits: List<RowEdit>, remove: List<Long>): JsonObject = call(companyId) {
    put("amal", "vosita"); put("nom", "f2_qoralama_tahrir")
    put("args", buildJsonObject {
        put("akt_id", aktId)
        if (edits.isNotEmpty()) put("ozgartir", buildJsonArray { edits.forEach { e -> add(buildJsonObject { put("qator_id", e.qatorId); e.hajm?.let { put("hajm", it) }; e.narx?.let { put("narx", it) }; e.narxsiz?.let { put("narxsiz", it) } }) } })
        if (remove.isNotEmpty()) put("olib_tashla", buildJsonArray { remove.forEach { add(JsonPrimitive(it)) } })
        if (version != null) put("kutilgan_versiya", version)
    })
}

fun toolBody(companyId: Long, nom: String, args: JsonObject): JsonObject = call(companyId) { put("amal", "vosita"); put("nom", nom); put("args", args) }
fun confirmBody(companyId: Long, token: String): JsonObject = call(companyId) { put("amal", "tasdiq"); put("token", token); put("tasdiqlayman", true) }

class F2DraftRepository(private val api: BffApi) {
    private suspend fun post(b: JsonObject) = api.bff("/api/f2-buyruq", "POST", b)

    /** Reads every page of the act rows. */
    suspend fun sheet(companyId: Long, aktId: Long): F2Out<DraftSheet> {
        var first: DraftSheet? = null; val all = ArrayList<DraftRow>(); var off = 0
        while (true) {
            val r = post(readBody(companyId, aktId, off))
            if (!ok(r)) return f2Failure(r)
            val s = parseSheet(r.body) ?: return F2Out.Fail("BAD_SHAPE", null)
            first = first ?: s; all += s.rows
            off = s.nextOffset ?: break
            if (all.size >= 20_000) break
        }
        return F2Out.Ok(first!!.copy(rows = all, nextOffset = null))
    }

    /** Preview of a write tool (nothing is saved). */
    suspend fun preview(body: JsonObject): F2Out<DraftPreview> {
        val r = post(body)
        if (!ok(r)) return f2Failure(r)
        val p = parsePreview(r.body) ?: return F2Out.Fail("BAD_SHAPE", null)
        return if (p.token == null) F2Out.Fail("TOKEN_YOQ", r.body.obj()?.get("xabar").str()) else F2Out.Ok(p, r.body.obj())
    }

    /** The ONLY call that writes: the owner pressed «Tasdiqlayman». The token is bound to actor + company + plan (409 if the data moved on). */
    suspend fun confirm(companyId: Long, token: String): F2Out<Unit> {
        val r = post(confirmBody(companyId, token))
        return if (ok(r)) F2Out.Ok(Unit, r.body.obj()) else f2Failure(r)
    }
}

/** Uzbek text of an /api/f2-buyruq failure (server `xabar` first, then the code). */
fun f2FailText(f: F2Out.Fail): String = when {
    f.offline -> "Internet yo'q: F-2 o'zgarishlari faqat onlayn yoziladi."
    f.stale -> "Hujjat boshqa joyda o'zgargan. Yangilab (F5), qayta ko'rib chiqing."
    f.code == "PERMISSION_DENIED" -> "Bu amal uchun ruxsatingiz yo'q."
    !f.text.isNullOrBlank() -> f.text
    f.code == "TOKEN_YOQ" -> "Server tasdiq tokenini bermadi."
    f.code == "VERSIYA_NOTOGRI" -> "Versiya noto'g'ri."
    else -> "Server xatosi: ${f.code ?: "noma'lum"}"
}

// ---------- texnadzor takliflari (PTO side; web F2TekshiruvTakliflari + lib/tekshiruv/pto.ts) ----------

data class Taklif(
    val id: Long, val qatorId: Long, val kod: String?, val nom: String?, val birlik: String?, val bayroq: String?, val izoh: String?, val taklifHajm: Double?,
    val hujjatTuri: String?, val qosh: Boolean, val qaror: String, val qarorSabab: String?, val hujjatId: Long?, val joriyHajm: Double?, val eskirgan: Boolean,
)
data class QabulQadam(val nom: String, val args: JsonObject)
data class TakliflarXulosa(val jami: Int, val hal: Int, val hujjatKutilmoqda: Int)

fun parseTakliflar(body: JsonElement?): List<Taklif>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return o["takliflar"].arr()?.mapNotNull { e ->
        val t = e.obj() ?: return@mapNotNull null
        Taklif(
            t["id"].num()?.toLong() ?: return@mapNotNull null, t["qator_id"].num()?.toLong() ?: return@mapNotNull null, t["kod"].str(), t["nom"].str(), t["birlik"].str(),
            t["bayroq"].str(), t["izoh"].str(), t["taklif_hajm"].num(), t["hujjat_turi"].str(), (t["qosh"] as? JsonPrimitive)?.booleanOrNull == true,
            t["qaror"].str() ?: "kutilmoqda", t["qaror_sabab"].str(), t["hujjat_id"].num()?.toLong(), t["joriy_hajm"].num(), (t["eskirgan"] as? JsonPrimitive)?.booleanOrNull == true,
        )
    }
}

fun takliflarXulosa(t: List<Taklif>) = TakliflarXulosa(t.size, t.count { it.qaror != "kutilmoqda" }, t.count { it.bayroq == "hujjat_kerak" && it.hujjatId == null && it.qaror != "rad" })

/**
 * «Qabul» -> the write steps it implies (each goes preview -> «Tasdiqlayman» through the same gateway; PTO decides, nothing is written silently):
 * a proposed volume -> f2_qoralama_tahrir; «olib tashlansin» -> f2_qoralama_tahrir remove + bajarilmadi mark (the estimate row stays, only the F-2 loses it).
 * A non-draft act or an «add» suggestion writes nothing: only the decision.
 */
fun qabulQadamlari(x: Taklif, companyId: Long, aktId: Long, obyektId: Long, versiya: Int?, qoralama: Boolean): List<QabulQadam> {
    if (!qoralama || x.qosh) return emptyList()
    fun tahrir(build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = QabulQadam("f2_qoralama_tahrir", buildJsonObject { put("akt_id", aktId); build(); if (versiya != null) put("kutilgan_versiya", versiya) })
    if (x.bayroq == "olib_tashlansin") return listOf(
        tahrir { put("olib_tashla", buildJsonArray { add(JsonPrimitive(x.qatorId)) }) },
        QabulQadam("bajarilmadi", buildJsonObject {
            put("obyekt_id", obyektId); put("amal", "belgila"); put("qatorlar", buildJsonArray { add(buildJsonObject { put("qator_id", x.qatorId) }) })
            put("sabab_kod", "texnik_sabab"); put("sabab_izoh", "Texnadzor taklifi")
        }),
    )
    if (x.taklifHajm != null) return listOf(tahrir { put("ozgartir", buildJsonArray { add(buildJsonObject { put("qator_id", x.qatorId); put("hajm", x.taklifHajm) }) }) })
    return emptyList()
}

fun takliflarPath(companyId: Long, aktId: Long) = "/api/tekshiruv?amal=akt&kompaniya_id=$companyId&akt_id=$aktId"
fun qarorBody(taklifId: Long, qaror: String, sabab: String?): JsonObject = buildJsonObject {
    put("amal", "qaror"); put("taklif_id", taklifId); put("qaror", qaror); if (sabab == null) put("sabab", JsonPrimitive(null as String?)) else put("sabab", sabab)
}

class TakliflarRepository(private val api: BffApi) {
    suspend fun list(companyId: Long, aktId: Long): List<Taklif> = parseTakliflar(api.bff(takliflarPath(companyId, aktId)).body).orEmpty()
    /** PTO decision. «Rad» needs a reason of >= 3 characters (as the site). null = saved, else the error code. */
    suspend fun decide(taklifId: Long, qaror: String, sabab: String? = null): String? {
        if (qaror == "rad" && (sabab?.trim()?.length ?: 0) < 3) return "SABAB_KERAK"
        val r = api.bff("/api/tekshiruv", "POST", qarorBody(taklifId, qaror, sabab?.trim()))
        return if (ok(r)) null else if (r.networkError) "TARMOQ_XATO" else (r.code ?: r.body.obj()?.get("code").str() ?: "SERVER_XATO")
    }
}

fun takliflarErrorText(code: String): String = when (code) {
    "SABAB_KERAK" -> "Rad etish uchun sabab yozing"
    "QAROR_QOYILGAN" -> "PTO bu taklifni allaqachon hal qilgan"
    "RUXSAT_YOQ", "PERMISSION_DENIED" -> "Bu tekshiruvga ruxsatingiz yo'q"
    "TARMOQ_XATO" -> "Internet yo'q"
    else -> "Bajarib bo'lmadi. Keyinroq urinib ko'ring."
}

// ---------- pending edits (view-model of the editor; pure) ----------

/** What the person typed into one row: raw text (kept as typed until Saqlash), or the conscious «narxsiz» mark. */
data class Pending(val hajm: String? = null, val narx: String? = null, val narxsiz: Boolean? = null)

/**
 * The unsaved changes of an open draft: typed cell texts and rows marked for removal. Nothing leaves the device until the owner presses
 * Saqlash -> preview -> Tasdiqlayman; a cell typed back to its original value is dropped from the list.
 */
data class DraftEdits(val cells: Map<Long, Pending> = emptyMap(), val removed: Set<Long> = emptySet()) {
    val count: Int get() = cells.size + removed.size
    val isEmpty: Boolean get() = count == 0

    fun setCell(row: DraftRow, field: String, text: String): DraftEdits {
        val cur = cells[row.qatorId] ?: Pending()
        val orig = if (field == "hajm") row.hajm else row.narx
        val same = parseVolume(text)?.let { it == orig } ?: false
        val next = if (field == "hajm") cur.copy(hajm = text.takeUnless { same }) else cur.copy(narx = text.takeUnless { same }, narxsiz = null)
        return withPending(row.qatorId, next)
    }
    fun markNarxsiz(row: DraftRow, on: Boolean): DraftEdits = withPending(row.qatorId, (cells[row.qatorId] ?: Pending()).copy(narxsiz = if (on) true else null, narx = null))
    fun remove(ids: Collection<Long>): DraftEdits = copy(removed = removed + ids)
    fun restore(ids: Collection<Long>): DraftEdits = copy(removed = removed - ids.toSet())
    private fun withPending(id: Long, p: Pending): DraftEdits = copy(cells = if (p.hajm == null && p.narx == null && p.narxsiz == null) cells - id else cells + (id to p))

    /** qator_id -> error text for every typed cell the site would reject. Removed rows are not validated. */
    fun errors(): Map<Long, String> = cells.filterKeys { it !in removed }.mapNotNull { (id, p) ->
        val e = p.hajm?.let { (checkHajm(it) as? CellCheck.Invalid)?.text } ?: p.narx?.let { (checkNarx(it) as? CellCheck.Invalid)?.text }
        e?.let { id to it }
    }.toMap()

    /** Edits for the request, or null while any cell is invalid. A row marked for removal is only removed. */
    fun toEdits(): List<RowEdit>? {
        if (errors().isNotEmpty()) return null
        return cells.filterKeys { it !in removed }.map { (id, p) ->
            RowEdit(id, p.hajm?.let { (checkHajm(it) as CellCheck.Valid).value }, p.narx?.let { (checkNarx(it) as CellCheck.Valid).value }, p.narxsiz)
        }
    }

    /** One server call carries at most 100 edits / 200 removals: more is a clear message, never a silent cut. */
    fun limitText(): String? = when {
        cells.size > MAX_EDITS -> "Bir saqlashda $MAX_EDITS tadan ko'p qator o'zgartirib bo'lmaydi (${cells.size}). Avval saqlang, keyin davom eting."
        removed.size > MAX_REMOVES -> "Bir saqlashda $MAX_REMOVES tadan ko'p qator olib tashlab bo'lmaydi (${removed.size})."
        else -> null
    }
}
