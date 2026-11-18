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
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.components.QTone

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

/** Status pill: the website's .fz-chip (shared QChip); state is always also written as text, never colour alone. */
@Composable
fun StatusChip(text: String, tone: Tone, modifier: Modifier = Modifier) {
    QChip(text, modifier, when (tone) { Tone.GOOD -> QTone.Ok; Tone.WARN -> QTone.Warn; Tone.BAD -> QTone.Danger; Tone.INFO -> QTone.Accent; Tone.NEUTRAL -> QTone.Neutral })
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

/** Dropdown that picks one of the company's objects (null selection = [allLabel] when given, else the placeholder). Shared QSelect. */
@Composable
fun ObjectDropdown(objects: List<ObyektEntity>, selectedId: Long?, placeholder: String, onPick: (Long?) -> Unit, allLabel: String? = null, modifier: Modifier = Modifier) {
    val opts: List<ObyektEntity?> = if (allLabel != null) listOf<ObyektEntity?>(null) + objects else objects
    QSelect(objects.firstOrNull { it.id == selectedId } ?: if (allLabel != null) null else null, opts, { it?.nom ?: allLabel.orEmpty() }, { onPick(it?.id) }, modifier, placeholder = allLabel ?: placeholder, fill = true)
}