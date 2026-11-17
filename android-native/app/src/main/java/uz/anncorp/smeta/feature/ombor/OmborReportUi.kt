package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberDateRangePickerState
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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.ChipRow
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import javax.inject.Inject

/** What the report tab shows: a period report, or the balance on a date. */
data class ReportUi(
    val loading: Boolean = false, val offline: Boolean = false, val failed: Boolean = false,
    val report: Report? = null, val dateRows: List<DateBalanceRow>? = null, val date: String? = null,
)

@HiltViewModel
class OmborReportViewModel @Inject constructor(private val api: BffApi, private val ctx: WorkContext) : ViewModel() {
    private val _state = MutableStateFlow(ReportUi())
    val state: StateFlow<ReportUi> = _state.asStateFlow()

    fun loadReport(skladId: Long, period: ReportPeriod?, from: String?, to: String?, query: String?, expenseOnly: Boolean?) {
        val w = ctx.current.value ?: return
        _state.value = ReportUi(loading = true)
        viewModelScope.launch {
            val r = api.bff("/api/ombor-buyruq", "POST", reportBody(w.companyId, skladId, period, from, to, query, expenseOnly))
            val rep = if (r.ok) parseReport(r.body) else null
            _state.value = ReportUi(offline = r.networkError, failed = !r.networkError && rep == null, report = rep)
        }
    }

    fun loadDate(skladId: Long, date: String, query: String?) {
        val w = ctx.current.value ?: return
        _state.value = ReportUi(loading = true, date = date)
        viewModelScope.launch {
            val r = api.bff("/api/ombor-buyruq", "POST", stockOnDateBody(w.companyId, skladId, date, query))
            val rows = if (r.ok) parseStockOnDate(r.body) else null
            _state.value = ReportUi(offline = r.networkError, failed = !r.networkError && rows == null, dateRows = rows, date = date)
        }
    }
}

private fun periodLabel(p: ReportPeriod): Int = when (p) {
    ReportPeriod.TODAY -> R.string.t14_period_today; ReportPeriod.YESTERDAY -> R.string.t14_period_yesterday; ReportPeriod.WEEK -> R.string.t14_period_week
    ReportPeriod.MONTH -> R.string.t14_period_month; ReportPeriod.LAST_MONTH -> R.string.t14_period_last_month; ReportPeriod.YEAR -> R.string.t14_period_year
}

private fun isoOf(millis: Long?): String? = millis?.let { Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }

/** Kirim-chiqim report for ANY period (presets or a date range) and the balance on a chosen date. All numbers come from the server. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
/** [query] is the warehouse screen's ONE search field (shared with the stock tabs); there is no second field here. */
internal fun OmborReportPanel(skladId: Long?, query: String, vm: OmborReportViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    var period by rememberSaveable { mutableStateOf<String?>(ReportPeriod.MONTH.name) }
    var from by rememberSaveable { mutableStateOf<String?>(null) }
    var to by rememberSaveable { mutableStateOf<String?>(null) }
    var op by rememberSaveable { mutableStateOf(0) } // 0 all, 1 kirim, 2 chiqim
    var date by rememberSaveable { mutableStateOf<String?>(null) }
    var rangeDialog by rememberSaveable { mutableStateOf(false) }
    var dateDialog by rememberSaveable { mutableStateOf(false) }

    fun reload() {
        val s = skladId ?: return
        val d = date
        if (d != null) vm.loadDate(s, d, query) else vm.loadReport(s, period?.let { ReportPeriod.valueOf(it) }, from, to, query, when (op) { 1 -> false; 2 -> true; else -> null })
    }
    LaunchedEffect(skladId, period, from, to, op, date, query) { if (query.isNotBlank()) kotlinx.coroutines.delay(350); reload() }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) { ChipRow {
            ReportPeriod.entries.forEach { p ->
                FilterChip(selected = date == null && period == p.name, onClick = { date = null; period = p.name; from = null; to = null }, label = { Text(stringResource(periodLabel(p))) })
            }
            FilterChip(selected = date == null && period == null, onClick = { rangeDialog = true }, label = { Text(if (from != null || to != null) (from ?: "…") + " – " + (to ?: "…") else stringResource(R.string.t14_period_range)) },
                leadingIcon = { Icon(Icons.Filled.CalendarMonth, null) })
        } }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            listOf(R.string.t14_op_all, R.string.t14_op_in, R.string.t14_op_out).forEachIndexed { i, res ->
                FilterChip(selected = date == null && op == i, onClick = { date = null; op = i }, label = { Text(stringResource(res)) })
            }
            AssistChip(onClick = { dateDialog = true }, label = { Text(date?.let { stringResource(R.string.t14_balance_on, it) } ?: stringResource(R.string.t14_balance_date)) }, leadingIcon = { Icon(Icons.Filled.CalendarMonth, null) })
        }
        when {
            skladId == null -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.ombor_cmd_m_nowarehouse))
            ui.loading -> SkeletonList(4)
            ui.offline -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.ombor_offline_empty), null, stringResource(R.string.retry)) { reload() }
            ui.failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.err_server), null, stringResource(R.string.retry)) { reload() }
            ui.dateRows != null -> DateRows(ui.date.orEmpty(), ui.dateRows!!)
            ui.report != null -> ReportBody(ui.report!!)
        }
    }

    if (rangeDialog) {
        val st = rememberDateRangePickerState()
        DatePickerDialog(
            onDismissRequest = { rangeDialog = false },
            confirmButton = {
                TextButton(enabled = st.selectedStartDateMillis != null, onClick = {
                    from = isoOf(st.selectedStartDateMillis); to = isoOf(st.selectedEndDateMillis ?: st.selectedStartDateMillis); period = null; date = null; rangeDialog = false
                }) { Text(stringResource(R.string.t14_apply)) }
            },
            dismissButton = { TextButton(onClick = { rangeDialog = false }) { Text(stringResource(R.string.p8_cancel)) } },
        ) { DateRangePicker(st, modifier = Modifier.heightIn(max = 520.dp)) }
    }
    if (dateDialog) {
        val st = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { dateDialog = false },
            confirmButton = {
                TextButton(enabled = st.selectedDateMillis != null, onClick = {
                    val d = isoOf(st.selectedDateMillis)
                    // The server refuses a future date; today is the latest allowed.
                    date = d?.let { if (LocalDate.parse(it).isAfter(LocalDate.now())) LocalDate.now().toString() else it }; dateDialog = false
                }) { Text(stringResource(R.string.t14_apply)) }
            },
            dismissButton = { TextButton(onClick = { dateDialog = false }) { Text(stringResource(R.string.p8_cancel)) } },
        ) { DatePicker(st, modifier = Modifier.heightIn(max = 520.dp)) }
    }
}

@Composable
private fun DateRows(date: String, rows: List<DateBalanceRow>) {
    if (rows.isEmpty()) { CenterMessage(Icons.Filled.CalendarMonth, stringResource(R.string.t14_balance_empty, date)); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text(stringResource(R.string.t14_balance_head, date), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface) }
        items(rows, key = { it.name + "|" + it.unit }) { r ->
            WorkCard(modifier = Modifier.heightIn(min = TouchTarget)) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(r.name, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 3)
                        r.lastDate?.let { Text(stringResource(R.string.ombor_last_movement, it.take(10)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Text(formatQty(r.qty) + " " + r.unit, style = MaterialTheme.typography.titleMedium, color = if ((r.qty ?: 0.0) < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}

@Composable
private fun ReportBody(r: Report) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Totals(r) }
        if (r.rows.isEmpty()) item { Text(stringResource(R.string.t14_report_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(r.rows, key = { it.id.toString() + it.date + it.name + it.qty }) { row ->
            WorkCard(modifier = Modifier.heightIn(min = TouchTarget)) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(row.name, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 3)
                        Text(listOfNotNull(row.date, row.party, row.objectName).joinToString("  ·  "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                        if (row.sum != null) Text(stringResource(R.string.t14_sum_both, formatMoney(row.sum), formatMoney(row.sumVat)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text((if (row.income) "+" else "−") + formatQty(row.qty) + " " + row.unit, style = MaterialTheme.typography.titleSmall, color = if (row.income) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary)
                }
            }
        }
        if (r.totalRows > r.rows.size) item { Text(stringResource(R.string.t14_report_more, r.rows.size, r.totalRows), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun Totals(r: Report) {
    val t = r.totals
    WorkCard {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text((r.from ?: "…") + " – " + (r.to ?: "…"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.t14_tot_in, t.incomeCount) + units(t.units) { it.income }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            if (t.incomeSum != null) Text(stringResource(R.string.t14_sum_both, formatMoney(t.incomeSum), formatMoney(t.incomeSumVat)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (t.unpriced > 0) Text(stringResource(R.string.t14_unpriced, t.unpriced), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary)
            Text(stringResource(R.string.t14_tot_out, t.expenseCount) + units(t.units) { it.expense }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
            if (t.expenseSum != null) Text(stringResource(R.string.t14_sum_both, formatMoney(t.expenseSum), formatMoney(t.expenseSumVat)), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun units(list: List<UnitTotal>, pick: (UnitTotal) -> Double): String =
    list.filter { pick(it) > 0 }.joinToString(", ", prefix = ": ") { formatQty(pick(it)) + " " + it.unit }.let { if (it == ": ") "" else it }

/** The clarifying question of the server with its answer buttons (kirim / chiqim, which supplier, which material). One tap sends the answer. */
@Composable
internal fun QuestionDialog(q: AskQuestion, working: Boolean, onAnswer: (AskOption) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.t14_question_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                q.heard?.let { Text(stringResource(R.string.ombor_cmd_heard, it), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(q.text.ifBlank { stringResource(R.string.t14_question_generic) }, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
                if (q.options.isEmpty()) Text(stringResource(R.string.t14_question_type), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                q.options.forEach { o ->
                    androidx.compose.material3.FilledTonalButton(onClick = { onAnswer(o) }, enabled = !working, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(o.label, maxLines = 2) }
                }
                if (working) CircularProgressIndicator(Modifier.padding(top = 4.dp), strokeWidth = 2.dp)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.p8_cancel)) } },
    )
}
