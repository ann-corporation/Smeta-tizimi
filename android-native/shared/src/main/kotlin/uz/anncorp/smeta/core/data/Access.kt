package uz.anncorp.smeta.core.data

/**
 * Who may see the money of an F-2 act. ONE rule for every screen (act detail, approval detail, Windows): the server RPC
 * `akt_summa_paket_v1` requires `f2.read`, so the clients hide the amount for everyone without it - never show it on one screen and
 * "no permission" on the next. Unknown permissions (offline / not loaded) = allowed; the server still decides.
 */
const val AMOUNT_PERMISSION = "f2.read"

fun canSeeActAmounts(permissions: Set<String>?): Boolean = permissions == null || AMOUNT_PERMISSION in permissions


/** Permission codes of the user's role in company [companyId] from `/api/company?me=1` (`context_kompaniyalar[].permissions`); null = not listed. */
fun permissionsFrom(body: kotlinx.serialization.json.JsonElement?, companyId: Long): Set<String>? {
    val list = (body as? kotlinx.serialization.json.JsonObject)?.get("context_kompaniyalar") as? kotlinx.serialization.json.JsonArray ?: return null
    val entry = list.mapNotNull { it as? kotlinx.serialization.json.JsonObject }
        .firstOrNull { ((it["kompaniya_id"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toLongOrNull()) == companyId } ?: return null
    val perms = entry["permissions"] as? kotlinx.serialization.json.JsonArray ?: return null
    return perms.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }.toSet()
}

/** Loads the permissions (null when unknown / offline) through the shared endpoint. Android [ModulesRepository] and the Windows F-2 screens both use it. */
suspend fun fetchPermissions(api: BffApi, companyId: Long): Set<String>? {
    val me = api.bff("/api/company?me=1")
    return if (me.ok) permissionsFrom(me.body, companyId) else null
}

/** The ONE "may this user see F-2 act amounts" check for Windows and Android: [canSeeActAmounts] over the cached permissions of the company. */
class ActAmountAccess(private val api: BffApi) {
    @Volatile private var last: Pair<Long, Set<String>?>? = null

    suspend fun canSee(companyId: Long): Boolean {
        val c = last?.takeIf { it.first == companyId }
        val perms = if (c != null) c.second else fetchPermissions(api, companyId).also { last = companyId to it }
        return canSeeActAmounts(perms)
    }
}