package uz.anncorp.qurai.desktop

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.debtRequest
import uz.anncorp.smeta.core.data.f2ListRequest
import uz.anncorp.smeta.core.data.objectsRequest
import uz.anncorp.smeta.core.data.parseDebts
import uz.anncorp.smeta.core.data.parseF2List
import uz.anncorp.smeta.core.data.parseRahbarPanel
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.rahbarPanelRequest
import uz.anncorp.smeta.feature.common.*
import uz.anncorp.smeta.feature.ombor.Warehouse
import uz.anncorp.smeta.feature.ombor.parseWarehouses
import uz.anncorp.smeta.feature.ombor.warehousesRequest

// ---------- repository ----------

/** All reads of the desktop app in one place; each is cached encrypted for offline viewing (see [Services.read]). */
class Repo(private val sv: Services) {
    private suspend fun sb(body: JsonObject) = sv.api.bff("/api/sb", "POST", body)

    suspend fun objects(cid: Long) = sv.read("obyektlar:$cid", { sb(objectsRequest(cid)) }, ::parseObjs)
    suspend fun money(cid: Long): Loaded<Map<Long, ObjectMoney>> = sv.read("money:$cid", { sb(rahbarPanelRequest(cid)) }, ::parseRahbarPanel)
    suspend fun f2Acts(oid: Long) = sv.read("f2:$oid", { sb(f2ListRequest(oid)) }, ::parseF2List)
    suspend fun packet(oid: Long) = sv.read("paket:$oid", { sv.api.bff("/api/obyekt-paket?obyekt_id=$oid") }, ::parsePacket)
    suspend fun actRows(aktId: Long, names: Map<Long, SNode>) = sv.read("aktqator:$aktId", { sb(f2ActRowsRequest(aktId)) }) { parseActRows(it, names) }
    suspend fun faktJournal(oid: Long) = sv.read("faktjurnal:$oid", { sb(faktJournalRequest(oid)) }, ::parseFaktJournal)
    suspend fun narx(cid: Long) = sv.read("narx:$cid", { sb(narxRequest(cid)) }, ::parseNarx)
    suspend fun debts(cid: Long) = sv.read("qarz:$cid", { sb(debtRequest(cid)) }, ::parseDebts)
    suspend fun docs(cid: Long, oid: Long) = sv.read("hujjatlar:$cid:$oid", { sv.api.bff(docsPath(cid, oid)) }, ::parseDocs)
    suspend fun warehouses(cid: Long): Loaded<List<Warehouse>> = sv.read("sklad:$cid", { sb(warehousesRequest(cid)) }) { b -> parseSb(b)?.let { parseWarehouses(it.rows) } }
    suspend fun profile() = sv.read("profil", { sv.api.bff("/api/profil") }, ::parseProfile)

    suspend fun stock(cid: Long, sid: Long, sana: String?) = sv.read("qoldiq:$cid:$sid:${sana ?: "bugun"}", {
        sv.api.bff("/api/ombor-buyruq", "POST", omborBody("qoldiq", cid, sid) { put("limit", 500); if (sana != null) put("sana", sana) })
    }, ::parseStockLines)

    suspend fun omborCall(body: JsonObject): ApiResult = sv.api.bff("/api/ombor-buyruq", "POST", body)

    suspend fun report(cid: Long, sid: Long, dan: String?, gacha: String?, qidir: String?, op: String?, offset: Int): ApiResult = omborCall(omborBody("hisobot", cid, sid) {
        put("limit", 500); put("offset", offset)
        put("filtr", buildJsonObject { dan?.let { put("dan", it) }; gacha?.let { put("gacha", it) }; qidir?.takeIf { it.isNotBlank() }?.let { put("qidir", it) }; op?.let { put("operatsiya", it) } })
    })
}
