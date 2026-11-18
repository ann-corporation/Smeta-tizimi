package uz.anncorp.qurai.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.gestures.animateScrollBy
import kotlinx.coroutines.launch
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

/** The three quick questions (label to question text), the same words as Android's `ja_q_*` strings. */
val JARVIS_QUICK_UZ: List<Pair<String, String>> = listOf(
    "Obyekt summasi QQS bilan" to "Obyektning smeta qiymati nakrutka (ustama) va QQS bilan qancha?",
    "Bugungi ishlarim" to "Bugungi ishlarim: bugun qanday ishlar bor va nimani tasdiqlashim kerak?",
    "Obyekt bo'yicha fakt holati" to "Obyektlar bo'yicha fakt holati qanday? Nima bajarilgan va nima qolgan?",
)

/** Every visible word of the chat, so Android can pass its 4-language resources and Windows the Uzbek defaults. */
data class QJarvisTexts(
    val title: String = "Jarvis", val welcome: String = "Jarvis tayyor", val hint: String = "Obyekt, fakt va bugungi ishlar haqida so'rang. Javob kompaniya ma'lumotlaridan olinadi.",
    val thinking: String = "Jarvis o'ylayapti\u2026", val input: String = "Savolingiz\u2026", val send: String = "Yuborish", val newChat: String = "Yangi suhbat",
    val chats: String = "Suhbatlar", val noChats: String = "Saqlangan suhbat yo'q",
    val copy: String = "Nusxalash", val copied: String = "Nusxalandi", val scrollDown: String = "Pastga",
)

/**
 * Jarvis chat, the SAME on Android and Windows (and laid out like the site's AI panel): optional header buttons, quick questions,
 * the saved-chat list, the conversation and the input. State is hoisted - each platform keeps its own repository / view model.
 * Enter sends, Shift+Enter makes a new line (desktop keyboards).
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun QJarvisChat(
    bubbles: List<QBubble>, busy: Boolean, input: String, onInput: (String) -> Unit, onSend: () -> Unit, modifier: Modifier = Modifier,
    texts: QJarvisTexts = QJarvisTexts(), scope: String? = null, quick: List<Pair<String, String>> = emptyList(), onQuick: (String) -> Unit = {},
    chats: List<QChatItem> = emptyList(), activeChat: String? = null, showChats: Boolean = false, onToggleChats: (() -> Unit)? = null, onNewChat: (() -> Unit)? = null,
    onOpenChat: (QChatItem) -> Unit = {}, headerExtra: (@Composable () -> Unit)? = null, focus: FocusRequester? = null, maxInput: Int = 2000,
    /** Android-only extras that sit between the header and the conversation (rename / delete, save problems). */
    belowHeader: (@Composable () -> Unit)? = null,
    /** Appended to the saved-chat list (e.g. "older chats"). */
    listFooter: (@Composable () -> Unit)? = null,
    /** False while a send is not allowed (busy, unsaved chat problem): the send button and Enter are off, quick questions too. */
    canSend: Boolean = true,
) {
    val c = Q.colors
    val list = rememberLazyListState()
    // A new bubble scrolls to the START of the last item (a long answer is read from its first line, never from its tail); the thinking row follows the question.
    val lastIndex = if (bubbles.isEmpty()) 0 else bubbles.size - 1 + (if (busy) 1 else 0)
    LaunchedEffect(bubbles.size, busy) { if (bubbles.isNotEmpty()) list.animateScrollToItem(lastIndex) }
    val sendOk = canSend && !busy
    val scope0 = androidx.compose.runtime.rememberCoroutineScope()
    Column(modifier.fillMaxSize()) {
        // Wraps instead of squeezing the title into a vertical column in a narrow panel.
        FlowRow(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp), verticalArrangement = Arrangement.spacedBy(4.dp), horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            if (texts.title.isNotBlank()) Text(texts.title, style = Q.type.titleMedium, color = c.text, maxLines = 1)
            if (scope != null) QChip(scope, tone = QTone.Accent)
            if (onToggleChats != null) QButton("${texts.chats} (${chats.size})", onToggleChats, kind = QButtonKind.Ghost)
            if (onNewChat != null) QButton(texts.newChat, onNewChat, kind = QButtonKind.Ghost, icon = QIcons.Plus)
            headerExtra?.invoke()
        }
        belowHeader?.invoke()
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
                listFooter?.let { f -> item { f() } }
            }
        } else Box(Modifier.weight(1f).fillMaxWidth()) { LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (bubbles.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(texts.welcome, style = Q.type.titleMedium, color = c.text)
                    Text(texts.hint, style = Q.type.bodyMedium, color = c.textMute)
                }
            }
            items(bubbles.size) { i -> Bubble(bubbles[i], texts) }
            if (busy) item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { QSpinner(16); Text(texts.thinking, style = Q.type.bodySmall, color = c.textMute) }
            }
        }
            // A long answer: a clear way down (the list also scrolls with the wheel / finger).
            if (list.canScrollForward) QButton(texts.scrollDown, { scope0.launch { list.animateScrollBy(list.layoutInfo.viewportSize.height * 0.8f) } }, Modifier.align(Alignment.BottomEnd).padding(8.dp), icon = QIcons.ChevronDown)
        }
        // Quick questions wrap onto the next line instead of being cut off at the right edge.
        if (quick.isNotEmpty() && !showChats) FlowRow(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp), verticalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            quick.forEach { (label, q) -> QButton(label, { onQuick(q) }, kind = QButtonKind.Secondary, enabled = sendOk) }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = QuraiTokens.SPACE_2.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(QuraiTokens.SPACE_2.dp)) {
            QInput(
                input, { onInput(it.take(maxInput)) },
                Modifier.weight(1f).let { m -> if (focus != null) m.focusRequester(focus) else m }.onPreviewKeyEvent { e ->
                    if (e.type == KeyEventType.KeyDown && e.key == Key.Enter && !e.isShiftPressed) { if (input.isNotBlank() && sendOk) onSend(); true } else false
                },
                placeholder = texts.input, singleLine = false, minLines = 1, maxLines = 5,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { if (input.isNotBlank() && sendOk) onSend() }),
            )
            QIconButton(QIcons.Send, texts.send, onSend, tint = if (input.isNotBlank() && sendOk) c.accent else c.textMute, enabled = input.isNotBlank() && sendOk)
        }
    }
}

@Composable
private fun Bubble(b: QBubble, texts: QJarvisTexts) {
    val c = Q.colors
    when (b) {
        is QBubble.Mine -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(b.text, Modifier.widthIn(max = 520.dp).background(c.accent, Q.shape.large).padding(QuraiTokens.SPACE_3.dp), style = Q.type.bodyMedium, color = c.onAccent)
        }
        is QBubble.Jarvis -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
            Column(Modifier.widthIn(max = 720.dp).background(c.surface2, Q.shape.large).border(BorderStroke(1.dp, c.border), Q.shape.large).padding(QuraiTokens.SPACE_3.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // The text can be selected; the button copies the whole answer.
                androidx.compose.foundation.text.selection.SelectionContainer { QMarkdown(b.text) }
                val clip = androidx.compose.ui.platform.LocalClipboardManager.current
                var copied by androidx.compose.runtime.remember(b.text) { androidx.compose.runtime.mutableStateOf(false) }
                QButton(if (copied) texts.copied else texts.copy, { clip.setText(androidx.compose.ui.text.AnnotatedString(b.text)); copied = true }, kind = QButtonKind.Ghost, icon = if (copied) QIcons.Check else QIcons.Copy)
            }
        }
        is QBubble.Budget -> Column(Modifier.fillMaxWidth().background(c.warnSoft, Q.shape.large).border(BorderStroke(1.dp, c.warn.copy(alpha = 0.5f)), Q.shape.large).padding(QuraiTokens.SPACE_3.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(b.title, style = Q.type.titleSmall, color = c.warn); Text(b.message, style = Q.type.bodyMedium, color = c.text)
            if (b.hint != null) Text(b.hint, style = Q.type.bodySmall, color = c.textMute)
        }
        is QBubble.Problem -> Text(b.message, Modifier.fillMaxWidth().background(c.dangerSoft, Q.shape.large).padding(QuraiTokens.SPACE_3.dp), style = Q.type.bodyMedium, color = c.danger)
    }
}
