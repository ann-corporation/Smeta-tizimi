package uz.anncorp.qurai.desktop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uz.anncorp.smeta.core.data.EvidenceUploader
import uz.anncorp.smeta.core.data.UPLOAD_MAX_BYTES
import uz.anncorp.smeta.core.data.UploadResult

/** Upload of a fact photo / object file to the selected object: same /api/mobil/yukla flow as Android (logic in :shared EvidenceUploader). Online only. */
@Composable
fun UploadBar(c: Ctx, objectId: Long, onUploaded: () -> Unit = {}) {
    val up = remember(c.sv) { EvidenceUploader(c.sv.api) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var ok by remember { mutableStateOf(false) }
    fun run(photo: Boolean) {
        if (busy) return
        val f = pickFile(if (photo) "Foto tanlang" else "Fayl tanlang", imagesOnly = photo) ?: return
        scope.launch {
            busy = true; msg = null
            val bytes = withContext(Dispatchers.IO) { runCatching { if (f.length() > UPLOAD_MAX_BYTES) null else f.readBytes() }.getOrNull() }
            val r = if (bytes == null) UploadResult.Error("Faylni o'qib bo'lmadi yoki 12 MB dan katta.")
            else if (photo) up.uploadPhoto(c.place.companyId, objectId, f.name, bytes) else up.uploadDocument(c.place.companyId, objectId, f.name, bytes)
            when (r) {
                is UploadResult.Done -> { ok = true; msg = "Yuklandi: ${f.name}"; onUploaded() }
                is UploadResult.Error -> { ok = false; msg = r.message }
            }
            busy = false
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Button(onClick = { run(true) }, enabled = !busy) { Text("Foto yuklash") }
        OutlinedButton(onClick = { run(false) }, enabled = !busy) { Text("Fayl yuklash") }
        if (busy) Text("Yuklanmoqda...", style = MaterialTheme.typography.labelMedium)
        msg?.let { Text(it, color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium) }
    }
}