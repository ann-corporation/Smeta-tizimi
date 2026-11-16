package uz.anncorp.smeta.feature.ombor

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.db.OutboxEntity

/**
 * Title of an outbox card. Fact writes keep showing the object name; warehouse writes show «Kirim: material — qty unit»
 * (the object name is added after it). Used by the shared OutboxScreen with a one-line call.
 */
@Composable
fun outboxTitle(e: OutboxEntity): String {
    if (uz.anncorp.smeta.feature.zayavka.isZayavkaKind(e.kind)) {
        val p = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(e.payloadJson) }.getOrNull() as? kotlinx.serialization.json.JsonObject
        val pl = p?.get("payload") as? kotlinx.serialization.json.JsonObject
        val item = (pl?.get("item_text") as? kotlinx.serialization.json.JsonPrimitive)?.content.orEmpty()
        val qty = (pl?.get("requested_qty") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()
        val unit = (pl?.get("unit") as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()
        return stringResource(R.string.zay_outbox, item, uz.anncorp.smeta.feature.ombor.formatQty(qty), unit) + " - " + e.obyektNom
    }
    if (uz.anncorp.smeta.feature.m29.isM29Kind(e.kind)) {
        val s = uz.anncorp.smeta.feature.m29.summarizeM29(e.payloadJson)
        return stringResource(R.string.dl_m29_outbox, s?.davr.orEmpty(), s?.lineCount ?: 0) + " - " + e.obyektNom
    }
    if (uz.anncorp.smeta.feature.naryad.isNaryadKind(e.kind)) return stringResource(R.string.dl_nar_outbox, uz.anncorp.smeta.feature.naryad.summarizeReport(e.payloadJson).orEmpty()) + " - " + e.obyektNom
    if (!isOmborKind(e.kind)) return e.obyektNom
    val s = summarizePayload(e.payloadJson) ?: return e.obyektNom
    val res = when (s.op) { "rasxod" -> R.string.ombor_outbox_rasxod; "berdim" -> R.string.ombor_outbox_berdim; else -> R.string.ombor_outbox_prixod }
    return stringResource(res, s.nomi, s.qty, s.unit) + " · " + e.obyektNom
}
