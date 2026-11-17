package uz.anncorp.smeta.core.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.core.db.ObyektEntity

/** Colour role of a status pill. */
enum class Tone { NEUTRAL, GOOD, WARN, BAD, INFO }

@Composable
fun toneColor(t: Tone): Color = when (t) {
    Tone.GOOD -> MaterialTheme.colorScheme.secondary
    Tone.WARN -> MaterialTheme.colorScheme.tertiary
    Tone.BAD -> MaterialTheme.colorScheme.error
    Tone.INFO -> MaterialTheme.colorScheme.primary
    Tone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
}

/** Small rounded status pill (state is always also written as text, never colour alone). */
@Composable
fun StatusChip(text: String, tone: Tone, modifier: Modifier = Modifier) {
    val c = toneColor(tone)
    Surface(shape = RoundedCornerShape(50), color = c.copy(alpha = 0.16f), modifier = modifier) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = c, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp), maxLines = 1)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = modifier.padding(top = 8.dp))
}

/** Horizontally scrolling chip row (filters). */
@Composable
fun ChipRow(content: @Composable RowScope.() -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = content)
}

/** Dropdown that picks one of the company's objects (null selection = [allLabel] when given, else the placeholder). */
@Composable
fun ObjectDropdown(objects: List<ObyektEntity>, selectedId: Long?, placeholder: String, onPick: (Long?) -> Unit, allLabel: String? = null, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    val chosen = objects.firstOrNull { it.id == selectedId }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
            Text(chosen?.nom ?: allLabel ?: placeholder, maxLines = 1)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (allLabel != null) DropdownMenuItem(text = { Text(allLabel) }, onClick = { onPick(null); open = false }, modifier = Modifier.heightIn(min = 48.dp))
            objects.forEach { o -> DropdownMenuItem(text = { Text(o.nom) }, onClick = { onPick(o.id); open = false }, modifier = Modifier.heightIn(min = 48.dp)) }
        }
    }
}
