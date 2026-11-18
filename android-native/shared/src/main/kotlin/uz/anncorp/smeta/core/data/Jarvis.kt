package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Outcome of one Jarvis question. Charging (aiHisobli) happens on the server; the app only shows what came back. */
sealed interface JarvisResult {
    data class Answer(val text: String, val local: Boolean) : JarvisResult
    /** HTTP 402: the token balance / budget does not cover the question. [message] is the server's own text. */
    data class Budget(val message: String?) : JarvisResult
    /** HTTP 422/403 about the company context (pick a company, no access, context too large). */
    data class Context(val message: String?) : JarvisResult
    data object Network : JarvisResult
    data class Server(val message: String?) : JarvisResult
}

/** One chat turn; [mine] = the user's own message (server role `user`), otherwise Jarvis (`ai`). */
data class ChatMsg(val mine: Boolean, val text: String)

/** A server-saved chat (t2_jarvis_suhbat), the same list the web Jarvis shows. [updatedAt] is the server ISO timestamp. */
data class ChatInfo(val id: String, val title: String, val updatedAt: String)

/**
 * Jarvis = the SAME brain as the web (/api/agent-ish kasb_savol: profession prompt, facts, exact search, deterministic money answers,
 * conversation history) through the mobile BFF. Chats live on the server (suhbat_royxat / suhbat_ol / suhbat_saqla), identical to the web.
 */
class JarvisRepository(private val api: BffApi) {
    /**
     * POST /api/agent-ish { amal: kasb_savol } through the BFF. A question is limited to 1000 characters; longer text is cut.
     * [history] = the last turns (server keeps ≤6, ≤500 chars each) so «shu obyekt» / «uni» resolve; [objectId] = the object the chat was opened from.
     */
    suspend fun ask(question: String, companyId: Long?, history: List<ChatMsg> = emptyList(), objectId: Long? = null): JarvisResult {
        val q = question.trim().take(MAX_QUESTION)
        if (q.isEmpty()) return JarvisResult.Context(null)
        val r = api.bff(PATH, "POST", buildJsonObject {
            put("amal", "kasb_savol")
            put("savol", q)
            put("sahifa", PAGE)
            if (companyId != null) put("kompaniya_id", companyId)
            if (objectId != null && objectId > 0) put("obyekt_id", objectId)
            val h = historyJson(history)
            if (h.isNotEmpty()) put("tarix", h)
        })
        return map(r)
    }

    /** Server chat list, newest first. null = request failed (keep what is on screen). */
    suspend fun chats(companyId: Long): List<ChatInfo>? =
        parseChats(api.bff(PATH, "POST", buildJsonObject { put("amal", "suhbat_royxat"); put("kompaniya_id", companyId) }))

    /** Messages of one server chat. null = failed; empty = chat has no messages. */
    suspend fun openChat(companyId: Long, id: String): List<ChatMsg>? =
        parseMessages(api.bff(PATH, "POST", buildJsonObject { put("amal", "suhbat_ol"); put("kompaniya_id", companyId); put("klient_id", id) }))

    /** Saves the chat after each message (server keeps the last 12 turns). true = saved. */
    suspend fun saveChat(companyId: Long, id: String, messages: List<ChatMsg>): Boolean {
        val title = chatTitle(messages) ?: return false
        val r = api.bff(PATH, "POST", buildJsonObject {
            put("amal", "suhbat_saqla"); put("kompaniya_id", companyId); put("klient_id", id); put("sarlavha", title)
            put("xabarlar", buildJsonArray {
                messages.takeLast(MAX_SAVED).forEach { add(buildJsonObject { put("r", if (it.mine) "user" else "ai"); put("m", it.text.take(MAX_SAVED_TEXT)) }) }
            })
        })
        return r.ok && ((r.body as? JsonObject)?.get("ok") as? JsonPrimitive)?.content != "false"
    }

    companion object {
        const val MAX_QUESTION = 1000
        const val MAX_HISTORY = 6
        const val MAX_SAVED = 12
        const val MAX_SAVED_TEXT = 400
        const val PATH = "/api/agent-ish"
        const val PAGE = "/android/jarvis"

        /** Last [MAX_HISTORY] non-blank turns in the server's shape ({rol: user|assistant, matn}). Pure. */
        fun historyJson(history: List<ChatMsg>): JsonArray = buildJsonArray {
            history.filter { it.text.isNotBlank() }.takeLast(MAX_HISTORY).forEach {
                add(buildJsonObject { put("rol", if (it.mine) "user" else "assistant"); put("matn", it.text.trim().take(500)) })
            }
        }

        /** Chat title = the first user message, ≤ 80 chars (the server also cuts at 80). null = nothing to save yet. */
        fun chatTitle(messages: List<ChatMsg>): String? =
            messages.firstOrNull { it.mine && it.text.isNotBlank() }?.text?.replace(Regex("\\s+"), " ")?.trim()?.take(80)

        fun parseChats(r: ApiResult): List<ChatInfo>? {
            val o = r.body as? JsonObject
            if (!r.ok || (o?.get("ok") as? JsonPrimitive)?.content == "false") return null
            val arr = o?.get("royxat") as? JsonArray ?: return null
            return arr.mapNotNull { e ->
                val x = e as? JsonObject ?: return@mapNotNull null
                val id = (x["id"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return@mapNotNull null
                ChatInfo(id, (x["sarlavha"] as? JsonPrimitive)?.content.orEmpty(), (x["yangilandi"] as? JsonPrimitive)?.content.orEmpty())
            }
        }

        fun parseMessages(r: ApiResult): List<ChatMsg>? {
            val o = r.body as? JsonObject
            if (!r.ok || (o?.get("ok") as? JsonPrimitive)?.content == "false") return null
            val arr = o?.get("xabarlar") as? JsonArray
            if (arr == null) {
                // Old chat kept only as a summary: show it as one Jarvis message rather than an empty chat.
                val s = (o?.get("qisqartma") as? JsonPrimitive)?.takeIf { it.isString }?.content
                return if (s.isNullOrBlank()) emptyList() else listOf(ChatMsg(false, s))
            }
            return arr.mapNotNull { e ->
                val x = e as? JsonObject ?: return@mapNotNull null
                val m = (x["m"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                ChatMsg((x["r"] as? JsonPrimitive)?.content == "user", m)
            }
        }

        /** Pure, unit tested. The server's error text is `xabar` (ai-savol) or `error` (agent-ish). */
        fun map(r: ApiResult): JarvisResult {
            val o = r.body as? JsonObject
            val msg = ((o?.get("xabar") ?: o?.get("error")) as? JsonPrimitive)?.takeIf { it.isString }?.content
            return when {
                r.networkError -> JarvisResult.Network
                r.status == 402 -> JarvisResult.Budget(msg)
                r.ok && (o?.get("ok") as? JsonPrimitive)?.content != "false" -> {
                    val text = (o?.get("javob") as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim().orEmpty()
                    val local = (o?.get("provider") as? JsonPrimitive)?.content == "local" || (o?.get("model") as? JsonPrimitive)?.content == "local"
                    if (text.isEmpty()) JarvisResult.Server(null) else JarvisResult.Answer(text, local)
                }
                r.status == 422 || r.status == 403 -> JarvisResult.Context(msg)
                else -> JarvisResult.Server(msg)
            }
        }
    }
}
