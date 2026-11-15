package uz.anncorp.smeta.core.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement

@Serializable
data class SessionInfo(
    val ok: Boolean = false,
    val rol: String = "",
    val email: String = "",
    @SerialName("foydalanuvchi_id") val userId: Long = 0,
    val tugaydi: Long = 0,
)

@Serializable
data class Workplace(
    @SerialName("kompaniya_id") val companyId: Long,
    val nom: String = "",
    val turi: String = "",
    val rol: String = "",
    val obyektlar: Int = 0,
    val azolar: Int = 0,
)

@Serializable
private data class WorkplacesResponse(val ok: Boolean = false, @SerialName("ish_joylari") val workplaces: List<Workplace> = emptyList())

sealed interface SessionCheck {
    data class Valid(val info: SessionInfo) : SessionCheck
    data object Unauthorized : SessionCheck
    data object Offline : SessionCheck
    data object ServerError : SessionCheck
}

/** Read-only calls for P0: who am I, and which workplaces/roles do I have. Authority is always decided server-side. */
class SessionRepository(private val api: ApiClient, private val json: Json) {
    suspend fun check(): SessionCheck {
        val r = api.bff("/api/sessiya")
        return when {
            r.networkError -> SessionCheck.Offline
            r.unauthorized -> SessionCheck.Unauthorized
            r.ok -> decode<SessionInfo>(r.body)?.takeIf { it.ok }?.let { SessionCheck.Valid(it) } ?: SessionCheck.ServerError
            else -> SessionCheck.ServerError
        }
    }

    /** Null on failure (offline or server problem). */
    suspend fun workplaces(): List<Workplace>? {
        val r = api.bff("/api/ish-joyi?bolim=joylarim")
        if (!r.ok) return null
        return decode<WorkplacesResponse>(r.body)?.takeIf { it.ok }?.workplaces
    }

    private inline fun <reified T> decode(e: JsonElement?): T? = e?.let { runCatching { json.decodeFromJsonElement<T>(it) }.getOrNull() }
}
