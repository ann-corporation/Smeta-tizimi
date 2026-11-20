package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import uz.anncorp.smeta.feature.ombor.confirmBody

data class JarvisWarehouseOption(val id: Long, val name: String)
data class JarvisWarehouseRequest internal constructor(val companyId: Long, val warehouseId: Long, val body: JsonObject)

/** Ephemeral server proposal. It is deliberately excluded from the synchronized text transcript. */
data class JarvisWarehouse(
    val companyId: Long, val question: String, val warehouses: List<JarvisWarehouseOption>,
    val selectedId: Long?, val result: JsonObject?,
) {
    fun request(warehouseId: Long, query: String = question, choice: JsonElement? = null, priceMode: String? = null, confirm: Boolean = false): JarvisWarehouseRequest? {
        if (warehouses.none { it.id == warehouseId }) return null
        if (confirm) {
            val preview = result?.get("preview").obj()
            val token = result?.get("token").str()?.takeIf { it.isNotBlank() } ?: return null
            if (selectedId != warehouseId || (result?.get("ok") as? JsonPrimitive)?.booleanOrNull != true || result?.get("holat").str() != "tasdiq_kerak" ||
                (preview?.get("narx_rejim_sorov") as? JsonPrimitive)?.booleanOrNull == true) return null
            return JarvisWarehouseRequest(companyId, warehouseId, confirmBody(companyId, warehouseId, token))
        }
        if (query.isBlank() || query.length > 1000 || (priceMode != null && priceMode !in listOf("siz", "bilan"))) return null
        val body = buildJsonObject {
            put("amal", "tahlil")
            put("kompaniya_id", companyId)
            put("sklad_id", warehouseId)
            put("matn", query)
            choice?.let { put("tanlov", it) }
            priceMode?.let { put("narx_rejim", it) }
        }
        return JarvisWarehouseRequest(companyId, warehouseId, body)
    }
}

fun parseJarvisWarehouse(value: JsonElement?, companyId: Long?): JarvisWarehouse? {
    val frame = value.obj() ?: return null
    val company = (frame["company"] as? JsonPrimitive)?.longOrNull ?: return null
    if (company <= 0 || company != companyId) return null
    val question = frame["question"].str()?.takeIf { it.isNotBlank() && it.length <= 1000 } ?: return null
    val warehouses = frame["warehouses"].arr().orEmpty().mapNotNull { item ->
        val row = item.obj() ?: return@mapNotNull null
        val id = (row["id"] as? JsonPrimitive)?.longOrNull ?: return@mapNotNull null
        val owner = (row["kompaniya_id"] as? JsonPrimitive)?.longOrNull
        val name = row["nomi"].str()?.takeIf { it.isNotBlank() }
        if (id <= 0 || owner != company || name == null || (row["yozish"] as? JsonPrimitive)?.booleanOrNull != true) null
        else JarvisWarehouseOption(id, name)
    }.distinctBy { it.id }
    if (warehouses.isEmpty()) return null
    val selected = (frame["warehouseId"] as? JsonPrimitive)?.longOrNull
    if (selected != null && warehouses.none { it.id == selected }) return null
    return JarvisWarehouse(company, question, warehouses, selected, frame["result"].obj())
}
