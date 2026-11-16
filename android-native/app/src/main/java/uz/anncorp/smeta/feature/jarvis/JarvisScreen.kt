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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
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
import dagger.Lazy
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
import uz.anncorp.smeta.core.data.ChatCursor
import uz.anncorp.smeta.core.data.ChatSnapshot
import uz.anncorp.smeta.core.data.ChatWrite
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.ObjectsRepository
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
enum class ChatSaveIssue { RETRY, STALE }
enum class ChatEditAction { RENAME, DELETE }
data class ChatEditor(val action: ChatEditAction, val target: ChatCursor, val title: String)
data class JarvisUi(
    val bubbles: List<Bubble> = emptyList(), val busy: Boolean = false, val chats: List<ChatInfo> = emptyList(),
    val chatId: String = newChatId(), val showList: Boolean = false, val saveIssue: ChatSaveIssue? = null,
    val editor: ChatEditor? = null, val editIssue: ChatSaveIssue? = null,
) {
    val canSend: Boolean get() = !busy && saveIssue == null && editor == null
}

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
class JarvisViewModel @Inject constructor(private val repo: JarvisRepository, private val ctx: WorkContext, saved: SavedStateHandle, objects: Lazy<ObjectsRepository>) : ViewModel() {
    private val _ui = MutableStateFlow(JarvisUi())
    val ui: StateFlow<JarvisUi> = _ui.asStateFlow()
    /** The object the chat was opened from (route arg `obyekt`); sent with every question so «shu obyekt» is exact. */
    private val objectId: Long? = saved.get<Long>("obyekt")?.takeIf { it > 0 }
    /** True when opened from an object card / smeta tree (`jarvis?obyekt=ID`): "shu obyekt" questions are about that object. */
    val scoped: Boolean = objectId != null
    val objectName: StateFlow<String?> = (objectId?.let { id -> objects.get().observeOne(id).map { it?.nom } } ?: flowOf(null)).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    private var cursor: ChatCursor? = null
    private var summaryOnly = false
    private var restored = false
    private var generation = 0L
    private var workplace = ctx.current.value
    private data class PendingWrite(
        val cursor: ChatCursor, val title: String?, val turns: List<ChatMsg>, val operationId: String?,
    )
    private var pending: PendingWrite? = null

    private fun companyId() = ctx.current.value?.companyId
    private fun current(epoch: Long, company: Long?) = generation == epoch && companyId() == company && ctx.current.value == workplace

    init {
        viewModelScope.launch {
            ctx.current.collect { next ->
                if (next != workplace) {
                    workplace = next
                    generation++
                    cursor = null
                    pending = null
                    summaryOnly = false
                    restored = false
                    _ui.value = JarvisUi()
                }
            }
        }
    }

    fun ask(text: String) {
        val q = text.trim()
        if (q.isEmpty() || !_ui.value.canSend || ctx.current.value != workplace) return
        val cid = companyId()
        val epoch = ++generation
        val history = toMessages(_ui.value.bubbles)
        if (summaryOnly) {
            cursor = null
            summaryOnly = false
            _ui.update { it.copy(chatId = newChatId()) }
        }
        val target = cursor ?: ChatCursor(_ui.value.chatId)
        _ui.update { it.copy(bubbles = it.bubbles + Bubble.Mine(q), busy = true, showList = false) }
        viewModelScope.launch {
            val reply: Bubble = when (val r = repo.ask(q, cid, history, objectId)) {
                is JarvisResult.Answer -> Bubble.Jarvis(r.text, r.local)
                is JarvisResult.Budget -> Bubble.Budget(r.message)
                is JarvisResult.Context -> Bubble.Problem(Bubble.Kind.CONTEXT, r.message)
                JarvisResult.Network -> Bubble.Problem(Bubble.Kind.NETWORK, null)
                is JarvisResult.Server -> Bubble.Problem(Bubble.Kind.SERVER, r.message)
            }
            if (!current(epoch, cid)) return@launch
            _ui.update { it.copy(bubbles = it.bubbles + reply) }
            if (cid == null) { _ui.update { it.copy(busy = false) }; return@launch }
            val turns = toMessages(listOf(Bubble.Mine(q), reply))
            val write = PendingWrite(
                target, if (target.etag == null) JarvisRepository.chatTitle(turns) else null, turns,
                if (target.etag != null) UUID.randomUUID().toString() else null,
            )
            pending = write
            save(cid, epoch, write)
        }
    }

    private suspend fun save(cid: Long, epoch: Long, write: PendingWrite) {
        val result = repo.writeMessages(cid, write.cursor, write.title, write.turns, write.operationId)
        if (!current(epoch, cid)) return
        val issue = when (result) {
            is ChatWrite.Saved -> {
                cursor = write.cursor.copy(etag = result.etag)
                pending = null
                null
            }
            ChatWrite.Stale -> ChatSaveIssue.STALE
            ChatWrite.Failed, ChatWrite.Deleted -> ChatSaveIssue.RETRY
        }
        _ui.update { it.copy(busy = false, saveIssue = issue) }
    }

    fun retrySave() {
        val cid = companyId() ?: return
        val write = pending ?: return
        if (_ui.value.busy || _ui.value.saveIssue != ChatSaveIssue.RETRY || ctx.current.value != workplace) return
        val epoch = ++generation
        _ui.update { it.copy(busy = true, saveIssue = null) }
        viewModelScope.launch { save(cid, epoch, write) }
    }

    fun startEdit(action: ChatEditAction) {
        val state = _ui.value
        if (!state.canSend || ctx.current.value != workplace) return
        val target = cursor?.takeIf { it.id == state.chatId && it.etag != null } ?: return
        val row = state.chats.firstOrNull { it.id == target.id } ?: return
        _ui.update { it.copy(editor = ChatEditor(action, target, row.title), editIssue = null) }
    }

    fun dismissEdit() {
        if (!_ui.value.busy) _ui.update { it.copy(editor = null, editIssue = null) }
    }

    fun confirmEdit(titleInput: String) {
        val company = companyId() ?: return
        val edit = _ui.value.editor ?: return
        if (_ui.value.busy || ctx.current.value != workplace) return
        val title = titleInput.trim().replace(Regex("\\s+"), " ")
        if (edit.action == ChatEditAction.RENAME && (title.isBlank() || title.length > 80)) return
        if (cursor != edit.target || _ui.value.chatId != edit.target.id) {
            _ui.update { it.copy(editor = null, editIssue = ChatSaveIssue.STALE) }
            return
        }
        val epoch = ++generation
        _ui.update { it.copy(busy = true, editIssue = null) }
        viewModelScope.launch {
            val result = when (edit.action) {
                ChatEditAction.RENAME -> repo.renameChat(company, edit.target, title)
                ChatEditAction.DELETE -> repo.deleteChat(company, edit.target)
            }
            if (!current(epoch, company)) return@launch
            // A list-only poll started during the write may still carry the previous name.
            generation++
            when (result) {
                is ChatWrite.Saved -> {
                    cursor = edit.target.copy(etag = result.etag)
                    _ui.update {
                        it.copy(busy = false, editor = null,
                            chats = it.chats.map { row -> if (row.id == edit.target.id) row.copy(title = title) else row })
                    }
                }
                ChatWrite.Deleted -> {
                    _ui.update { it.copy(busy = false, chats = it.chats.filterNot { row -> row.id == edit.target.id }) }
                    newChat()
                }
                ChatWrite.Stale -> _ui.update { it.copy(busy = false, editor = null, editIssue = ChatSaveIssue.STALE) }
                ChatWrite.Failed -> _ui.update { it.copy(busy = false, editIssue = ChatSaveIssue.RETRY) }
            }
        }
    }

    /** A foreground request carries the list and the current version, so a slow response cannot change a different chat. */
    suspend fun refresh(typing: () -> Boolean = { false }): Boolean {
        val cid = companyId() ?: return true
        val epoch = generation
        val requested = cursor.takeIf { _ui.value.canSend && !typing() }
        val snapshot = repo.syncChats(cid, requested) ?: return false
        if (!current(epoch, cid)) return true
        _ui.update { it.copy(chats = snapshot.chats) }
        if (!_ui.value.canSend || typing()) return true
        when (val active = snapshot.active) {
            is ChatSnapshot.Changed -> if (requested != null) applySnapshot(requested.id, active, selected = false)
            ChatSnapshot.Missing -> newChat()
            else -> Unit
        }
        if (!restored && cursor == null && _ui.value.bubbles.isEmpty()) {
            restored = true
            snapshot.chats.firstOrNull { isRecent(it.updatedAt) }?.let { open(it) }
        }
        return true
    }

    private fun applySnapshot(id: String, snapshot: ChatSnapshot.Changed, selected: Boolean) {
        cursor = ChatCursor(id, snapshot.etag)
        summaryOnly = snapshot.messages == null
        val messages = snapshot.messages ?: snapshot.summary?.takeIf { it.isNotBlank() }?.let { listOf(ChatMsg(false, it)) }.orEmpty()
        _ui.update {
            val bubbles = if (!selected && toMessages(it.bubbles) == messages) it.bubbles else toBubbles(messages)
            it.copy(chatId = id, bubbles = bubbles, showList = if (selected) false else it.showList)
        }
    }

    fun open(c: ChatInfo) {
        val cid = companyId() ?: return
        if (!_ui.value.canSend || ctx.current.value != workplace) return
        val epoch = ++generation
        _ui.update { it.copy(busy = true, editIssue = null) }
        viewModelScope.launch {
            val snapshot = repo.syncChats(cid, ChatCursor(c.id))
            if (!current(epoch, cid)) return@launch
            val active = snapshot?.active
            if (active is ChatSnapshot.Changed) applySnapshot(c.id, active, selected = true)
            _ui.update { it.copy(chats = snapshot?.chats ?: it.chats, busy = false) }
        }
    }

    fun newChat() {
        if (_ui.value.busy) return
        generation++
        cursor = null
        pending = null
        summaryOnly = false
        restored = true
        _ui.update {
            it.copy(chatId = newChatId(), bubbles = emptyList(), showList = false, saveIssue = null, editor = null, editIssue = null)
        }
    }
    fun toggleList() = _ui.update { it.copy(showList = !it.showList) }
}

@Composable
fun JarvisScreen(onBack: () -> Unit, vm: JarvisViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var text by remember(ui.chatId) { mutableStateOf("") }
    var confirmDiscard by remember(ui.chatId) { mutableStateOf(false) }
    val currentText by rememberUpdatedState(text)
    val list = rememberLazyListState()
    val owner = LocalLifecycleOwner.current
    LaunchedEffect(owner) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) delay(if (vm.refresh { currentText.isNotBlank() }) POLL_MS else 30_000L)
        }
    }
    LaunchedEffect(ui.bubbles.size, ui.busy) { if (ui.bubbles.isNotEmpty()) list.animateScrollToItem(ui.bubbles.size) }
    val send = { val t = text; text = ""; vm.ask(t) }
    if (confirmDiscard) AlertDialog(
        onDismissRequest = { confirmDiscard = false },
        title = { Text(stringResource(R.string.ja_discard_title)) },
        text = { Text(stringResource(R.string.ja_discard_body)) },
        confirmButton = { TextButton(onClick = { confirmDiscard = false; vm.newChat() }) { Text(stringResource(R.string.ja_discard_confirm)) } },
        dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text(stringResource(android.R.string.cancel)) } },
    )
    ui.editor?.let { editor ->
        val rename = editor.action == ChatEditAction.RENAME
        var title by remember(editor) { mutableStateOf(editor.title) }
        AlertDialog(
            onDismissRequest = vm::dismissEdit,
            title = { Text(stringResource(if (rename) R.string.ja_rename else R.string.ja_delete)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (rename) OutlinedTextField(
                        value = title, onValueChange = { if (it.length <= 80) title = it },
                        label = { Text(stringResource(R.string.ja_chat_title)) }, singleLine = true, enabled = !ui.busy,
                    ) else Text(stringResource(R.string.ja_delete_prompt, editor.title))
                    if (ui.editIssue == ChatSaveIssue.RETRY) {
                        Text(stringResource(R.string.ja_edit_failed), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.confirmEdit(title) }, enabled = !ui.busy && (!rename || title.isNotBlank())) {
                    Text(stringResource(if (rename) R.string.ja_rename_save else R.string.ja_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissEdit, enabled = !ui.busy) { Text(stringResource(android.R.string.cancel)) }
            },
        )
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        WorkTopBar(stringResource(R.string.mod_jarvis), onBack)
        val objName by vm.objectName.collectAsStateWithLifecycle()
        if (vm.scoped) Text(
            stringResource(R.string.ja_object_scope) + (objName?.let { ": $it" } ?: ""),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SuggestionChip(onClick = {
                if (ui.saveIssue == null && text.isBlank()) vm.newChat() else confirmDiscard = true
            }, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_new_chat)) })
            SuggestionChip(onClick = { vm.toggleList() }, label = { Text(stringResource(R.string.ja_chats, ui.chats.size)) })
        }
        if (!ui.showList && ui.chats.any { it.id == ui.chatId }) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val canEdit = ui.canSend && text.isBlank()
                SuggestionChip(onClick = { vm.startEdit(ChatEditAction.RENAME) }, enabled = canEdit, label = { Text(stringResource(R.string.ja_rename)) })
                SuggestionChip(onClick = { vm.startEdit(ChatEditAction.DELETE) }, enabled = canEdit, label = { Text(stringResource(R.string.ja_delete)) })
            }
        }
        if (ui.editIssue == ChatSaveIssue.STALE) {
            Text(stringResource(R.string.ja_edit_stale), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
        ui.saveIssue?.let { issue ->
            Text(stringResource(if (issue == ChatSaveIssue.RETRY) R.string.ja_save_failed else R.string.ja_save_stale),
                color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
            if (issue == ChatSaveIssue.RETRY) SuggestionChip(
                onClick = vm::retrySave, label = { Text(stringResource(R.string.ja_save_retry)) },
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
        if (ui.showList) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ui.chats.isEmpty()) item { Text(stringResource(R.string.ja_chats_empty), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items(ui.chats) { c ->
                    Surface(color = if (c.id == ui.chatId) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth().clickable(enabled = ui.canSend && text.isBlank()) { vm.open(c) }) {
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
            SuggestionChip(onClick = { vm.ask(q1) }, enabled = ui.canSend, label = { Text(stringResource(R.string.ja_q_money)) })
            SuggestionChip(onClick = { vm.ask(q2) }, enabled = ui.canSend, label = { Text(stringResource(R.string.ja_q_today)) })
            SuggestionChip(onClick = { vm.ask(q3) }, enabled = ui.canSend, label = { Text(stringResource(R.string.ja_q_fact)) })
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                text, { text = it.take(JarvisRepository.MAX_QUESTION) }, Modifier.weight(1f), placeholder = { Text(stringResource(R.string.ja_input)) }, maxLines = 4,
                enabled = !ui.busy, shape = MaterialTheme.shapes.large, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            )
            IconButton(onClick = send, enabled = text.isNotBlank() && ui.canSend) {
                Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.ja_send), tint = if (text.isNotBlank() && ui.canSend) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private const val POLL_MS = 3_000L
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
