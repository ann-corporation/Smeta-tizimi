package uz.anncorp.smeta.core.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

const val OBYEKT_COLUMNS = "id,nom,tur,kompaniya_id,qator_soni,jami,narxsiz,yangilandi"

fun objectsRequest(companyId: Long): JsonObject = buildJsonObject {
    put("jadval", "t2_obyekt_jami")
    put("filtr", "kompaniya_id=eq.$companyId")
    put("ustunlar", OBYEKT_COLUMNS)
    put("tartib", "nom.asc")
    put("limit", 5000)
}

