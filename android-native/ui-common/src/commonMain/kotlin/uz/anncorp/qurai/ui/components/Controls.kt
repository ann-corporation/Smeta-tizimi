package uz.anncorp.qurai.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.height
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

enum class QButtonKind { Primary, Secondary, Ghost, Danger }

/** Website `.fz-btn`: 32dp on the desktop, 44dp touch target on the phone; primary = accent fill; secondary = surface-2 + border; ghost = text only. */
@Composable
fun QButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier, kind: QButtonKind = QButtonKind.Secondary,
    icon: ImageVector? = null, enabled: Boolean = true, loading: Boolean = false, fill: Boolean = false,
) = QButtonSlot(onClick, modifier, kind, enabled, loading, fill) {
    val fg = LocalContentColor.current
    if (loading) QSpinner(16, fg) else if (icon != null) Icon(icon, null, Modifier.size(16.dp), tint = fg)
    if (text.isNotEmpty()) Text(text, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** Slot form of [QButton] (content = Text / Icon): the same button for call sites that build their own label. */
@Composable
fun QButtonSlot(
    onClick: () -> Unit, modifier: Modifier = Modifier, kind: QButtonKind = QButtonKind.Secondary, enabled: Boolean = true,
    loading: Boolean = false, fill: Boolean = false, content: @Composable RowScope.() -> Unit,
) {
    val c = Q.colors
    val (bg, fg, border) = when (kind) {
        QButtonKind.Primary -> Triple(c.accent, c.onAccent, c.accent)
        QButtonKind.Secondary -> Triple(c.surface2, c.text, c.border)
        QButtonKind.Ghost -> Triple(Color.Transparent, c.textDim, Color.Transparent)
        QButtonKind.Danger -> Triple(Color.Transparent, c.danger, c.danger)
    }
    val on = enabled && !loading
    Row(
        modifier.let { if (fill) it.fillMaxWidth() else it }.heightIn(min = Q.layout.control).alpha(if (enabled) 1f else 0.45f)
            .background(bg, Q.shape.small).border(BorderStroke(1.dp, border), Q.shape.small)
            .clickable(enabled = on, role = androidx.compose.ui.semantics.Role.Button, onClick = onClick)
            .padding(horizontal = if (Q.layout.wide) QuraiTokens.SPACE_3.dp else QuraiTokens.SPACE_4.dp),
        horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalContentColor provides fg) {
            ProvideTextStyle(Q.type.labelLarge.copy(fontWeight = if (kind == QButtonKind.Primary) FontWeight.SemiBold else FontWeight.Medium)) { content() }
        }
    }
}

@Composable fun QPrimaryButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) = QButtonSlot(onClick, modifier, QButtonKind.Primary, enabled, content = content)
@Composable fun QSecondaryButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) = QButtonSlot(onClick, modifier, QButtonKind.Secondary, enabled, content = content)
@Composable fun QGhostButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) = QButtonSlot(onClick, modifier, QButtonKind.Ghost, enabled, content = content)
/** Icon-only button (`.fz-btn--icon`), always at least the control size. */
@Composable
fun QIconButton(icon: ImageVector, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = Q.colors.textDim, enabled: Boolean = true) {
    Box(
        modifier.size(Q.layout.control).clickable(enabled = enabled, role = androidx.compose.ui.semantics.Role.Button, onClick = onClick).alpha(if (enabled) 1f else 0.45f),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, Modifier.size(18.dp), tint = tint) }
}

/** Website input: surface-2 fill, 1dp border (accent on focus), label above, error/hint line below. */
@Composable
fun QInput(
    value: String, onValue: (String) -> Unit, modifier: Modifier = Modifier, label: String? = null, placeholder: String? = null,
    error: String? = null, hint: String? = null, singleLine: Boolean = true, enabled: Boolean = true, leading: ImageVector? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default, keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None, minLines: Int = 1, trailing: (@Composable () -> Unit)? = null, isError: Boolean = false,
) {
    val c = Q.colors
    val src = remember { MutableInteractionSource() }
    val focused by src.collectIsFocusedAsState()
    val bc = when { error != null || isError -> c.danger; focused -> c.accent; else -> c.border }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (label != null) Text(label, style = Q.type.labelMedium, color = c.textDim)
        BasicTextField(
            value, onValue, enabled = enabled, singleLine = singleLine, minLines = minLines, interactionSource = src,
            textStyle = Q.type.bodyMedium.merge(TextStyle(color = c.text)), cursorBrush = SolidColor(c.accent),
            keyboardOptions = keyboardOptions, keyboardActions = keyboardActions, visualTransformation = visualTransformation,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = Q.layout.control).background(c.surface2, Q.shape.small).border(BorderStroke(1.dp, bc), Q.shape.small)
                        .padding(horizontal = QuraiTokens.SPACE_3.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp),
                ) {
                    if (leading != null) Icon(leading, null, Modifier.size(16.dp), tint = c.textMute)
                    Box(Modifier.weight(1f)) {
                        if (value.isEmpty() && placeholder != null) Text(placeholder, style = Q.type.bodyMedium, color = c.textMute)
                        inner()
                    }
                    trailing?.invoke()
                }
            },
        )
        if (error != null) Text(error, style = Q.type.bodySmall, color = c.danger)
        else if (hint != null) Text(hint, style = Q.type.bodySmall, color = c.textMute)
    }
}

/** Search field: magnifier, clear button. */
@Composable
fun QSearchField(value: String, onValue: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "Qidirish...") {
    QInput(value, onValue, modifier, placeholder = placeholder, leading = QIcons.Search, trailing = if (value.isNotEmpty()) ({ QIconButtonSmall(QIcons.X, "Tozalash") { onValue("") } }) else null)
}

@Composable
private fun QIconButtonSmall(icon: ImageVector, description: String, onClick: () -> Unit) {
    Box(Modifier.size(24.dp).clickable(onClick = onClick), contentAlignment = Alignment.Center) { Icon(icon, description, Modifier.size(14.dp), tint = Q.colors.textMute) }
}

/** Dropdown that picks one of [options]. Looks like an input with a chevron; the menu is a Material dropdown restyled with site colours. */
@Composable
fun <O> QSelect(
    current: O?, options: List<O>, label: (O) -> String, onPick: (O) -> Unit, modifier: Modifier = Modifier,
    placeholder: String = "Tanlang", title: String? = null, enabled: Boolean = true, minWidth: Int = 160, fill: Boolean = false,
) {
    val c = Q.colors
    var open by remember { mutableStateOf(false) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (title != null) Text(title, style = Q.type.labelMedium, color = c.textDim)
        Box(if (fill) Modifier.fillMaxWidth() else Modifier) {
            Row(
                Modifier.let { if (fill) it.fillMaxWidth() else it }.widthIn(min = minWant(minWidth)).heightIn(min = Q.layout.control).background(c.surface2, Q.shape.small).border(BorderStroke(1.dp, c.border), Q.shape.small)
                    .clickable(enabled = enabled) { open = true }.padding(horizontal = QuraiTokens.SPACE_3.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp),
            ) {
                Text(current?.let(label) ?: placeholder, Modifier.weight(1f, fill = false), style = Q.type.bodyMedium, color = if (current == null) c.textMute else c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(QIcons.ChevronDown, null, Modifier.size(16.dp), tint = c.textMute)
            }
            DropdownMenu(open, { open = false }, containerColor = c.surface2, shape = Q.shape.small) {
                if (options.isEmpty()) DropdownMenuItem(text = { Text("Ro'yxat bo'sh", color = c.textMute) }, onClick = { open = false })
                options.forEach { o ->
                    DropdownMenuItem(text = { Text(label(o), style = Q.type.bodyMedium, color = c.text) }, onClick = { onPick(o); open = false })
                }
            }
        }
    }
}

private fun minWant(v: Int) = v.dp

/** `.fz-card`: surface fill, 1dp border, radius-md; optional head (title, sub, actions). */
@Composable
fun QCard(
    modifier: Modifier = Modifier, title: String? = null, sub: String? = null, actions: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null, padding: PaddingValues = PaddingValues(QuraiTokens.SPACE_4.dp), content: @Composable () -> Unit,
) {
    val c = Q.colors
    Column(
        modifier.background(c.surface, Q.shape.medium).border(BorderStroke(1.dp, c.border), Q.shape.medium)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it },
    ) {
        if (title != null || actions != null) {
            Row(Modifier.fillMaxWidth().padding(horizontal = QuraiTokens.SPACE_4.dp, vertical = QuraiTokens.SPACE_3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp)) {
                Column(Modifier.weight(1f)) {
                    if (title != null) Text(title, style = Q.type.titleMedium, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (sub != null) Text(sub, style = Q.type.bodySmall, color = c.textDim)
                }
                actions?.invoke()
            }
            QDivider()
        }
        Box(Modifier.padding(padding)) { content() }
    }
}

@Composable
fun QDivider(modifier: Modifier = Modifier) = Box(modifier.fillMaxWidth().height(1.dp).background(Q.colors.border))

/** `.fz-pagehead`: 19/24 title, 12/17 description, actions on the right (they wrap under the title on the phone). */
@Composable
fun QPageHead(title: String, modifier: Modifier = Modifier, desc: String? = null, actions: (@Composable () -> Unit)? = null) {
    val c = Q.colors
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_3.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, style = Q.type.headlineSmall, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (desc != null) Text(desc, style = Q.type.bodySmall, color = c.textDim)
        }
        actions?.invoke()
    }
}

@Composable
fun QSectionLabel(text: String, modifier: Modifier = Modifier) =
    Text(text.uppercase(), modifier, style = Q.type.labelSmall, color = Q.colors.textMute, letterSpacing = 0.6.sp)

@Composable
fun QContentColor(color: Color, content: @Composable () -> Unit) = CompositionLocalProvider(LocalContentColor provides color, content = content)

@Composable
fun QSpinner(size: Int = 20, color: Color = Q.colors.accent) =
    androidx.compose.material3.CircularProgressIndicator(Modifier.size(size.dp), color = color, strokeWidth = 2.dp)

internal val QRoundedPill = RoundedCornerShape(50)

/** Small grey helper line (the old Hint). */
@Composable
fun QHint(text: String, modifier: Modifier = Modifier) = Text(text, modifier, style = Q.type.bodySmall, color = Q.colors.textMute)

/** Tinted block that groups related controls (Section): surface-2 fill, radius-sm, 10dp padding. */
@Composable
fun QPanel(modifier: Modifier = Modifier, content: @Composable () -> Unit) =
    Column(modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.small).border(BorderStroke(1.dp, Q.colors.border), Q.shape.small).padding(QuraiTokens.SPACE_3.dp), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) { content() }
