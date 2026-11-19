package uz.anncorp.smeta.feature.jarvis

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.JarvisWarehouse
import uz.anncorp.smeta.core.data.JarvisWarehouseRequest
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.feature.ombor.searchKey

@Composable
internal fun JarvisWarehouseCard(frame: JarvisWarehouse, enabled: Boolean, onRequest: suspend (JarvisWarehouseRequest) -> ApiResult) {
    var warehouse by remember(frame) { mutableStateOf(frame.selectedId) }
    var result by remember(frame) { mutableStateOf(frame.result) }
    var query by remember(frame) { mutableStateOf(frame.question) }
    var choice by remember(frame) { mutableStateOf<JsonElement?>(null) }
    var mode by remember(frame) { mutableStateOf<String?>(null) }
    var extra by remember(frame) { mutableStateOf("") }
    var search by remember(frame) { mutableStateOf("") }
    var busy by remember(frame) { mutableStateOf(false) }
    var closed by remember(frame) { mutableStateOf(false) }
    var saved by remember(frame) { mutableStateOf(false) }
    var error by remember(frame) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val failed = stringResource(R.string.ombor_cmd_m_failed)
    val forbidden = stringResource(R.string.ombor_cmd_m_forbidden)
    val offline = stringResource(R.string.err_network)
    fun run(confirm: Boolean = false, id: Long? = warehouse, selection: JsonElement? = choice, priceMode: String? = mode, text: String = query) {
        if (!enabled || busy || closed || saved || id == null) return
        val request = frame.copy(selectedId = id, result = result).request(id, text, selection, priceMode, confirm) ?: return
        warehouse = id
        choice = selection
        mode = priceMode
        query = text
        busy = true
        error = null
        if (!confirm) result = null
        scope.launch {
            try {
                val reply = onRequest(request)
                val body = reply.body.obj()
                if (!reply.ok || (body?.get("ok") as? JsonPrimitive)?.booleanOrNull != true) {
                    error = when { reply.networkError -> offline; reply.status == 403 -> forbidden; else -> body?.get("xabar").str() ?: failed }
                } else if (confirm) saved = true else result = body
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { error = offline }
            finally { busy = false }
        }
    }
    if (closed) return
    if (saved) { Text(stringResource(R.string.p10_msg_saved)); return }
    val preview = result?.get("preview").obj()
    val ready = result?.get("holat").str() == "tasdiq_kerak"
    val modeAsk = (preview?.get("narx_rejim_sorov") as? JsonPrimitive)?.booleanOrNull == true
    val canAct = enabled && !busy
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (warehouse == null) {
            OutlinedTextField(search, { search = it }, label = { Text(stringResource(R.string.mod_warehouse)) }, enabled = canAct)
            frame.warehouses.filter { searchKey(it.name).contains(searchKey(search)) }.take(12).forEach { option ->
                TextButton(onClick = { run(id = option.id, selection = null, priceMode = null) }, enabled = canAct) { Text(option.name) }
            }
        } else {
            frame.warehouses.firstOrNull { it.id == warehouse }?.let { Text(it.name, style = MaterialTheme.typography.titleSmall) }
            if (preview != null) {
                Text(stringResource(if (preview["tur"].str() == "prixod") R.string.ombor_cmd_k_in else R.string.ombor_cmd_k_out))
                listOf("nomi", "sana", "kontragent", "obyekt", "izoh").forEach { key -> preview[key].str()?.takeIf { it.isNotBlank() }?.let { Text(it) } }
                if (preview["miqdor"].str() != null) Text(preview["miqdor"].str().orEmpty() + " " + preview["birligi"].str().orEmpty())
                if (preview["narx"].str() != null) Text(stringResource(R.string.ombor_cmd_price_both, preview["narx"].str() ?: "—", preview["narx_bilan"].str() ?: "—"))
                preview["ogohlantirish"].arr().orEmpty().forEach { warning -> warning.str()?.let { Text(it, color = MaterialTheme.colorScheme.error) } }
            }
            result?.get("savol").str()?.let { Text(it) }
            result?.get("nomzodlar").arr().orEmpty().forEach { item ->
                val candidate = item.obj()
                val name = candidate?.get("nomi").str()
                val unit = candidate?.get("birligi").str()
                if (name != null && unit != null) TextButton(onClick = {
                    val selection = JsonObject(choice.obj().orEmpty() + mapOf("nomi" to JsonPrimitive(name), "birligi" to JsonPrimitive(unit)))
                    run(selection = selection)
                }, enabled = canAct) { Text("$name · $unit") }
            }
            result?.get("variantlar").arr().orEmpty().forEach { item ->
                val variant = item.obj()
                val label = variant?.get("yorliq").str()
                val selection = variant?.get("tanlov")
                if (label != null && selection != null) TextButton(onClick = {
                    val merged = if (choice is JsonObject && selection is JsonObject) JsonObject(choice.obj().orEmpty() + selection) else selection
                    run(selection = merged)
                }, enabled = canAct) { Text(label) }
            }
            if (modeAsk) {
                Text(stringResource(R.string.ombor_cmd_price_mode_ask))
                TextButton(onClick = { run(priceMode = "bilan") }, enabled = canAct) { Text(stringResource(R.string.ombor_cmd_qqs_in)) }
                TextButton(onClick = { run(priceMode = "siz") }, enabled = canAct) { Text(stringResource(R.string.ombor_cmd_qqs_ex)) }
            }
            if (ready) TextButton(onClick = { run(confirm = true) }, enabled = canAct && !modeAsk) { Text(stringResource(R.string.ombor_cmd_save)) }
            else {
                OutlinedTextField(extra, { extra = it.take((999 - query.length).coerceAtLeast(0)) }, label = { Text(stringResource(R.string.ja_input)) }, enabled = canAct)
                TextButton(onClick = { run(text = query + "\n" + extra.trim()); extra = "" }, enabled = canAct && extra.isNotBlank()) { Text(stringResource(R.string.ja_send)) }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (error != null && !ready && warehouse != null) TextButton(onClick = { run() }, enabled = canAct) { Text(stringResource(R.string.retry)) }
        TextButton(onClick = { closed = true }, enabled = !busy) { Text(stringResource(android.R.string.cancel)) }
    }
}
