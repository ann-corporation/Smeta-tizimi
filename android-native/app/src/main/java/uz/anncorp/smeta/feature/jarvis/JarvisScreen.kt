package uz.anncorp.smeta.feature.jarvis

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ChatInfo
import uz.anncorp.smeta.core.data.ChatMsg
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject

/** One bubble in the chat. Errors are first-class so a 402 (no tokens) is shown as a clear card, not a generic failure. */
sealed interface Bubble {
    data class Mine(val text: String) : Bubble
    data class Jarvis(val text: String, val local: Boolean) : Bubble
    data class Budget(val message: String?) : Bubble
    data class Problem(val kind: Kind, val message: String?) : Bubble
    enum class Kind { NETWORK, SERVER, CONTEXT }
}

/** [chats] = the server chat list shared with the web; [chatId] = the open chat (its id is the server `klient_id`). */
data class JarvisUi(val bubbles: List<Bubble> = emptyList(), val busy: Boolean = false, val chats: List<ChatInfo> = emptyList(), val chatId: String = newChatId(), val showList: Boolean = false)

internal fun newChatId(): String = UUID.randomUUID().toString()

/** Conversation turns (errors and budget cards are not part of the conversation). Pure. */
internal fun toMessages(b: List<Bubble>): List<ChatMsg> = b.mapNotNull {
    when (it) { is Bubble.Mine -> ChatMsg(true, it.text); is Bubble.Jarvis -> ChatMsg(false, it.text); else -> null }
}
internal fun toBubbles(m: List<ChatMsg>): List<Bubble> = m.map { if (it.mine) Bubble.Mine(it.text) else Bubble.Jarvis(it.text, false) }

/** A chat counts as «recent» for auto-restore on a new device/screen open when updated within 48 hours (same rule as the web). */
internal fun isRecent(updatedAt: String, now: OffsetDateTime = OffsetDateTime.now()): Boolean =
    runCatching { OffsetDateTime.parse(updatedAt).isAfter(now.minusHours(48)) }.getOrDefault(false)

@HiltViewModel
class JarvisViewModel @Inject constructor(private val repo: JarvisRepository, private val ctx: WorkContext, saved: SavedStateHandle, objects: uz.anncorp.smeta.core.data.ObjectsRepository) : ViewModel() {
    private val _ui = MutableStateFlow(JarvisUi())
    val ui: StateFlow<JarvisUi> = _ui.asStateFlow()
    /** The object the chat was opened from (route arg `obyekt`); sent with every question so «shu obyekt» is exact. */
    private val objectId: Long? = saved.get<Long>("obyekt")?.takeIf { it > 0 }
    /** True when opened from an object card / smeta tree (`jarvis?obyekt=ID`): "shu obyekt" questions are about that object. */
    val scoped: Boolean = objectId != null
    val objectName: StateFlow<String?> = (objectId?.let { id -> objects.observeOne(id).map { it?.nom } } ?: flowOf(null)).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    private var known: String? = null  // server updatedAt of the open chat that this screen already shows
    private var saving = false
    private var restored = false

    private fun companyId() = ctx.current.value?.companyId

    fun ask(text: String) {
        val q = text.trim()
        if (q.isEmpty() || _ui.value.busy) return
        val history = toMessages(_ui.value.bubbles)
        _ui.update { it.copy(bubbles = it.bubbles + Bubble.Mine(q), busy = true, showList = false) }
        viewModelScope.launch {
            val reply: Bubble = when (val r = repo.ask(q, companyId(), history, objectId)) {
                is JarvisResult.Answer -> Bubble.Jarvis(r.text, r.local)
                is JarvisResult.Budget -> Bubble.Budget(r.message)
                is JarvisResult.Context -> Bubble.Problem(Bubble.Kind.CONTEXT, r.message)
                JarvisResult.Network -> Bubble.Problem(Bubble.Kind.NETWORK, null)
                is JarvisResult.Server -> Bubble.Problem(Bubble.Kind.SERVER, r.message)
            }
            _ui.update { it.copy(bubbles = it.bubbles + reply, busy = false) }
            save()
        }
    }

    /** Save after each message to the server chat (same store as the web) — no local-only history. */
    private suspend fun save() {
        val cid = companyId() ?: return
        val s = _ui.value
        val msgs = toMessages(s.bubbles)
        if (msgs.isEmpty()) return
        saving = true
        try {
            if (repo.saveChat(cid, s.chatId, msgs)) {
                val list = repo.chats(cid)
                if (list != null) { _ui.update { it.copy(chats = list) }; known = list.firstOrNull { it.id == s.chatId }?.updatedAt }
            }
        } finally { saving = false }
    }

    /** Called on open and every ~5 s while the screen is visible: refreshes the chat list and picks up changes made on the web/another device. */
    suspend fun refresh() {
        val cid = companyId() ?: return
        val list = repo.chats(cid) ?: return
        _ui.update { it.copy(chats = list) }
        if (_ui.value.busy || saving) return
        val s = _ui.value
        val cur = list.firstOrNull { it.id == s.chatId }
        if (cur != null) {
            if (cur.updatedAt != known) {
                val m = repo.openChat(cid, cur.id) ?: return
                if (_ui.value.busy || saving) return
                known = cur.updatedAt
                if (toMessages(_ui.value.bubbles) != m) _ui.update { it.copy(bubbles = toBubbles(m)) }
            }
        } else if (!restored && s.bubbles.isEmpty()) {
            restored = true
            list.firstOrNull { isRecent(it.updatedAt) }?.let { open(it) }
        }
    }

    fun open(c: ChatInfo) {
        val cid = companyId() ?: return
        viewModelScope.launch {
            val m = repo.openChat(cid, c.id) ?: return@launch
            known = c.updatedAt
            _ui.update { it.copy(chatId = c.id, bubbles = toBubbles(m), showList = false, busy = false) }
        }
    }

    fun newChat() { known = null; restored = true; _ui.update { it.copy(chatId = newChatId(), bubbles = emptyList(), showList = false) } }
    fun toggleList() = _ui.update { it.copy(showList = !it.showList) }
}

@Composable
fun JarvisScreen(onBack: () -> Unit, vm: JarvisViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var text by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    val owner = LocalLifecycleOwner.current
    // Refresh on open and poll ~5 s only while the screen is visible (STARTED) — the web and the app show the same server chats.
    LaunchedEffect(owner) { owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { while (true) { vm.refresh(); delay(POLL_MS) } } }
    LaunchedEffect(ui.bubbles.size, ui.busy) { if (ui.bubbles.isNotEmpty()) list.animateScrollToItem(ui.bubbles.size) }
    val send = { val t = text; text = ""; vm.ask(t) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        WorkTopBar(stringResource(R.string.mod_jarvis), onBack)
        val objName by vm.objectName.collectAsStateWithLifecycle()
        if (vm.scoped) Text(
            stringResource(R.string.ja_object_scope) + (objName?.let { ": $it" } ?: ""),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SuggestionChip(onClick = { vm.newChat() }, label = { Text(stringResource(R.string.ja_new_chat)) })
            SuggestionChip(onClick = { vm.toggleList() }, label = { Text(stringResource(R.string.ja_chats, ui.chats.size)) })
        }
        if (ui.showList) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ui.chats.isEmpty()) item { Text(stringResource(R.string.ja_chats_empty), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items(ui.chats) { c ->
                    Surface(color = if (c.id == ui.chatId) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth().clickable { vm.open(c) }) {
                        Text(c.title.ifBlank { "—" }, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp), maxLines = 2)
                    }
                }
            }
        } else LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (ui.bubbles.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(R.string.ja_welcome), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                    Spacer(Modifier.height(6.dp))
                    Text(stringResource(R.string.ja_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(ui.bubbles) { b -> BubbleView(b) }
            if (ui.busy) item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text(stringResource(R.string.ja_thinking), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        val q1 = stringResource(if (vm.scoped) R.string.ja_q_money_obj_text else R.string.ja_q_money_text)
        val q2 = stringResource(R.string.ja_q_today_text)
        val q3 = stringResource(R.string.ja_q_fact_text)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SuggestionChip(onClick = { vm.ask(q1) }, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_q_money)) })
            SuggestionChip(onClick = { vm.ask(q2) }, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_q_today)) })
            SuggestionChip(onClick = { vm.ask(q3) }, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_q_fact)) })
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                text, { text = it.take(JarvisRepository.MAX_QUESTION) }, Modifier.weight(1f), placeholder = { Text(stringResource(R.string.ja_input)) }, maxLines = 4,
                shape = MaterialTheme.shapes.large, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            )
            IconButton(onClick = send, enabled = text.isNotBlank() && !ui.busy) {
                Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.ja_send), tint = if (text.isNotBlank() && !ui.busy) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private const val POLL_MS = 5_000L
@Composable
private fun BubbleView(b: Bubble) {
    when (b) {
        is Bubble.Mine -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.widthIn(max = 300.dp)) {
                Text(b.text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.padding(12.dp))
            }
        }
        is Bubble.Jarvis -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.widthIn(max = 340.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(b.text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        is Bubble.Budget -> Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Text(stringResource(R.string.ja_budget_title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onErrorContainer)
                Text(b.message ?: stringResource(R.string.ja_budget_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(top = 4.dp))
                Text(stringResource(R.string.ja_budget_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(top = 6.dp))
            }
        }
        is Bubble.Problem -> Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Text(
                b.message?.takeIf { b.kind != Bubble.Kind.NETWORK } ?: stringResource(if (b.kind == Bubble.Kind.NETWORK) R.string.err_network else R.string.err_server),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp),
            )
        }
    }
}
