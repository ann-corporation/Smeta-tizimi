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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import uz.anncorp.smeta.core.data.search
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.open
import uz.anncorp.smeta.core.data.Arranged
import uz.anncorp.smeta.core.data.ModuleCatalog
import uz.anncorp.smeta.core.data.grantedModules
import uz.anncorp.smeta.core.data.ModuleDef
import uz.anncorp.smeta.core.data.ModuleKind
import uz.anncorp.smeta.core.data.NativeTarget
import uz.anncorp.smeta.core.data.arrange
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.QatorEntity
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget

internal fun iconFor(code: String): ImageVector = when (code) {
    "zayavka" -> Icons.Filled.ShoppingCart
    "m29" -> Icons.Filled.Place
    "qarzdor" -> Icons.Filled.Warning
    "qabul" -> Icons.Filled.CheckCircle
    "resurs" -> Icons.Filled.List
    "naryad" -> Icons.Filled.Build
    "nazorat" -> Icons.Filled.Warning
    "obyektlar" -> Icons.Filled.Home
    "fakt" -> Icons.Filled.Create
    "foto" -> Icons.Filled.CameraAlt
    "tasdiq" -> Icons.Filled.CheckCircle
    "bugun" -> Icons.Filled.DateRange
    "ombor" -> Icons.Filled.Place
    "jarvis" -> Icons.Filled.Star
    "smeta" -> Icons.Filled.List
    "narx" -> Icons.Filled.ShoppingCart
    "f2" -> Icons.Filled.Check
    "f2reestr" -> Icons.Filled.Menu
    "nakop" -> Icons.Filled.Info
    "moliya" -> Icons.Filled.Send
    "buxgalteriya" -> Icons.Filled.Lock
    "hujjat", "aosr" -> Icons.Filled.Edit
    "tender" -> Icons.Filled.AddCircle
    "logistika" -> Icons.Filled.Place
    "hr" -> Icons.Filled.Person
    "sotuv" -> Icons.Filled.Home
    "kompaniya" -> Icons.Filled.Settings
    else -> Icons.Filled.Build
}

/**
 * Telegram-mini-app-like launcher: the modules this user may use in the selected workplace (same permission / module rules as the
 * website), pinned favourites first, search across modules, objects and cached smeta rows, recent objects.
 */
@Composable
fun HubScreen(
    onNative: (NativeTarget) -> Unit,
    onObject: (Long) -> Unit,
    onFakt: (Long) -> Unit,
    onOnboard: () -> Unit,
    onNotifications: () -> Unit = {},
    vm: HubViewModel = hiltViewModel(),
) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val granted = remember(ui.workspace) { ui.workspace?.grantedModules().orEmpty() }
    val visible = remember(ui.permissions, ui.offModules, granted) { ModuleCatalog.visible(ui.permissions, ui.offModules, granted) }
    val duplicates = remember(ui.workspace) { shownAsActions(ui.workspace) }
    // Searching lists everything; the plain grid skips modules the workspace already shows as buttons.
    val arranged = remember(visible, ui.picks, ui.query, duplicates) {
        arrange(if (ui.query.trim().length >= 2) visible else visible.filter { it.code !in duplicates }, ui.picks, ui.query) { context.getString(it.title) }
    }
    val openAction: (uz.anncorp.smeta.core.data.WsAction) -> Unit = { a ->
        when (val o = a.open()) {
            is uz.anncorp.smeta.core.data.WsOpen.Native -> onNative(o.target)
            is uz.anncorp.smeta.core.data.WsOpen.Web -> Unit
            uz.anncorp.smeta.core.data.WsOpen.Onboard -> onOnboard()
            null -> Unit
        }
    }
    val open: (ModuleDef) -> Unit = { m -> m.target?.let(onNative) }
    val searching = ui.query.trim().length >= 2
    androidx.lifecycle.compose.LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) { vm.refreshUnread() }

    // "Barcha modullar": the server catalogue of EVERY page this user may open (native screen when the app has one, else the in-app web container).
    var allMode by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val catalogVm: AllModulesViewModel = hiltViewModel()
    val catalogUi by catalogVm.state.collectAsStateWithLifecycle()
    val lang = remember { uiLang() }
    // Hub search also finds catalogue pages (Ctrl+K-like): pages that already have a module card are left out to avoid duplicates.
    val pageHits = remember(catalogUi.catalog, ui.query, visible) {
        if (!searching) emptyList() else catalogUi.catalog?.search(ui.query).orEmpty()
            .filter { p -> visible.none { m -> m.webPath == p.path || (p.native != null && m.code == p.native) } }.take(12)
    }
    val openPage: (uz.anncorp.smeta.core.data.CatalogItem) -> Unit = { p -> openItem(p, onNative) }
    if (allMode) {
        androidx.activity.compose.BackHandler { allMode = false }
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { allMode = false }, modifier = Modifier.size(TouchTarget)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.p1_back)) }
                Text(stringResource(R.string.hub_all_modules), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
            }
            AllModulesScreen(onNative = onNative, visible = visible, vm = catalogVm)
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = ui.query, onValueChange = vm::setQuery, singleLine = true,
                placeholder = { Text(stringResource(R.string.hub_search), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = { if (ui.query.isNotEmpty()) IconButton(onClick = { vm.setQuery("") }) { Icon(Icons.Filled.Clear, stringResource(R.string.p1_remove)) } },
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.weight(1f).heightIn(min = TouchTarget),
            )
            // Notifications centre entry: the badge is the server's unread counter.
            IconButton(onClick = onNotifications, modifier = Modifier.size(TouchTarget)) {
                BadgedBox(badge = { if ((ui.unread ?: 0) > 0) Badge { Text(if ((ui.unread ?: 0) > 99) "99+" else ui.unread.toString()) } }) {
                    Icon(Icons.Filled.Notifications, stringResource(R.string.nt_open))
                }
            }
        }
        when {
            !ui.hasCompany && !ui.loading -> CenterMessage(Icons.Filled.Home, stringResource(R.string.hub_no_company), stringResource(R.string.hub_no_company_hint), stringResource(R.string.hub_no_company_action), onAction = onOnboard)
            ui.loading && ui.permissions == null && !searching -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else -> HubGrid(ui, arranged, searching, vm, open, openAction, onObject, onFakt, pageHits, lang, openPage, FirstStepsActions(onNative = onNative, onOnboard = onOnboard)) { allMode = true }
        }
    }
}

@Composable
private fun HubGrid(
    ui: HubUi, arranged: Arranged, searching: Boolean, vm: HubViewModel, open: (ModuleDef) -> Unit, openAction: (uz.anncorp.smeta.core.data.WsAction) -> Unit, onObject: (Long) -> Unit, onFakt: (Long) -> Unit,
    pageHits: List<uz.anncorp.smeta.core.data.CatalogItem>, lang: String, onPage: (uz.anncorp.smeta.core.data.CatalogItem) -> Unit, steps: FirstStepsActions, onAllModules: () -> Unit,
) {
    val span = GridItemSpan(2)
    LazyVerticalGrid(
        columns = GridCells.Fixed(2), modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (searching) {
            if (pageHits.isNotEmpty()) { item(span = { span }) { SectionTitle(R.string.hub_sec_pages) }; items(pageHits, key = { "pg" + it.id }, span = { span }) { CatalogRow(it, lang) { onPage(it) } } }
            if (arranged.pinned.isEmpty() && arranged.others.isEmpty() && pageHits.isEmpty() && ui.objectHits.isEmpty() && ui.rowHits.isEmpty()) {
                item(span = { span }) { CenterMessage(Icons.Filled.Search, stringResource(R.string.p1_objects_empty_search), modifier = Modifier.padding(top = 32.dp)) }
            }
            val mods = arranged.pinned + arranged.others
            if (mods.isNotEmpty()) { item(span = { span }) { SectionTitle(R.string.hub_sec_modules) }; items(mods, key = { "m" + it.code }) { ModuleCard(it, pinned = it.code in ui.picks.pinned, edit = false, first = false, last = false, vm = vm, onOpen = open) } }
            if (ui.objectHits.isNotEmpty()) { item(span = { span }) { SectionTitle(R.string.hub_sec_objects) }; items(ui.objectHits, key = { "o" + it.id }, span = { span }) { ObjectChip(it) { onObject(it.id) } } }
            if (ui.rowHits.isNotEmpty()) { item(span = { span }) { SectionTitle(R.string.hub_sec_rows) }; items(ui.rowHits, key = { "r" + it.rid }, span = { span }) { RowHit(it) { onFakt(it.obyektId) } } }
            return@LazyVerticalGrid
        }
        // Trial account: the first-steps checklist leads (sample object, upload, F-2, AI, real company); gone once the workspace is a real company.
        ui.sinov?.takeIf { it.showChecklist }?.let { s ->
            item(span = { span }) {
                FirstStepsCard(s, jarvis = uz.anncorp.smeta.core.data.Features.JARVIS, busy = ui.sinovBusy, error = ui.sinovError) { id ->
                    when (id) {
                        FirstStepId.DEMO -> vm.openDemo { steps.onNative(NativeTarget.OBJECTS) }
                        FirstStepId.F2 -> steps.onNative(NativeTarget.F2REESTR)
                        FirstStepId.AI -> steps.onNative(NativeTarget.JARVIS)
                        FirstStepId.REAL -> steps.onOnboard()
                    }
                }
            }
        }
        // Server-driven role workspace first (the cabinet's sections and quick actions); the plain module launcher stays below as "all apps".
        ui.workspace?.let { ws ->
            workspaceItems(ws, ui.places, openAction, onObject, ui.kpi)
        }
        if (ui.workspace == null && ui.recent.isNotEmpty()) {
            item(span = { span }) { SectionTitle(R.string.hub_sec_recent) }
            items(ui.recent, key = { "rc" + it.id }, span = { span }) { ObjectChip(it) { onObject(it.id) } }
        }
        item(span = { span }) { AllModulesCard(onAllModules) }
        item(span = { span }) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(if (arranged.pinned.isEmpty()) R.string.hub_sec_all else R.string.hub_sec_pinned), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                TextButton(onClick = vm::toggleEdit) { Text(stringResource(if (ui.edit) R.string.hub_done else R.string.hub_edit)) }
            }
        }
        if (arranged.pinned.isNotEmpty()) {
            items(arranged.pinned, key = { "p" + it.code }) { m -> ModuleCard(m, pinned = true, edit = ui.edit, first = m == arranged.pinned.first(), last = m == arranged.pinned.last(), vm = vm, onOpen = open) }
            item(span = { span }) { SectionTitle(R.string.hub_sec_all) }
        }
        items(arranged.others, key = { "a" + it.code }) { m -> ModuleCard(m, pinned = false, edit = ui.edit, first = false, last = false, vm = vm, onOpen = open) }
    }
}

/** Entry to the full server catalogue ("Barcha modullar"): 100% of the system is reachable from the app. */
@Composable
private fun AllModulesCard(onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable(onClick = onClick)) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Menu, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.hub_all_modules), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text(stringResource(R.string.hub_all_modules_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
    }
}

@Composable
private fun SectionTitle(res: Int) = Text(stringResource(res), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))

@Composable
private fun ModuleCard(m: ModuleDef, pinned: Boolean, edit: Boolean, first: Boolean, last: Boolean, vm: HubViewModel, onOpen: (ModuleDef) -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth().heightIn(min = 128.dp).clickable { onOpen(m) },
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp), modifier = Modifier.size(44.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(iconFor(m.code), null, tint = MaterialTheme.colorScheme.onPrimaryContainer) }
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { vm.togglePin(m.code) }, modifier = Modifier.size(TouchTarget)) {
                    Icon(Icons.Filled.Star, contentDescription = stringResource(if (pinned) R.string.hub_unpin else R.string.hub_pin), tint = if (pinned) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outline)
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(stringResource(m.title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(stringResource(m.desc), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (edit && pinned) Row {
                if (!first) TextButton(onClick = { vm.move(m.code, -1) }) { Text(stringResource(R.string.hub_earlier)) }
                if (!last) TextButton(onClick = { vm.move(m.code, 1) }) { Text(stringResource(R.string.hub_later)) }
            }
        }
    }
}

@Composable
private fun ObjectChip(o: ObyektEntity, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable(onClick = onClick)) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Home, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            Spacer(Modifier.size(10.dp))
            Text(o.nom, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun RowHit(r: QatorEntity, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable(onClick = onClick)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            r.kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary) }
            Text(r.nom, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Where the first-steps checklist sends the user (the hub's own navigation callbacks). */
class FirstStepsActions(val onNative: (NativeTarget) -> Unit, val onOnboard: () -> Unit)

