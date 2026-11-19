package uz.anncorp.smeta.feature.ombor

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * Ombor lug'ati (site OmborLugat.tsx): phrases the system understood and the storekeeper confirmed (phrase -> existing material / supplier name).
 * Server: POST /api/ombor-buyruq `lugat_royxat` / `lugat_tahrir` (t2_ombor_lugat_royxat_v1 / t2_ombor_lugat_yoz_v1): the same RPCs, company check and
 * permission as the site; the device BFF only carries them. Web, Android, Telegram and Jarvis share one dictionary.
 */

enum class LugatType(val wire: String) { MATERIAL("material"), SUPPLIER("kontragent") }

data class LugatRow(val id: Long, val type: LugatType, val phrase: String, val canonical: String, val unit: String?, val used: Int)

sealed interface LugatAction {
    data class Add(val type: LugatType, val phrase: String, val canonical: String) : LugatAction
    data class Rename(val id: Long, val canonical: String) : LugatAction
    data class Merge(val ids: List<Long>, val canonical: String) : LugatAction
    data class Delete(val id: Long) : LugatAction
}

fun lugatListBody(companyId: Long, skladId: Long, type: LugatType): JsonObject = buildJsonObject {
    put("amal", "lugat_royxat"); put("kompaniya_id", companyId); put("sklad_id", skladId); put("tur", type.wire)
}

/** Same limits as the server (phrase 200, canonical 500). Blank text is refused here as on the site (buttons stay disabled). */
fun lugatEditBody(companyId: Long, skladId: Long, a: LugatAction): JsonObject = buildJsonObject {
    put("amal", "lugat_tahrir"); put("kompaniya_id", companyId); put("sklad_id", skladId)
    when (a) {
        is LugatAction.Add -> { put("lugat_amal", "qosh"); put("yuk", buildJsonObject { put("tur", a.type.wire); put("ibora", a.phrase.trim().take(200)); put("kanonik", a.canonical.trim().take(500)) }) }
        is LugatAction.Rename -> { put("lugat_amal", "nomla"); put("yuk", buildJsonObject { put("id", a.id); put("kanonik", a.canonical.trim().take(500)) }) }
        is LugatAction.Merge -> { put("lugat_amal", "birlashtir"); put("yuk", buildJsonObject { put("ids", buildJsonArray { a.ids.forEach { add(JsonPrimitive(it)) } }); put("kanonik", a.canonical.trim().take(500)) }) }
        is LugatAction.Delete -> { put("lugat_amal", "ochir"); put("yuk", buildJsonObject { put("id", a.id) }) }
    }
}

fun lugatActionValid(a: LugatAction): Boolean = when (a) {
    is LugatAction.Add -> a.phrase.isNotBlank() && a.canonical.isNotBlank()
    is LugatAction.Rename -> a.canonical.isNotBlank()
    is LugatAction.Merge -> a.ids.size > 1 && a.canonical.isNotBlank()
    is LugatAction.Delete -> true
}

/** `{ok:true, qatorlar:[{id, tur, ibora, kanonik, birlik, soni}]}` -> rows; null for any other shape. */
fun parseLugat(body: JsonElement?): List<LugatRow>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return (o["qatorlar"].arr() ?: return null).mapNotNull { e ->
        val r = e.obj() ?: return@mapNotNull null
        val id = r["id"].num()?.toLong() ?: return@mapNotNull null
        LugatRow(id, if (r["tur"].str() == "kontragent") LugatType.SUPPLIER else LugatType.MATERIAL, r["ibora"].str().orEmpty(), r["kanonik"].str().orEmpty(), r["birlik"].str(), r["soni"].num()?.toInt() ?: 0)
    }
}

/** null = ok; otherwise the server error code (MIGRATSIYA_YOQ = the table is not applied yet: the site says «Lugat hali ulanmagan.»). */
fun lugatError(r: ApiResult): String? {
    if (r.networkError) return "NETWORK"
    val o = r.body.obj()
    return if (r.ok && (o?.get("ok") as? JsonPrimitive)?.booleanOrNull != false) null else r.code ?: o?.get("code").str() ?: "HTTP ${r.status}"
}
