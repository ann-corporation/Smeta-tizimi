package uz.anncorp.qurai.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

/** Empty list / nothing found. */
@Composable
fun QEmpty(text: String, modifier: Modifier = Modifier, icon: ImageVector = QIcons.Inbox, action: (@Composable () -> Unit)? = null) {
    Column(modifier.fillMaxWidth().padding(QuraiTokens.SPACE_6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
        Icon(icon, null, Modifier.size(28.dp), tint = Q.colors.textMute)
        Text(text, style = Q.type.bodyMedium, color = Q.colors.textMute, textAlign = TextAlign.Center)
        action?.invoke()
    }
}

/** Error / offline / forbidden banner: danger tint, optional retry. */
@Composable
fun QError(text: String, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null) {
    val c = Q.colors
    Row(
        modifier.fillMaxWidth().background(c.dangerSoft, Q.shape.small).border(BorderStroke(1.dp, c.danger.copy(alpha = 0.5f)), Q.shape.small).padding(QuraiTokens.SPACE_3.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp),
    ) {
        Icon(QIcons.TriangleAlert, null, Modifier.size(18.dp), tint = c.danger)
        Text(text, Modifier.weight(1f), style = Q.type.bodyMedium, color = c.danger)
        if (onRetry != null) QButton("Qayta urinish", onRetry, kind = QButtonKind.Ghost)
    }
}

/** Soft information banner (offline copy, hints). */
@Composable
fun QNote(text: String, modifier: Modifier = Modifier, tone: QTone = QTone.Info) {
    val c = Q.colors
    val (bg, fg) = when (tone) { QTone.Warn -> c.warnSoft to c.warn; QTone.Danger -> c.dangerSoft to c.danger; QTone.Ok -> c.okSoft to c.ok; else -> c.infoSoft to c.info }
    Row(modifier.fillMaxWidth().background(bg, Q.shape.small).padding(horizontal = QuraiTokens.SPACE_3.dp, vertical = QuraiTokens.SPACE_2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
        Icon(QIcons.Info, null, Modifier.size(16.dp), tint = fg)
        Text(text, style = Q.type.bodySmall, color = c.text)
    }
}

@Composable
fun QLoading(modifier: Modifier = Modifier, text: String? = null) {
    Column(modifier.fillMaxWidth().padding(QuraiTokens.SPACE_6.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
        QSpinner(24)
        if (text != null) Text(text, style = Q.type.bodySmall, color = Q.colors.textMute)
    }
}

/** Modal dialog styled like the site's modals: card, title, body, buttons right-aligned (full width stacked on the phone). */
@Composable
fun QDialog(
    title: String, onDismiss: () -> Unit, modifier: Modifier = Modifier, confirm: String? = null, onConfirm: (() -> Unit)? = null,
    dismissText: String = "Bekor qilish", confirmEnabled: Boolean = true, danger: Boolean = false, buttons: (@Composable RowScope.() -> Unit)? = null, content: @Composable () -> Unit,
) {
    val c = Q.colors
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier.widthIn(max = 520.dp).fillMaxWidth(if (Q.layout.wide) 0.5f else 0.92f).background(c.surface, Q.shape.large).border(BorderStroke(1.dp, c.border), Q.shape.large).padding(QuraiTokens.SPACE_5.dp),
            verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp),
        ) {
            Text(title, style = Q.type.titleMedium, color = c.text)
            content()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp, Alignment.End)) {
                if (buttons != null) buttons() else {
                    QButton(dismissText, onDismiss, kind = QButtonKind.Ghost)
                    if (confirm != null && onConfirm != null) QButton(confirm, onConfirm, kind = if (danger) QButtonKind.Danger else QButtonKind.Primary, enabled = confirmEnabled)
                }
            }
        }
    }
}
