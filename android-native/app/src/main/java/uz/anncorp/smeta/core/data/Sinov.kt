package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.util.UUID

/** Token granted by the trial start (the server grants it once; the figure is only used for the button text). */
const val SINOV_TOKEN = 1000

/** Trial state of the account (GET /api/company?sinov=1, same contract as the website's SinovBoshlash card). */
data class SinovState(
    val started: Boolean,
    val companyId: Long?,
    /** True once the trial workplace has become a real company (checklist is hidden then). */
    val real: Boolean,
    val canStart: Boolean,
    val demoObjectId: Long?,
    val demoAvailable: Boolean,
    val balance: Double?,
) {
    /** "Birinchi qadamlar" checklist is shown while the trial workplace exists and is not yet a real company. */
    val showChecklist: Boolean get() = started && !real
    val demoOpened: Boolean get() = demoObjectId != null
}

enum class SinovError { LIMIT, ALREADY_HAS, NO_DEMO, AUTH, NETWORK, SERVER }

sealed interface SinovResult {
    data class Done(val companyId: Long?, val demoObjectId: Long?, val balance: Double?) : SinovResult
    data class Failed(val error: SinovError) : SinovResult
}

private fun JsonObject.bool(k: String) = (this[k] as? JsonPrimitive)?.booleanOrNull == true
private fun JsonObject.long(k: String) = (this[k] as? JsonPrimitive)?.longOrNull

/** Pure and tolerant: null only when the answer is not `{ok:true}`. An old server (no `boshlash_mumkin`) yields "nothing to show". */
fun parseSinov(e: JsonElement?): SinovState? {
    val o = e as? JsonObject ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return SinovState(
        started = o.bool("boshlangan"), companyId = o.long("kompaniya_id"), real = o.bool("haqiqiy"), canStart = o.bool("boshlash_mumkin"),
        demoObjectId = o.long("demo_obyekt_id"), demoAvailable = o.bool("demo_mavjud"), balance = (o["balans"] as? JsonPrimitive)?.doubleOrNull,
    )
}

/** Trial start / sample object through the shared endpoints the website uses (/api/company sinov_boshlash, sinov_demo). */
class SinovRepository(private val api: BffApi, private val newId: () -> String = { UUID.randomUUID().toString() }) {
    /** Null when unknown (offline, old server): the UI then shows nothing trial-related. */
    suspend fun state(): SinovState? {
        val r = api.bff("/api/company?sinov=1")
        return if (r.ok) parseSinov(r.body) else null
    }

    suspend fun start(): SinovResult = command("sinov_boshlash")
    suspend fun demo(): SinovResult = command("sinov_demo")

    private suspend fun command(action: String): SinovResult {
        val r = api.bff("/api/company", "POST", buildJsonObject { put("action", action); put("operation_id", newId()) })
        if (!r.ok || (r.body as? JsonObject)?.get("ok")?.let { (it as? JsonPrimitive)?.booleanOrNull } == false) return SinovResult.Failed(sinovError(r))
        val o = r.body as? JsonObject
        return SinovResult.Done(o?.long("kompaniya_id"), o?.long("demo_obyekt_id"), (o?.get("balans") as? JsonPrimitive)?.doubleOrNull)
    }
}

internal fun sinovError(r: ApiResult): SinovError = when {
    r.networkError -> SinovError.NETWORK
    r.code == "LIMIT" || r.status == 429 -> SinovError.LIMIT
    r.code == "SINOV_KERAKMAS" -> SinovError.ALREADY_HAS
    r.code == "SINOV_YOQ" || r.code == "DEMO_YOQ" -> SinovError.NO_DEMO
    r.code == "AUTH_REQUIRED" || r.status == 401 -> SinovError.AUTH
    else -> SinovError.SERVER
}
