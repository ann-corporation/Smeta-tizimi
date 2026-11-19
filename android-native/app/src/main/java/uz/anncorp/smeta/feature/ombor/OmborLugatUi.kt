package uz.anncorp.smeta.feature.ombor

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.ui.TouchTarget
import javax.inject.Inject

data class LugatUi(val type: LugatType = LugatType.MATERIAL, val rows: List<LugatRow>? = null, val error: String? = null, val busy: Boolean = false, val toast: Int? = null, val toastText: String? = null)

/** Same screen and server calls as the site tab «Ombor lugati» (lugat_royxat / lugat_tahrir through /api/ombor-buyruq). */
@HiltViewModel
class OmborLugatViewModel @Inject constructor(private val api: BffApi, private val ctx: WorkContext) : ViewModel() {
    private val _ui = MutableStateFlow(LugatUi())
    val ui: StateFlow<LugatUi> = _ui
    private var skladId: Long? = null
    private fun cid() = ctx.current.value?.companyId

    fun load(sklad: Long?) { skladId = sklad; reload() }
    fun setType(t: LugatType) { _ui.update { it.copy(type = t, rows = null) }; reload() }
    fun consumeToast() = _ui.update { it.copy(toast = null, toastText = null) }

    private fun reload() {
        val c = cid() ?: return; val s = skladId ?: return
        val t = _ui.value.type
        viewModelScope.launch {
            val r = api.bff(COMMAND_PATH, "POST", lugatListBody(c, s, t))
            val rows = if (r.ok) parseLugat(r.body) else null
            _ui.update { if (it.type != t) it else if (rows == null) it.copy(rows = emptyList(), error = lugatError(r) ?: "BAD_SHAPE") else it.copy(rows = rows, error = null) }
        }
    }

    fun run(a: LugatAction, done: Int, onOk: () -> Unit = {}) {
        val c = cid() ?: return; val s = skladId ?: return
        if (!lugatActionValid(a) || _ui.value.busy) return
        viewModelScope.launch {
            _ui.update { it.copy(busy = true) }
            val e = lugatError(api.bff(COMMAND_PATH, "POST", lugatEditBody(c, s, a)))
            _ui.update { it.copy(busy = false, toast = if (e == null) done else null, toastText = e) }
            if (e == null) { onOk(); reload() }
        }
    }
}

@Composable
fun OmborLugatPanel(skladId: Long?, canWrite: Boolean, vm: OmborLugatViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(skladId) { vm.load(skladId) }
    ui.toast?.let { r -> val t = stringResource(r); LaunchedEffect(r) { Toast.makeText(context, t, Toast.LENGTH_SHORT).show(); vm.consumeToast() } }
    ui.toastText?.let { t -> LaunchedEffect(t) { Toast.makeText(context, t, Toast.LENGTH_LONG).show(); vm.consumeToast() } }
    var picked by remember { mutableStateOf(setOf<Long>()) }
    var editing by remember { mutableStateOf<Pair<Long, String>?>(null) }
    var merged by remember { mutableStateOf("") }
    var phrase by remember { mutableStateOf("") }
    var canon by remember { mutableStateOf("") }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text(stringResource(R.string.ol_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(ui.type == LugatType.MATERIAL, { picked = emptySet(); vm.setType(LugatType.MATERIAL) }, label = { Text(stringResource(R.string.ol_material)) })
                FilterChip(ui.type == LugatType.SUPPLIER, { picked = emptySet(); vm.setType(LugatType.SUPPLIER) }, label = { Text(stringResource(R.string.ol_supplier)) })
            }
        }
        ui.error?.let { e -> item { Text(if (e == "MIGRATSIYA_YOQ") stringResource(R.string.ol_notlinked) else e, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary) } }
        if (ui.rows != null && ui.rows!!.isEmpty() && ui.error == null) item { Text(stringResource(R.string.ol_empty), style = MaterialTheme.typography.bodySmall) }
        items(ui.rows.orEmpty(), key = { it.id }) { q ->
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (canWrite) Checkbox(q.id in picked, { picked = if (q.id in picked) picked - q.id else picked + q.id })
                    Column(Modifier.weight(1f)) {
                        Text(q.phrase, style = MaterialTheme.typography.bodyMedium)
                        Text(stringResource(R.string.ol_name) + ": " + q.canonical + " · " + stringResource(R.string.ol_used) + ": " + q.used, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (canWrite) {
                    val e = editing
                    if (e?.first == q.id) {
                        OutlinedTextField(e.second, { editing = q.id to it.take(500) }, label = { Text(stringResource(R.string.ol_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { vm.run(LugatAction.Rename(q.id, e.second), R.string.ol_saved) { editing = null } }, enabled = !ui.busy && e.second.isNotBlank(), modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.ol_save)) }
                            OutlinedButton(onClick = { editing = null }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.ol_cancel)) }
                        }
                    } else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { editing = q.id to q.canonical }, enabled = !ui.busy) { Text(stringResource(R.string.ol_rename)) }
                        TextButton(onClick = { vm.run(LugatAction.Delete(q.id), R.string.ol_removed) }, enabled = !ui.busy) { Text(stringResource(R.string.ol_remove)) }
                    }
                }
            }
        }
        if (canWrite && picked.size > 1) item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(merged, { merged = it.take(500) }, label = { Text(stringResource(R.string.ol_merge_name)) }, singleLine = true, modifier = Modifier.weight(1f))
                Button(onClick = { vm.run(LugatAction.Merge(picked.toList(), merged), R.string.ol_merged) { picked = emptySet(); merged = "" } }, enabled = !ui.busy && merged.isNotBlank(), modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.ol_merge) + " (${picked.size})") }
            }
        }
        if (canWrite) item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(phrase, { phrase = it.take(200) }, label = { Text(stringResource(R.string.ol_phrase)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(canon, { canon = it.take(500) }, label = { Text(stringResource(R.string.ol_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Button(onClick = { vm.run(LugatAction.Add(ui.type, phrase, canon), R.string.ol_added) { phrase = ""; canon = "" } }, enabled = !ui.busy && phrase.isNotBlank() && canon.isNotBlank(), modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.ol_add)) }
            }
        }
    }
}
