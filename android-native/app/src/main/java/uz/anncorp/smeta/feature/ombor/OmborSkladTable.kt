package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.ui.TouchTarget

/** One table cell: plain text (optionally coloured / bold / right-aligned) or any composable. */
class Cell(val text: String = "", val color: Color? = null, val bold: Boolean = false, val end: Boolean = false, val content: (@Composable () -> Unit)? = null)

/**
 * The site's `.fz-table` / plain tables, same columns and order. A phone is narrower than the table, so the whole table scrolls sideways
 * (the site does the same through `overflow-x-auto`); header and rows share one scroll state.
 */
@Composable
fun SkladTable(headers: List<String>, widths: List<Dp>, rows: List<List<Cell>>, empty: String?, onRow: ((Int) -> Unit)? = null, endCols: Set<Int> = emptySet()) {
    val scroll = rememberScrollState()
    Column(Modifier.fillMaxWidth().horizontalScroll(scroll)) {
        Row { headers.forEachIndexed { i, h -> Text(h, Modifier.width(widths[i]).padding(8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = if (i in endCols) TextAlign.End else TextAlign.Start) } }
        HorizontalDivider(Modifier.width(widths.fold(0.dp) { a, b -> a + b }))
        rows.forEachIndexed { r, cells ->
            Row(Modifier.then(if (onRow != null) Modifier.clickable { onRow(r) } else Modifier).heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                cells.forEachIndexed { i, c ->
                    Box(Modifier.width(widths[i]).padding(8.dp)) {
                        if (c.content != null) c.content.invoke()
                        else Text(c.text, Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp), fontWeight = if (c.bold) FontWeight.SemiBold else null,
                            color = c.color ?: MaterialTheme.colorScheme.onSurface, textAlign = if (c.end || i in endCols) TextAlign.End else TextAlign.Start)
                    }
                }
            }
            HorizontalDivider(Modifier.width(widths.fold(0.dp) { a, b -> a + b }), color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
    if (rows.isEmpty() && empty != null) Text(empty, Modifier.fillMaxWidth().padding(24.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
}

/** «1–50 / 120» + Oldingi / Keyingi (site Sahifalash); hidden when everything fits on one page. */
@Composable
fun SkladPager(total: Int, offset: Int, loading: Boolean, onOffset: (Int) -> Unit, page: Int = OMBOR_PAGE) {
    if (total <= page) return
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("${offset + 1}–${minOf(offset + page, total)} / $total", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
        OutlinedButton(onClick = { onOffset(maxOf(0, offset - page)) }, enabled = !loading && offset > 0, modifier = Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.sk2_oldingi)) }
        Box(Modifier.width(8.dp))
        OutlinedButton(onClick = { onOffset(offset + page) }, enabled = !loading && offset + page < total, modifier = Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.sk2_keyingi)) }
    }
}

/** A date input (site `<input type=date>`): tap opens the picker, the clear button empties it. */
@Composable
fun SkladDateField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedTextField(value = value, onValueChange = {}, readOnly = true, singleLine = true, label = { Text(label) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
            trailingIcon = { if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Filled.Clear, null) } })
        if (value.isEmpty()) Box(Modifier.matchParentSizeClickable { open = true })
        else Box(Modifier.matchParentSizeClickable(endInset = 56.dp) { open = true })
    }
    if (open) uz.anncorp.qurai.ui.components.QDatePickerDialog(initialIso = value.ifEmpty { null }, onDismiss = { open = false }, onPick = onChange, okText = stringResource(R.string.t14_apply), cancelText = stringResource(R.string.p8_cancel))
}

private fun Modifier.matchParentSizeClickable(endInset: Dp = 0.dp, onClick: () -> Unit): Modifier = this.then(Modifier.fillMaxWidth().heightIn(min = TouchTarget).padding(end = endInset).background(Color.Transparent).clickable(onClick = onClick))
