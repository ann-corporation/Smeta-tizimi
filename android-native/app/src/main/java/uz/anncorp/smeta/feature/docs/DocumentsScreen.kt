package uz.anncorp.smeta.feature.docs

import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.SaveAlt
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
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
import uz.anncorp.smeta.core.data.DocItem
import uz.anncorp.smeta.core.data.DocKind
import uz.anncorp.smeta.core.data.DocType
import uz.anncorp.smeta.core.data.DocumentsRepository
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.OpenResult
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.ui.EmptyState
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.UpdatedLine
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

/** A document opened in the in-app viewer. The bytes live only in memory (and, encrypted, in the cache). */
class Viewing(val doc: DocItem, val name: String, val mime: String, val bytes: ByteArray)

data class DocsUi(
    val name: String = "",
    val docs: List<DocItem>? = null,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val f2Only: Boolean = false,
    val opening: Long? = null,
    val viewing: Viewing? = null,
    val error: Int? = null,
    val cached: Set<Long> = emptySet(),
) {
    val shown: List<DocItem>? get() = docs?.let { d -> if (f2Only) d.filter { it.isF2 } else d }
}

@HiltViewModel
class DocumentsViewModel @Inject constructor(handle: SavedStateHandle, objects: ObjectsRepository, private val repo: DocumentsRepository, private val ctx: WorkContext) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val local = MutableStateFlow(DocsUi(f2Only = handle.get<Boolean>("f2") == true))

    val state: StateFlow<DocsUi> = combine(repo.observe(id), objects.observeOne(id), repo.lastUpdated(id), local) { docs, o, ts, l ->
        val companyId = ctx.current.value?.companyId
        l.copy(name = o?.nom.orEmpty(), docs = docs, updatedAt = ts, cached = if (companyId == null) emptySet() else docs.orEmpty().filter { repo.isCached(companyId, it) }.map { it.id }.toSet())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DocsUi())

    init { refresh() }

    fun refresh() {
        val companyId = ctx.current.value?.companyId ?: run { local.update { it.copy(syncing = false, result = SyncResult.Failed("NO_COMPANY")) }; return }
        viewModelScope.launch {
            local.update { it.copy(syncing = true, result = null) }
            val r = repo.refresh(companyId, id)
            local.update { it.copy(syncing = false, result = r) }
        }
    }

    fun setF2Only(v: Boolean) = local.update { it.copy(f2Only = v) }
    fun dismissError() = local.update { it.copy(error = null) }
    fun closeViewer() = local.update { it.copy(viewing = null) }

    fun open(doc: DocItem) {
        val companyId = ctx.current.value?.companyId ?: return
        if (local.value.opening != null) return
        local.update { it.copy(opening = doc.id, error = null) }
        viewModelScope.launch {
            val r = repo.open(companyId, doc)
            local.update {
                when (r) {
                    is OpenResult.Ready -> it.copy(opening = null, viewing = Viewing(doc, r.name, r.mime, r.bytes))
                    OpenResult.Offline -> it.copy(opening = null, error = R.string.docs_err_offline)
                    OpenResult.PaymentRequired -> it.copy(opening = null, error = R.string.docs_err_pay)
                    OpenResult.Forbidden -> it.copy(opening = null, error = R.string.docs_err_forbidden)
                    OpenResult.Missing -> it.copy(opening = null, error = R.string.docs_err_missing)
                    OpenResult.TooLarge -> it.copy(opening = null, error = R.string.docs_err_big)
                    is OpenResult.Failed -> it.copy(opening = null, error = R.string.docs_err_generic)
                }
            }
        }
    }
}

@Composable
fun DocumentsScreen(onBack: () -> Unit, vm: DocumentsViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val viewing = ui.viewing
    if (viewing != null) {
        BackHandler { vm.closeViewer() }
        DocViewer(viewing, onBack = vm::closeViewer)
        return
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.docs_title) + if (ui.name.isNotBlank()) " · " + ui.name else "", onBack)
        DocsList(ui, vm)
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun DocsList(ui: DocsUi, vm: DocumentsViewModel) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = !ui.f2Only, onClick = { vm.setF2Only(false) }, label = { Text(stringResource(R.string.docs_filter_all)) })
        FilterChip(selected = ui.f2Only, onClick = { vm.setF2Only(true) }, label = { Text(stringResource(R.string.docs_filter_f2)) })
    }
    ui.error?.let { msg ->
        Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp, 16.dp, 0.dp)) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(msg), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.weight(1f))
                androidx.compose.material3.TextButton(onClick = vm::dismissError) { Text(stringResource(R.string.docs_dismiss)) }
            }
        }
    }
    PullToRefreshBox(isRefreshing = ui.syncing && ui.docs != null, onRefresh = { vm.refresh() }, modifier = Modifier.fillMaxSize()) {
        val docs = ui.shown
        when {
            ui.docs == null && ui.syncing -> SkeletonList(4)
            ui.docs == null -> when (ui.result) {
                is SyncResult.Forbidden -> EmptyState(Icons.Filled.Lock, stringResource(R.string.f2_forbidden), stringResource(R.string.f2_forbidden_body))
                else -> EmptyState(Icons.Filled.Warning, stringResource(R.string.err_server), stringResource(R.string.err_network), stringResource(R.string.retry)) { vm.refresh() }
            }
            docs.isNullOrEmpty() -> EmptyState(Icons.Outlined.Description, stringResource(if (ui.f2Only) R.string.docs_empty_f2 else R.string.docs_empty), stringResource(R.string.docs_empty_hint))
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp, 8.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(docs, key = { it.id }) { d -> DocCard(d, cached = d.id in ui.cached, opening = ui.opening == d.id) { vm.open(d) } }
                item { UpdatedLine(ui.updatedAt, Modifier.padding(top = 4.dp)) }
            }
        }
    }
}

@Composable
private fun docIcon(k: DocKind) = when (k) {
    DocKind.PDF -> Icons.Outlined.PictureAsPdf
    DocKind.IMAGE -> Icons.Outlined.Image
    DocKind.SHEET -> Icons.Outlined.TableChart
    DocKind.OTHER -> Icons.Outlined.Description
}

@Composable
private fun typeLabel(t: DocType): String = stringResource(
    when (t) { DocType.F2 -> R.string.docs_type_f2; DocType.F3 -> R.string.docs_type_f3; DocType.PACK -> R.string.docs_type_pack; DocType.OTHER -> R.string.docs_type_other },
)

@Composable
private fun DocCard(d: DocItem, cached: Boolean, opening: Boolean, onClick: () -> Unit) {
    WorkCard(onClick = if (d.ready) onClick else null, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(docIcon(d.kind), null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(d.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(typeLabel(d.docType), formatBytes(d.size).takeIf { d.size > 0 }, dateLabel(d.updatedAt)).joinToString("  ·  "),
                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!d.ready) Text(stringResource(R.string.docs_pending), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                else if (cached) Text(stringResource(R.string.docs_cached), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
            }
            if (opening) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else if (d.ready) Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** "1,2 MB" style size. Pure. */
internal fun formatBytes(n: Long): String = when {
    n >= 1024 * 1024 -> String.format(java.util.Locale.ROOT, "%.1f MB", n / 1048576.0).replace('.', ',')
    n >= 1024 -> "${n / 1024} KB"
    else -> "$n B"
}

/** "2026-11-15T10:20:00+00:00" -> "15.11.2026". Pure. */
internal fun dateLabel(iso: String): String? =
    Regex("^(\\d{4})-(\\d{2})-(\\d{2})").find(iso)?.let { "${it.groupValues[3]}.${it.groupValues[2]}.${it.groupValues[1]}" }

// ---------- viewer ----------

@Composable
private fun DocViewer(v: Viewing, onBack: () -> Unit) {
    val context = LocalContext.current
    val savedMsg = stringResource(R.string.docs_saved)
    val noApp = stringResource(R.string.docs_no_app)
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(v.mime.ifBlank { "application/octet-stream" })) { uri ->
        if (uri != null) runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(v.bytes) } }.onSuccess { Toast.makeText(context, savedMsg, Toast.LENGTH_SHORT).show() }
    }
    DisposableEffect(Unit) { onDispose { DocFiles.cleanup(context) } }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(v.name, onBack) {
            IconButton(onClick = { save.launch(safeName(v)) }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.Filled.SaveAlt, stringResource(R.string.docs_save)) }
            IconButton(onClick = { DocFiles.share(context, v.name, v.mime, v.bytes) }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.Filled.Share, stringResource(R.string.docs_share)) }
        }
        when (kindOfBytes(v)) {
            DocKind.PDF -> PdfPages(v.bytes) { NoPreview(v, noApp) }
            DocKind.IMAGE -> ImageBody(v) { NoPreview(v, noApp) }
            else -> NoPreview(v, noApp)
        }
    }
}

private fun safeName(v: Viewing) = uz.anncorp.smeta.core.data.safeFileName(v.name, "hujjat")

/** The registry type and the real response type can differ (e.g. a generic octet-stream): trust what the bytes say first. */
private fun kindOfBytes(v: Viewing): DocKind {
    val b = v.bytes
    if (b.size > 4 && b[0] == '%'.code.toByte() && b[1] == 'P'.code.toByte() && b[2] == 'D'.code.toByte() && b[3] == 'F'.code.toByte()) return DocKind.PDF
    return uz.anncorp.smeta.core.data.docKind(v.mime, v.name)
}

@Composable
private fun NoPreview(v: Viewing, noApp: String) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(docIcon(v.doc.kind), null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(56.dp))
        Spacer(Modifier.height(12.dp))
        Text(v.name, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.docs_no_preview), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        Button(onClick = { if (!DocFiles.openWith(context, v.name, v.mime, v.bytes)) Toast.makeText(context, noApp, Toast.LENGTH_SHORT).show() }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
            Text(stringResource(R.string.docs_open_with))
        }
        OutlinedButton(onClick = { DocFiles.share(context, v.name, v.mime, v.bytes) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).padding(top = 8.dp)) {
            Text(stringResource(R.string.docs_share))
        }
    }
}

@Composable
private fun ImageBody(v: Viewing, fallback: @Composable () -> Unit) {
    val bmp = remember(v) { runCatching { BitmapFactory.decodeByteArray(v.bytes, 0, v.bytes.size) }.getOrNull() }
    if (bmp == null) fallback() else Box(Modifier.fillMaxSize()) {
        Image(bmp.asImageBitmap(), null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun PdfPages(bytes: ByteArray, fallback: @Composable () -> Unit) {
    val context = LocalContext.current
    var failed by remember(bytes) { mutableStateOf(false) }
    var doc by remember(bytes) { mutableStateOf<PdfDoc?>(null) }
    androidx.compose.runtime.LaunchedEffect(bytes) { val opened = PdfDoc.open(context, bytes); if (opened == null) failed = true else doc = opened }
    DisposableEffect(bytes) { onDispose { doc?.close() } }
    val d = doc
    when {
        failed -> fallback()
        d == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> BoxWithConstraints(Modifier.fillMaxSize()) {
            val widthPx = with(LocalDensity.current) { (maxWidth - 16.dp).roundToPx() }
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(List(d.pageCount) { it }) { _, index ->
                    var shown by remember(d, index, widthPx) { mutableStateOf<android.graphics.Bitmap?>(null) }
                    androidx.compose.runtime.LaunchedEffect(d, index, widthPx) { shown = d.render(index, widthPx) }
                    val bitmap = shown
                    Surface(color = androidx.compose.ui.graphics.Color.White, shape = MaterialTheme.shapes.small, modifier = Modifier.fillMaxWidth()) {
                        if (bitmap == null) Box(Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }
                        else Image(bitmap.asImageBitmap(), stringResource(R.string.docs_page_of, index + 1, d.pageCount), contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        }
    }
}
