package uz.anncorp.smeta.feature.home

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.ui.QurLogo
import uz.anncorp.smeta.core.ui.SoonPlaceholder
import uz.anncorp.smeta.feature.company.WorkplaceSheet
import uz.anncorp.smeta.feature.profile.ProfileScreen
import uz.anncorp.smeta.feature.ombor.OmborAccess
import uz.anncorp.smeta.feature.ombor.OmborScreen
import uz.anncorp.smeta.feature.work.BannerViewModel
import uz.anncorp.smeta.feature.work.ObjectsScreen
import uz.anncorp.smeta.core.ui.OutboxBanner

private const val OMBOR_TAB = 5

private data class Tab(@StringRes val label: Int, val icon: ImageVector)

private val Tabs = listOf(
    Tab(R.string.nav_objects, Icons.Filled.Home),
    Tab(R.string.nav_fact, Icons.Filled.Create),
    Tab(R.string.nav_approval, Icons.Filled.CheckCircle),
    Tab(R.string.nav_today, Icons.Filled.DateRange),
    Tab(R.string.nav_profile, Icons.Filled.Person),
)

@Composable
fun HomeScreen(onOpenObject: (Long) -> Unit, onOpenFakt: (Long) -> Unit, onOutbox: () -> Unit, vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var sheet by rememberSaveable { mutableStateOf(false) }
    val omborAccess = OmborAccess.forRole(state.selected?.rol)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkplaceBar(state.selected, state.workplaces.size > 1) { sheet = true } },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                Tabs.forEachIndexed { i, t ->
                    // Warehouse tab (role-gated) sits before Profile; the other tab indices are unchanged.
                    if (i == 4 && omborAccess.read) NavigationBarItem(selected = tab == OMBOR_TAB, onClick = { tab = OMBOR_TAB }, icon = { Icon(Icons.Filled.Inventory2, contentDescription = null) }, label = { Text(stringResource(R.string.ombor_nav), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall) })
                    NavigationBarItem(
                        selected = tab == i, onClick = { tab = i },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(stringResource(t.label), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                state.loading && state.workplaces.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.home_loading), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                tab == OMBOR_TAB && omborAccess.read -> OmborScreen(onOutbox)
                tab == 4 -> ProfileScreen(state, onTheme = vm::setTheme, onSwitch = { sheet = true }, onSignOut = vm::signOut)
                else -> TabBody(state, tab, vm::load, onOpenObject, onOpenFakt, onOutbox)
            }
        }
    }

    if (sheet) WorkplaceSheet(state.workplaces, state.selected, onPick = { vm.select(it); sheet = false }, onDismiss = { sheet = false })
}

@Composable
private fun WorkplaceBar(selected: Workplace?, canSwitch: Boolean, onClick: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            QurLogo(26.dp)
            Spacer(Modifier.width(12.dp))
            Row(
                Modifier.weight(1f).then(if (canSwitch) Modifier.clickable(onClick = onClick) else Modifier),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    selected?.nom?.ifBlank { null } ?: "QURAI", style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
                if (canSwitch) Icon(Icons.Filled.ArrowDropDown, contentDescription = stringResource(R.string.workplace_switch), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            selected?.rol?.takeIf { it.isNotBlank() }?.let { RoleChip(it) }
        }
    }
}

@Composable
fun RoleChip(role: String) {
    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(50)) {
        Text(
            role.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun TabBody(state: HomeState, tab: Int, onRetry: () -> Unit, onOpenObject: (Long) -> Unit, onOpenFakt: (Long) -> Unit, onOutbox: () -> Unit, banner: BannerViewModel = hiltViewModel()) {
    val bannerState by banner.state.collectAsStateWithLifecycle()
    val work = tab == 0 || tab == 1
    Column(Modifier.fillMaxSize()) {
        if (work) OutboxBanner(bannerState, onOutbox)
        if (state.offline && !work) {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.offline_banner), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            }
        }
        if (state.failed) {
            Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(stringResource(R.string.err_server), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                TextButton(onClick = onRetry) { Text(stringResource(R.string.retry)) }
            }
        } else if (state.selected == null && !state.loading) {
            Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(stringResource(R.string.workplace_none), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.workplace_none_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        } else if (tab == 0) {
            ObjectsScreen(onOpen = onOpenObject)
        } else if (tab == 1) {
            ObjectsScreen(onOpen = onOpenFakt, pickForFact = true)
        } else {
            SoonPlaceholder(Modifier.fillMaxSize())
        }
    }
}

