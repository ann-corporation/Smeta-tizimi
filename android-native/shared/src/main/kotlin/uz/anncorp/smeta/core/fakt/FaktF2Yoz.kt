package uz.anncorp.smeta.core.fakt

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str

/*
 * "Fakt = F2" data + write (site api/t2-f2-narx.ts sbF2TasdiqNarxlar + api/t2-fakt.ts sbFaktYoz): ONLY reads of the approved F2 acts' rows and the live fakt documents' rows,
 * then fakt_yoz_v2 in chunks (one operation id per chunk, reused on every retry: the server never writes the same chunk twice). The estimate rows are never touched.
 */

class TenglashManba(
    val narxlar: Map<Long, F2Narx>, val f2Satrlar: Map<Long, List<F2AktQator>>, val manba: FaktManba,
) {
    fun kontekst(smetaNarx: (Long) -> Double?) = TenglashKontekst(narxlar, smetaNarx, manba.directFakt, f2Satrlar, manba.nusxalangan, manba.qolda, manba.f2Delta)
}

private fun tableRead(jadval: String, filtr: String, ustunlar: String) = buildJsonObject { put("jadval", jadval); put("filtr", filtr); put("ustunlar", ustunlar); put("limit", 100000) }

/** `{ok:true, qatorlar:[...]}` and NOT a partial read -> rows; anything else null (a partial read must never feed a sum). */
private fun rowsOf(body: JsonElement?): List<JsonObject>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true || (o["toliq"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return o["qatorlar"].arr()?.mapNotNull { it.obj() } ?: emptyList()
}

private suspend fun chunkedRows(api: BffApi, ids: List<Long>, ustunlar: String): List<JsonObject>? {
    val out = ArrayList<JsonObject>()
    for (c in ids.chunked(100)) out.addAll(rowsOf(api.bff("/api/sb", "POST", tableRead("t2_akt_qator", "akt_id=in.(${c.joinToString(",")})", ustunlar)).body) ?: return null)
    return out
}

/** Null = unreadable (the dialog must NOT open: a sum seen would differ from the sum written). */
suspend fun tenglashManbaOqi(api: BffApi, obyektId: Long): TenglashManba? {
    val a = rowsOf(api.bff("/api/sb", "POST", tableRead("t2_akt", "obyekt_id=eq.$obyektId&tur=eq.f2&holat=eq.tasdiqlangan", "id")).body) ?: return null
    val f = rowsOf(api.bff("/api/sb", "POST", tableRead("t2_akt", "obyekt_id=eq.$obyektId&tur=eq.fakt&holat=neq.bekor", "id,raqam,sana,izoh,hujjat_jami")).body) ?: return null
    val f2q = chunkedRows(api, a.mapNotNull { it["id"].num()?.toLong() }.filter { it > 0 }, "id,akt_id,qator_id,hajm,narx,summa,certified_quantity,certified_unit_price,certified_amount") ?: return null
    val fq = chunkedRows(api, f.mapNotNull { it["id"].num()?.toLong() }.filter { it > 0 }, "akt_id,qator_id,hajm,narx_manba,manba_akt_qator_id") ?: return null
    val f2 = f2q.mapNotNull { x -> F2AktQator(x["id"].num()?.toLong(), x["akt_id"].num()?.toLong() ?: return@mapNotNull null, x["qator_id"].num()?.toLong() ?: return@mapNotNull null, x["hajm"].num(), x["narx"].num(), x["summa"].num(), x["certified_quantity"].num(), x["certified_unit_price"].num(), x["certified_amount"].num()) }
    val satrlar = LinkedHashMap<Long, MutableList<F2AktQator>>(); for (x in f2) satrlar.getOrPut(x.qatorId) { ArrayList() }.add(x)
    val aktlar = f.mapNotNull { x -> FaktAkt(x["id"].num()?.toLong() ?: return@mapNotNull null, x["raqam"].str(), x["sana"].str(), x["izoh"].str(), x["hujjat_jami"].num()) }
    val qator = fq.mapNotNull { x -> FaktAktQator(x["akt_id"].num()?.toLong() ?: return@mapNotNull null, x["qator_id"].num()?.toLong() ?: return@mapNotNull null, x["hajm"].num(), x["narx_manba"].str(), x["manba_akt_qator_id"].num()?.toLong()) }
    return TenglashManba(f2NarxYigish(f2), satrlar, faktManbaYigish(aktlar, qator))
}

/** fakt_yoz_v2 body of one chunk (same line shape as the site's FaktQator: narx / narx_yoq / narx_manba / narx_manba_id / narx_izoh / manba_akt_qator_id). */
fun tenglashPayload(companyId: Long, obyektId: Long, sana: String, qatorlar: List<FaktF2PaketQator>, operationId: String, izoh: String? = null): JsonObject = buildJsonObject {
    put("amal", "fakt_yoz_v2"); put("kompaniya_id", companyId); put("obyekt_id", obyektId); put("sana", sana)
    put("qatorlar", buildJsonArray {
        for (q in qatorlar) add(buildJsonObject {
            put("qator_id", q.qatorId); put("hajm", q.hajm)
            q.manbaAktQatorId?.let { put("manba_akt_qator_id", it) }
            q.narx?.let { put("narx", it) }
            if (q.narxYoq) put("narx_yoq", true)
            q.narxManba?.let { put("narx_manba", it) }
            q.narxManbaId?.let { put("narx_manba_id", it) }
            q.narxIzoh?.let { put("narx_izoh", it) }
        })
    })
    if (izoh != null) put("izoh", izoh) else put("izoh", JsonNull)
    put("operation_id", operationId)
}

/** Cancels one fakt document (site faktF2Bekor = sbT2AktBekor): only that document, the estimate rows are not touched. */
fun aktBekorPayload(aktId: Long): JsonObject = buildJsonObject {
    put("amal", "akt_bekor"); put("akt_id", aktId); put("sabab", "Fakt = F2 bekor qilindi")
}
