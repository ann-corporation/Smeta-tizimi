package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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

class JarvisRepository(private val api: BffApi) {
    /** POST /api/ai-savol { savol, kompaniya_id } through the BFF. A question is limited to 1000 characters by the server; longer text is cut. */
    suspend fun ask(question: String, companyId: Long?): JarvisResult {
        val q = question.trim().take(MAX_QUESTION)
        if (q.isEmpty()) return JarvisResult.Context(null)
        val r = api.bff("/api/ai-savol", "POST", buildJsonObject {
            put("savol", q)
            if (companyId != null) put("kompaniya_id", companyId)
        })
        return map(r)
    }

    companion object {
        const val MAX_QUESTION = 1000

        /** Pure, unit tested. */
        fun map(r: ApiResult): JarvisResult {
            val o = r.body as? JsonObject
            val msg = (o?.get("xabar") as? JsonPrimitive)?.takeIf { it.isString }?.content
            return when {
                r.networkError -> JarvisResult.Network
                r.status == 402 -> JarvisResult.Budget(msg)
                r.ok && (o?.get("ok") as? JsonPrimitive)?.content != "false" -> {
                    val text = (o?.get("javob") as? JsonPrimitive)?.takeIf { it.isString }?.content?.trim().orEmpty()
                    if (text.isEmpty()) JarvisResult.Server(null)
                    else JarvisResult.Answer(text, (o?.get("provider") as? JsonPrimitive)?.content == "local")
                }
                r.status == 422 || r.status == 403 -> JarvisResult.Context(msg)
                else -> JarvisResult.Server(msg)
            }
        }
    }
}
