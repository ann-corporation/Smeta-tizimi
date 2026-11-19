package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QCard
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QCol
import uz.anncorp.qurai.ui.components.QEmpty
import uz.anncorp.qurai.ui.components.QSumBlock
import uz.anncorp.qurai.ui.components.QTable
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

/**
 * One object of the list as plain display values. Money strings are ALREADY formatted from the server's sum package - this screen
 * never computes QQS or markup (owner rule): qqsBilan first, then ustamali (QQS siz), then ustamasiz. null = unknown ("—", never 0).
 */
data class QObjectRow(
    val id: Long, val name: String, val type: String? = null, val rows: Int? = null, val unpriced: Int? = null,
    val qqsBilan: String? = null, val ustamali: String? = null, val ustamasiz: String? = null, val factPct: String? = null, val f2Pct: String? = null,
)

data class QObjectTexts(
    val colObject: String = "Obyekt", val colType: String = "Turi", val colRows: String = "Qator", val colUnpriced: String = "Narxsiz",
    val colSmeta: String = "Smeta (QQS bilan)", val colFact: String = "Fakt %", val colF2: String = "F-2 %", val empty: String = "Obyekt topilmadi",
    val rowsLabel: (Int) -> String = { "$it qator" }, val unpricedLabel: (Int) -> String = { "$it ta narxsiz" },
)

/**
 * Objects list used by BOTH apps: a sortable table on wide windows (Windows / tablet), cards with the money triple on the phone.
 * Same data, same wording, same click behaviour - only the layout adapts.
 */
@Composable
fun QObjectList(
    rows: List<QObjectRow>, onOpen: (QObjectRow) -> Unit, modifier: Modifier = Modifier, selectedId: Long? = null, texts: QObjectTexts = QObjectTexts(),
    contentPadding: PaddingValues = PaddingValues(0.dp),
) {
    val dash = "—"
    if (rows.isEmpty()) { QEmpty(texts.empty, modifier); return }
    if (Q.layout.wide) {
        // The Jarvis side panel (420dp) leaves a narrow pane: fit the columns to it (name column takes the rest; type / rows are dropped first) instead of cutting the table at the right edge.
        androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxSize()) {
            val avail = maxWidth.value.toInt() - 4
            val full = avail - 600 >= 160
            val nameW = (if (full) avail - 600 else avail - 410).coerceIn(160, 380)
            val cols = buildList<QCol<QObjectRow>> {
                add(QCol(texts.colObject, nameW.dp, sort = { it.name.lowercase() }) { it.name })
                if (full) { add(QCol(texts.colType, 110.dp, sort = { it.type }) { it.type ?: dash }); add(QCol(texts.colRows, 80.dp, true, { it.rows }) { it.rows?.toString() ?: dash }) }
                add(QCol(texts.colUnpriced, 80.dp, true, { it.unpriced }) { it.unpriced?.toString() ?: dash })
                add(QCol(texts.colSmeta, 170.dp, true, { it.qqsBilan }) { it.qqsBilan ?: dash })
                add(QCol(texts.colFact, 80.dp, true, { it.factPct }) { it.factPct ?: dash })
                add(QCol(texts.colF2, 80.dp, true, { it.f2Pct }) { it.f2Pct ?: dash })
            }
            QTable(rows, cols, modifier = Modifier.fillMaxSize(), key = { it.id }, onClick = onOpen, selected = { it.id == selectedId })
        }
    } else {
        LazyColumn(modifier.fillMaxSize(), contentPadding = contentPadding, verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp)) {
            items(rows, key = { it.id }) { o ->
                QCard(Modifier.fillMaxWidth(), onClick = { onOpen(o) }) {
                    Column(verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
                        Text(o.name, style = Q.type.titleMedium, color = Q.colors.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            o.type?.takeIf { it.isNotBlank() }?.let { QChip(it) }
                            o.rows?.let { QChip(texts.rowsLabel(it)) }
                            if ((o.unpriced ?: 0) > 0) QChip(texts.unpricedLabel(o.unpriced ?: 0), tone = QTone.Warn)
                            o.factPct?.let { QChip("${texts.colFact} $it", tone = QTone.Accent) }
                            o.f2Pct?.let { QChip("${texts.colF2} $it", tone = QTone.Info) }
                        }
                        QSumBlock(o.qqsBilan, o.ustamali, o.ustamasiz)
                    }
                }
            }
        }
    }
}
