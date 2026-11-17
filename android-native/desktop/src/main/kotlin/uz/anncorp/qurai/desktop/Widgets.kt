package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.core.data.formatMoney
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Shared Uzbek (Latin) strings of the desktop app. */
object Tx {
    const val off = "Oflayn: oxirgi saqlangan nusxa"
    const val forbidden = "Bu bo'limni ko'rishga ruxsat yo'q"
    const val nodata = "Ma'lumot yo'q (oflayn va nusxa saqlanmagan)"
    const val offlineWrite = "Oflayn: yozib bo'lmaydi, tarmoqqa ulanib qayta urinib ko'ring"
    const val dash = "—"
}

fun stamp(ms: Long): String = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(ms))

/** Money with a space-grouped integer part; unknown (null) is a dash, never 0. */
fun money(v: Double?): String = if (v == null) Tx.dash else formatMoney(v, 2)

/** Plain number for a quantity (up to 3 decimals, comma decimal). */
fun qty(v: Double?): String = if (v == null) Tx.dash else uz.anncorp.smeta.core.data.formatVolume(v)

@Composable
fun <T> Loaded<T>.Banner() {
    when (this) {
        is Loaded.Offline<*> -> Text("${Tx.off} (${stamp(savedAt)})", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
        Loaded.Forbidden -> Text(Tx.forbidden, color = MaterialTheme.colorScheme.error)
        Loaded.NoData -> Text(Tx.nodata, color = MaterialTheme.colorScheme.error)
        is Loaded.Failed -> Text("Xato: $code", color = MaterialTheme.colorScheme.error)
        is Loaded.Fresh<*> -> {}
    }
}

/** The data of a fresh or offline read; null when there is nothing to show. */
fun <T> Loaded<T>?.valueOrNull(): T? = when (this) { is Loaded.Fresh -> data; is Loaded.Offline -> data; else -> null }

@Composable
fun Title(s: String, sub: String? = null) {
    Column {
        Text(s, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        if (sub != null) Text(sub, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Loading() = Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
fun Hint(s: String) = Text(s, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

/** One column of a [SortTable]: [sort] is the key used when the header is clicked; [text] is what the cell shows. */
class Col<R>(val title: String, val width: Dp, val numeric: Boolean = false, val sort: ((R) -> Comparable<*>?)? = null, val text: (R) -> String)

/**
 * Desktop table: fixed header with click-to-sort columns (click again to reverse), zebra-free thin dividers, horizontal scroll when the
 * columns are wider than the window. [onClick] makes a row clickable (keyboard-free selection).
 */
@Composable
fun <R> SortTable(rows: List<R>, cols: List<Col<R>>, modifier: Modifier = Modifier, key: ((R) -> Any)? = null, onClick: ((R) -> Unit)? = null, selected: ((R) -> Boolean)? = null) {
    var sortIdx by remember(cols.size) { mutableStateOf(-1) }
    var asc by remember(cols.size) { mutableStateOf(true) }
    val sorted = remember(rows, sortIdx, asc) {
        val s = cols.getOrNull(sortIdx)?.sort
        if (s == null) rows else {
            @Suppress("UNCHECKED_CAST")
            val cmp = Comparator<R> { a, b ->
                val x = s(a) as Comparable<Any>?; val y = s(b) as Comparable<Any>?
                when { x == null && y == null -> 0; x == null -> 1; y == null -> -1; else -> x.compareTo(y) }
            }
            rows.sortedWith(if (asc) cmp else cmp.reversed())
        }
    }
    val hs = rememberScrollState()
    Column(modifier.fillMaxSize()) {
        Column(Modifier.horizontalScroll(hs).fillMaxSize()) {
            Row(Modifier.background(MaterialTheme.colorScheme.surfaceVariant).padding(vertical = 6.dp)) {
                cols.forEachIndexed { i, c ->
                    val mark = if (i == sortIdx) (if (asc) " ▲" else " ▼") else ""
                    Text(
                        c.title + mark, Modifier.width(c.width).padding(horizontal = 6.dp).let { m -> if (c.sort != null) m.clickable { if (sortIdx == i) asc = !asc else { sortIdx = i; asc = true } } else m },
                        fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        textAlign = if (c.numeric) TextAlign.End else TextAlign.Start,
                    )
                }
            }
            LazyColumn(Modifier.weight(1f)) {
                items(sorted, key = key) { r ->
                    val bg = if (selected?.invoke(r) == true) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface
                    Row(Modifier.background(bg).let { m -> if (onClick != null) m.clickable { onClick(r) } else m }.padding(vertical = 5.dp)) {
                        cols.forEach { c ->
                            Text(
                                c.text(r), Modifier.width(c.width).padding(horizontal = 6.dp), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                textAlign = if (c.numeric) TextAlign.End else TextAlign.Start,
                            )
                        }
                    }
                    HorizontalDivider(thickness = 0.5.dp)
                }
            }
        }
    }
}


/** A dropdown that picks one of [options]; [label] names the option. */
@Composable
fun <O> Picker(current: O?, options: List<O>, empty: String, label: (O) -> String, onPick: (O) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }) { Text(current?.let(label) ?: empty, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(260.dp)) }
        DropdownMenu(open, { open = false }) {
            options.forEach { o -> DropdownMenuItem(text = { Text(label(o)) }, onClick = { onPick(o); open = false }) }
        }
    }
}

/** A labelled money line: "label  value" with a bold value, used in the totals strip. */
@Composable
fun Kv(k: String, v: String, modifier: Modifier = Modifier) {
    Column(modifier.padding(end = 20.dp)) {
        Text(k, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(v, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun Section(content: @Composable () -> Unit) = Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small).padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { content() }

@Composable
fun Fill(content: @Composable () -> Unit) = Box(Modifier.fillMaxSize()) { content() }
