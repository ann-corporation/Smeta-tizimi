package uz.anncorp.smeta.feature.zayavka

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.ombor.parseQuantity
import uz.anncorp.smeta.feature.work.BannerViewModel
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Reads (cached in `meta`, works offline) and queued writes (shared outbox; outbox id = operation_id) of material requests. */
@Singleton
class ZayavkaRepository @Inject constructor(
    private val api: BffApi, private val db: AppDb, private val outbox: OutboxRepository, private val json: Json,
) {
    private val ser = ListSerializer(ZayavkaRow.serializer())

    fun requests(companyId: Long): Flow<List<ZayavkaRow>> = db.meta().observe("zayavka:$companyId").map { s ->
        s?.let { runCatching { json.decodeFromString(ser, it) }.getOrNull() }.orEmpty()
    }

    suspend fun refresh(companyId: Long): SyncResult {
        val r: ApiResult = api.bff("/api/sb", "POST", requestsReadBody(companyId))
        if (!r.ok) return when {
            r.networkError -> SyncResult.Offline
            r.status == 403 -> SyncResult.Forbidden
            else -> SyncResult.Failed(r.code ?: "HTTP ${r.status}")
        }
        val p = parseSb(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("zayavka:$companyId", json.encodeToString(ser, parseRequests(p.rows))))
        return SyncResult.Ok
    }

    /** false = this operation id is already queued (double tap). */
    suspend fun queue(companyId: Long, o: ObyektEntity, payload: kotlinx.serialization.json.JsonObject, operationId: String): Boolean =
        outbox.enqueue(OutboxEntity(operationId, AMAL_ZAYAVKA, payload.toString(), o.id, o.nom, 1, OutboxState.PENDING, 0, null, null, System.currentTimeMillis()))
}

data class ZayavkaUi(
    val objects: List<ObyektEntity> = emptyList(),
    val requests: List<ZayavkaRow> = emptyList(),
    val canWrite: Boolean = false,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val noCompany: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ZayavkaViewModel @Inject constructor(
    private val repo: ZayavkaRepository, private val objects: ObjectsRepository, private val ctx: WorkContext,
) : ViewModel() {
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())
    private val company = ctx.current

    val state: StateFlow<ZayavkaUi> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else repo.requests(w.companyId) },
        sync, company,
    ) { o, r, s, w -> ZayavkaUi(o, r, canRequestMaterial(w?.rol), s.syncing, s.result, w == null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ZayavkaUi())

    init { viewModelScope.launch { company.collect { if (it != null) refresh() } } }

    fun refresh() {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.value = Sync(true, null)
            objects.refresh(w.companyId)
            sync.value = Sync(false, repo.refresh(w.companyId))
        }
    }

    fun newOperationId(): String = UUID.randomUUID().toString()

    fun submit(o: ObyektEntity, item: String, qty: String, unit: String, date: String, priority: String, bl: String, note: String, opId: String, onDone: () -> Unit) {
        val w = ctx.current.value ?: return
        val q = parseQuantity(qty) ?: return
        viewModelScope.launch {
            repo.queue(w.companyId, o, requestPayload(w.companyId, o.id, item, q, unit, date, priority, composeNote(bl, note), opId), opId)
            onDone()
        }
    }
}

@Composable
internal fun statusLabel(code: String): String = stringResource(
    when (code) {
        "submitted" -> R.string.zay_st_submitted
        "approved" -> R.string.zay_st_approved
        "procurement" -> R.string.zay_st_procurement
        "ordered" -> R.string.zay_st_ordered
        "partially_delivered" -> R.string.zay_st_partial
        "delivered" -> R.string.zay_st_delivered
        "closed" -> R.string.zay_st_closed
        "cancelled" -> R.string.zay_st_cancelled
        else -> R.string.zay_st_draft
    },
)

@Composable
internal fun priorityLabel(code: String): String = stringResource(
    when (code) { "past" -> R.string.zay_pr_low; "yuqori" -> R.string.zay_pr_high; else -> R.string.zay_pr_mid },
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ZayavkaScreen(onBack: () -> Unit, onOutbox: () -> Unit, vm: ZayavkaViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    val opId = rememberSaveable { vm.newOperationId() }
    var objectId by rememberSaveable { mutableStateOf<Long?>(null) }
    var item by rememberSaveable { mutableStateOf("") }
    var qty by rememberSaveable { mutableStateOf("") }
    var unit by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf("") }
    var priority by rememberSaveable { mutableStateOf("orta") }
    var bl by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var tried by rememberSaveable { mutableStateOf(false) }
    var sent by rememberSaveable { mutableStateOf(false) }
    var menu by rememberSaveable { mutableStateOf(false) }
    val chosen = ui.objects.firstOrNull { it.id == objectId } ?: ui.objects.singleOrNull()
    val problem = validateRequest(chosen?.id, item, qty, date)
    val names = ui.objects.associate { it.id to it.nom }

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.zay_title), onBack)
        if (b.visible) OutboxBanner(b, onOutbox)
        PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (ui.noCompany) item { CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint)) }
                else if (!ui.canWrite) item { Text(stringResource(R.string.zay_no_write), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                else item {
                    WorkCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(stringResource(R.string.zay_new), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                            if (sent) Text(stringResource(R.string.zay_queued), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
                            androidx.compose.foundation.layout.Box {
                                OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                                    Text(chosen?.nom ?: stringResource(R.string.zay_pick_object), maxLines = 1)
                                }
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                    ui.objects.forEach { o -> DropdownMenuItem(text = { Text(o.nom) }, onClick = { objectId = o.id; menu = false }) }
                                }
                            }
                            OutlinedTextField(item, { item = it; sent = false }, label = { Text(stringResource(R.string.zay_item)) }, singleLine = true, isError = tried && problem == "nom", modifier = Modifier.fillMaxWidth())
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    qty, { qty = it; sent = false }, label = { Text(stringResource(R.string.zay_qty)) }, singleLine = true, isError = tried && problem == "miqdor",
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(unit, { unit = it }, label = { Text(stringResource(R.string.zay_unit)) }, singleLine = true, modifier = Modifier.weight(1f))
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PRIORITIES.forEach { p -> FilterChip(selected = priority == p, onClick = { priority = p }, label = { Text(priorityLabel(p)) }) }
                            }
                            OutlinedTextField(date, { date = it }, label = { Text(stringResource(R.string.zay_date)) }, placeholder = { Text("2026-12-01") }, singleLine = true, isError = tried && problem == "sana", modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(bl, { bl = it }, label = { Text(stringResource(R.string.zay_bl)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(note, { note = it }, label = { Text(stringResource(R.string.zay_note)) }, modifier = Modifier.fillMaxWidth())
                            if (tried && problem != null) Text(
                                stringResource(when (problem) { "obyekt" -> R.string.zay_err_object; "nom" -> R.string.zay_err_item; "miqdor" -> R.string.zay_err_qty; else -> R.string.zay_err_date }),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
                            )
                            Button(
                                onClick = {
                                    tried = true
                                    val o = chosen
                                    if (problem == null && o != null) vm.submit(o, item, qty, unit, date, priority, bl, note, opId) { sent = true; item = ""; qty = ""; bl = ""; note = "" }
                                },
                                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
                            ) { Text(stringResource(R.string.zay_send)) }
                            Text(stringResource(R.string.zay_offline_hint), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
