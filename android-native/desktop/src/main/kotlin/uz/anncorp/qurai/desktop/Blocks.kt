package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QDivider
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.theme.Q

/** Master-detail: [master] on the left, [detail] on the right, a draggable divider between them (width kept while the window resizes). */
@Composable
fun SplitView(master: @Composable () -> Unit, detail: @Composable () -> Unit, modifier: Modifier = Modifier, detailWidth: Int = 380, showDetail: Boolean = true) {
    var w by remember { mutableStateOf(detailWidth.toFloat()) }
    val density = LocalDensity.current.density
    Row(modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxHeight()) { master() }
        if (showDetail) {
            Box(Modifier.width(8.dp).fillMaxHeight().pointerInput(Unit) { detectHorizontalDragGestures { _, dx -> w = (w - dx / density).coerceIn(240f, 800f) } }, contentAlignment = Alignment.Center) {
                Box(Modifier.width(1.dp).fillMaxHeight().background(Q.colors.border))
            }
            Box(Modifier.width(w.dp).fillMaxHeight()) { detail() }
        }
    }
}

/** One command of the toolbar: label + the shortcut hint shown on the button, so the keyboard way is always discoverable. */
class Command(val label: String, val hint: String? = null, val icon: ImageVector? = null, val enabled: Boolean = true, val primary: Boolean = false, val loading: Boolean = false, val run: () -> Unit)

/** Ribbon-style command bar: groups separated by a thin divider. */
@Composable
fun CommandBar(vararg groups: List<Command>, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        groups.filter { it.isNotEmpty() }.forEachIndexed { gi, g ->
            if (gi > 0) Box(Modifier.width(1.dp).height(24.dp).background(Q.colors.border))
            g.forEach { c -> QButton(c.label + (c.hint?.let { " ($it)" } ?: ""), c.run, kind = if (c.primary) QButtonKind.Primary else QButtonKind.Secondary, icon = c.icon, enabled = c.enabled, loading = c.loading) }
        }
    }
}

/** A line of a preview card: [oldValue] -> [newValue] under [title] (both already formatted; [tone] colours the change). */
class PreviewLine(val title: String, val detail: String, val tone: QTone = QTone.Neutral)

/** The shared «preview -> Tasdiqlash» card: what WILL change (server dry run), warnings, the server totals, and the only two buttons. Nothing is saved before [onConfirm]. */
@Composable
fun PreviewCard(
    title: String, lines: List<PreviewLine>, totals: List<PreviewLine>, warnings: List<String>, busy: Boolean, error: String?,
    onConfirm: () -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier, confirmText: String = "Tasdiqlayman",
) {
    val c = Q.colors
    Column(modifier.background(c.surface, Q.shape.medium).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = Q.type.titleSmall, color = c.text, fontWeight = FontWeight.SemiBold)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            lines.forEach { l -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Text(l.title, Modifier.weight(1f), style = Q.type.bodyMedium, color = c.text); Text(l.detail, style = Q.type.bodyMedium, color = toneColor(l.tone)) } }
            if (lines.isEmpty()) Text("O'zgarish yo'q", style = Q.type.bodyMedium, color = c.textMute)
        }
        if (totals.isNotEmpty()) { QDivider(); totals.forEach { l -> Column { Text(l.title, style = Q.type.labelSmall, color = c.textMute); Text(l.detail, style = Q.type.bodySmall, color = toneColor(l.tone)) } } }
        warnings.forEach { QNote(it, tone = QTone.Warn) }
        if (error != null) QNote(error, tone = QTone.Danger)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QButton(confirmText, onConfirm, kind = QButtonKind.Primary, loading = busy, enabled = !busy)
            QButton("Bekor qilish (Esc)", onCancel, enabled = !busy)
        }
    }
}

@Composable
private fun toneColor(t: QTone) = when (t) { QTone.Danger -> Q.colors.danger; QTone.Ok -> Q.colors.ok; QTone.Warn -> Q.colors.warn; QTone.Info, QTone.Accent -> Q.colors.accentText; else -> Q.colors.text }
