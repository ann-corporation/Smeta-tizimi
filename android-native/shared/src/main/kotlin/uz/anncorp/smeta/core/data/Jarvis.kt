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
import kotlinx.serialization.Serializable

/** Outcome of one Jarvis question. Charging (aiHisobli) happens on the server; the app only shows what came back. */
sealed interface JarvisResult {
    /** [previewToken] = a write preview waiting for the user's manual confirmation (server 2_preview.token); nothing is saved until [JarvisRepository.confirm]. */
    data class Answer(val text: String, val local: Boolean, val previewToken: String? = null) : JarvisResult
    /** HTTP 402: the token balance / budget does not cover the question. [message] is the server's own text. */
    data class Budget(val message: String?) : JarvisResult
    /** HTTP 422/403 about the company context (pick a company, no access, context too large). */
    data class Context(val message: String?) : JarvisResult
    data object Network : JarvisResult
    data class Server(val message: String?) : JarvisResult
}

/** One chat turn; [mine] = the user's own message (server role `user`), otherwise Jarvis (`ai`). */
@Serializable
data class ChatMsg(val mine: Boolean, val text: String)

/** A server-saved chat (t2_jarvis_suhbat), the same list the web Jarvis shows. [updatedAt] is the server ISO timestamp. */
data class ChatInfo(val id: String, val title: String, val updatedAt: String)

@Serializable
data class ChatCursor(val id: String, val etag: String? = null)
sealed interface ChatSnapshot {
    data object Missing : ChatSnapshot
    data object Same : ChatSnapshot
    data class Changed(
        val etag: String, val messages: List<ChatMsg>?, val summary: String?, val archived: Boolean = false, val title: String? = null,
    ) : ChatSnapshot
}
data class ChatSync(val chats: List<ChatInfo>, val active: ChatSnapshot?)
data class ChatPageCursor(val at: String, val row: String)
data class ChatPage(val chats: List<ChatInfo>, val next: ChatPageCursor?)

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

    /** The web card's confirm: POST /api/f2-buyruq { amal: tasdiq, token, tasdiqlayman } - the only call that writes. Returns null on success, else the error text. */
    suspend fun confirm(companyId: Long, token: String): String? =
        failText(api.bff("/api/f2-buyruq", "POST", buildJsonObject { put("amal", "tasdiq"); put("kompaniya_id", companyId); put("token", token); put("tasdiqlayman", true) }))

    /** Voice to text for the question field (server STT, nothing is written): POST /api/ombor-ovoz { audio_b64 }. Pair(text, null) or Pair(null, error). */
    @OptIn(kotlin.io.encoding.ExperimentalEncodingApi::class)
    suspend fun transcribe(companyId: Long, audio: ByteArray, mime: String, lang: String = "auto"): Pair<String?, String?> {
        val r = api.bff("/api/ombor-ovoz", "POST", buildJsonObject {
            put("kompaniya_id", companyId); put("language", lang); put("mime", mime); put("audio_b64", kotlin.io.encoding.Base64.encode(audio))
        })
        val err = failText(r)
        val text = ((r.body as? JsonObject)?.get("text") as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim()
        return if (err == null && !text.isNullOrEmpty()) text to null else null to (err ?: "Ovoz tanilmadi")
    }

    suspend fun syncChats(companyId: Long, cursor: ChatCursor? = null): ChatSync? =
        parseSync(api.bff(PATH, "POST", buildJsonObject {
            put("amal", "suhbat_sync"); put("kompaniya_id", companyId); put("full_history", true)
            cursor?.let { put("klient_id", it.id); it.etag?.let { tag -> put("etag", tag) } }
        }), cursor)

    suspend fun chatPage(companyId: Long, before: ChatPageCursor?): ChatPage? {
        val r = api.bff(PATH, "POST", buildJsonObject {
            put("amal", "suhbat_page"); put("kompaniya_id", companyId)
            before?.let { put("before_at", it.at); put("before_row", it.row) }
        })
        val body = r.body as? JsonObject ?: return null
        if (!r.ok || !body.successful()) return null
        val chats = parseChatRows(body["royxat"] as? JsonArray ?: return null) ?: return null
        val next = when (val marker = body["keyingi"]) {
            JsonNull -> null
            is JsonObject -> {
                val at = marker.string("at") ?: return null
                val row = marker.string("row")?.takeIf { it.toLongOrNull()?.let { id -> id > 0 } == true } ?: return null
                if (runCatching { OffsetDateTime.parse(at) }.isFailure) return null
                ChatPageCursor(at, row).takeIf { it != before } ?: return null
            }
            else -> return null
        }
        return ChatPage(chats, next)
    }

    suspend fun writeMessages(
        companyId: Long, cursor: ChatCursor, title: String?, messages: List<ChatMsg>, operationId: String? = null,
        deviceId: String? = null,
    ): ChatWrite {
        val create = cursor.etag == null
        if (!CHAT_ID.matches(cursor.id) || (create && title.isNullOrBlank()) ||
            (!create && (!ETAG.matches(cursor.etag.orEmpty()) || title != null)) ||
            messages.size !in 1..MAX_SAVED || messages.any { !validTranscriptText(it.text) }) return ChatWrite.Failed
        return mutateChat(companyId, cursor, if (create) "create" else "append") {
            if (create) put("sarlavha", title)
            else operationId?.let { put("operation_id", it) }
            deviceId?.let { put("jarvis_device_id", it) }
            put("xabarlar", buildJsonArray {
                messages.forEach {
                    add(buildJsonObject { put("r", if (it.mine) "user" else "ai"); put("m", it.text) })
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

        private fun parseChatRows(rows: JsonArray): List<ChatInfo>? {
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
            return list
        }

        internal fun parseSync(r: ApiResult, cursor: ChatCursor?): ChatSync? {
            val body = r.body as? JsonObject ?: return null
            if (!r.ok || !body.successful()) return null
            val list = parseChatRows(body["royxat"] as? JsonArray ?: return null) ?: return null
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
                            if (value.size > MAX_TRANSCRIPT) return null
                            value.map {
                                val msg = it as? JsonObject ?: return null
                                val mine = when (msg.string("r")) { "user" -> true; "ai" -> false; else -> return null }
                                val text = msg.string("m")?.takeIf(::validTranscriptText) ?: return null
                                ChatMsg(mine, text)
                            }
                        }
                        else -> return null
                    }
                    ChatSnapshot.Changed(tag, messages, summary, (row["arxivlangan"] as? JsonPrimitive)?.booleanOrNull == true, row.string("sarlavha"))
                }
                else -> return null
            }
            return ChatSync(list, active)
        }

        const val MAX_QUESTION = 1000
        const val MAX_HISTORY = 16
        const val MAX_HISTORY_TEXT = 6000
        const val MAX_HISTORY_TOTAL = 24000
        const val MAX_SAVED = 12
        private const val MAX_TRANSCRIPT = 256
        private const val MAX_SAVED_TEXT = 16_000
        private fun validTranscriptText(text: String): Boolean = text.isNotBlank() &&
            text.length <= MAX_SAVED_TEXT * 2 && text.codePointCount(0, text.length) <= MAX_SAVED_TEXT
        const val PATH = "/api/agent-ish"
        const val PAGE = "/android/jarvis"

        /** Bounded transport excerpt, matching server/web suhbatKonteksti. Never truncates the canonical saved transcript. */
        fun historyJson(history: List<ChatMsg>): JsonArray = buildJsonArray {
            val indexes = ((0 until minOf(32, history.size)) + (maxOf(0, history.size - 128) until history.size)).distinct().sorted()
            val valid = indexes.mapNotNull { index ->
                val turn = history[index]
                if (turn.text.isBlank()) null else index to if (turn.text.length > MAX_HISTORY_TEXT)
                    turn.copy(text = turn.text.take(MAX_HISTORY_TEXT - 24) + "\n[TRUNCATED BY LIMIT]") else turn
            }
            val goal = valid.firstOrNull { it.second.mine }
            val selected = mutableListOf<Pair<Int, ChatMsg>>()
            if (goal != null) selected += goal
            var size = goal?.second?.text?.length ?: 0
            for (entry in valid.asReversed()) {
                if (entry.first == goal?.first) continue
                if (selected.size >= MAX_HISTORY) break
                if (size + entry.second.text.length > MAX_HISTORY_TOTAL) continue
                selected += entry; size += entry.second.text.length
            }
            selected.sortedBy { it.first }.forEach { (_, turn) ->
                add(buildJsonObject { put("rol", if (turn.mine) "user" else "assistant"); put("matn", turn.text) })
            }
        }

        /** Chat title = the first user message, ≤ 80 chars (the server also cuts at 80). null = nothing to save yet. */
        fun chatTitle(messages: List<ChatMsg>): String? =
            messages.firstOrNull { it.mine && it.text.isNotBlank() }?.text?.replace(Regex("\\s+"), " ")?.trim()?.take(80)

        /** The confirmation token of a write preview (2_preview with holat 	asdiq_kerak), or null for an ordinary answer. Pure. */
        fun previewToken(o: JsonObject?): String? {
            val p = o?.get("f2_preview") as? JsonObject ?: return null
            if ((p["holat"] as? JsonPrimitive)?.content != "tasdiq_kerak") return null
            return (p["token"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }
        }

        /** Outcome text of a confirm / transcription call: null = success. Pure. */
        fun failText(r: ApiResult): String? {
            val o = r.body as? JsonObject
            if (r.networkError) return "Tarmoq yo'q"
            if (r.ok && (o?.get("ok") as? JsonPrimitive)?.content != "false") return null
            return ((o?.get("xabar") ?: o?.get("error") ?: o?.get("code")) as? JsonPrimitive)?.takeIf { it.isString }?.content ?: "Server xatosi"
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
                    if (text.isEmpty()) JarvisResult.Server(null) else JarvisResult.Answer(text, local, previewToken(o))
                }
                r.status == 422 || r.status == 403 -> JarvisResult.Context(msg)
                else -> JarvisResult.Server(msg)
            }
        }
    }
}
