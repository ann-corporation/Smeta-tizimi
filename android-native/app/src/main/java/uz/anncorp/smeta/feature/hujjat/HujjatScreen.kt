package uz.anncorp.smeta.feature.hujjat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ApprovalItem
import uz.anncorp.smeta.core.data.ApprovalsRepository
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.syncFailure
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.SectionTitle
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.StatusChip
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.Tone
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.time.LocalDate
import javax.inject.Inject

data class HujjatUi(
    val loading: Boolean = true, val failed: Boolean = false, val tab: String = "menga",
    val waiting: List<ApprovalItem> = emptyList(), val toMe: List<ChainRow> = emptyList(), val fromMe: List<ChainRow> = emptyList(), val letters: List<LetterRow> = emptyList(),
    val letter: LetterDetail? = null, val letterError: Boolean = false, val receiving: Boolean = false, val received: Boolean = false,
)

@HiltViewModel
class HujjatViewModel @Inject constructor(private val api: BffApi, private val approvals: ApprovalsRepository, private val ctx: WorkContext, handle: SavedStateHandle) : ViewModel() {
    private val _state = MutableStateFlow(HujjatUi())
    val state: StateFlow<HujjatUi> = _state.asStateFlow()
    /** Deep link from a notification: open this letter once loaded. */
    val startLetter: Long? = handle.get<Long>("xat")?.takeIf { it > 0 }

    init { load(); startLetter?.let { openLetter(it) } }

    fun tab(t: String) = _state.update { it.copy(tab = t) }

    fun load() {
        val w = ctx.current.value ?: run { _state.update { it.copy(loading = false, failed = true) }; return }
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val inbox = approvals.inbox(w.companyId)
            val a = api.bff(chainsPath(w.companyId, ChainDirection.TO_ME))
            val b = api.bff(chainsPath(w.companyId, ChainDirection.FROM_ME))
            val c = api.bff(lettersPath(w.companyId, null))
            val toMe = if (a.ok) parseChains(a.body) else null
            val fromMe = if (b.ok) parseChains(b.body) else null
            val letters = if (c.ok) parseLetters(c.body) else null
            val all = toMe == null && fromMe == null && letters == null && inbox.first != SyncResult.Ok
            _state.update { it.copy(loading = false, failed = all, waiting = inbox.second, toMe = toMe ?: it.toMe, fromMe = fromMe ?: it.fromMe, letters = letters ?: it.letters) }
        }
    }

    fun openLetter(id: Long) {
        val w = ctx.current.value ?: return
        _state.update { it.copy(letter = null, letterError = false, received = false) }
        viewModelScope.launch {
            val r = api.bff(letterPath(w.companyId, id))
            val d = if (r.ok) parseLetter(r.body) else null
            _state.update { it.copy(letter = d, letterError = d == null) }
        }
    }

    fun closeLetter() = _state.update { it.copy(letter = null, letterError = false) }

    /** Confirms receipt of an incoming letter (online; the server records who and when). */
    fun receive(id: Long) {
        val w = ctx.current.value ?: return
        _state.update { it.copy(receiving = true) }
        viewModelScope.launch {
            val r = api.bff("/api/hujjat-aylanish", "POST", receiveBody(w.companyId, id))
            val ok = r.ok && (r.body as? kotlinx.serialization.json.JsonObject)?.get("ok")?.toString() != "false"
            _state.update { it.copy(receiving = false, received = ok, letterError = !ok) }
            if (ok) { openLetter(id); load() }
        }
    }
}

private fun chainTone(h: String) = when (h) { "tasdiqlandi" -> Tone.GOOD; "rad", "bekor" -> Tone.BAD; "jarayonda" -> Tone.INFO; else -> Tone.WARN }

@Composable
private fun chainLabel(h: String): String = when (h) {
    "jarayonda" -> stringResource(R.string.dl_doc_c_running); "tasdiqlandi" -> stringResource(R.string.dl_doc_c_approved); "rad" -> stringResource(R.string.dl_doc_c_rejected)
    "bekor" -> stringResource(R.string.dl_doc_c_cancelled); "qaytarilgan" -> stringResource(R.string.dl_doc_c_returned); else -> h
}

@Composable
private fun letterLabel(h: String): String = stringResource(when (h) { "olindi" -> R.string.dl_doc_l_received; "javob_berildi" -> R.string.dl_doc_l_answered; else -> R.string.dl_doc_l_sent })

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HujjatScreen(onBack: () -> Unit, onOpenChain: (Long) -> Unit, vm: HujjatViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var chainMode by rememberSaveable { mutableStateOf("all") }
    val today = LocalDate.now()

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.dl_doc_title), onBack)
        when {
            ui.loading && ui.waiting.isEmpty() && ui.toMe.isEmpty() && ui.fromMe.isEmpty() && ui.letters.isEmpty() -> SkeletonList(4)
            ui.failed -> CenterMessage(null, stringResource(R.string.dl_load_failed), null, stringResource(R.string.retry)) { vm.load() }
            else -> PullToRefreshBox(isRefreshing = ui.loading, onRefresh = vm::load, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        ChipRow {
                            FilterChip(selected = ui.tab == "menga", onClick = { vm.tab("menga") }, label = { Text(stringResource(R.string.dl_doc_t_inbox) + " (" + (ui.waiting.size + ui.letters.count { canReceive(it) }) + ")") })
                            FilterChip(selected = ui.tab == "mendan", onClick = { vm.tab("mendan") }, label = { Text(stringResource(R.string.dl_doc_t_mine) + " (" + ui.fromMe.size + ")") })
                            FilterChip(selected = ui.tab == "xatlar", onClick = { vm.tab("xatlar") }, label = { Text(stringResource(R.string.dl_doc_t_letters) + " (" + ui.letters.size + ")") })
                        }
                    }
                    when (ui.tab) {
                        "menga" -> {
                            item { SectionTitle(stringResource(R.string.dl_doc_waiting)) }
                            if (ui.waiting.isEmpty()) item { Text(stringResource(R.string.dl_doc_waiting_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            items(ui.waiting, key = { "w" + it.id }) { a ->
                                WorkCard(modifier = Modifier.heightIn(min = TouchTarget), onClick = { onOpenChain(a.id) }) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(a.sarlavha.ifBlank { a.tur }, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                                            if (a.kechikkan) StatusChip(stringResource(R.string.dl_doc_late), Tone.BAD) else StatusChip(stringResource(R.string.dl_doc_your_turn), Tone.WARN)
                                        }
                                        a.egasi?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                        a.muddat?.let { Text(stringResource(R.string.dl_doc_due, formatIsoStamp(it)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    }
                                }
                            }
                            item { SectionTitle(stringResource(R.string.dl_doc_incoming_letters)) }
                            val inc = ui.letters.filter { it.incoming && it.holat != "javob_berildi" }
                            if (inc.isEmpty()) item { Text(stringResource(R.string.dl_doc_letters_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            items(inc, key = { "l" + it.id }) { l -> LetterCard(l, today) { vm.openLetter(l.id) } }
                        }
                        "mendan" -> {
                            item { ChipRow { listOf("all" to R.string.docs_filter_all, "turn" to R.string.dl_doc_your_turn, "running" to R.string.dl_doc_c_running, "done" to R.string.dl_doc_c_finished).forEach { (k, r) -> FilterChip(selected = chainMode == k, onClick = { chainMode = k }, label = { Text(stringResource(r)) }) } } }
                            val rows = filterChains(ui.fromMe, chainMode)
                            if (rows.isEmpty()) item { Text(stringResource(R.string.dl_doc_chains_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            items(rows, key = { "c" + it.id }) { c ->
                                WorkCard(modifier = Modifier.heightIn(min = TouchTarget), onClick = { onOpenChain(c.id) }) {
                                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(c.sarlavha.ifBlank { c.tur }, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                                            StatusChip(chainLabel(c.holat), chainTone(c.holat))
                                        }
                                        c.turnRole?.takeIf { c.holat == "jarayonda" }?.let { Text(stringResource(R.string.dl_doc_waiting_role, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                        c.yaratildi?.let { Text(formatIsoStamp(it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    }
                                }
                            }
                        }
                        else -> {
                            if (ui.letters.isEmpty()) item { Text(stringResource(R.string.dl_doc_letters_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            items(ui.letters, key = { "x" + it.id }) { l -> LetterCard(l, today) { vm.openLetter(l.id) } }
                        }
                    }
                }
            }
        }
    }

    if (ui.letter != null || ui.letterError) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = vm::closeLetter, sheetState = sheet) {
            val d = ui.letter
            if (d == null) Text(stringResource(R.string.dl_load_failed), Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
            else Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(d.row.mavzu, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                StatusChip(letterLabel(d.row.holat), if (d.row.holat == "javob_berildi") Tone.GOOD else Tone.WARN)
                d.row.raqam?.let { Text(stringResource(R.string.dl_doc_number, it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
                d.sender?.let { Text(stringResource(R.string.dl_doc_from, it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
                d.receiver?.let { Text(stringResource(R.string.dl_doc_to, it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
                d.row.sana?.let { Text(formatIsoStamp(it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                d.row.muddat?.let { Text(stringResource(R.string.dl_doc_answer_by, formatIsoStamp(it)), style = MaterialTheme.typography.bodyMedium, color = if (isLate(d.row, today)) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface) }
                d.text?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
                if (ui.received) Text(stringResource(R.string.dl_doc_received_ok), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
                if (canReceive(d.row)) Button(onClick = { vm.receive(d.row.id) }, enabled = !ui.receiving, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_doc_receive)) }
            }
        }
    }
}

@Composable
private fun LetterCard(l: LetterRow, today: LocalDate, onClick: () -> Unit) {
    WorkCard(modifier = Modifier.heightIn(min = TouchTarget), onClick = onClick) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(l.mavzu, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                if (isLate(l, today)) StatusChip(stringResource(R.string.dl_doc_late), Tone.BAD) else StatusChip(letterLabel(l.holat), if (l.holat == "javob_berildi") Tone.GOOD else Tone.WARN)
            }
            Text((if (l.incoming) stringResource(R.string.dl_doc_incoming) else stringResource(R.string.dl_doc_outgoing)) + (l.counterparty?.let { "  -  $it" } ?: ""), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            l.muddat?.let { Text(stringResource(R.string.dl_doc_answer_by, formatIsoStamp(it)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
