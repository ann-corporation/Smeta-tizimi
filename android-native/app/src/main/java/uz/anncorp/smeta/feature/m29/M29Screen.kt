package uz.anncorp.smeta.feature.m29

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.RowsRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.formatIsoStamp
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.syncFailure
import uz.anncorp.smeta.core.db.AppDb
import uz.anncorp.smeta.core.db.MetaEntity
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.OutboxState
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ObjectDropdown
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.SectionTitle
import uz.anncorp.smeta.core.ui.StatusChip
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.Tone
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.ombor.parseQuantity
import uz.anncorp.smeta.feature.work.BannerViewModel
import java.math.BigDecimal
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Reads (cached in `meta`, works offline), queued writes (shared outbox; outbox id = operation_id) and the online-only cancel of M-29 documents. */
@Singleton
class M29Repository @Inject constructor(
    private val api: BffApi, private val db: AppDb, private val outbox: OutboxRepository, private val json: Json,
) {
    private val ser = ListSerializer(M29Doc.serializer())

    fun docs(companyId: Long): Flow<List<M29Doc>> = db.meta().observe("m29:$companyId").map { s ->
        s?.let { runCatching { json.decodeFromString(ser, it) }.getOrNull() }.orEmpty()
    }

    /** Queued / paused / rejected M-29 entries (delivered ones are history in the server list). */
    val entries: Flow<List<OutboxEntity>> = outbox.active.map { list -> list.filter { isM29Kind(it.kind) } }

    suspend fun refresh(companyId: Long): SyncResult {
        val r: ApiResult = api.bff("/api/sb", "POST", m29ListBody(companyId))
        if (!r.ok) return r.syncFailure()
        val p = parseSb(r.body) ?: return SyncResult.Failed("BAD_SHAPE")
        db.meta().put(MetaEntity("m29:$companyId", json.encodeToString(ser, parseM29Docs(p.rows))))
        return SyncResult.Ok
    }

    suspend fun queue(o: ObyektEntity, payload: JsonObject, lineCount: Int, operationId: String): Boolean =
        outbox.enqueue(OutboxEntity(operationId, AMAL_M29_BAJAR, payload.toString(), o.id, o.nom, lineCount, OutboxState.PENDING, 0, null, null, System.currentTimeMillis()))

    /** Re-sends a rejected entry as a NEW operation with the consent the server asked for. */
    suspend fun resubmit(id: String, allowNegative: Boolean, cancelTrigger: Boolean): Boolean {
        val e = outbox.get(id) ?: return false
        val newId = UUID.randomUUID().toString()
        val p = flaggedPayload(e.payloadJson, newId, allowNegative, cancelTrigger) ?: return false
        outbox.delete(id)
        return outbox.enqueue(e.copy(id = newId, payloadJson = p.toString(), state = OutboxState.PENDING, attempts = 0, lastError = null, info = null, createdAt = System.currentTimeMillis()))
    }

    suspend fun discard(id: String) = outbox.delete(id)

    /** Online only (a cancel must be seen to succeed). */
    suspend fun cancel(companyId: Long, hujjatId: Long, reason: String): ApiResult = api.bff("/api/sb-yoz", "POST", m29CancelPayload(companyId, hujjatId, reason))
}

/** One editable material row of the form. */
data class LineUi(val key: Int, val nomi: String = "", val birligi: String = "", val qty: String = "", val hint: Double? = null)

data class M29Form(val objectId: Long? = null, val davr: String = currentPeriod(), val lines: List<LineUi> = listOf(LineUi(0)), val nextKey: Int = 1)

data class M29Ui(
    val objects: List<ObyektEntity> = emptyList(),
    val docs: List<M29Doc> = emptyList(),
    val entries: List<OutboxEntity> = emptyList(),
    val canWrite: Boolean = false,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val noCompany: Boolean = false,
    val form: M29Form = M29Form(),
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class M29ViewModel @Inject constructor(
    private val repo: M29Repository, private val objects: ObjectsRepository, private val rows: RowsRepository, private val ctx: WorkContext,
) : ViewModel() {
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())
    private val form = MutableStateFlow(M29Form())
    private val company = ctx.current
    private var opId = UUID.randomUUID().toString()
    private val pickQuery = MutableStateFlow("")

    val state: StateFlow<M29Ui> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else repo.docs(w.companyId) },
        repo.entries, sync, company,
    ) { o, d, e, s, w -> M29Ui(o, d, e, canExecuteM29(w?.rol), s.syncing, s.result, w == null) }
        .combine(form) { ui, f -> ui.copy(form = f.copy(objectId = f.objectId ?: ui.objects.singleOrNull()?.id)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), M29Ui())

    /** Works (BL) of the chosen object matching the typed text (cached estimate; works offline). */
    val pickResults = combine(form.map { it.objectId }, pickQuery) { id, q -> id to q }.flatMapLatest { (id, q) ->
        if (id == null) flowOf(emptyList()) else rows.search(id, q, null, 40)
    }
    fun setPickQuery(q: String) { pickQuery.value = q }

    init { viewModelScope.launch { company.collect { if (it != null) refresh() } } }

    fun refresh() {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.value = Sync(true, null)
            objects.refresh(w.companyId)
            sync.value = Sync(false, repo.refresh(w.companyId))
        }
    }

    fun setObject(id: Long?) = form.update { it.copy(objectId = id) }
    fun shift(delta: Int) = form.update { it.copy(davr = shiftPeriod(it.davr, delta)) }
    fun addLine() = form.update { it.copy(lines = it.lines + LineUi(it.nextKey), nextKey = it.nextKey + 1) }
    fun removeLine(key: Int) = form.update { f -> f.copy(lines = f.lines.filterNot { it.key == key }.ifEmpty { listOf(LineUi(f.nextKey)) }, nextKey = f.nextKey + 1) }
    fun edit(key: Int, change: (LineUi) -> LineUi) = form.update { f -> f.copy(lines = f.lines.map { if (it.key == key) change(it) else it }) }

    /** Adds the materials of one estimate work (BL) with empty quantities (the person enters what was consumed); the estimate volume stays as a hint. */
    fun addFromWork(qatorId: Long, onResult: (added: Boolean) -> Unit) {
        val oid = form.value.objectId ?: return
        viewModelScope.launch {
            val mats = rows.nodes(oid).first().filter { it.parentId == qatorId && it.tur == "mat" }
            if (mats.isEmpty()) { onResult(false); return@launch }
            form.update { f ->
                var k = f.nextKey
                val have = f.lines.filter { it.nomi.isNotBlank() }.map { it.nomi.trim().lowercase() + "|" + it.birligi.trim().lowercase() }.toSet()
                val fresh = mats.filter { (it.nom.trim().lowercase() + "|" + it.birlik.orEmpty().trim().lowercase()) !in have }
                    .map { LineUi(k++, it.nom, it.birlik.orEmpty(), "", it.hajm) }
                val keep = f.lines.filter { it.nomi.isNotBlank() || it.qty.isNotBlank() }
                f.copy(lines = (keep + fresh).ifEmpty { listOf(LineUi(k++)) }, nextKey = k)
            }
            onResult(true)
        }
    }

    /** null = queued; otherwise the wrong field (see [validateM29]). */
    suspend fun submit(): String? {
        val w = ctx.current.value ?: return "obyekt"
        val f = form.value
        val o = state.value.objects.firstOrNull { it.id == (f.objectId ?: state.value.objects.singleOrNull()?.id) }
        val lines = f.lines.filter { it.nomi.isNotBlank() || it.qty.isNotBlank() }
        val parsed = lines.map { l -> M29Line(l.nomi, l.birligi.ifBlank { null }, parseQuantity(l.qty) ?: BigDecimal.ZERO) }
        validateM29(o?.id, f.davr, parsed)?.let { return it }
        repo.queue(o!!, m29Payload(w.companyId, o.id, f.davr, parsed, opId), parsed.size, opId)
        opId = UUID.randomUUID().toString()
        form.update { it.copy(lines = listOf(LineUi(it.nextKey)), nextKey = it.nextKey + 1) }
        return null
    }

    fun resubmit(id: String, allowNegative: Boolean, cancelTrigger: Boolean) { viewModelScope.launch { repo.resubmit(id, allowNegative, cancelTrigger) } }
    fun discard(id: String) { viewModelScope.launch { repo.discard(id) } }

    /** Online-only cancel; [onDone] gets true on success. */
    fun cancel(doc: M29Doc, reason: String, onDone: (Boolean) -> Unit) {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            val r = repo.cancel(w.companyId, doc.id, reason)
            val ok = r.ok && (r.body as? JsonObject)?.get("ok")?.toString() != "false"
            if (ok) repo.refresh(w.companyId)
            onDone(ok)
        }
    }
}

@Composable
private fun docStatus(d: M29Doc): Pair<String, Tone> =
    if (d.active) stringResource(R.string.dl_m29_done) to Tone.GOOD else stringResource(R.string.dl_m29_cancelled) to Tone.BAD

@Composable
private fun problemText(info: FailInfo?, fallback: String?): String = when (problemOf(info?.code)) {
    M29Problem.PERIOD_DONE -> stringResource(R.string.dl_m29_err_period)
    M29Problem.STOCK_SHORT -> stringResource(R.string.dl_m29_err_stock)
    M29Problem.TRIGGER -> stringResource(R.string.dl_m29_err_trigger)
    M29Problem.FORBIDDEN -> stringResource(R.string.dl_m29_err_forbidden)
    M29Problem.OBJECT -> stringResource(R.string.dl_m29_err_object)
    M29Problem.LINES -> stringResource(R.string.dl_m29_err_lines)
    M29Problem.OTHER -> fallback ?: stringResource(R.string.dl_m29_err_other)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun M29Screen(onBack: () -> Unit, onOutbox: () -> Unit, vm: M29ViewModel = hiltViewModel(), banner: BannerViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val b by banner.state.collectAsStateWithLifecycle()
    var tried by rememberSaveable { mutableStateOf(false) }
    var problem by rememberSaveable { mutableStateOf<String?>(null) }
    var sent by rememberSaveable { mutableStateOf(false) }
    var filter by rememberSaveable { mutableStateOf("all") }
    var objectFilter by rememberSaveable { mutableStateOf<Long?>(null) }
    var picking by rememberSaveable { mutableStateOf(false) }
    var noMaterials by rememberSaveable { mutableStateOf(false) }
    var cancelDoc by rememberSaveable { mutableStateOf<Long?>(null) }
    var cancelFailed by rememberSaveable { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val names = ui.objects.associate { it.id to it.nom }
    val shown = filterDocs(ui.docs, filter, objectFilter)

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.dl_m29_title), onBack)
        if (b.visible) OutboxBanner(b, onOutbox)
        PullToRefreshBox(isRefreshing = ui.syncing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (ui.noCompany) item { CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint)) }
                else if (!ui.canWrite) item { Text(stringResource(R.string.dl_m29_no_write), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                else item {
                    WorkCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(stringResource(R.string.dl_m29_new), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                            if (sent) Text(stringResource(R.string.dl_m29_queued), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
                            ObjectDropdown(ui.objects, ui.form.objectId, stringResource(R.string.zay_pick_object), { vm.setObject(it); sent = false })
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                IconButton(onClick = { vm.shift(-1) }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.dl_m29_prev_month)) }
                                Text(ui.form.davr, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                IconButton(onClick = { vm.shift(1) }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.dl_m29_next_month)) }
                            }
                            Text(stringResource(R.string.dl_m29_hint), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            ui.form.lines.forEach { l ->
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        OutlinedTextField(l.nomi, { v -> vm.edit(l.key) { it.copy(nomi = v) }; sent = false }, label = { Text(stringResource(R.string.dl_m29_material)) }, singleLine = true, isError = tried && problem == "nom" && l.nomi.isBlank(), modifier = Modifier.fillMaxWidth())
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            val hintContent: (@Composable () -> Unit)? = if (l.hint == null) null else ({ Text(stringResource(R.string.dl_m29_estimate, formatQty(l.hint))) })
                                            OutlinedTextField(
                                                l.qty, { v -> vm.edit(l.key) { it.copy(qty = v) }; sent = false }, label = { Text(stringResource(R.string.dl_m29_qty)) }, singleLine = true,
                                                isError = tried && problem == "miqdor", keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f),
                                                supportingText = hintContent,
                                            )
                                            OutlinedTextField(l.birligi, { v -> vm.edit(l.key) { it.copy(birligi = v) } }, label = { Text(stringResource(R.string.zay_unit)) }, singleLine = true, modifier = Modifier.weight(0.7f))
                                        }
                                    }
                                    IconButton(onClick = { vm.removeLine(l.key) }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.Filled.Close, stringResource(R.string.dl_m29_remove_line)) }
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { vm.addLine() }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Icon(Icons.Filled.Add, null); Text(stringResource(R.string.dl_m29_add_line)) }
                                OutlinedButton(onClick = { picking = true; noMaterials = false }, enabled = ui.form.objectId != null, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_m29_from_work)) }
                            }
                            if (tried && problem != null) Text(
                                stringResource(when (problem) { "obyekt" -> R.string.zay_err_object; "davr" -> R.string.dl_m29_err_davr; "qator" -> R.string.dl_m29_err_empty; "nom" -> R.string.zay_err_item; else -> R.string.zay_err_qty }),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
                            )
                            Button(
                                onClick = { tried = true; scope.launch { problem = vm.submit(); if (problem == null) { sent = true; tried = false } } },
                                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget),
                            ) { Text(stringResource(R.string.dl_m29_send)) }
                            Text(stringResource(R.string.zay_offline_hint), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                if (ui.entries.isNotEmpty()) item { SectionTitle(stringResource(R.string.dl_m29_pending)) }
                items(ui.entries, key = { "e" + it.id }) { e ->
                    val info = parseFailInfo(e.info)
                    val sum = summarizeM29(e.payloadJson)
                    WorkCard {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(e.obyektNom + (sum?.let { "  -  " + it.davr } ?: ""), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                                if (e.state == OutboxState.FAILED) StatusChip(stringResource(R.string.dl_m29_rejected), Tone.BAD) else StatusChip(stringResource(R.string.dl_m29_waiting), Tone.WARN)
                            }
                            sum?.let { Text(pluralStr(R.plurals.dl_m29_materials, it.lineCount) + if (it.first.isNotEmpty()) " - " + it.first else "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2) }
                            if (e.state == OutboxState.FAILED) {
                                Text(problemText(info, e.lastError), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                                info?.shortages?.take(6)?.forEach { s ->
                                    Text(stringResource(R.string.dl_m29_short, s.nomi, formatQtyS(s.kerak), formatQtyS(s.bor), s.birligi.orEmpty()), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    when (problemOf(info?.code)) {
                                        M29Problem.STOCK_SHORT -> OutlinedButton(onClick = { vm.resubmit(e.id, true, false) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_m29_allow_negative)) }
                                        M29Problem.TRIGGER -> OutlinedButton(onClick = { vm.resubmit(e.id, false, true) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_m29_replace_auto)) }
                                        else -> Unit
                                    }
                                    TextButton(onClick = { vm.discard(e.id) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_m29_discard)) }
                                }
                            }
                        }
                    }
                }

                item { SectionTitle(stringResource(R.string.dl_m29_docs)) }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ChipRow {
                            FilterChip(selected = filter == "all", onClick = { filter = "all" }, label = { Text(stringResource(R.string.docs_filter_all)) })
                            FilterChip(selected = filter == "active", onClick = { filter = "active" }, label = { Text(stringResource(R.string.dl_m29_done)) })
                            FilterChip(selected = filter == "cancelled", onClick = { filter = "cancelled" }, label = { Text(stringResource(R.string.dl_m29_cancelled)) })
                        }
                        if (ui.objects.size > 1) ObjectDropdown(ui.objects, objectFilter, stringResource(R.string.dl_all_objects), { objectFilter = it }, allLabel = stringResource(R.string.dl_all_objects))
                    }
                }
                if (shown.isEmpty()) item {
                    if (ui.syncing && ui.docs.isEmpty()) Text(stringResource(R.string.dl_loading), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else Text(stringResource(if (ui.result == SyncResult.Ok || ui.docs.isNotEmpty()) R.string.dl_m29_empty else R.string.dl_load_failed), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(shown, key = { "d" + it.id }) { d ->
                    val (label, tone) = docStatus(d)
                    WorkCard {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(names[d.obyektId] ?: "#${d.obyektId}", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, modifier = Modifier.weight(1f))
                                StatusChip(label, tone)
                            }
                            Text(d.davr + (d.qatorSoni?.let { "  -  " + pluralStr(R.plurals.dl_m29_materials, it) } ?: ""), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                            d.bajarildi?.let { Text(formatIsoStamp(it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            if (d.manfiyQoldiq) Text(stringResource(R.string.dl_m29_negative_stock), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
                            if ((d.triggerBekor ?: 0) > 0) Text(stringResource(R.string.dl_m29_auto_replaced, d.triggerBekor ?: 0), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (ui.canWrite && d.active) TextButton(onClick = { cancelDoc = d.id; cancelFailed = false }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_m29_cancel)) }
                        }
                    }
                }
            }
        }
    }

    if (picking) WorkPickerDialog(vm, noMaterials, onPick = { id -> vm.addFromWork(id) { added -> if (added) picking = false else noMaterials = true } }, onDismiss = { picking = false })

    cancelDoc?.let { id ->
        val doc = ui.docs.firstOrNull { it.id == id }
        var reason by rememberSaveable(id) { mutableStateOf("") }
        var busy by rememberSaveable(id) { mutableStateOf(false) }
        if (doc != null) AlertDialog(
            onDismissRequest = { if (!busy) cancelDoc = null },
            title = { Text(stringResource(R.string.dl_m29_cancel_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.dl_m29_cancel_body), style = MaterialTheme.typography.bodyMedium)
                    OutlinedTextField(reason, { reason = it }, label = { Text(stringResource(R.string.dl_m29_cancel_reason)) }, modifier = Modifier.fillMaxWidth())
                    if (cancelFailed) Text(stringResource(R.string.dl_m29_cancel_failed), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            },
            confirmButton = {
                TextButton(enabled = reason.isNotBlank() && !busy, onClick = { busy = true; vm.cancel(doc, reason) { ok -> busy = false; if (ok) cancelDoc = null else cancelFailed = true } }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_m29_cancel)) }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { cancelDoc = null }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_close)) } },
        )
    }
}

@Composable
private fun WorkPickerDialog(vm: M29ViewModel, noMaterials: Boolean, onPick: (Long) -> Unit, onDismiss: () -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    val hits by vm.pickResults.collectAsStateWithLifecycle(emptyList())
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.dl_m29_pick_work)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(q, { q = it; vm.setPickQuery(it) }, label = { Text(stringResource(R.string.dl_m29_search_work)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (noMaterials) Text(stringResource(R.string.dl_m29_no_materials), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                LazyColumn(Modifier.heightIn(max = 320.dp)) {
                    items(hits, key = { it.rid }) { r ->
                        TextButton(onClick = { onPick(r.qatorId) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                            Text((r.kod?.let { "$it  " } ?: "") + r.nom, maxLines = 2, modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.dl_close)) } },
    )
}

@Composable
private fun pluralStr(res: Int, n: Int): String = androidx.compose.ui.res.pluralStringResource(res, n, n)

/** Quantities keep their sign (a negative on-hand figure is real information). */
private fun formatQtyS(v: Double?): String = if (v != null && v < 0) "−" + formatQty(-v) else formatQty(v)
