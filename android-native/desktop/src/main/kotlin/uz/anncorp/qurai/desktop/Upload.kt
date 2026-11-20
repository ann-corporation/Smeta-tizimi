package uz.anncorp.qurai.desktop

import uz.anncorp.qurai.ui.components.*

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
    var picking by remember { mutableStateOf(false) }
    // "Diskdan tanlash": a file already in the Disk goes through the same upload as a local one (no second path).
    fun attach(name: String, bytes: ByteArray) {
        if (busy) return
        scope.launch {
            busy = true; msg = null
            val photo = name.substringAfterLast('.', "").lowercase() in setOf("jpg", "jpeg", "png", "webp")
            val r = if (bytes.size > UPLOAD_MAX_BYTES) UploadResult.Error("12 MB dan katta.") else if (photo) up.uploadPhoto(c.place.companyId, objectId, name, bytes) else up.uploadDocument(c.place.companyId, objectId, name, bytes)
            when (r) {
                is UploadResult.Done -> { ok = true; msg = "Yuklandi: $name"; onUploaded() }
                is UploadResult.Error -> { ok = false; msg = r.message }
            }
            busy = false
        }
    }
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
    if (picking) DiskPickDialog(c, onPicked = { n, b -> picking = false; attach(n, b) }, onClose = { picking = false })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        QPrimaryButton(onClick = { run(true) }, enabled = !busy) { Text("Foto yuklash") }
        QSecondaryButton(onClick = { run(false) }, enabled = !busy) { Text("Fayl yuklash") }
        QSecondaryButton(onClick = { picking = true }, enabled = !busy) { Text(I18n.s("qa4_disk_pick", "Diskdan tanlash")) }
        if (busy) Text("Yuklanmoqda...", style = MaterialTheme.typography.labelMedium)
        msg?.let { Text(it, color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium) }
    }
}

/** "Diskdan tanlash" for the Windows app: browses the Disk (same controller as the Disk page) and returns the tapped file's bytes. */
@Composable
fun DiskPickDialog(c: Ctx, onPicked: (String, ByteArray) -> Unit, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val ctl = remember(c.place.companyId) { uz.anncorp.smeta.feature.disk.DiskController(uz.anncorp.smeta.feature.disk.DiskRepository(c.sv.api), scope) { c.place.companyId }.also { it.reload() } }
    val st by ctl.state.collectAsState()
    var section by remember { mutableStateOf("mine") }
    var fetching by remember { mutableStateOf(false) }
    val tabs = listOf(
        uz.anncorp.qurai.ui.screens.QDiskTab("mine", I18n.s("qa2_disk_mine", "Mening diskim")), uz.anncorp.qurai.ui.screens.QDiskTab("company", I18n.s("qa2_disk_company", "Kompaniya diski")),
        uz.anncorp.qurai.ui.screens.QDiskTab("shared", I18n.s("qa2_disk_shared", "Ulashilgan")),
    )
    uz.anncorp.qurai.ui.screens.QDiskPickDialog(
        title = I18n.s("qa4_disk_pick", "Diskdan tanlash"), close = I18n.s("qa3_disk_close", "Yopish"), tabs = tabs, selected = section,
        onTab = { id -> section = id; ctl.select(when (id) { "company" -> uz.anncorp.smeta.feature.disk.DiskTab.COMPANY; "shared" -> uz.anncorp.smeta.feature.disk.DiskTab.SHARED; else -> uz.anncorp.smeta.feature.disk.DiskTab.MINE }) },
        rows = st.rows.map { uz.anncorp.qurai.ui.screens.QDiskRow(it.key, it.folder, it.name, it.sub, it.meta) },
        state = when (st.status) {
            uz.anncorp.smeta.feature.disk.DiskController.Status.LOADING -> uz.anncorp.qurai.ui.screens.QDiskState.Loading
            uz.anncorp.smeta.feature.disk.DiskController.Status.READY -> uz.anncorp.qurai.ui.screens.QDiskState.Ready
            uz.anncorp.smeta.feature.disk.DiskController.Status.FAILED -> uz.anncorp.qurai.ui.screens.QDiskState.Failed
        },
        onRow = { r ->
            val m = st.rows.firstOrNull { it.key == r.key }
            if (m != null && m.folder) { if (section != "shared") ctl.openFolder(m.id, m.name) }
            else if (m != null && !fetching) ctl.fileOf(m.key)?.let { f ->
                fetching = true
                scope.launch {
                    when (val b = ctl.bytesOf(f)) {
                        is uz.anncorp.smeta.feature.disk.DiskBytes.Ready -> onPicked(b.name, b.bytes)
                        is uz.anncorp.smeta.feature.disk.DiskBytes.Failed -> {}
                    }
                    fetching = false
                }
            }
        },
        crumbs = st.stack.takeIf { it.isNotEmpty() }?.joinToString(" / ") { it.name }, onUp = if (st.canGoUp) ({ ctl.up() }) else null, upLabel = I18n.s("p1_back", "Orqaga"),
        emptyText = I18n.s("qa2_disk_empty", "Bu yerda hali hech narsa yo'q"), errorText = if (st.offline) Tx.offlineWrite else I18n.s("qa3_disk_n_failed", "Yuklab bo'lmadi"),
        onRetry = { ctl.reload() }, busyText = if (fetching) I18n.s("qa4_disk_picking", "Fayl olinmoqda...") else null, onClose = onClose,
    )
}