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
    if (!isOmborKind(e.kind)) return e.obyektNom
    val s = summarizePayload(e.payloadJson) ?: return e.obyektNom
    val res = when (s.op) { "rasxod" -> R.string.ombor_outbox_rasxod; "berdim" -> R.string.ombor_outbox_berdim; else -> R.string.ombor_outbox_prixod }
    return stringResource(res, s.nomi, s.qty, s.unit) + " · " + e.obyektNom
}
