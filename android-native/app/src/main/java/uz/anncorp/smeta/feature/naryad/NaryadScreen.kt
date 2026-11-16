package uz.anncorp.smeta.feature.naryad

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.syncFailure
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.ObjectDropdown
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.StatusChip
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.Tone
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.ombor.parseQuantity
import uz.anncorp.smeta.feature.work.BannerViewModel
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NaryadRepository @Inject constructor(private val api: BffApi, private val db: AppDb, private val outbox: OutboxRepository, private val json: Json) {
    private val ser = ListSerializer(NaryadBrief.serializer())

    fun list(companyId: Long): Flow<List<NaryadBrief>> = db.meta().observe("naryad:$companyId").map { s -> s?.let { runCatching { json.decodeFromString(ser, it) }.getOrNull() }.orEmpty() }

    fun detail(id: Long): Flow<NaryadDetail?> = db.meta().observe("naryad_d:$id").map { s -> s?.let { runCatching { json.decodeFromString(NaryadDetail.serializer(), it) }.getOrNull() } }

    suspend fun refresh(companyId: Long): SyncResult {
        val r = api.bff("/api/sb", "POST", naryadListBody(companyId))
        if (!r.ok) return r.syncFailure()
        val rows = parseNaryadList(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("naryad:$companyId", json.encodeToString(ser, rows)))
        return SyncResult.Ok
    }

    suspend fun refreshDetail(companyId: Long, id: Long): SyncResult {
        val r = api.bff("/api/sb", "POST", naryadOneBody(companyId, id))
        if (!r.ok) return r.syncFailure()
        val d = parseNaryadDetail(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("naryad_d:$id", json.encodeToString(NaryadDetail.serializer(), d)))
        return SyncResult.Ok
    }

    val queued: Flow<List<OutboxEntity>> = outbox.active.map { l -> l.filter { isNaryadKind(it.kind) } }

    suspend fun queue(d: NaryadDetail, companyId: Long, line: NaryadLine, hajm: java.math.BigDecimal, note: String?, done: Boolean, opId: String, objectName: String): Boolean =
        outbox.enqueue(OutboxEntity(opId, AMAL_NARYAD_USTA, reportPayload(companyId, d.id, d.versiya, line, hajm, note, done, opId).toString(), d.obyektId, objectName, 1, OutboxState.PENDING, 0, null, null, System.currentTimeMillis()))
}

data class NaryadUi(
    val objects: List<uz.anncorp.smeta.core.db.ObyektEntity> = emptyList(), val rows: List<NaryadBrief> = emptyList(), val queued: List<OutboxEntity> = emptyList(),
    val canReport: Boolean = false, val syncing: Boolean = true, val result: SyncResult? = null, val noCompany: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class NaryadViewModel @Inject constructor(private val repo: NaryadRepository, private val objects: ObjectsRepository, private val ctx: WorkContext) : ViewModel() {
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())
    private val company = ctx.current

    val state: StateFlow<NaryadUi> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else repo.list(w.companyId) },
        repo.queued, sync, company,
    ) { o, r, q, s, w -> NaryadUi(o, r, q, canReportNaryad(w?.rol), s.syncing, s.result, w == null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), NaryadUi())

    private var opId = UUID.randomUUID().toString()
    private val openId = MutableStateFlow<Long?>(null)
    val detail: StateFlow<NaryadDetail?> = openId.flatMapLatest { id -> if (id == null) flowOf(null) else repo.detail(id) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    private val _detailSync = MutableStateFlow<SyncResult?>(null)
    val detailSync: StateFlow<SyncResult?> = _detailSync

    init { viewModelScope.launch { company.collect { if (it != null) refresh() } } }

    fun refresh() {
        val w = ctx.current.value ?: return
        viewModelScope.launch { sync.value = Sync(true, null); objects.refresh(w.companyId); sync.value = Sync(false, repo.refresh(w.companyId)) }
    }

    fun open(id: Long?) {
        openId.value = id
        _detailSync.value = null
        val w = ctx.current.value
        if (id != null && w != null) viewModelScope.launch { _detailSync.value = repo.refreshDetail(w.companyId, id) }
    }

    /** null = queued, otherwise the wrong field. */
    suspend fun report(line: NaryadLine, qty: String, note: String, done: Boolean): String? {
        val d = detail.value ?: return "naryad"
        val w = ctx.current.value ?: return "naryad"
        val h = parseQuantity(qty)
        validateReport(h)?.let { return it }
        val name = state.value.objects.firstOrNull { it.id == d.obyektId }?.nom ?: d.obyektNom ?: "#${d.obyektId}"
        repo.queue(d, w.companyId, line, h!!, note, done, opId, name)
        opId = UUID.randomUUID().toString()
        return null
    }
}

@Composable
private fun holatLabel(h: String): String = stringResource(
    when (h) {
        "berildi" -> R.string.dl_nar_s_given; "bajarildi" -> R.string.dl_nar_s_reported; "qabul" -> R.string.dl_nar_s_accepted
        "hisoblandi" -> R.string.dl_nar_s_paid; else -> R.string.dl_nar_s_cancelled
    },
)

private fun holatTone(h: String) = when (h) { "hisoblandi", "qabul" -> Tone.GOOD; "bekor" -> Tone.BAD; "bajarildi" -> Tone.INFO; else -> Tone.WARN }

@Composable
private fun groupLabel(g: NaryadGroup) = stringResource(
    when (g) { NaryadGroup.ALL -> R.string.docs_filter_all; NaryadGroup.OPEN -> R.string.dl_nar_g_open; NaryadGroup.ACCEPTED -> R.string.dl_nar_s_accepted; NaryadGroup.PAID -> R.string.dl_nar_s_paid; NaryadGroup.CANCELLED -> R.string.dl_nar_s_cancelled },
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NaryadScreen(onBack: () -> Unit, onOutbox: () -> Unit, onPhoto: (obyektId: Long, naryadId: Long) -> Unit, vm: NaryadViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()
    val dSync by vm.detailSync.collectAsStateWithLifecycle()
    var group by rememberSaveable { mutableStateOf(NaryadGroup.ALL) }
    var objectId by rememberSaveable { mutableStateOf<Long?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf<Long?>(null) }
    val names = ui.objects.associate { it.id to it.nom }
    val shown = filterNaryad(ui.rows, group, objectId, query)
    val counts = naryadCounts(ui.rows)

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.dl_nar_title), onBack)
        if (b.visible) OutboxBanner(b, onOutbox)
        when {
            ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
            ui.syncing && ui.rows.isEmpty() -> SkeletonList(4)
            else -> PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (ui.queued.isNotEmpty()) item { Text(stringResource(R.string.dl_nar_queued, ui.queued.size), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary) }
                    item { ChipRow { NaryadGroup.values().forEach { g -> FilterChip(selected = group == g, onClick = { group = g }, label = { Text(groupLabel(g) + " (" + (counts[g] ?: 0) + ")") }) } } }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(query, { query = it }, label = { Text(stringResource(R.string.dl_nar_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            if (ui.objects.size > 1) ObjectDropdown(ui.objects, objectId, stringResource(R.string.dl_all_objects), { objectId = it }, allLabel = stringResource(R.string.dl_all_objects))
                        }
                    }
                    if (shown.isEmpty()) item {
                        Text(stringResource(if (ui.rows.isEmpty() && ui.result != SyncResult.Ok) R.string.dl_load_failed else R.string.dl_nar_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(shown, key = { it.id }) { n ->
                        WorkCard(modifier = Modifier.heightIn(min = TouchTarget), onClick = { open = n.id; vm.open(n.id) }) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(n.raqam.ifBlank { "#${n.id}" } + "  -  " + n.ustaNom, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                                    StatusChip(holatLabel(n.holat), holatTone(n.holat))
                                }
                                Text(names[n.obyektId].orEmpty(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(androidx.compose.ui.res.pluralStringResource(R.plurals.dl_nar_lines, n.qatorSoni, n.qatorSoni), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                                n.xarajatSumma?.let { Text(stringResource(R.string.dl_nar_paid_sum, formatMoney(it)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
                                if (n.narxsizSoni > 0) Text(stringResource(R.string.dl_nar_unpriced, n.narxsizSoni), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                            }
                        }
                    }
                }
            }
        }
    }

    open?.let { id ->
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { open = null; vm.open(null) }, sheetState = sheet) {
            val d = detail?.takeIf { it.id == id }
            if (d == null) {
                if (dSync != null && dSync != SyncResult.Ok) Text(stringResource(R.string.dl_load_failed), Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error)
                else SkeletonList(2)
            } else DetailBody(d, ui.canReport, dSync == SyncResult.Offline, vm, onPhoto = { onPhoto(d.obyektId, d.id) })
        }
    }
}

@Composable
private fun DetailBody(d: NaryadDetail, canReport: Boolean, offline: Boolean, vm: NaryadViewModel, onPhoto: () -> Unit) {
    var line by rememberSaveable { mutableStateOf<Long?>(null) }
    var sent by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(d.raqam.ifBlank { "#${d.id}" }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            StatusChip(holatLabel(d.holat), holatTone(d.holat))
        }
        Text(listOfNotNull(d.ustaNom, d.brigada).joinToString(" / "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (d.davrDan != null || d.davrGacha != null) Text(listOfNotNull(d.davrDan, d.davrGacha).joinToString(" - ") { formatIsoStamp(it) }, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (offline) Text(stringResource(R.string.dl_nar_cached), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
        if (sent) Text(stringResource(R.string.dl_nar_sent), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
        naryadSteps(d.holat).forEach { (c, s) ->
            Text((if (s > 0) "✓ " else if (s == 0) "● " else "○ ") + holatLabel(c), style = MaterialTheme.typography.bodyMedium, color = if (s < 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
        }
        d.izoh?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        d.xarajatSumma?.let { Text(stringResource(R.string.dl_nar_paid_sum, formatMoney(it)), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface) }
        d.lines.forEach { l ->
            WorkCard {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(l.nom, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                    Text(stringResource(R.string.dl_nar_given, formatQty(l.hajm), l.birlik, formatQty(l.qolgan)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                    l.bajarilgan?.let { Text(stringResource(R.string.dl_nar_reported, formatQty(it), l.birlik), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface) }
                    l.qabul?.let { Text(stringResource(R.string.dl_nar_accepted, formatQty(it), l.birlik), style = MaterialTheme.typography.bodyMedium, color = if (l.kamQabul) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface) }
                    Text(l.narxBirlik?.let { stringResource(R.string.dl_nar_price, formatMoney(it), l.birlik) } ?: stringResource(R.string.dl_nar_no_price), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (canReport && d.canReport) Button(onClick = { line = l.id; sent = false }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(if (l.bajarilgan != null) R.string.dl_nar_resend else R.string.dl_nar_did)) }
                }
            }
        }
        if (canReport && d.canReport) OutlinedButton(onClick = onPhoto, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_nar_photo)) }
    }
    line?.let { id ->
        val l = d.lines.firstOrNull { it.id == id }
        if (l != null) ReportDialog(l, othersUnreported(d.lines, id), vm, onDone = { line = null; sent = true }, onDismiss = { line = null })
    }
}

@Composable
private fun ReportDialog(l: NaryadLine, others: Int, vm: NaryadViewModel, onDone: () -> Unit, onDismiss: () -> Unit) {
    var qty by rememberSaveable(l.id) { mutableStateOf(formatQty(if (l.bajarilgan != null) l.bajarilgan else if (l.qolgan > 0) l.qolgan else l.hajm).replace(" ", "")) }
    var note by rememberSaveable(l.id) { mutableStateOf("") }
    var bad by rememberSaveable(l.id) { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    fun send(done: Boolean) { scope.launch { if (vm.report(l, qty, note, done) == null) onDone() else bad = true } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(l.nom, maxLines = 2) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.dl_nar_how_much, l.birlik), style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(qty, { qty = it; bad = false }, label = { Text(stringResource(R.string.dl_m29_qty)) }, singleLine = true, isError = bad, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                if (bad) Text(stringResource(R.string.zay_err_qty), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                OutlinedTextField(note, { note = it }, label = { Text(stringResource(R.string.zay_note)) }, modifier = Modifier.fillMaxWidth())
                if (others > 0) Text(stringResource(R.string.dl_nar_others, others), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Column {
                TextButton(onClick = { send(true) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(if (others > 0) R.string.dl_nar_all_done else R.string.dl_nar_submit)) }
                if (others > 0) TextButton(onClick = { send(false) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_nar_save)) }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_close)) } },
    )
}
