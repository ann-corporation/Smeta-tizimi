package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.OffsetDateTime

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

data class ChatCursor(val id: String, val etag: String? = null)
sealed interface ChatSnapshot {
    data object Missing : ChatSnapshot
    data object Same : ChatSnapshot
    data class Changed(val etag: String, val messages: List<ChatMsg>?, val summary: String?) : ChatSnapshot
}
data class ChatSync(val chats: List<ChatInfo>, val active: ChatSnapshot?)

sealed interface ChatWrite {
    data class Saved(val etag: String) : ChatWrite
    data object Deleted : ChatWrite
    data object Stale : ChatWrite
    data object Failed : ChatWrite
}

/**
 * Jarvis = the SAME brain as the web (/api/agent-ish kasb_savol: profession prompt, facts, exact search, deterministic money answers,
 * conversation history) through the mobile BFF. Chats share the web snapshot and mutation contract.
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

    suspend fun syncChats(companyId: Long, cursor: ChatCursor? = null): ChatSync? =
        parseSync(api.bff(PATH, "POST", buildJsonObject {
            put("amal", "suhbat_sync"); put("kompaniya_id", companyId)
            cursor?.let { put("klient_id", it.id); it.etag?.let { tag -> put("etag", tag) } }
        }), cursor)

    suspend fun writeMessages(companyId: Long, cursor: ChatCursor, title: String?, messages: List<ChatMsg>): ChatWrite {
        val create = cursor.etag == null
        if (!CHAT_ID.matches(cursor.id) || (create && title.isNullOrBlank()) ||
            (!create && (!ETAG.matches(cursor.etag.orEmpty()) || title != null)) ||
            messages.size !in 1..MAX_SAVED || messages.any { it.text.isBlank() }) return ChatWrite.Failed
        return mutateChat(companyId, cursor, if (create) "create" else "append") {
            if (create) put("sarlavha", title)
            put("xabarlar", buildJsonArray {
                messages.forEach {
                    add(buildJsonObject { put("r", if (it.mine) "user" else "ai"); put("m", it.text.trim().take(MAX_SAVED_TEXT)) })
                }
            })
        }
    }

    suspend fun renameChat(companyId: Long, cursor: ChatCursor, title: String): ChatWrite {
        if (title.isBlank() || title.length > 80) return ChatWrite.Failed
        return mutateChat(companyId, cursor, "rename") { put("sarlavha", title) }
    }

    suspend fun deleteChat(companyId: Long, cursor: ChatCursor): ChatWrite =
        mutateChat(companyId, cursor, "delete") {}

    private suspend fun mutateChat(
        companyId: Long, cursor: ChatCursor, action: String, fields: JsonObjectBuilder.() -> Unit,
    ): ChatWrite {
        if (!CHAT_ID.matches(cursor.id) || (action != "create" && !ETAG.matches(cursor.etag.orEmpty()))) return ChatWrite.Failed
        val r = api.bff(PATH, "POST", buildJsonObject {
            put("amal", "suhbat_mutate"); put("kompaniya_id", companyId); put("klient_id", cursor.id); put("harakat", action)
            cursor.etag?.let { put("etag", it) }
            fields()
        })
        if (r.status == 409 || r.status == 404) return ChatWrite.Stale
        val body = r.body as? JsonObject ?: return ChatWrite.Failed
        if (!r.ok || !body.successful() || body.string("id") != cursor.id) return ChatWrite.Failed
        if (action == "delete") return if (body.string("holat") == "missing") ChatWrite.Deleted else ChatWrite.Failed
        val tag = body.string("etag")?.takeIf(ETAG::matches) ?: return ChatWrite.Failed
        return ChatWrite.Saved(tag)
    }

    companion object {
        private val CHAT_ID = Regex("^[A-Za-z0-9_.-]{1,40}$")
        private val ETAG = Regex("^[a-f0-9]{32}$")
        private fun JsonObject.string(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
        private fun JsonObject.successful() = (this["ok"] as? JsonPrimitive)?.let { !it.isString && it.booleanOrNull == true } == true

        internal fun parseSync(r: ApiResult, cursor: ChatCursor?): ChatSync? {
            val body = r.body as? JsonObject ?: return null
            if (!r.ok || !body.successful()) return null
            val rows = body["royxat"] as? JsonArray ?: return null
            if (rows.size > 20) return null
            val list = rows.map {
                val row = it as? JsonObject ?: return null
                val id = row.string("id")?.takeIf(CHAT_ID::matches) ?: return null
                val title = row.string("sarlavha") ?: return null
                val time = row.string("yangilandi") ?: return null
                if (runCatching { OffsetDateTime.parse(time) }.isFailure) return null
                ChatInfo(id, title, time)
            }
            if (list.map { it.id }.toSet().size != list.size) return null
            if (cursor == null) return if (body["suhbat"] == JsonNull) ChatSync(list, null) else null
            val row = body["suhbat"] as? JsonObject ?: return null
            if (row.string("id") != cursor.id) return null
            if (row.string("holat") == "missing") return ChatSync(list, ChatSnapshot.Missing)
            val tag = row.string("etag")?.takeIf(ETAG::matches) ?: return null
            val active = when (row.string("holat")) {
                "same" -> if (tag == cursor.etag) ChatSnapshot.Same else return null
                "changed" -> {
                    val summary = row.string("qisqartma")
                    if (summary == null && row["qisqartma"] != JsonNull) return null
                    val messages = when (val value = row["xabarlar"]) {
                        JsonNull -> null
                        is JsonArray -> {
                            if (value.size > MAX_SAVED) return null
                            value.map {
                                val msg = it as? JsonObject ?: return null
                                val mine = when (msg.string("r")) { "user" -> true; "ai" -> false; else -> return null }
                                val text = msg.string("m")?.takeIf { it.isNotBlank() && it.length <= MAX_SAVED_TEXT * 2 } ?: return null
                                ChatMsg(mine, text)
                            }
                        }
                        else -> return null
                    }
                    ChatSnapshot.Changed(tag, messages, summary)
                }
                else -> return null
            }
            return ChatSync(list, active)
        }

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
