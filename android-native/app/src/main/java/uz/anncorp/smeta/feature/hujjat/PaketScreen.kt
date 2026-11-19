package uz.anncorp.smeta.feature.hujjat

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.GenResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.safeFileName
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.feature.docs.DocFiles
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.inject.Inject

data class PaketUi(
    val filter: PaketFilter = PaketFilter(), val rows: List<PaketRow> = emptyList(), val total: Int = 0, val allKeys: List<String> = emptyList(),
    val variants: PaketVariants? = null, val selected: Set<String> = emptySet(), val loading: Boolean = false, val error: Boolean = false,
    val saved: List<SavedFilter> = emptyList(), val progress: String? = null, val message: Int? = null, val rawMessage: String? = null,
)

/** Same flow as the site page HujjatPaket.tsx: server filter + paging, pick, one button "Yuklab olish". Nothing is built on the device. */
@HiltViewModel
class PaketViewModel @Inject constructor(api: BffApi, private val ctx: WorkContext) : ViewModel() {
    private val repo = PaketRepository(api)
    private val _ui = MutableStateFlow(PaketUi())
    val ui: StateFlow<PaketUi> = _ui
    private var first = true
    private fun cid() = ctx.current.value?.companyId

    init { load(); loadSaved() }

    fun setFilter(f: PaketFilter) { _ui.update { it.copy(filter = f) }; load() }

    fun load() {
        val c = cid() ?: return
        viewModelScope.launch {
            _ui.update { it.copy(loading = true, error = false) }
            val p = repo.page(c, _ui.value.filter, 0, variants = first)
            if (p == null) { _ui.update { it.copy(loading = false, error = true, rows = emptyList(), total = 0, allKeys = emptyList()) }; return@launch }
            first = false
            _ui.update { it.copy(loading = false, rows = p.rows, total = p.total, allKeys = p.allKeys, variants = p.variants ?: it.variants, selected = it.selected.filter { k -> k in p.allKeys }.toSet()) }
        }
    }

    fun more() {
        val c = cid() ?: return
        viewModelScope.launch { repo.page(c, _ui.value.filter, _ui.value.rows.size)?.let { p -> _ui.update { u -> u.copy(rows = u.rows + p.rows.filter { r -> u.rows.none { x -> x.key == r.key } }) } } }
    }

    private fun loadSaved() { val c = cid() ?: return; viewModelScope.launch { val s = repo.saved(c); _ui.update { it.copy(saved = s) } } }

    fun saveFilter(name: String) {
        val c = cid() ?: return
        if (name.isBlank()) { _ui.update { it.copy(message = R.string.pk_fname_ask) }; return }
        viewModelScope.launch { val ok = repo.save(c, name.trim(), _ui.value.filter); _ui.update { it.copy(message = if (ok) R.string.pk_f_saved else R.string.pk_f_notsaved) }; if (ok) loadSaved() }
    }
    fun deleteSaved(id: Long) { val c = cid() ?: return; viewModelScope.launch { repo.delete(c, id); loadSaved() } }

    fun toggle(key: String) = _ui.update { it.copy(selected = if (key in it.selected) it.selected - key else it.selected + key) }
    fun selectAll() = _ui.update { it.copy(selected = it.allKeys.toSet()) }
    fun selectNone() = _ui.update { it.copy(selected = emptySet()) }
    fun clearMessage() = _ui.update { it.copy(message = null, rawMessage = null) }

    /** Result of "Yuklab olish": one file is shared as is, several go into one ZIP (Disk copy first = free; the rest through the server engine). */
    fun download(onReady: (String, String, ByteArray) -> Unit) {
        val c = cid() ?: return
        val u = _ui.value
        if (u.selected.isEmpty()) { _ui.update { it.copy(message = R.string.pk_nosel) }; return }
        viewModelScope.launch {
            val picked = u.rows.filter { it.key in u.selected && it.selectable }
            _ui.update { it.copy(progress = "0/${picked.size}") }
            val files = ArrayList<Triple<PaketRow, String, ByteArray>>(); var errors = 0; var done = 0
            for (r in picked) {
                when (val g = repo.fetch(c, r)) { is GenResult.Ready -> files += Triple(r, g.name, g.bytes); else -> errors++ }
                done++; _ui.update { it.copy(progress = "$done/${picked.size}") }
            }
            _ui.update { it.copy(progress = null) }
            if (files.isEmpty()) { _ui.update { it.copy(message = R.string.pk_failed) }; return@launch }
            if (files.size == 1) onReady(files[0].second, "application/octet-stream", files[0].third)
            else {
                val bos = ByteArrayOutputStream()
                ZipOutputStream(bos).use { z -> val used = HashSet<String>(); files.forEach { (r, name, bytes) -> var p = paketTurLabel(r.type) + "/" + safeFileName(name, "hujjat"); var i = 2; while (!used.add(p)) p = paketTurLabel(r.type) + "/" + (i++) + "_" + safeFileName(name, "hujjat"); z.putNextEntry(ZipEntry(p)); z.write(bytes); z.closeEntry() } }
                onReady("hujjatlar-paketi.zip", "application/zip", bos.toByteArray())
            }
            _ui.update { it.copy(message = R.string.pk_ready) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun PaketScreen(onBack: () -> Unit, vm: PaketViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val f = ui.filter
    var query by remember { mutableStateOf("") }
    var fname by remember { mutableStateOf("") }
    var contractMenu by remember { mutableStateOf(false) }
    val objects = ui.variants?.objects.orEmpty().filter { f.shartnomaId == null || it.third == f.shartnomaId }.map { it.first to (it.second ?: "#${it.first}") }
    fun objName(id: Long) = ui.variants?.objects?.firstOrNull { it.first == id }?.second ?: "#$id"
    ui.message?.let { m -> val t = stringResource(m); androidx.compose.runtime.LaunchedEffect(m) { Toast.makeText(context, t, Toast.LENGTH_SHORT).show(); vm.clearMessage() } }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.pk_title), onBack, actions = { IconButton(onClick = { vm.load() }) { Icon(Icons.Filled.Refresh, stringResource(R.string.pk_refresh)) } })
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 4.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { Text(stringResource(R.string.pk_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box {
                        OutlinedButton(onClick = { contractMenu = true }) { Text(stringResource(R.string.pk_contract) + ": " + (ui.variants?.contracts?.firstOrNull { it.first == f.shartnomaId }?.let { "№${it.second ?: it.first}" } ?: stringResource(R.string.pk_all))) }
                        DropdownMenu(contractMenu, { contractMenu = false }) {
                            DropdownMenuItem(text = { Text(stringResource(R.string.pk_all)) }, onClick = { contractMenu = false; vm.setFilter(f.copy(shartnomaId = null, obyektIds = emptyList())) })
                            ui.variants?.contracts.orEmpty().forEach { (id, no) -> DropdownMenuItem(text = { Text("№${no ?: id}") }, onClick = { contractMenu = false; vm.setFilter(f.copy(shartnomaId = id, obyektIds = emptyList())) }) }
                        }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(f.oyDan, { vm.setFilter(monthEdit(f, it, f.oyGacha)) }, label = { Text(stringResource(R.string.pk_from)) }, placeholder = { Text("YYYY-MM") }, singleLine = true, isError = f.oyDan.isNotBlank() && !isMonth(f.oyDan), modifier = Modifier.weight(1f))
                    OutlinedTextField(f.oyGacha, { vm.setFilter(monthEdit(f, f.oyDan, it)) }, label = { Text(stringResource(R.string.pk_to)) }, placeholder = { Text("YYYY-MM") }, singleLine = true, isError = f.oyGacha.isNotBlank() && !isMonth(f.oyGacha), modifier = Modifier.weight(1f))
                }
            }
            item {
                Text(stringResource(R.string.pk_object) + ":", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { f.obyektIds.forEach { id -> FilterChip(true, { vm.setFilter(f.copy(obyektIds = f.obyektIds - id)) }, label = { Text(objName(id) + " ×") }) } }
                OutlinedTextField(query, { query = it }, label = { Text(stringResource(R.string.pk_object_search)) }, placeholder = { Text(stringResource(R.string.pk_object_ph)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                searchObjects(objects, query, f.obyektIds).forEach { (id, nom) -> TextButton(onClick = { vm.setFilter(f.copy(obyektIds = f.obyektIds + id)); query = "" }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(nom) } }
            }
            item {
                Text(stringResource(R.string.pk_type) + ":", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { PAKET_TURLAR.forEach { t -> FilterChip(t in f.turlar, { vm.setFilter(f.copy(turlar = if (t in f.turlar) f.turlar - t else f.turlar + t)) }, label = { Text(paketTurLabel(t)) }) } }
                Text(stringResource(R.string.pk_status) + ":", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PAKET_HOLATLAR.forEach { h -> FilterChip(h in f.holatlar, { vm.setFilter(f.copy(holatlar = if (h in f.holatlar) f.holatlar - h else f.holatlar + h)) }, label = { Text(stringResource(if (h == "tasdiqlangan") R.string.pk_st_approved else R.string.pk_st_draft)) }) }
                    if (!f.isEmpty) TextButton(onClick = { vm.setFilter(PaketFilter()) }) { Text(stringResource(R.string.pk_clear)) }
                }
            }
            item {
                Text(stringResource(R.string.pk_saved) + ":", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ui.saved.forEach { s -> FilterChip(false, { vm.setFilter(s.filter) }, label = { Text(s.name) }); TextButton(onClick = { vm.deleteSaved(s.id) }) { Text(stringResource(R.string.pk_delete) + ": " + s.name) } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(fname, { fname = it.take(60) }, label = { Text(stringResource(R.string.pk_fname)) }, placeholder = { Text(stringResource(R.string.pk_fname_ph)) }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedButton(onClick = { vm.saveFilter(fname); fname = "" }, enabled = !f.isEmpty && fname.isNotBlank()) { Text(stringResource(R.string.pk_save)) }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (ui.loading) stringResource(R.string.pk_loading) else stringResource(R.string.pk_found, ui.total), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = vm::selectAll, enabled = ui.allKeys.isNotEmpty()) { Text(stringResource(R.string.pk_sel_all)) }
                    TextButton(onClick = vm::selectNone, enabled = ui.selected.isNotEmpty()) { Text(stringResource(R.string.pk_sel_none)) }
                }
                if (!ui.loading && !ui.error && ui.rows.isEmpty()) Text(stringResource(R.string.pk_none), style = MaterialTheme.typography.bodySmall)
                if (ui.error) Text(stringResource(R.string.f2d_load_error), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            items(ui.rows, key = { it.key }) { r -> RowLine(r, r.key in ui.selected) { vm.toggle(r.key) } }
            if (ui.rows.size < ui.total) item { OutlinedButton(onClick = vm::more) { Text(stringResource(R.string.pk_more, minOf(PAKET_PAGE, ui.total - ui.rows.size))) } }
        }
        Button(
            onClick = { vm.download { name, mime, bytes -> DocFiles.share(context, name, mime, bytes) } }, enabled = ui.progress == null && ui.selected.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp).heightIn(min = TouchTarget),
        ) { Text(ui.progress?.let { "… $it" } ?: (stringResource(R.string.pk_download) + " (${ui.selected.size})")) }
    }
}

@Composable
private fun RowLine(r: PaketRow, checked: Boolean, onToggle: () -> Unit) {
    val dash = "—"
    val fresh = freshText(r)
    WorkCard(modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked, { onToggle() }, enabled = r.selectable)
            Column(Modifier.weight(1f)) {
                Text(listOf(r.objectName ?: dash, r.title, r.month ?: dash).joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
                val st = when (r.status) { "tasdiqlangan" -> stringResource(R.string.pk_st_approved); "qoralama" -> stringResource(R.string.pk_st_draft); else -> r.status ?: dash }
                Text(st + (if (r.duplicate) " (" + stringResource(R.string.pk_dup) + ")" else "") + " · " + fresh + (if (r.updating) " · " + stringResource(R.string.pk_updating) else ""), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun isMonth(s: String) = Regex("^\\d{4}-(0[1-9]|1[0-2])$").matches(s)

/** Site oyOraligi: both valid months -> a reversed range is swapped; a half-typed month is kept as typed (not sent until valid). */
private fun monthEdit(f: PaketFilter, dan: String, gacha: String): PaketFilter =
    if ((dan.isBlank() || isMonth(dan)) && (gacha.isBlank() || isMonth(gacha))) f.withMonths(dan, gacha) else f.copy(oyDan = dan, oyGacha = gacha)

@Composable
private fun freshText(r: PaketRow): String {
    if (r.queueState == "xato") return stringResource(R.string.pk_fresh_err)
    if (r.fileId == null) return stringResource(if (r.updating) R.string.pk_updating2 else R.string.pk_nodisk)
    val ms = r.updatedAt?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
    val ago = ms?.let { m -> val b = elapsedBucket(System.currentTimeMillis() - m); when (b?.first) { null -> "hozirgina"; "m" -> "${b.second} daqiqa oldin"; "h" -> "${b.second} soat oldin"; else -> "${b.second} kun oldin" } }
    return stringResource(if (r.updating) R.string.pk_old else R.string.pk_excel_ready) + (r.version?.let { " · v$it" } ?: "") + (ago?.let { " · $it" } ?: "")
}