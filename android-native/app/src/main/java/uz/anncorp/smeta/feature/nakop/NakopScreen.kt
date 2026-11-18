package uz.anncorp.smeta.feature.nakop

import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.DocGenRepository
import uz.anncorp.smeta.core.data.DocItem
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.F2Repository
import uz.anncorp.smeta.core.data.GenItem
import uz.anncorp.smeta.core.data.GenResult
import uz.anncorp.smeta.core.data.MoneyRepository
import uz.anncorp.smeta.core.data.NakopMonth
import uz.anncorp.smeta.core.data.NakopRepository
import uz.anncorp.smeta.core.data.NakopView
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.buildNakopView
import uz.anncorp.smeta.core.data.displayMoney
import uz.anncorp.smeta.core.data.nakopMonthLabel
import uz.anncorp.smeta.core.ui.ChartColors
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.MoneyDual
import uz.anncorp.smeta.core.ui.PercentBar
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.docs.DocViewer
import uz.anncorp.smeta.feature.docs.Viewing
import uz.anncorp.smeta.feature.docs.GenCard
import uz.anncorp.smeta.feature.f2.StatusChip
import javax.inject.Inject

data class NakopUi(
    val name: String = "",
    val view: NakopView? = null,
    val money: ObjectMoney? = null,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val generating: String? = null,
    val viewing: Viewing? = null,
    val error: Int? = null,
)

@HiltViewModel
class NakopViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val repo: NakopRepository, private val genRepo: DocGenRepository, f2: F2Repository, money: MoneyRepository, private val ctx: WorkContext,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private data class Local(val syncing: Boolean = true, val result: SyncResult? = null, val generating: String? = null, val viewing: Viewing? = null, val error: Int? = null)
    private val local = MutableStateFlow(Local())
    private val f2Acts = f2

    val state: StateFlow<NakopUi> = combine(
        repo.observe(ctx.current.value?.companyId ?: -1, id), f2.observe(id), objects.observeOne(id), money.observe(id), repo.lastUpdated(ctx.current.value?.companyId ?: -1, id), local,
    ) { values ->
        @Suppress("UNCHECKED_CAST")
        val gen = values[0] as List<GenItem>?
        @Suppress("UNCHECKED_CAST")
        val acts = values[1] as List<F2Act>?
        val o = values[2] as uz.anncorp.smeta.core.db.ObyektEntity?
        val m = values[3] as ObjectMoney?
        val ts = values[4] as Long?
        val l = values[5] as Local
        NakopUi(o?.nom.orEmpty(), if (gen == null && acts == null) null else buildNakopView(gen.orEmpty(), acts.orEmpty()), m, l.syncing, l.result, ts, l.generating, l.viewing, l.error)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), NakopUi())

    init { refresh() }

    fun refresh() {
        val companyId = ctx.current.value?.companyId ?: run { local.update { it.copy(syncing = false, result = SyncResult.Failed("NO_COMPANY")) }; return }
        viewModelScope.launch {
            local.update { it.copy(syncing = true, result = null) }
            launch { f2Acts.refresh(id) }
            val r = repo.refresh(companyId, id)
            local.update { it.copy(syncing = false, result = r) }
        }
    }

    /** Asks the server document engine for the final file (the app builds nothing) and opens it in the viewer. */
    fun generate(item: GenItem, format: String) {
        val companyId = ctx.current.value?.companyId ?: return
        if (local.value.generating != null) return
        local.update { it.copy(generating = item.key + '|' + format, error = null) }
        viewModelScope.launch {
            val r = genRepo.generate(companyId, id, item, format)
            local.update {
                when (r) {
                    is GenResult.Ready -> it.copy(generating = null, viewing = Viewing(DocItem(-1, r.name, item.type, r.mime, r.bytes.size.toLong(), "", "", true), r.name, r.mime, r.bytes))
                    GenResult.Offline -> it.copy(generating = null, error = R.string.docs_err_offline)
                    GenResult.NoTokens -> it.copy(generating = null, error = R.string.gen_err_tokens)
                    GenResult.Forbidden -> it.copy(generating = null, error = R.string.docs_err_forbidden)
                    GenResult.DataIncomplete -> it.copy(generating = null, error = R.string.gen_err_data)
                    is GenResult.Failed -> it.copy(generating = null, error = R.string.gen_err_server)
                }
            }
        }
    }

    fun closeViewer() = local.update { it.copy(viewing = null) }
    fun dismissError() = local.update { it.copy(error = null) }
}

/** Nakopitelniy of one object: progress numbers (server package), the statement of every F-2 month and the object's other statements; files come from the server engine. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun NakopScreen(onBack: () -> Unit, onResources: (Long) -> Unit, onOpenF2: (Long) -> Unit, vm: NakopViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val viewing = ui.viewing
    if (viewing != null) {
        BackHandler { vm.closeViewer() }
        DocViewer(viewing, onBack = vm::closeViewer)
        return
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.p8_nk_title) + if (ui.name.isNotBlank()) " · " + ui.name else "", onBack)
        ui.error?.let { msg ->
            Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp, 16.dp, 0.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(msg), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
                    TextButton(onClick = vm::dismissError) { Text(stringResource(R.string.docs_dismiss)) }
                }
            }
        }
        PullToRefreshBox(isRefreshing = ui.syncing && ui.view != null, onRefresh = vm::refresh, modifier = Modifier.weight(1f).fillMaxWidth()) {
            val view = ui.view
            when {
                view == null && ui.syncing -> SkeletonList(4)
                view == null -> when (ui.result) {
                    is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.f2_forbidden), stringResource(R.string.f2_forbidden_body))
                    else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
                }
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item { Progress(ui) }
                    if (view.months.isEmpty()) item { Text(stringResource(R.string.p8_nk_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    else item { Text(stringResource(R.string.p8_nk_months), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface) }
                    items(view.months, key = { it.month }) { m -> MonthCard(m, ui.generating) { item, fmt -> vm.generate(item, fmt) } }
                    if (view.others.isNotEmpty()) {
                        item { Text(stringResource(R.string.p8_nk_others), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(top = 6.dp)) }
                        items(view.others, key = { it.key }) { g -> GenCard(g, ui.generating) { fmt -> vm.generate(g, fmt) } }
                    }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { onResources(vm.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p8_rv_title)) }
                            OutlinedButton(onClick = { onOpenF2(vm.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p8_reg_open_list)) }
                            Text(stringResource(R.string.p8_nk_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            UpdatedLine(ui.updatedAt)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Progress(ui: NakopUi) {
    WorkCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.p8_nk_progress), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            PercentBar(stringResource(R.string.p1_card_fakt), ui.money?.factPct, ChartColors.fact)
            PercentBar(stringResource(R.string.p1_card_f2), ui.money?.f2Pct, ChartColors.f2)
            PercentBar(stringResource(R.string.p8_nk_f3), ui.money?.f3Pct, ChartColors.warn)
            Text(stringResource(R.string.p1_card_f2), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            MoneyDual(displayMoney(ui.money?.f2, null), showVat = true, short = true)
        }
    }
}

@Composable
private fun MonthCard(m: NakopMonth, generating: String?, onGenerate: (GenItem, String) -> Unit) {
    WorkCard(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.p8_nk_month, nakopMonthLabel(m.month)), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                    m.actNumber?.let { Text(stringResource(R.string.f2_act_title, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                m.status?.let { StatusChip(it) }
            }
            val doc = m.doc
            if (doc == null) {
                Text(stringResource(R.string.p8_nk_not_ready), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    doc.formats.forEach { fmt ->
                        val busy = generating == doc.key + '|' + fmt
                        val label = stringResource(if (fmt == "pdf") R.string.gen_pdf else R.string.gen_xlsx)
                        val mod = Modifier.weight(1f).heightIn(min = TouchTarget)
                        if (fmt == "pdf") Button(onClick = { onGenerate(doc, fmt) }, enabled = generating == null, modifier = mod) { if (busy) CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp) else Text(label) }
                        else OutlinedButton(onClick = { onGenerate(doc, fmt) }, enabled = generating == null, modifier = mod) { if (busy) CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp) else Text(label) }
                    }
                }
            }
        }
    }
}
