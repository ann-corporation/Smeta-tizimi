package uz.anncorp.qurai.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.theme.Q

/*
 * ONE date picker for the Android app and the Windows app (QA 2026-11-18: dates were "Bugun/Kecha" chips on the phone and a YYYY-MM-DD text box on
 * Windows). Dates travel as ISO "yyyy-MM-dd" strings and are SHOWN as dd.MM.yyyy everywhere; no java.time in common code.
 */

private const val MILLIS_PER_DAY = 86_400_000L

/** "yyyy-MM-dd" -> UTC midnight millis (what the Material picker state uses); null when the text is not a real date. */
fun isoToPickerMillis(iso: String?): Long? {
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$").find(iso?.trim().orEmpty()) ?: return null
    val (y, mo, d) = m.destructured
    val year = y.toInt(); val month = mo.toInt(); val day = d.toInt()
    if (month !in 1..12 || day !in 1..daysInMonth(year, month)) return null
    return daysFromCivil(year, month, day) * MILLIS_PER_DAY
}

/** UTC-midnight millis -> "yyyy-MM-dd". */
fun pickerMillisToIso(millis: Long): String {
    val (y, m, d) = civilFromDays(millis.floorDiv(MILLIS_PER_DAY))
    return "${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
}

/** "yyyy-MM-dd" -> "dd.MM.yyyy"; anything else is returned unchanged (empty -> empty). */
fun isoToDisplay(iso: String): String {
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})").find(iso.trim()) ?: return iso
    val (y, mo, d) = m.destructured
    return "$d.$mo.$y"
}

/** Typed "dd.MM.yyyy" (or ISO) -> ISO, null when invalid. Lets the keyboard stay an option next to the calendar. */
fun displayToIso(text: String): String? {
    val t = text.trim()
    Regex("^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})$").find(t)?.let { m ->
        val (d, mo, y) = m.destructured
        val iso = "${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}"
        return iso.takeIf { isoToPickerMillis(it) != null }
    }
    return t.takeIf { isoToPickerMillis(it) != null }
}

private fun isLeap(y: Int) = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
private fun daysInMonth(y: Int, m: Int) = when (m) { 2 -> if (isLeap(y)) 29 else 28; 4, 6, 9, 11 -> 30; else -> 31 }

// Howard Hinnant's civil-date algorithms (days since 1970-01-01).
private fun daysFromCivil(y0: Int, m: Int, d: Int): Long {
    val y = if (m <= 2) y0 - 1 else y0
    val era = y.floorDiv(400)
    val yoe = y - era * 400
    val doy = (153 * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era.toLong() * 146_097 + doe - 719_468
}

private fun civilFromDays(z0: Long): Triple<Int, Int, Int> {
    val z = z0 + 719_468
    val era = z.floorDiv(146_097L)
    val doe = (z - era * 146_097).toInt()
    val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
    val y = yoe + era * 400
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = doy - (153 * mp + 2) / 5 + 1
    val m = if (mp < 10) mp + 3 else mp - 9
    return Triple((if (m <= 2) y + 1 else y).toInt(), m, d)
}

/** Calendar dialog. [onPick] gets the ISO date. */
@Composable
fun QDatePickerDialog(initialIso: String?, onDismiss: () -> Unit, onPick: (String) -> Unit, okText: String = "OK", cancelText: String = "Bekor") {
    val state = rememberDatePickerState(initialSelectedDateMillis = isoToPickerMillis(initialIso))
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = { state.selectedDateMillis?.let { onPick(pickerMillisToIso(it)) }; onDismiss() }, enabled = state.selectedDateMillis != null) { Text(okText) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(cancelText) } },
    ) { DatePicker(state = state) }
}

/** Label + a tappable field showing dd.MM.yyyy (calendar icon); tap opens [QDatePickerDialog]. Quick chips (today / yesterday) stay the caller's choice. */
@Composable
fun QDateField(iso: String?, onPick: (String) -> Unit, modifier: Modifier = Modifier, label: String? = null, placeholder: String = "dd.mm.yyyy") {
    var open by remember { mutableStateOf(false) }
    val c = Q.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (label != null) Text(label, style = Q.type.labelMedium, color = c.textDim)
        Row(
            Modifier.fillMaxWidth().heightIn(min = Q.layout.control).background(c.surface2, Q.shape.small).border(BorderStroke(1.dp, c.border), Q.shape.small)
                .clickable { open = true }.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(if (iso.isNullOrBlank()) placeholder else isoToDisplay(iso), style = Q.type.bodyMedium, color = if (iso.isNullOrBlank()) c.textMute else c.text, modifier = Modifier.weight(1f))
            Text("\u25BE", style = Q.type.bodyMedium, color = c.textDim)
        }
    }
    if (open) QDatePickerDialog(iso, onDismiss = { open = false }, onPick = onPick)
}
