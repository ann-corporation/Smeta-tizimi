package uz.anncorp.smeta.feature.jarvis

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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
import kotlinx.coroutines.flow.collectLatest
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
import uz.anncorp.smeta.core.data.ChatPageCursor
import uz.anncorp.smeta.core.data.ChatSnapshot
import uz.anncorp.smeta.core.data.ChatWrite
import uz.anncorp.smeta.core.data.ConnectivityMonitor
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.JarvisWarehouse
import uz.anncorp.smeta.core.data.JarvisWarehouseRequest
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.JarvisPendingStore
import uz.anncorp.smeta.core.data.PendingJarvisWrite
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.demo.Demo
import uz.anncorp.qurai.ui.screens.QBubble
import uz.anncorp.qurai.ui.screens.QChatItem
import uz.anncorp.qurai.ui.screens.QJarvisChat
import uz.anncorp.qurai.ui.screens.QJarvisTexts
import uz.anncorp.qurai.ui.screens.QJarvisVoice
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject

/** One bubble in the chat. Errors are first-class so a 402 (no tokens) is shown as a clear card, not a generic failure. */
sealed interface Bubble {
    data class Mine(val text: String) : Bubble
    data class Jarvis(val text: String, val local: Boolean, val previewToken: String? = null, val warehouse: JarvisWarehouse? = null) : Bubble
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
    val editor: ChatEditor? = null, val editIssue: ChatSaveIssue? = null, val outboxUnreadable: Boolean = false,
    val historyLoading: Boolean = false, val historyFailed: Boolean = false, val hasMoreHistory: Boolean = true,
) {
    val canSend: Boolean get() = !busy && saveIssue == null && editor == null && !outboxUnreadable
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
class JarvisViewModel @Inject constructor(
    private val repo: JarvisRepository, private val ctx: WorkContext, saved: SavedStateHandle,
    objects: Lazy<ObjectsRepository>, private val outbox: JarvisPendingStore,
) : ViewModel() {
    private val _ui = MutableStateFlow(JarvisUi(busy = ctx.current.value != null))
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
    private var pending: PendingJarvisWrite? = null
    private var pendingDevice: String? = null
    private var pendingStored = false
    private var lastAttempt = 0L
    private var latestChats = emptyList<ChatInfo>()
    private val olderChats = mutableMapOf<String, ChatInfo>()
    private var historyCursor: ChatPageCursor? = null
    private var historyRequest: Any? = null

    private fun companyId() = ctx.current.value?.companyId
    private fun current(epoch: Long, company: Long?) = generation == epoch && companyId() == company && ctx.current.value == workplace

    suspend fun warehouseAction(index: Int, request: JarvisWarehouseRequest): ApiResult {
        val original = (_ui.value.bubbles.getOrNull(index) as? Bubble.Jarvis)?.warehouse ?: return ApiResult(403, null, "PERMISSION_DENIED")
        if (!_ui.value.canSend || ctx.current.value != workplace || original.companyId != companyId() ||
            request.companyId != original.companyId || original.warehouses.none { it.id == request.warehouseId }) return ApiResult(403, null, "PERMISSION_DENIED")
        val epoch = generation
        _ui.update { it.copy(busy = true) }
        return try { repo.warehouseRequest(request) }
        finally { if (current(epoch, request.companyId)) _ui.update { it.copy(busy = false) } }
    }

    init {
        viewModelScope.launch {
            var initial = true
            ctx.current.collect { next ->
                if (initial || next != workplace) {
                    initial = false
                    workplace = next
                    generation++
                    cursor = null
                    pending = null
                    pendingDevice = null
                    pendingStored = false
                    latestChats = emptyList()
                    olderChats.clear()
                    historyCursor = null
                    historyRequest = null
                    summaryOnly = false
                    restored = false
                    _ui.value = JarvisUi(busy = next != null)
                    if (next != null) restorePending(next.companyId, generation)
                }
            }
        }
    }

    private fun allChats(): List<ChatInfo> = (latestChats + olderChats.values).distinctBy { it.id }

    fun loadOlderChats() {
        val company = companyId() ?: return
        if (historyRequest != null || !_ui.value.canSend || !_ui.value.hasMoreHistory || ctx.current.value != workplace) return
        val epoch = generation
        val before = historyCursor
        val marker = Any()
        historyRequest = marker
        _ui.update { it.copy(historyLoading = true, historyFailed = false) }
        viewModelScope.launch {
            try {
                var page = repo.chatPage(company, before)
                if (!current(epoch, company)) return@launch
                val known = latestChats.map { it.id }.toSet()
                val next = page?.next
                if (before == null && page != null && next != null && page.chats.all { it.id in known }) {
                    page = repo.chatPage(company, next)
                    if (!current(epoch, company)) return@launch
                }
                if (page == null) { _ui.update { it.copy(historyFailed = true) }; return@launch }
                page.chats.forEach { row -> olderChats[row.id] = row }
                historyCursor = page.next
                _ui.update { it.copy(chats = allChats(), hasMoreHistory = page.next != null) }
            } finally {
                if (historyRequest === marker) {
                    historyRequest = null
                    _ui.update { it.copy(historyLoading = false) }
                }
            }
        }
    }

    private suspend fun restorePending(company: Long, epoch: Long) {
        val device = outbox.deviceId()
        val stored = device?.let { outbox.read(it, company) }
        if (!current(epoch, company) || outbox.deviceId() != device) return
        val write = stored?.getOrNull()
        if (write == null) {
            _ui.update { it.copy(busy = false, outboxUnreadable = stored?.isFailure == true) }
            return
        }
        pending = write
        pendingDevice = device
        pendingStored = true
        lastAttempt = 0
        restored = true
        _ui.update { it.copy(chatId = write.cursor.id, bubbles = toBubbles(write.preview), busy = false, outboxUnreadable = false,
            saveIssue = if (write.stale) ChatSaveIssue.STALE else ChatSaveIssue.RETRY) }
    }

    /** Manual confirmation of a write preview (the web card's Tasdiqlash): null = written, else the error text. */
    suspend fun confirmPreview(token: String): String? {
        val cid = companyId() ?: return "Kompaniya tanlang"
        return repo.confirm(cid, token)
    }

    /** Server speech-to-text for the question field: Pair(text, null) or Pair(null, error). */
    suspend fun transcribe(audio: ByteArray, mime: String): Pair<String?, String?> {
        val cid = companyId() ?: return null to "Kompaniya tanlang"
        return repo.transcribe(cid, audio, mime)
    }

    fun ask(text: String) {
        val q = text.trim()
        if (q.isEmpty() || !_ui.value.canSend || ctx.current.value != workplace) return
        val cid = companyId()
        val device = outbox.deviceId()
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
                is JarvisResult.Answer -> Bubble.Jarvis(r.text, r.local, r.previewToken, r.warehouse)
                is JarvisResult.Budget -> Bubble.Budget(r.message)
                is JarvisResult.Context -> Bubble.Problem(Bubble.Kind.CONTEXT, r.message)
                JarvisResult.Network -> Bubble.Problem(Bubble.Kind.NETWORK, null)
                is JarvisResult.Server -> Bubble.Problem(Bubble.Kind.SERVER, r.message)
            }
            if (!current(epoch, cid)) return@launch
            _ui.update { it.copy(bubbles = it.bubbles + reply) }
            if (cid == null) { _ui.update { it.copy(busy = false) }; return@launch }
            val turns = toMessages(listOf(Bubble.Mine(q), reply))
            val write = PendingJarvisWrite(
                target, if (target.etag == null) JarvisRepository.chatTitle(turns) else null, turns,
                if (target.etag != null) UUID.randomUUID().toString() else null,
                toMessages(_ui.value.bubbles).takeLast(JarvisRepository.MAX_SAVED),
            )
            pending = write
            pendingDevice = device
            save(cid, epoch, write)
        }
    }

    private suspend fun save(cid: Long, epoch: Long, write: PendingJarvisWrite) {
        lastAttempt = System.nanoTime()
        val device = pendingDevice
        if (device == null || !outbox.store(device, cid, write)) {
            if (current(epoch, cid)) _ui.update { it.copy(busy = false, saveIssue = ChatSaveIssue.RETRY) }
            return
        }
        if (!current(epoch, cid) || outbox.deviceId() != device) return
        pendingStored = true
        val result = repo.writeMessages(cid, write.cursor, write.title, write.turns, write.operationId, device)
        if (!current(epoch, cid)) return
        val issue = when (result) {
            is ChatWrite.Saved -> {
                val removed = outbox.remove(device, cid, write)
                if (!current(epoch, cid)) return
                if (!removed) {
                    _ui.update { it.copy(busy = false, saveIssue = ChatSaveIssue.RETRY) }
                    return
                }
                cursor = write.cursor.copy(etag = result.etag)
                pending = null
                pendingDevice = null
                pendingStored = false
                null
            }
            ChatWrite.Stale -> {
                val stale = write.copy(stale = true)
                val marked = outbox.store(device, cid, stale)
                if (!current(epoch, cid)) return
                if (marked) pending = stale
                ChatSaveIssue.STALE
            }
            ChatWrite.Failed, ChatWrite.Deleted -> ChatSaveIssue.RETRY
        }
        _ui.update { it.copy(busy = false, saveIssue = issue) }
    }

    fun retrySave() {
        val cid = companyId() ?: return
        if (_ui.value.outboxUnreadable && !_ui.value.busy) {
            val epoch = ++generation
            _ui.update { it.copy(busy = true) }
            viewModelScope.launch { restorePending(cid, epoch) }
            return
        }
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
                    olderChats[edit.target.id]?.let { olderChats[edit.target.id] = it.copy(title = title) }
                    latestChats = latestChats.map { if (it.id == edit.target.id) it.copy(title = title) else it }
                    _ui.update {
                        it.copy(busy = false, editor = null,
                            chats = it.chats.map { row -> if (row.id == edit.target.id) row.copy(title = title) else row })
                    }
                }
                ChatWrite.Deleted -> {
                    olderChats.remove(edit.target.id)
                    latestChats = latestChats.filterNot { it.id == edit.target.id }
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
        latestChats = snapshot.chats
        _ui.update { it.copy(chats = allChats()) }
        if (pendingStored && _ui.value.saveIssue == ChatSaveIssue.RETRY &&
            (lastAttempt == 0L || System.nanoTime() - lastAttempt > 30_000_000_000L)) retrySave()
        if (!_ui.value.canSend || typing()) return true
        when (val active = snapshot.active) {
            is ChatSnapshot.Changed -> if (requested != null) applySnapshot(requested.id, active, selected = false)
            ChatSnapshot.Missing -> {
                requested?.id?.let(olderChats::remove)
                _ui.update { it.copy(chats = allChats()) }
                newChat()
            }
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
        summaryOnly = snapshot.messages == null || snapshot.archived
        val messages = snapshot.messages ?: snapshot.summary?.takeIf { it.isNotBlank() }?.let { listOf(ChatMsg(false, it)) }.orEmpty()
        val title = snapshot.title
        if (title != null) olderChats[id]?.let { olderChats[id] = it.copy(title = title) }
        _ui.update {
            val bubbles = if (!selected && toMessages(it.bubbles) == messages) it.bubbles else toBubbles(messages)
            it.copy(chatId = id, bubbles = bubbles, chats = allChats(), showList = if (selected) false else it.showList)
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
            if (snapshot != null) latestChats = snapshot.chats
            _ui.update { it.copy(chats = allChats(), busy = false) }
        }
    }

    fun newChat() {
        if (_ui.value.busy || _ui.value.outboxUnreadable) return
        val write = pending
        val device = pendingDevice
        val cid = companyId()
        if (pendingStored && write != null && device != null && cid != null) {
            val epoch = ++generation
            _ui.update { it.copy(busy = true) }
            viewModelScope.launch {
                val removed = outbox.remove(device, cid, write)
                if (!current(epoch, cid)) return@launch
                _ui.update { it.copy(busy = false) }
                if (removed) clearChat()
            }
        } else clearChat()
    }

    private fun clearChat() {
        generation++
        cursor = null
        pending = null
        pendingDevice = null
        pendingStored = false
        summaryOnly = false
        restored = true
        _ui.update {
            it.copy(chatId = newChatId(), bubbles = emptyList(), showList = false, saveIssue = null, editor = null, editIssue = null)
        }
    }
    fun toggleList() = _ui.update { it.copy(showList = !it.showList) }
}

@Composable
fun JarvisScreen(onBack: () -> Unit, vm: JarvisViewModel = hiltViewModel(), embedded: Boolean = false) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var text by remember(ui.chatId) { mutableStateOf("") }
    var confirmDiscard by remember(ui.chatId) { mutableStateOf(false) }
    val currentText by rememberUpdatedState(text)
    val owner = LocalLifecycleOwner.current
    val appContext = LocalContext.current.applicationContext
    val connectivity = remember(appContext) { ConnectivityMonitor(appContext) { Demo.forcedOffline(appContext) } }
    LaunchedEffect(owner, connectivity) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            connectivity.online.collectLatest { online ->
                if (online) while (true) delay(if (vm.refresh { currentText.isNotBlank() }) POLL_MS else 30_000L)
            }
        }
    }
    val send = { val t = text; text = ""; vm.ask(t) }
    // Voice input: AAC recording (the ombor recorder) -> server STT -> the transcript lands in the field for the user to read and send.
    val micContext = LocalContext.current
    val micScope = androidx.compose.runtime.rememberCoroutineScope()
    val recorder = remember { uz.anncorp.smeta.core.media.AndroidAudioRecorder(micContext.applicationContext) }
    var micRecording by remember { mutableStateOf(false) }
    var micBusy by remember { mutableStateOf(false) }
    val micFail = stringResource(R.string.ja_mic_fail)
    val micDenied = stringResource(R.string.ja_mic_denied)
    val toast = { m: String -> android.widget.Toast.makeText(micContext, m, android.widget.Toast.LENGTH_SHORT).show() }
    val beginRecord = { if (recorder.start()) micRecording = true else toast(micFail) }
    val micPerm = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { ok -> if (ok) beginRecord() else toast(micDenied) }
    val startMic: () -> Unit = {
        if (androidx.core.content.ContextCompat.checkSelfPermission(micContext, android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) beginRecord()
        else micPerm.launch(android.Manifest.permission.RECORD_AUDIO)
    }
    val stopMic: () -> Unit = {
        micRecording = false
        val a = recorder.stop()
        if (a == null) toast(micFail) else {
            micBusy = true
            micScope.launch {
                val (t, err) = vm.transcribe(a.bytes, a.mime)
                micBusy = false
                if (t != null) text = (text.trim() + " " + t).trim().take(JarvisRepository.MAX_QUESTION) else toast(err ?: micFail)
            }
        }
    }
    androidx.compose.runtime.DisposableEffect(Unit) { onDispose { recorder.cancel() } }
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
    val objName by vm.objectName.collectAsStateWithLifecycle()
    val q1 = stringResource(if (vm.scoped) R.string.ja_q_money_obj_text else R.string.ja_q_money_text)
    val q2 = stringResource(R.string.ja_q_today_text)
    val q3 = stringResource(R.string.ja_q_fact_text)
    val budgetTitle = stringResource(R.string.ja_budget_title); val budgetBody = stringResource(R.string.ja_budget_body); val budgetHint = stringResource(R.string.ja_budget_hint)
    val errNetwork = stringResource(R.string.err_network); val errServer = stringResource(R.string.err_server)
    // The conversation is drawn by the ONE chat UI shared with Windows (QJarvisChat); this screen only brings Android's sync / history / unsaved-chat logic.
    val bubbles = ui.bubbles.map { b ->
        when (b) {
            is Bubble.Mine -> QBubble.Mine(b.text)
            is Bubble.Jarvis -> QBubble.Jarvis(b.text, b.previewToken)
            is Bubble.Budget -> QBubble.Budget(budgetTitle, b.message ?: budgetBody, budgetHint)
            is Bubble.Problem -> QBubble.Problem(b.message?.takeIf { b.kind != Bubble.Kind.NETWORK } ?: if (b.kind == Bubble.Kind.NETWORK) errNetwork else errServer)
        }
    }
    val texts = QJarvisTexts(
        title = "", welcome = stringResource(R.string.ja_welcome), hint = stringResource(R.string.ja_hint), thinking = stringResource(R.string.ja_thinking),
        input = stringResource(R.string.ja_input), send = stringResource(R.string.ja_send), newChat = stringResource(R.string.ja_new_chat), chats = stringResource(R.string.ja_chats_label),
        confirm = stringResource(R.string.ja_confirm), cancel = stringResource(R.string.ja_cancel_preview), saved = stringResource(R.string.ja_confirmed), cancelled = stringResource(R.string.ja_cancelled), preview = stringResource(R.string.ja_preview_hint),
        micStart = stringResource(R.string.ja_mic_start), micStop = stringResource(R.string.ja_mic_stop), micBusy = stringResource(R.string.ja_mic_busy),
        noChats = stringResource(R.string.ja_chats_empty), copy = stringResource(R.string.ja_copy), copied = stringResource(R.string.ja_copied), scrollDown = stringResource(R.string.ja_scroll_down),
    )
    // Inside the bottom sheet the sheet already sits below the status bar: no second inset (that was the ~170 px empty band on top).
    Column(Modifier.fillMaxSize().then(if (embedded) Modifier else Modifier.statusBarsPadding()).navigationBarsPadding().imePadding()) {
        WorkTopBar(stringResource(R.string.mod_jarvis), onBack, insets = !embedded)
        QJarvisChat(
            bubbles = bubbles, busy = ui.busy, input = text, onInput = { text = it }, onSend = send, texts = texts,
            scope = if (vm.scoped) stringResource(R.string.ja_object_scope) + (objName?.let { ": $it" } ?: "") else null,
            quick = listOf(stringResource(R.string.ja_q_money) to q1, stringResource(R.string.ja_q_today) to q2, stringResource(R.string.ja_q_fact) to q3),
            onQuick = { vm.ask(it) },
            chats = ui.chats.map { QChatItem(it.id, it.title) }, activeChat = ui.chatId, showChats = ui.showList,
            onToggleChats = { vm.toggleList() },
            onNewChat = { if (!ui.busy && !ui.outboxUnreadable) { if (ui.saveIssue == null && text.isBlank()) vm.newChat() else confirmDiscard = true } },
            onOpenChat = { qc -> if (ui.canSend && text.isBlank()) ui.chats.firstOrNull { it.id == qc.id }?.let(vm::open) },
            maxInput = JarvisRepository.MAX_QUESTION, canSend = ui.canSend,
            messageExtra = { index ->
                (ui.bubbles.getOrNull(index) as? Bubble.Jarvis)?.warehouse?.let { frame ->
                    JarvisWarehouseCard(frame, enabled = ui.canSend) { request -> vm.warehouseAction(index, request) }
                }
            },
            onConfirm = { token -> vm.confirmPreview(token) },
            voice = QJarvisVoice(recording = micRecording, busy = micBusy, onStart = startMic, onStop = stopMic),
            belowHeader = {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (!ui.showList && ui.chats.any { it.id == ui.chatId }) {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val canEdit = ui.canSend && text.isBlank()
                            SuggestionChip(onClick = { vm.startEdit(ChatEditAction.RENAME) }, enabled = canEdit, label = { Text(stringResource(R.string.ja_rename)) })
                            SuggestionChip(onClick = { vm.startEdit(ChatEditAction.DELETE) }, enabled = canEdit, label = { Text(stringResource(R.string.ja_delete)) })
                        }
                    }
                    if (ui.editIssue == ChatSaveIssue.STALE) Text(stringResource(R.string.ja_edit_stale), color = MaterialTheme.colorScheme.error)
                    ui.saveIssue?.let { issue ->
                        Text(stringResource(if (issue == ChatSaveIssue.RETRY) R.string.ja_save_failed else R.string.ja_save_stale), color = MaterialTheme.colorScheme.error)
                        if (issue == ChatSaveIssue.RETRY) SuggestionChip(onClick = vm::retrySave, label = { Text(stringResource(R.string.ja_save_retry)) })
                    }
                    if (ui.outboxUnreadable) {
                        Text(stringResource(R.string.ja_outbox_unreadable), color = MaterialTheme.colorScheme.error)
                        SuggestionChip(onClick = vm::retrySave, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_save_retry)) })
                    }
                }
            },
            listFooter = {
                if (ui.hasMoreHistory) Column {
                    if (ui.historyFailed) Text(stringResource(R.string.ja_history_failed), color = MaterialTheme.colorScheme.error)
                    SuggestionChip(onClick = vm::loadOlderChats, enabled = !ui.historyLoading && ui.canSend && text.isBlank(), label = { Text(stringResource(R.string.ja_history_older)) })
                }
            },
        )
    }
}
private const val POLL_MS = 3_000L
