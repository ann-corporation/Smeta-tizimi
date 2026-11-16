package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import uz.anncorp.smeta.R

/** Where a module opens: a native screen, or the website page inside the authenticated in-app WebView. */
enum class ModuleKind { NATIVE, WEB }

/** Native destinations the hub can jump to (the UI maps each to a tab or a route). */
enum class NativeTarget { OBJECTS, FAKT, PHOTO, APPROVALS, TODAY, WAREHOUSE, JARVIS, RAHBAR, ZAYAVKA, M29, NARYAD, HUJJAT, F2REESTR, NAKOP, QARZDOR, QABUL, RESURS }

/**
 * One launcher entry. [anyOf] / [moduleCode] mirror the website gating (frontend/src/lib/reestr/sahifa.ts `ruxsat`/`modul`,
 * lib/ilova/ilovalar.ts): visible when the user holds at least one listed permission (empty = everyone) and the company has not
 * switched the module off. This only decides what is SHOWN; the server re-checks every action.
 */
data class ModuleDef(
    val code: String,
    val title: Int,
    val desc: Int,
    val kind: ModuleKind,
    val anyOf: List<String> = emptyList(),
    val moduleCode: String? = null,
    val target: NativeTarget? = null,
    val webPath: String? = null,
    val enabled: Boolean = true,
)

/**
 * Feature flags. Warehouse (Ombor) is merged and enabled. USERNAME (@username, people search, company invites; docs/architecture/USERNAME_V1.md)
 * is on: migration 20261224100000_t2_username_v1 is applied and the server (/api/profil username actions, /api/company member_invite,
 * BFF allow-list) is live on main. Kept as a var so tests can still switch it off. JARVIS (AI chat) uses the existing /api/ai-savol.
 */
object Features {
    const val NATIVE_WAREHOUSE = true
    const val JARVIS = true
    @Volatile @JvmStatic var USERNAME = true
}

private const val BOSS = "control.company.read"

object ModuleCatalog {
    val all: List<ModuleDef> = listOf(
        ModuleDef("obyektlar", R.string.mod_objects, R.string.mod_objects_d, ModuleKind.NATIVE, listOf("smeta.read"), target = NativeTarget.OBJECTS),
        ModuleDef("fakt", R.string.mod_fact, R.string.mod_fact_d, ModuleKind.NATIVE, listOf("fakt.read"), target = NativeTarget.FAKT),
        ModuleDef("foto", R.string.mod_photo, R.string.mod_photo_d, ModuleKind.NATIVE, listOf("fakt.read"), target = NativeTarget.PHOTO),
        ModuleDef("tasdiq", R.string.mod_approval, R.string.mod_approval_d, ModuleKind.NATIVE, target = NativeTarget.APPROVALS),
        ModuleDef("bugun", R.string.mod_today, R.string.mod_today_d, ModuleKind.NATIVE, listOf("company.read"), target = NativeTarget.TODAY),
        ModuleDef("ombor", R.string.mod_warehouse, R.string.mod_warehouse_d, ModuleKind.NATIVE, listOf(BOSS, "warehouse.read"), "module.logistika", NativeTarget.WAREHOUSE, enabled = Features.NATIVE_WAREHOUSE),
        ModuleDef("jarvis", R.string.mod_jarvis, R.string.mod_jarvis_d, ModuleKind.NATIVE, listOf("company.read"), target = NativeTarget.JARVIS, enabled = Features.JARVIS),
        ModuleDef("rahbar", R.string.mod_rahbar, R.string.mod_rahbar_d, ModuleKind.NATIVE, listOf(BOSS, "financial.write"), target = NativeTarget.RAHBAR, webPath = "/admin/dashboard"),
        ModuleDef("qarzdor", R.string.mod_qarzdor, R.string.mod_qarzdor_d, ModuleKind.NATIVE, listOf(BOSS, "financial.write"), target = NativeTarget.QARZDOR, webPath = "/admin/qarzdorlik"),
        ModuleDef("qabul", R.string.mod_qabul, R.string.mod_qabul_d, ModuleKind.NATIVE, listOf("fakt.write"), target = NativeTarget.QABUL),
        ModuleDef("resurs", R.string.mod_resurs, R.string.mod_resurs_d, ModuleKind.NATIVE, listOf(BOSS, "smeta.write", "warehouse.read"), target = NativeTarget.RESURS),
        ModuleDef("smeta", R.string.mod_estimate, R.string.mod_estimate_d, ModuleKind.WEB, listOf(BOSS, "smeta.write"), webPath = "/admin/smeta-studio"),
        ModuleDef("narx", R.string.mod_prices, R.string.mod_prices_d, ModuleKind.WEB, listOf(BOSS, "narx.write"), webPath = "/admin/narxlar"),
        ModuleDef("f2", R.string.mod_f2, R.string.mod_f2_d, ModuleKind.WEB, listOf("f2.prepare"), webPath = "/admin/f2-tayyorlash"),
        ModuleDef("f2reestr", R.string.mod_f2_registry, R.string.mod_f2_registry_d, ModuleKind.NATIVE, listOf("f2.read"), target = NativeTarget.F2REESTR, webPath = "/admin/f2-reestr"),
        ModuleDef("nakop", R.string.mod_accum, R.string.mod_accum_d, ModuleKind.NATIVE, listOf("f2.read"), target = NativeTarget.NAKOP, webPath = "/admin/nakopitelniy"),
        ModuleDef("moliya", R.string.mod_finance, R.string.mod_finance_d, ModuleKind.WEB, listOf(BOSS, "financial.write"), "module.moliya", webPath = "/admin/moliya"),
        ModuleDef("buxgalteriya", R.string.mod_accounting, R.string.mod_accounting_d, ModuleKind.WEB, listOf(BOSS, "accounting.write"), "module.moliya", webPath = "/admin/buxgalteriya"),
        ModuleDef("hujjat", R.string.mod_documents, R.string.mod_documents_d, ModuleKind.NATIVE, listOf(BOSS, "project.read", "document.write"), "module.hujjat", NativeTarget.HUJJAT, webPath = "/admin/hujjat-aylanish"),
        ModuleDef("m29", R.string.mod_m29, R.string.mod_m29_d, ModuleKind.NATIVE, listOf(BOSS, "smeta.write", "warehouse.write"), target = NativeTarget.M29, webPath = "/admin/m29"),
        ModuleDef("naryad", R.string.mod_naryad, R.string.mod_naryad_d, ModuleKind.NATIVE, listOf(BOSS, "smeta.write", "self.work.read"), target = NativeTarget.NARYAD, webPath = "/admin/naryad"),
        ModuleDef("aosr", R.string.mod_aosr, R.string.mod_aosr_d, ModuleKind.WEB, listOf(BOSS, "document.write"), "module.hujjat", webPath = "/admin/aosr"),
        ModuleDef("tender", R.string.mod_tender, R.string.mod_tender_d, ModuleKind.WEB, listOf(BOSS, "project.write", "object.write", "procurement.read", "supply.offer"), "module.xarid", webPath = "/admin/tender"),
        ModuleDef("logistika", R.string.mod_logistics, R.string.mod_logistics_d, ModuleKind.WEB, listOf(BOSS, "project.write", "object.write", "warehouse.read", "procurement.read", "logistics.read"), "module.logistika", webPath = "/admin/logistika"),
        ModuleDef("hr", R.string.mod_hr, R.string.mod_hr_d, ModuleKind.WEB, listOf(BOSS, "project.write", "object.write", "hr.read", "machinery.read", "machinery.log"), "module.hr", webPath = "/admin/erp"),
        ModuleDef("sotuv", R.string.mod_sales, R.string.mod_sales_d, ModuleKind.WEB, listOf("sales.read"), "module.sotuv", webPath = "/admin/sotuv"),
        ModuleDef("kompaniya", R.string.mod_company, R.string.mod_company_d, ModuleKind.WEB, listOf(BOSS, "company.member.manage", "company.profile.update"), webPath = "/admin/kompaniya"),
    )

    /** [permissions] null = unknown (offline / not loaded yet): show everything, like the website does while loading. */
    fun visible(permissions: Set<String>?, offModules: Set<String>): List<ModuleDef> = all.filter { m ->
        m.enabled && (m.moduleCode == null || m.moduleCode !in offModules) &&
            (permissions == null || m.anyOf.isEmpty() || m.anyOf.any { it in permissions })
    }
}

/** The user's own choices for one company: pinned modules and their order. Same shape the server stores (/api/modullarim). */
data class Picks(val pinned: List<String> = emptyList(), val order: List<String> = emptyList(), val version: Int = 0) {
    fun toggle(code: String): Picks = if (code in pinned) copy(pinned = pinned - code) else copy(pinned = pinned + code, order = if (code in order) order else order + code)
    /** Moves a pinned module one slot up (-1) or down (+1) among the pinned ones. */
    fun move(code: String, delta: Int): Picks {
        val ranked = rank(pinned.toList())
        val i = ranked.indexOf(code)
        val j = i + delta
        if (i < 0 || j !in ranked.indices) return this
        val swapped = ranked.toMutableList().also { it[i] = it[j]; it[j] = code }
        return copy(order = swapped + order.filter { it !in swapped })
    }
    internal fun rank(codes: List<String>): List<String> = codes.sortedBy { c -> order.indexOf(c).let { if (it < 0) Int.MAX_VALUE else it } }
}

data class Arranged(val pinned: List<ModuleDef>, val others: List<ModuleDef>)

/** Pinned first (in the user's order), then the rest in catalogue order; [query] filters by the localized title. */
fun arrange(visible: List<ModuleDef>, picks: Picks, query: String, titleOf: (ModuleDef) -> String): Arranged {
    val q = query.trim()
    val filtered = if (q.isEmpty()) visible else visible.filter { titleOf(it).contains(q, ignoreCase = true) }
    val byCode = filtered.associateBy { it.code }
    val pinned = picks.rank(picks.pinned).mapNotNull { byCode[it] }
    return Arranged(pinned, filtered.filter { it.code !in picks.pinned })
}

/** Reads the user's permissions/module switches and syncs picks with the shared server endpoint; local copy is the fallback. */
class ModulesRepository(private val api: BffApi, private val json: Json, private val local: PicksStore) {
    data class Access(val permissions: Set<String>?, val offModules: Set<String>)

    suspend fun access(companyId: Long): Access {
        val me = api.bff("/api/company?me=1")
        val perms: Set<String>? = if (me.ok) permissionsFrom(me.body, companyId) else null
        val off = api.bff("/api/sb", "POST", buildJsonObject { put("soro", "modul_holat_v1"); put("kompaniya_id", companyId) })
        return Access(perms, if (off.ok) offModulesFrom(off.body) else emptySet())
    }

    suspend fun picks(companyId: Long): Picks {
        val r = api.bff("/api/modullarim?kompaniya_id=$companyId")
        val b = r.body as? JsonObject
        if (r.ok && b?.get("ok")?.jsonPrimitive?.content == "true") {
            val p = Picks(strings(b["tanlangan"]), strings(b["tartib"]), b["versiya"]?.jsonPrimitive?.intOrNull ?: 0)
            local.put(companyId, p)
            return p
        }
        return local.get(companyId) ?: Picks()
    }

    /** Saves locally first (instant, works offline), then best effort to the server; returns the picks with the newest known version. */
    suspend fun save(companyId: Long, picks: Picks): Picks {
        local.put(companyId, picks)
        var current = picks
        repeat(2) {
            val r = api.bff("/api/modullarim", "POST", buildJsonObject {
                put("kompaniya_id", companyId); put("expected_version", current.version)
                putJsonArray("tanlangan") { current.pinned.forEach { add(JsonPrimitive(it)) } }
                putJsonArray("tartib") { current.order.forEach { add(JsonPrimitive(it)) } }
            })
            val b = r.body as? JsonObject
            if (r.ok) { current = current.copy(version = b?.get("versiya")?.jsonPrimitive?.intOrNull ?: current.version); local.put(companyId, current); return current }
            val newer = b?.get("versiya")?.jsonPrimitive?.intOrNull
            if (r.status == 409 && newer != null) current = current.copy(version = newer) else return current
        }
        return current
    }

    private fun strings(e: kotlinx.serialization.json.JsonElement?): List<String> =
        (e as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } ?: emptyList()

    companion object {
        fun permissionsFrom(body: kotlinx.serialization.json.JsonElement?, companyId: Long): Set<String>? {
            val list = (body as? JsonObject)?.get("context_kompaniyalar") as? JsonArray ?: return null
            val entry = list.map { it.jsonObject }.firstOrNull { it["kompaniya_id"]?.jsonPrimitive?.longOrNull == companyId } ?: return null
            val perms = entry["permissions"] as? JsonArray ?: return null
            return perms.mapNotNull { (it as? JsonPrimitive)?.content }.toSet()
        }
        fun offModulesFrom(body: kotlinx.serialization.json.JsonElement?): Set<String> {
            val mods = ((body as? JsonObject)?.get("natija") as? JsonObject)?.get("modullar") as? JsonArray ?: return emptySet()
            return mods.map { it.jsonObject }.filter { it["holat"]?.jsonPrimitive?.content == "off" }.mapNotNull { it["kod"]?.jsonPrimitive?.content }.toSet()
        }
    }
}

interface PicksStore {
    fun get(companyId: Long): Picks?
    fun put(companyId: Long, picks: Picks)
}
