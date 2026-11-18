package uz.anncorp.smeta.feature.hub

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BusinessCenter
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Engineering
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderCopy
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.Catalog
import uz.anncorp.smeta.core.data.CatalogItem
import uz.anncorp.smeta.core.data.CatalogOpen
import uz.anncorp.smeta.core.data.CatalogRepository
import uz.anncorp.smeta.core.data.CatalogResult
import uz.anncorp.smeta.core.data.ModuleCatalog
import uz.anncorp.smeta.core.data.ModuleDef
import uz.anncorp.smeta.core.data.NativeTarget
import uz.anncorp.smeta.core.data.native
import uz.anncorp.smeta.core.data.nativeTarget
import uz.anncorp.smeta.core.data.withExtraModules
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.open
import uz.anncorp.smeta.core.data.search
import uz.anncorp.smeta.core.data.sections
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget
import java.util.Locale
import javax.inject.Inject

data class AllModulesUi(
    val loading: Boolean = true,
    val catalog: Catalog? = null,
    /** The shown catalogue is the offline copy (the server could not be reached). */
    val offlineCopy: Boolean = false,
    /** Nothing loaded and nothing cached. */
    val failed: Boolean = false,
)

/** Server catalogue of the selected workplace (cached copy first, refreshed on every workplace change). Shared by the hub search and the full screen. */
@HiltViewModel
class AllModulesViewModel @Inject constructor(private val repo: CatalogRepository, private val work: WorkContext) : ViewModel() {
    private val _state = MutableStateFlow(AllModulesUi())
    val state: StateFlow<AllModulesUi> = _state.asStateFlow()
    val query = MutableStateFlow("")

    init {
        viewModelScope.launch { work.current.map { it?.companyId }.distinctUntilChanged().collect { id -> if (id == null) _state.value = AllModulesUi(loading = false, failed = true) else reload(id) } }
    }

    fun setQuery(v: String) { query.value = v }
    fun retry() { work.current.value?.companyId?.let { id -> viewModelScope.launch { reload(id) } } }

    private suspend fun reload(id: Long) {
        _state.update { it.copy(loading = true, catalog = repo.cached(id) ?: it.catalog?.takeIf { c -> c.companyId == id }, failed = false) }
        when (val r = repo.load(id)) {
            is CatalogResult.Fresh -> _state.value = AllModulesUi(loading = false, catalog = r.catalog)
            is CatalogResult.Stale -> _state.update { it.copy(loading = false, catalog = r.catalog ?: it.catalog, offlineCopy = (r.catalog ?: it.catalog) != null, failed = (r.catalog ?: it.catalog) == null) }
        }
    }
}

/** Language of the current UI (app locale): "uz", "ru" or "en"; anything else is shown in Uzbek. */
internal fun uiLang(): String = Locale.getDefault().language.lowercase().takeIf { it == "ru" || it == "en" } ?: "uz"

/** Server icon keys (web NavIkonka) -> Material icons. */
internal fun catalogIcon(key: String): ImageVector = when (key) {
    "Building2" -> Icons.Filled.Apartment
    "Tags" -> Icons.Filled.Sell
    "Calculator" -> Icons.Filled.Calculate
    "FileOutput", "FileText" -> Icons.Filled.Description
    "HardHat" -> Icons.Filled.Engineering
    "ShieldAlert" -> Icons.Filled.Warning
    "ShieldCheck" -> Icons.Filled.Shield
    "Settings" -> Icons.Filled.Settings
    "Link2" -> Icons.Filled.Link
    "FileStack" -> Icons.Filled.FolderCopy
    "Gauge" -> Icons.Filled.Speed
    "FlaskConical" -> Icons.Filled.Science
    "LayoutDashboard" -> Icons.Filled.Dashboard
    "BarChart" -> Icons.Filled.BarChart
    "ClipboardList" -> Icons.Filled.Checklist
    "Briefcase" -> Icons.Filled.BusinessCenter
    "Box" -> Icons.Filled.Inventory2
    "Users" -> Icons.Filled.Group
    "FolderKanban" -> Icons.Filled.Folder
    "Crown" -> Icons.Filled.WorkspacePremium
    "Map" -> Icons.Filled.Map
    "Inbox" -> Icons.Filled.Inbox
    "Truck" -> Icons.Filled.LocalShipping
    "User" -> Icons.Filled.Person
    "Trash2" -> Icons.Filled.Delete
    else -> Icons.Filled.Folder
}

/** Opens a catalogue item on its native screen. */
internal fun openItem(item: CatalogItem, onNative: (NativeTarget) -> Unit) {
    when (val o = item.open()) {
        is CatalogOpen.Native -> onNative(o.target)
        null -> Unit
    }
}

/** "Barcha modullar": every page this user may open in the selected workplace, grouped like the website menu, searchable. */
@Composable
fun AllModulesScreen(onNative: (NativeTarget) -> Unit, visible: List<ModuleDef> = emptyList(), vm: AllModulesViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val lang = remember { uiLang() }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val catalog = remember(ui.catalog, visible) {
        ui.catalog?.let { c ->
            val missing = ModuleCatalog.missingFrom(c.native().mapNotNull { it.nativeTarget() }.toSet(), visible)
            c.withExtraModules(ctx.getString(R.string.am_extra_group), missing.map { Triple(it, ctx.getString(it.title), ctx.getString(it.desc)) })
        }
    }
    val hits = remember(catalog, query) { catalog?.search(query).orEmpty() }
    val sections = remember(catalog, hits) { catalog?.sections(hits).orEmpty() }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query, onValueChange = vm::setQuery, singleLine = true,
            placeholder = { Text(stringResource(R.string.am_search)) },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, stringResource(R.string.p1_remove)) } },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 4.dp).heightIn(min = TouchTarget),
        )
        if (ui.offlineCopy) Text(stringResource(R.string.am_offline_copy), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp))
        when {
            catalog == null && ui.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            catalog == null -> CenterMessage(Icons.Filled.CloudOff, stringResource(R.string.am_failed), stringResource(R.string.err_network), stringResource(R.string.retry), onAction = vm::retry)
            sections.isEmpty() -> CenterMessage(Icons.Filled.Search, stringResource(R.string.am_empty))
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (query.isNotBlank()) item(key = "count") { Text(stringResource(R.string.am_count, hits.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                sections.forEach { s ->
                    item(key = "g" + s.group.id) {
                        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(catalogIcon(s.group.icon), null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(s.group.title.pick(lang), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    items(s.items, key = { "i" + it.id }) { CatalogRow(it, lang) { openItem(it, onNative) } }
                }
            }
        }
    }
}

@Composable
internal fun CatalogRow(item: CatalogItem, lang: String, onClick: () -> Unit) {
    val nativeScreen = item.open() is CatalogOpen.Native
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable(onClick = onClick)) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(10.dp), modifier = Modifier.size(38.dp)) {
                Box(contentAlignment = Alignment.Center) { Icon(catalogIcon(item.icon), null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(20.dp)) }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.title.pick(lang), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val band = item.band.pick(lang)
                if (band != item.title.pick(lang)) Text(band, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (nativeScreen) Text(stringResource(R.string.am_in_app), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}
