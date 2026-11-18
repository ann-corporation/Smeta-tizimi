package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QChip
import uz.anncorp.qurai.ui.components.QIconButton
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QSpinner
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.markdown.QMarkdown
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.ui.QuraiTokens

/** One chat bubble. [Jarvis] text is markdown (bold, lists, tables, code) rendered by the one shared renderer. */
sealed interface QBubble {
    data class Mine(val text: String) : QBubble
    data class Jarvis(val text: String) : QBubble
    /** Token budget exhausted (402): a clear card, not a generic failure. */
    data class Budget(val title: String, val message: String, val hint: String? = null) : QBubble
    data class Problem(val message: String) : QBubble
}

data class QChatItem(val id: String, val title: String)

/** Every visible word of the chat, so Android can pass its 4-language resources and Windows the Uzbek defaults. */
data class QJarvisTexts(
    val title: String = "Jarvis", val welcome: String = "Savol bering", val hint: String = "Obyektlar, qoldiq, F-2, narxlar haqida so'rang.",
    val thinking: String = "Jarvis o'ylayapti...", val input: String = "Savol yozing...", val send: String = "Yuborish", val newChat: String = "Yangi suhbat",
    val chats: String = "Suhbatlar", val noChats: String = "Saqlangan suhbat yo'q",
)

/**
 * Jarvis chat, the SAME on Android and Windows (and laid out like the site's AI panel): optional header buttons, quick questions,
 * the saved-chat list, the conversation and the input. State is hoisted - each platform keeps its own repository / view model.
 * Enter sends, Shift+Enter makes a new line (desktop keyboards).
 */
@Composable
fun QJarvisChat(
    bubbles: List<QBubble>, busy: Boolean, input: String, onInput: (String) -> Unit, onSend: () -> Unit, modifier: Modifier = Modifier,
    texts: QJarvisTexts = QJarvisTexts(), scope: String? = null, quick: List<Pair<String, String>> = emptyList(), onQuick: (String) -> Unit = {},
    chats: List<QChatItem> = emptyList(), activeChat: String? = null, showChats: Boolean = false, onToggleChats: (() -> Unit)? = null, onNewChat: (() -> Unit)? = null,
    onOpenChat: (QChatItem) -> Unit = {}, headerExtra: (@Composable () -> Unit)? = null, focus: FocusRequester? = null, maxInput: Int = 2000,
) {
    val c = Q.colors
    val list = rememberLazyListState()
    LaunchedEffect(bubbles.size, busy) { if (bubbles.isNotEmpty()) list.animateScrollToItem(bubbles.size) }
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            Text(texts.title, Modifier.weight(1f, fill = false), style = Q.type.titleMedium, color = c.text)
            if (scope != null) QChip(scope, tone = QTone.Accent)
            Box(Modifier.weight(1f))
            if (onToggleChats != null) QButton("${texts.chats} (${chats.size})", onToggleChats, kind = QButtonKind.Ghost)
            if (onNewChat != null) QButton(texts.newChat, onNewChat, kind = QButtonKind.Ghost, icon = QIcons.Plus)
            headerExtra?.invoke()
        }
        if (showChats) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth().padding(horizontal = Q.layout.gutter), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
                if (chats.isEmpty()) item { Text(texts.noChats, style = Q.type.bodyMedium, color = c.textMute) }
                items(chats, key = { it.id }) { ch ->
                    val sel = ch.id == activeChat
                    Text(
                        ch.title.ifBlank { "—" }, Modifier.fillMaxWidth().background(if (sel) c.accentSoft else c.surface2, Q.shape.small).border(BorderStroke(1.dp, if (sel) c.accent else c.border), Q.shape.small)
                            .clickable { onOpenChat(ch) }.padding(QuraiTokens.SPACE_3.dp),
                        style = Q.type.bodyMedium, color = c.text, maxLines = 2,
                    )
                }
            }
        } else LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (bubbles.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(texts.welcome, style = Q.type.titleMedium, color = c.text)
                    Text(texts.hint, style = Q.type.bodyMedium, color = c.textMute)
                }
            }
            items(bubbles.size) { i -> Bubble(bubbles[i]) }
            if (busy) item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { QSpinner(16); Text(texts.thinking, style = Q.type.bodySmall, color = c.textMute) }
            }
        }
        if (quick.isNotEmpty() && !showChats) Row(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = 4.dp).horizontalScroll(androidx.compose.foundation.rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            quick.forEach { (label, q) -> QButton(label, { onQuick(q) }, kind = QButtonKind.Secondary, enabled = !busy) }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            QInput(
                input, { onInput(it.take(maxInput)) },
                Modifier.weight(1f).let { m -> if (focus != null) m.focusRequester(focus) else m }.onPreviewKeyEvent { e ->
                    if (e.type == KeyEventType.KeyDown && e.key == Key.Enter && !e.isShiftPressed) { if (input.isNotBlank() && !busy) onSend(); true } else false
                },
                placeholder = texts.input, singleLine = false, minLines = 1,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { if (input.isNotBlank() && !busy) onSend() }),
            )
            QIconButton(QIcons.Send, texts.send, onSend, tint = if (input.isNotBlank() && !busy) c.accent else c.textMute, enabled = input.isNotBlank() && !busy)
        }
    }
}

@Composable
private fun Bubble(b: QBubble) {
    val c = Q.colors
    when (b) {
        is QBubble.Mine -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(b.text, Modifier.widthIn(max = 520.dp).background(c.accent, Q.shape.large).padding(QuraiTokens.SPACE_3.dp), style = Q.type.bodyMedium, color = c.onAccent)
        }
        is QBubble.Jarvis -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
            Box(Modifier.widthIn(max = 720.dp).background(c.surface2, Q.shape.large).border(BorderStroke(1.dp, c.border), Q.shape.large).padding(QuraiTokens.SPACE_3.dp)) { QMarkdown(b.text) }
        }
        is QBubble.Budget -> Column(Modifier.fillMaxWidth().background(c.warnSoft, Q.shape.large).border(BorderStroke(1.dp, c.warn.copy(alpha = 0.5f)), Q.shape.large).padding(QuraiTokens.SPACE_3.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(b.title, style = Q.type.titleSmall, color = c.warn); Text(b.message, style = Q.type.bodyMedium, color = c.text)
            if (b.hint != null) Text(b.hint, style = Q.type.bodySmall, color = c.textMute)
        }
        is QBubble.Problem -> Text(b.message, Modifier.fillMaxWidth().background(c.dangerSoft, Q.shape.large).padding(QuraiTokens.SPACE_3.dp), style = Q.type.bodyMedium, color = c.danger)
    }
}
