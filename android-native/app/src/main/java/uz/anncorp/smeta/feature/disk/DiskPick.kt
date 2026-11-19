package uz.anncorp.smeta.feature.disk

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.screens.QDiskPickDialog
import uz.anncorp.qurai.ui.screens.QDiskRow
import uz.anncorp.qurai.ui.screens.QDiskState
import uz.anncorp.qurai.ui.screens.QDiskTab
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.WorkContext
import javax.inject.Inject

/** The browsing state of "Diskdan tanlash": the same [DiskController] the Disk screen uses (so folders, tabs and permissions behave identically), read-only here. */
@HiltViewModel
class DiskPickViewModel @Inject constructor(api: BffApi, ctx: WorkContext) : ViewModel() {
    val disk = DiskController(DiskRepository(api), viewModelScope) { ctx.current.value?.companyId }
    init { disk.reload() }
}

private val IMAGE_EXT = setOf("jpg", "jpeg", "png", "webp")

/**
 * "Diskdan tanlash": pick a file that already lives in the Disk and hand its bytes to the screen that attaches files ([onPicked] gets name, MIME, bytes).
 * [imagesOnly] hides other files (the photo flow). Nothing is written to the Disk here.
 */
@Composable
fun DiskPickDialog(imagesOnly: Boolean, onPicked: (String, String, ByteArray) -> Unit, onClose: () -> Unit, vm: DiskPickViewModel = hiltViewModel()) {
    val st by vm.disk.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var section by rememberSaveable { mutableStateOf("mine") }
    var fetching by remember { mutableStateOf(false) }
    val tabs = listOf(
        QDiskTab("mine", stringResource(R.string.qa2_disk_mine)), QDiskTab("company", stringResource(R.string.qa2_disk_company)), QDiskTab("shared", stringResource(R.string.qa2_disk_shared)),
    )
    val failed = stringResource(R.string.qa3_disk_n_failed)
    QDiskPickDialog(
        title = stringResource(R.string.qa4_disk_pick), close = stringResource(R.string.qa3_disk_close), tabs = tabs, selected = section,
        onTab = { id -> section = id; vm.disk.select(when (id) { "company" -> DiskTab.COMPANY; "shared" -> DiskTab.SHARED; else -> DiskTab.MINE }) },
        rows = st.rows.filter { !imagesOnly || it.folder || it.name.substringAfterLast('.', "").lowercase() in IMAGE_EXT }.map { QDiskRow(it.key, it.folder, it.name, it.sub, it.meta) },
        state = when (st.status) { DiskController.Status.LOADING -> QDiskState.Loading; DiskController.Status.READY -> QDiskState.Ready; DiskController.Status.FAILED -> QDiskState.Failed },
        onRow = { r ->
            val m = st.rows.firstOrNull { it.key == r.key }
            if (m != null && m.folder) { if (section != "shared") vm.disk.openFolder(m.id, m.name) }
            else if (m != null && !fetching) vm.disk.fileOf(m.key)?.let { f ->
                fetching = true
                scope.launch {
                    when (val b = vm.disk.bytesOf(f)) {
                        is DiskBytes.Ready -> onPicked(b.name, b.mime, b.bytes)
                        is DiskBytes.Failed -> Toast.makeText(context, failed, Toast.LENGTH_LONG).show()
                    }
                    fetching = false
                }
            }
        },
        crumbs = st.stack.takeIf { it.isNotEmpty() }?.joinToString(" / ") { it.name }, onUp = if (st.canGoUp) ({ vm.disk.up() }) else null, upLabel = stringResource(R.string.p1_back),
        emptyText = stringResource(R.string.qa2_disk_empty),
        errorText = stringResource(if (st.offline) R.string.err_network else if (st.forbidden) R.string.qa2_disk_forbidden else R.string.dl_load_failed),
        onRetry = { vm.disk.reload() }, busyText = if (fetching) stringResource(R.string.qa4_disk_picking) else null, onClose = onClose,
    )
}
