package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * Approvals inbox and "Today" numbers. Wire shapes mirror the web client (frontend/src/api/t2-hujjat-aylanish.ts) and the
 * Telegram bot's logic (functions/_shared/telegram-bot-oqim.ts: zanjirHolatiOl / hujjatTafsiloti / tasdiqBajar,
 * functions/_shared/telegram-bot.ts: bugunSonlari). The gateway (/api/hujjat-aylanish) derives the actor from the device and the
 * database checks membership, role and whose turn it is; the app only sends the decision.
 */

// ---------- inbox ----------

data class ApprovalItem(
    val id: Long, val tur: String, val sarlavha: String, val raund: Int, val yaratildi: String?, val muddat: String?,
    val rol: String?, val egasi: String?, val kechikkan: Boolean,
)

/** The gateway returns the RPC object as is (it carries `ok`) or wrapped as `{ok:true, natija}`; both are accepted. */
internal fun payload(body: JsonElement?): JsonObject? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return o["natija"].obj() ?: o
}

fun parseInbox(body: JsonElement?): List<ApprovalItem>? {
    val p = payload(body) ?: return null
    val list = p["zanjirlar"].arr() ?: return null
    return list.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        ApprovalItem(
            id = o["id"].num()?.toLong() ?: return@mapNotNull null, tur = o["hujjat_turi"].str().orEmpty(), sarlavha = o["sarlavha"].str().orEmpty(),
            raund = o["raund"].num()?.toInt() ?: 1, yaratildi = o["yaratildi"].str(), muddat = o["muddat"].str(), rol = o["rol"].str(),
            egasi = o["egasi_nom"].str(), kechikkan = (o["kechikkan"] as? JsonPrimitive)?.booleanOrNull ?: false,
        )
    }
}

fun inboxCount(body: JsonElement?): Int? = payload(body)?.get("sanoq").obj()?.get("zanjir").num()?.toInt()

// ---------- detail ----------

data class ApprovalStep(val tartib: Int, val rol: String, val holat: String, val muddat: String?, val izoh: String?, val men: Boolean)
data class ApprovalDetail(
    val id: Long, val tur: String, val sarlavha: String, val holat: String, val raund: Int, val obyektId: Long?,
    val manbaJadval: String?, val manbaId: Long?, val yaratildi: String?, val steps: List<ApprovalStep>,
) {
    /** My open step (state `navbat` and `men`), only while the chain is running. */
    val myStep: ApprovalStep? get() = if (holat == "jarayonda") steps.firstOrNull { it.holat == "navbat" && it.men } else null
    val myTurn get() = myStep != null
    /** Identifies "this decision, this round, this step" so a changed chain is never approved by mistake (same idea as the bot's tq:id:raund-tartib). */
    val stepToken: String? get() = myStep?.let { "$raund-${it.tartib}" }
}

fun parseZanjir(body: JsonElement?): ApprovalDetail? {
    val p = payload(body) ?: return null
    val z = p["zanjir"].obj() ?: return null
    val steps = p["qadamlar"].arr()?.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        ApprovalStep(o["tartib"].num()?.toInt() ?: return@mapNotNull null, o["rol"].str().orEmpty(), o["holat"].str().orEmpty(), o["muddat"].str(), o["izoh"].str(),
            (o["men"] as? JsonPrimitive)?.booleanOrNull ?: false)
    }.orEmpty()
    return ApprovalDetail(
        id = z["id"].num()?.toLong() ?: return null, tur = z["hujjat_turi"].str().orEmpty(), sarlavha = z["sarlavha"].str().orEmpty(), holat = z["holat"].str().orEmpty(),
        raund = z["raund"].num()?.toInt() ?: 1, obyektId = z["obyekt_id"].num()?.toLong()?.takeIf { it > 0 },
        manbaJadval = z["manba_jadval"].str(), manbaId = z["manba_id"].num()?.toLong()?.takeIf { it > 0 }, yaratildi = z["yaratildi"].str(), steps = steps,
    )
}

/** What the person needs to recognise the document: type, number, object, date, total (the same five things the bot shows). */
data class ApprovalDoc(val tur: String, val raqam: String?, val obyekt: String?, val sana: String?, val jami: Double?)

fun docTypeKey(hujjatTuri: String?, aktTur: String?): String = if (aktTur == "f2") "f2" else hujjatTuri.orEmpty()

// ---------- decisions ----------

enum class Decision(val wire: String, val needsComment: Boolean) {
    APPROVE("tasdiqlash", false), RETURN("qaytarish", true), REJECT("rad", true)
}

fun decisionPayload(companyId: Long, zanjirId: Long, d: Decision, comment: String?): JsonObject = buildJsonObject {
    put("amal", "zanjir_qaror"); put("kompaniya_id", companyId); put("zanjir_id", zanjirId); put("qaror", d.wire)
    comment?.trim()?.takeIf { it.isNotEmpty() }?.let { put("izoh", it.take(2000)) }
}

enum class DecisionError { OFFLINE, NOT_YOUR_TURN, CHANGED, ROLE, FORBIDDEN, FAILED }
sealed interface DecisionResult {
    data object Done : DecisionResult
    data class Error(val kind: DecisionError, val code: String? = null) : DecisionResult
}

/** Maps the gateway answer to a clear outcome. `NAVBAT_EMAS` = not (or no longer) your turn; 403 variants = no right. */
fun decisionResult(r: ApiResult): DecisionResult {
    val code = r.code ?: payloadCode(r.body)
    return when {
        r.networkError -> DecisionResult.Error(DecisionError.OFFLINE)
        code == "NAVBAT_EMAS" -> DecisionResult.Error(DecisionError.NOT_YOUR_TURN, code)
        r.status == 403 && code == "ROL_YETARLI_EMAS" -> DecisionResult.Error(DecisionError.ROLE, code)
        r.status == 403 || code == "AZO_EMAS" || code == "ROL_YETARLI_EMAS" -> DecisionResult.Error(if (code == "ROL_YETARLI_EMAS") DecisionError.ROLE else DecisionError.FORBIDDEN, code)
        r.ok && (r.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull != false -> DecisionResult.Done
        else -> DecisionResult.Error(DecisionError.FAILED, code ?: "HTTP ${r.status}")
    }
}

private fun payloadCode(body: JsonElement?): String? = body.obj()?.get("code").str()

// ---------- notifications ----------

data class NotificationItem(val id: Long, val mavzu: String, val yaratildi: String?, val oqildi: Boolean)
data class NotificationList(val items: List<NotificationItem>, val unread: Int)

fun parseNotifications(body: JsonElement?): NotificationList? {
    val p = payload(body) ?: return null
    val rows = p["qatorlar"].arr() ?: return null
    val items = rows.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        NotificationItem(o["id"].num()?.toLong() ?: return@mapNotNull null, o["mavzu"].str().orEmpty(), o["yaratildi"].str(), o["oqildi"].str() != null)
    }
    return NotificationList(items, p["oqilmagan"].num()?.toInt() ?: items.count { !it.oqildi })
}

/** Known topics (frontend/src/lib/bildirishnoma-matn.ts); unknown topics are shown by their raw topic string. */
enum class NotifKind { APPROVAL_WAITING, APPROVED, REJECTED, RETURNED, LETTER, DEADLINE_NEAR, DEADLINE_PASSED, DRAWING, DRAWING_DECISION, OTHER }

fun notifKind(mavzu: String): NotifKind = when (mavzu) {
    "hujjat.tasdiq_kutmoqda" -> NotifKind.APPROVAL_WAITING
    "hujjat.tasdiqlandi" -> NotifKind.APPROVED
    "hujjat.rad_etildi" -> NotifKind.REJECTED
    "hujjat.qaytarildi" -> NotifKind.RETURNED
    "hujjat.xat_keldi" -> NotifKind.LETTER
    "hujjat.muddat_yaqin" -> NotifKind.DEADLINE_NEAR
    "hujjat.muddat_otdi" -> NotifKind.DEADLINE_PASSED
    "chizma.chiqdi" -> NotifKind.DRAWING
    "chizma.qaror" -> NotifKind.DRAWING_DECISION
    else -> NotifKind.OTHER
}

fun markReadPayload(ids: List<Long>): JsonObject = buildJsonObject {
    put("amal", "bildirishnoma_oqildi")
    put("idlar", buildJsonArray { ids.forEach { add(JsonPrimitive(it)) } })
}

// ---------- today ----------

/** Roles that see the F-2 / fact draft counters (same set as the bot's /bugun). */
val EXECUTIVE_ROLES = setOf("superadmin", "admin", "boss", "rahbar", "director", "bugalter", "pto", "prorab")
fun isExecutive(role: String) = role.lowercase() in EXECUTIVE_ROLES

data class TodayData(
    val approvals: Int?, val f2Drafts: Int?, val faktDrafts: Int?, val notifications: List<NotificationItem>, val unread: Int?,
)

fun draftCountRequest(companyId: Long, tur: String): JsonObject = buildJsonObject {
    put("jadval", "t2_akt"); put("filtr", "kompaniya_id=eq.$companyId&tur=eq.$tur&lifecycle_status=eq.draft"); put("ustunlar", "id"); put("limit", 1000)
}

fun parseCount(body: JsonElement?): Int? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return o["jamiServerda"].num()?.toInt() ?: o["soni"].num()?.toInt()
}

// ---------- repository ----------

class ApprovalsRepository(private val api: BffApi, private val cachedObjectName: suspend (Long) -> String? = { null }) {
    suspend fun inbox(companyId: Long): Pair<SyncResult, List<ApprovalItem>> {
        val r = api.bff("/api/hujjat-aylanish?bolim=kiruvchi&kompaniya_id=$companyId")
        if (!r.ok) return r.syncFailure() to emptyList()
        val items = parseInbox(r.body) ?: return SyncResult.Failed("BAD_SHAPE") to emptyList()
        return SyncResult.Ok to items
    }

    /** Chain detail plus the document it points at (act number/date/total) and the object name. Missing pieces stay null ("—"). */
    suspend fun detail(companyId: Long, zanjirId: Long): Triple<SyncResult, ApprovalDetail?, ApprovalDoc?> {
        val r = api.bff("/api/hujjat-aylanish?bolim=zanjir&kompaniya_id=$companyId&zanjir_id=$zanjirId")
        if (!r.ok) return Triple(r.syncFailure(), null, null)
        val d = parseZanjir(r.body)?.takeIf { it.id == zanjirId } ?: return Triple(SyncResult.Failed("BAD_SHAPE"), null, null)
        var akt: JsonObject? = null
        if (d.manbaJadval == "t2_akt" && d.manbaId != null) {
            val a = api.bff("/api/sb", "POST", buildJsonObject {
                put("jadval", "t2_akt"); put("filtr", "id=eq.${d.manbaId}"); put("ustunlar", "id,raqam,oy,tur,hujjat_jami,obyekt_id"); put("limit", 1)
            })
            akt = parseSb(a.body)?.rows?.firstOrNull { it["id"].num()?.toLong() == d.manbaId }
        }
        val oid = d.obyektId ?: akt?.get("obyekt_id").num()?.toLong()?.takeIf { it > 0 }
        var objectName: String? = null
        if (oid != null) {
            objectName = cachedObjectName(oid)
            if (objectName == null) {
                val o = api.bff("/api/sb", "POST", buildJsonObject { put("jadval", "t2_obyekt"); put("filtr", "id=eq.$oid"); put("ustunlar", "id,nom"); put("limit", 1) })
                objectName = parseSb(o.body)?.rows?.firstOrNull { it["id"].num()?.toLong() == oid }?.get("nom").str()
            }
        }
        val doc = ApprovalDoc(
            tur = docTypeKey(d.tur, akt?.get("tur").str()), raqam = akt?.get("raqam").str(), obyekt = objectName,
            sana = akt?.get("oy").str() ?: d.yaratildi?.take(10), jami = akt?.get("hujjat_jami").num(),
        )
        return Triple(SyncResult.Ok, d, doc)
    }

    /**
     * Online only. The chain is re-read first: if my open step is no longer the one the person saw (someone decided, or the
     * document was resubmitted) nothing is sent and CHANGED is reported.
     */
    suspend fun decide(companyId: Long, zanjirId: Long, seenToken: String?, d: Decision, comment: String?): DecisionResult {
        val cur = api.bff("/api/hujjat-aylanish?bolim=zanjir&kompaniya_id=$companyId&zanjir_id=$zanjirId")
        if (cur.networkError) return DecisionResult.Error(DecisionError.OFFLINE)
        if (!cur.ok) return decisionResult(cur)
        val now = parseZanjir(cur.body) ?: return DecisionResult.Error(DecisionError.FAILED, "BAD_SHAPE")
        if (!now.myTurn) return DecisionResult.Error(DecisionError.NOT_YOUR_TURN)
        if (seenToken != null && now.stepToken != seenToken) return DecisionResult.Error(DecisionError.CHANGED)
        return decisionResult(api.bff("/api/hujjat-aylanish", "POST", decisionPayload(companyId, zanjirId, d, comment)))
    }
}

class TodayRepository(private val api: BffApi) {
    suspend fun load(companyId: Long, role: String): TodayData {
        val inbox = api.bff("/api/hujjat-aylanish?bolim=kiruvchi&kompaniya_id=$companyId")
        val notes = api.bff("/api/hujjat-aylanish?bolim=bildirishnomalar&limit=5")
        val exec = isExecutive(role)
        val f2 = if (exec) parseCount(api.bff("/api/sb", "POST", draftCountRequest(companyId, "f2")).body) else null
        val fakt = if (exec) parseCount(api.bff("/api/sb", "POST", draftCountRequest(companyId, "fakt")).body) else null
        val list = if (notes.ok) parseNotifications(notes.body) else null
        return TodayData(if (inbox.ok) inboxCount(inbox.body) else null, f2, fakt, list?.items?.take(5).orEmpty(), list?.unread)
    }

    suspend fun markRead(ids: List<Long>): Boolean = ids.isEmpty() || api.bff("/api/hujjat-aylanish", "POST", markReadPayload(ids)).ok
}

internal fun ApiResult.syncFailure(): SyncResult = when {
    networkError -> SyncResult.Offline
    status == 403 -> SyncResult.Forbidden
    else -> SyncResult.Failed(code ?: "HTTP $status")
}
