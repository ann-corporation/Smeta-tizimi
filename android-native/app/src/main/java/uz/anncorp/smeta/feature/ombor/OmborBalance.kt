package uz.anncorp.smeta.feature.ombor

// ---------- balance computed from movements ----------

/**
 * The import only brings receipts (prixod), so the balance is receipts minus issues per object, material and unit, computed from the
 * movement history when the server's stock table has nothing. Quantities only, no prices.
 */
fun balanceFromMoves(moves: List<OmborMove>): List<StockRow> =
    moves.groupBy { Triple(it.objectId, searchKey(it.nomi), it.birligi.lowercase()) }.map { (_, list) ->
        val first = list.first()
        val sum = list.fold(0.0) { s, m -> s + (m.qty ?: 0.0) * (if (m.isIncoming) 1 else -1) }
        StockRow(first.objectId, first.nomi, first.birligi, sum, list.mapNotNull { it.date }.maxOrNull())
    }
