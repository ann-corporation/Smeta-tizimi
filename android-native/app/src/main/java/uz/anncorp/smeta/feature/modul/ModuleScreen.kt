package uz.anncorp.smeta.feature.modul

import androidx.annotation.StringRes
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
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
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.FeedCatalog
import uz.anncorp.smeta.core.data.FeedFact
import uz.anncorp.smeta.core.data.FeedLoad
import uz.anncorp.smeta.core.data.FeedLoader
import uz.anncorp.smeta.core.data.FeedModule
import uz.anncorp.smeta.core.data.FeedRow
import uz.anncorp.smeta.core.data.FeedSource
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.feedAnswerOk
import uz.anncorp.smeta.core.data.feedRequest
import uz.anncorp.smeta.core.data.filterFeed
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.data.parseFeed
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.time.LocalDate
import javax.inject.Inject

/** State of one tab: not loaded yet, loaded rows, or why it failed. */
data class FeedTab(val rows: List<FeedRow>? = null, val loading: Boolean = false, val offline: Boolean = false, val forbidden: Boolean = false, val failed: Boolean = false)

data class ModuleUi(val module: FeedModule? = null, val tab: Int = 0, val tabs: Map<String, FeedTab> = emptyMap(), val noCompany: Boolean = false)

/**
 * One simple native reader for the office modules (see core/data/ModuleFeed.kt in :shared). The same endpoints as the website, read through the BFF;
 * the device shows what the server sent and computes nothing.
 */
@HiltViewModel
class ModuleViewModel @Inject constructor(private val api: BffApi, private val ctx: WorkContext, saved: SavedStateHandle) : ViewModel() {
    private val code: String = saved.get<String>("code").orEmpty()
    private val _state = MutableStateFlow(ModuleUi(module = FeedCatalog.module(code, LocalDate.now().toString().take(7))))
    val state: StateFlow<ModuleUi> = _state.asStateFlow()
    private var lastQuery = ""

    init { load(0, "") }

    fun select(i: Int) { _state.update { it.copy(tab = i) }; val key = _state.value.module?.sources?.getOrNull(i)?.key ?: return; if (_state.value.tabs[key]?.rows == null) load(i, lastQuery) }
    fun refresh(query: String = lastQuery) = load(_state.value.tab, query)

    private fun load(i: Int, query: String) {
        val m = _state.value.module ?: return
        val s: FeedSource = m.sources.getOrNull(i) ?: return
        val w = ctx.current.value ?: run { _state.update { it.copy(noCompany = true) }; return }
        lastQuery = query
        _state.update { it.copy(tabs = it.tabs + (s.key to (it.tabs[s.key] ?: FeedTab()).copy(loading = true, offline = false, forbidden = false, failed = false))) }
        viewModelScope.launch {
            val tab = when (val res = FeedLoader(api).load(w.companyId, s, query)) {
                FeedLoad.Offline -> FeedTab(rows = _state.value.tabs[s.key]?.rows, offline = true)
                FeedLoad.Forbidden -> FeedTab(forbidden = true)
                FeedLoad.Failed -> FeedTab(failed = true)
                is FeedLoad.Rows -> FeedTab(rows = res.rows)
            }
            _state.update { it.copy(tabs = it.tabs + (s.key to tab)) }
        }
    }
}

@StringRes
private fun tabTitle(key: String): Int = when (key) {
    "narx_all" -> R.string.t14_tab_narx_all; "narx_risk" -> R.string.t14_tab_narx_risk
    "moliya_tahlil" -> R.string.t14_tab_moliya_tahlil; "moliya_pul" -> R.string.t14_tab_moliya_pul
    "bux_shartnoma" -> R.string.t14_tab_bux_shartnoma; "bux_tolov" -> R.string.t14_tab_bux_tolov; "bux_xarajat" -> R.string.t14_tab_bux_xarajat; "bux_umumiy" -> R.string.t14_tab_bux_umumiy
    "aosr_reestr" -> R.string.t14_tab_aosr_reestr
    "tender_mine" -> R.string.t14_tab_tender_mine; "tender_to_me" -> R.string.t14_tab_tender_to_me; "tender_open" -> R.string.t14_tab_tender_open
    "log_zayavka" -> R.string.t14_tab_log_zayavka; "log_harakat" -> R.string.t14_tab_log_harakat
    "hr_xodim" -> R.string.t14_tab_hr_xodim; "hr_oy" -> R.string.t14_tab_hr_oy; "hr_kpi" -> R.string.t14_tab_hr_kpi
    "sotuv_panel" -> R.string.t14_tab_sotuv_panel; "sotuv_bitim" -> R.string.t14_tab_sotuv_bitim; "sotuv_mijoz" -> R.string.t14_tab_sotuv_mijoz
    "kom_azo" -> R.string.t14_tab_kom_azo; "kom_profil" -> R.string.t14_tab_kom_profil
    else -> R.string.t14_tab_generic
}

@StringRes
private fun moduleTitle(code: String): Int = uz.anncorp.smeta.core.data.ModuleCatalog.all.firstOrNull { it.code == code }?.title ?: R.string.t14_tab_generic

/** An office module as a native screen: tabs, search, cards, one tap for every field. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModuleScreen(onBack: () -> Unit, onDebtors: () -> Unit = {}, vm: ModuleViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val m = ui.module
    var query by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(moduleTitle(m?.code.orEmpty())), onBack)
        if (m == null) { CenterMessage(Icons.Filled.Inbox, stringResource(R.string.t14_unknown_module)); return@Column }
        if (m.sources.size > 1) Column(Modifier.padding(horizontal = 16.dp)) { ChipRow { m.sources.forEachIndexed { i, s -> FilterChip(selected = ui.tab == i, onClick = { vm.select(i) }, label = { Text(stringResource(tabTitle(s.key))) }) } } }
        val source = m.sources[ui.tab.coerceIn(0, m.sources.lastIndex)]
        val tab = ui.tabs[source.key]
        if (!source.single) {
            OutlinedTextField(
                query, { query = it }, singleLine = true, placeholder = { Text(stringResource(R.string.t14_search)) },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { if (source.searchColumn != null) vm.refresh(query) }),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).heightIn(min = TouchTarget),
            )
        }
        when {
            ui.noCompany -> CenterMessage(null, stringResource(R.string.workplace_none), stringResource(R.string.workplace_none_hint))
            tab == null || (tab.loading && tab.rows == null) -> SkeletonList(4)
            tab.forbidden -> CenterMessage(Icons.Filled.Lock, stringResource(R.string.rb_forbidden), stringResource(R.string.f2_forbidden_body))
            tab.offline && tab.rows == null -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.t14_offline), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
            tab.failed || tab.rows == null -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.err_server), null, stringResource(R.string.retry)) { vm.refresh() }
            else -> {
                val shown = filterFeed(tab.rows, query)
                PullToRefreshBox(isRefreshing = tab.loading, onRefresh = { vm.refresh() }, modifier = Modifier.fillMaxSize()) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (m.code == "moliya") item(key = "debtors") {
                            OutlinedButton(onClick = onDebtors, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.t14_open_debtors)) }
                        }
                        if (shown.isEmpty()) item(key = "empty") {
                            CenterMessage(Icons.Filled.Inbox, stringResource(if (tab.rows.isEmpty()) R.string.t14_empty else R.string.p8_reg_no_match))
                        }
                        itemsIndexed(shown, key = { i, r -> source.key + i + r.id }) { _, r -> FeedCard(r) { open = r.id } }
                    }
                }
            }
        }
    }
    val sel = ui.tabs[m?.sources?.getOrNull(ui.tab)?.key]?.rows?.firstOrNull { it.id == open }
    if (sel != null) ModalBottomSheet(onDismissRequest = { open = null }) { FeedSheet(sel) }
}

@Composable
private fun FeedCard(r: FeedRow, onClick: () -> Unit) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(r.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                r.subtitle?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, maxLines = 1) }
                r.amount?.let { a ->
                    Text(formatMoney(a, if (a % 1.0 == 0.0) 0 else 2), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    r.amountLabel?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                r.facts.take(3).forEach { Text(it.label + ": " + it.value, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
            }
            Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun FeedSheet(r: FeedRow) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(r.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        r.subtitle?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
        HorizontalDivider(Modifier.padding(vertical = 6.dp))
        r.all.forEach { f: FeedFact ->
            Row(Modifier.fillMaxWidth().heightIn(min = 32.dp), verticalAlignment = Alignment.Top) {
                Text(f.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(0.45f))
                Text(f.value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(0.55f))
            }
        }
    }
}
