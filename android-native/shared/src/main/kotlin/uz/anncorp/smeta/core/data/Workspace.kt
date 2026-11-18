package uz.anncorp.smeta.core.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

/**
 * SERVER-DRIVEN WORKSPACE ("Ish stoli"): GET /api/ish-joyi?bolim=ish_stoli. The server decides, per user + cabinet (company x party),
 * which sections and quick actions exist and has ALREADY checked the permissions; this file only parses and caches it.
 * Web, Android, Windows and Telegram read the same definition (docs/architecture/ISH_JOYI_ROL_V1.md), so a new role or action is
 * one server entry, not one change per app. Unknown section types / malformed rows are skipped, never fatal (forward compatible).
 */
enum class WsSectionType { ACTIONS, LIST, KPI, TEXT }

/** Where an action opens: a native module code (see [ModuleCatalog]) or a website page inside the in-app WebView. */
data class WsTarget(val native: Boolean, val code: String, val path: String?)
data class WsAction(val id: String, val title: String, val icon: String, val target: WsTarget, val primary: Boolean)
data class WsSection(
    val id: String, val type: WsSectionType, val title: String, val source: String?, val groupByPlace: Boolean,
    val actionIds: List<String>, val openAction: String?, val text: String?, val big: Boolean,
)
data class WsCabinet(val id: String, val companyId: Long?, val name: String, val party: String, val partyName: String, val origin: String, val current: Boolean)
data class WsField(val bigButtons: Boolean, val offline: Boolean, val voice: Boolean, val photo: Boolean)
data class Workspace(
    val version: Int, val cabinets: List<WsCabinet>, val current: String, val companyId: Long?, val party: String, val partyName: String,
    val fieldMode: Boolean, val field: WsField?, val actions: List<WsAction>, val sections: List<WsSection>, val primaryAction: String?,
) {
    fun action(id: String): WsAction? = actions.firstOrNull { it.id == id }
}

private fun JsonElement?.wsObj(): JsonObject? = this as? JsonObject
private fun JsonObject.wsStr(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }
private fun JsonObject.wsBool(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull == true

/** Pure and tolerant: returns null only when the skeleton (ok + cabinets/actions/sections arrays + current) is missing. */
fun parseWorkspace(e: JsonElement?): Workspace? {
    val o = e.wsObj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val rawActions = o["amallar"] as? JsonArray ?: return null
    val rawSections = o["bolimlar"] as? JsonArray ?: return null
    val rawCabinets = o["kabinetlar"] as? JsonArray ?: return null
    val current = o.wsStr("joriy") ?: return null
    val actions = rawActions.mapNotNull { a ->
        val x = a.wsObj() ?: return@mapNotNull null
        val t = x["maqsad"].wsObj() ?: return@mapNotNull null
        val id = x.wsStr("id") ?: return@mapNotNull null
        val title = x.wsStr("nom") ?: return@mapNotNull null
        val code = t.wsStr("kod") ?: return@mapNotNull null
        WsAction(id, title, x.wsStr("ikonka") ?: id, WsTarget(t.wsStr("tur") != "web", code, t.wsStr("yol")), x.wsBool("birlamchi"))
    }
    val known = actions.map { it.id }.toSet()
    val sections = rawSections.mapNotNull { s ->
        val x = s.wsObj() ?: return@mapNotNull null
        val type = when (x.wsStr("tur")) { "amallar" -> WsSectionType.ACTIONS; "royxat" -> WsSectionType.LIST; "kpi" -> WsSectionType.KPI; "matn" -> WsSectionType.TEXT; else -> return@mapNotNull null }
        val id = x.wsStr("id") ?: return@mapNotNull null
        val ids = (x["amallar"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content?.takeIf { c -> c in known } } ?: emptyList()
        WsSection(id, type, x.wsStr("nom") ?: id, x.wsStr("manba"), x.wsStr("guruh") == "joy", ids, x.wsStr("amal")?.takeIf { it in known }, x.wsStr("matn"), x.wsBool("katta"))
    }
    val cabinets = rawCabinets.mapNotNull { c ->
        val x = c.wsObj() ?: return@mapNotNull null
        val id = x.wsStr("id") ?: return@mapNotNull null
        WsCabinet(id, (x["kompaniya_id"] as? JsonPrimitive)?.longOrNull, x.wsStr("nom") ?: "—", x.wsStr("tomon") ?: "", x.wsStr("tomon_nom") ?: "", x.wsStr("manba") ?: "", x.wsBool("joriy"))
    }
    val field = (o["dala"] as? JsonObject)?.let { WsField(it.wsBool("katta_tugma"), it.wsBool("oflayn"), it.wsBool("ovoz"), it.wsBool("foto")) }
    return Workspace(
        version = (o["versiya"] as? JsonPrimitive)?.intOrNull ?: 1, cabinets = cabinets, current = current,
        companyId = (o["kompaniya_id"] as? JsonPrimitive)?.longOrNull, party = o.wsStr("tomon") ?: "", partyName = o.wsStr("tomon_nom") ?: "",
        fieldMode = o.wsStr("rejim") == "dala", field = field, actions = actions, sections = sections,
        primaryAction = o.wsStr("birlamchi_amal")?.takeIf { it in known },
    )
}

/** Local copy of the last good answer per company, so the workspace also renders offline. */
interface WorkspaceCache {
    fun workspaceGet(companyId: Long): String?
    fun workspacePut(companyId: Long, raw: String)
}

/**
 * Loads the workspace of the selected company, remembers the chosen cabinet (company x party) and falls back to the cached copy
 * when offline. Shared by the hub body and the top-bar cabinet switcher (singleton).
 */
class WorkspaceRepository(private val api: BffApi, private val json: Json, private val cache: WorkspaceCache) {
    private val _current = MutableStateFlow<Workspace?>(null)
    val current: StateFlow<Workspace?> = _current.asStateFlow()
    private var chosen: String? = null

    fun choose(cabinetId: String?) { chosen = cabinetId }
    fun clear() { chosen = null; _current.value = null }

    /** Refreshes for [companyId]; a failed call keeps the previous/cached workspace (null only when nothing is known). */
    suspend fun refresh(companyId: Long): Workspace? {
        // Another company: never show the previous company's workspace while loading - start from this company's cached copy (or nothing).
        if (_current.value?.companyId != companyId) _current.value = cached(companyId)
        val pick = chosen?.takeIf { it.startsWith("$companyId:") }
        val q = "/api/ish-joyi?bolim=ish_stoli&kompaniya_id=$companyId" + (pick?.let { "&kabinet=$it" } ?: "")
        val r = api.bff(q)
        val fresh = if (r.ok) parseWorkspace(r.body) else null
        if (fresh != null) {
            r.body?.let { cache.workspacePut(companyId, it.toString()) }
            chosen = fresh.current
            _current.value = fresh
        }
        return _current.value
    }

    private fun cached(companyId: Long): Workspace? =
        cache.workspaceGet(companyId)?.let { raw -> runCatching { parseWorkspace(json.parseToJsonElement(raw)) }.getOrNull() }
}

/** How a client opens an action: an existing native screen, a website page in the in-app WebView, or the onboarding (join/create) flow. */
sealed interface WsOpen {
    data class Native(val target: NativeTarget) : WsOpen
    data class Web(val path: String) : WsOpen
    data object Onboard : WsOpen
}
