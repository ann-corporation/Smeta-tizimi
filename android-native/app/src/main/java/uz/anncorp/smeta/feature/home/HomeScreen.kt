package uz.anncorp.smeta.feature.home

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.NativeTarget
import uz.anncorp.smeta.core.data.isBossRole
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.ui.OutboxBanner
import uz.anncorp.smeta.core.ui.QurLogo
import uz.anncorp.smeta.feature.approval.ApprovalsScreen
import uz.anncorp.smeta.feature.company.CabinetSheet
import uz.anncorp.smeta.feature.company.WorkplaceSheet
import uz.anncorp.smeta.feature.hub.HubScreen
import uz.anncorp.smeta.feature.onboarding.OnboardingScreen
import uz.anncorp.smeta.feature.profile.ProfileScreen
import uz.anncorp.smeta.feature.today.TodayScreen
import uz.anncorp.smeta.feature.ombor.OmborScreen
import uz.anncorp.smeta.feature.work.BannerViewModel
import uz.anncorp.smeta.feature.work.ObjectsScreen

private const val OMBOR_TAB = 5

private data class Tab(@StringRes val label: Int, val icon: ImageVector)

// 0 Apps (hub), 1 Objects, 2 Approvals, 3 Today, 4 Profile. Fact and Photo are hub modules (and live on the object card).
private val Tabs = listOf(
    Tab(R.string.nav_apps, Icons.Filled.Menu),
    Tab(R.string.nav_objects, Icons.Filled.Home),
    Tab(R.string.nav_approval, Icons.Filled.CheckCircle),
    Tab(R.string.nav_today, Icons.Filled.DateRange),
    Tab(R.string.nav_profile, Icons.Filled.Person),
)

@Composable
fun HomeScreen(
    onOpenObject: (Long) -> Unit, onOpenFakt: (Long) -> Unit, onOpenApproval: (Long) -> Unit, onOutbox: () -> Unit,
    onPickFakt: () -> Unit, onPickPhoto: () -> Unit,
    onJarvis: () -> Unit = {}, onRahbar: () -> Unit = {}, onZayavka: () -> Unit = {}, onInvite: () -> Unit = {}, onInvites: () -> Unit = {}, onNotifications: () -> Unit = {}, onSettings: () -> Unit = {},
    onModule: (NativeTarget) -> Unit = {},
    vm: HomeViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val signOut by vm.signOutUi.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var sheet by rememberSaveable { mutableStateOf(false) }
    var cabinetSheet by rememberSaveable { mutableStateOf(false) }
    val workspace by vm.workspace.collectAsStateWithLifecycle()
    val openObject: (Long) -> Unit = { vm.opened(it); onOpenObject(it) }

    // A fresh account (Google / Telegram / e-mail sign-up) has no workplace: create one, join with a code, or carry on without.
    if (!state.loading && !state.failed && ((state.selected == null && !state.skipped) || state.forceOnboard)) {
        OnboardingScreen(
            busy = state.onboardBusy, error = state.onboardError, onCreate = vm::createCompany, onJoin = vm::joinCompany,
            onSkip = vm::skipOnboarding, onClearError = vm::clearOnboardError, onInvites = onInvites,
            trial = state.sinov?.takeIf { it.canStart && state.selected == null }, trialBusy = state.sinovBusy, trialError = state.sinovError, onTrial = vm::startTrial,
            forced = state.selected != null,
        )
        return
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { Column { WorkplaceBar(state.selected, state.workplaces.size > 1, workspace, onCabinets = { cabinetSheet = true }) { sheet = true }; UpdateBanner() } },
        // With the keyboard open the bar would sit under it and push the content below the keyboard (Ombor command field was hidden): drop it, the Scaffold then pads for the IME.
        bottomBar = {
            if (androidx.compose.foundation.layout.WindowInsets.Companion.ime.getBottom(androidx.compose.ui.platform.LocalDensity.current) == 0) NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                Tabs.forEachIndexed { i, t ->
                    NavigationBarItem(
                        selected = tab == i || (i == 0 && tab == OMBOR_TAB), onClick = { tab = i },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(stringResource(t.label), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).imePadding().fillMaxSize()) {
            when {
                state.loading && state.workplaces.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.home_loading), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                tab == OMBOR_TAB -> { BackHandler { tab = 0 }; OmborScreen(onOutbox) }
                tab == 4 -> ProfileScreen(state, onTheme = vm::setTheme, onSwitch = { sheet = true }, onSignOut = vm::requestSignOut, onInvite = onInvite, onInvites = onInvites, onSettings = onSettings)
                else -> TabBody(state, tab, vm::load, openObject, onOpenFakt, onOpenApproval, { tab = it }, onOutbox, onPickFakt, onPickPhoto, vm::resumeOnboarding, onJarvis, onRahbar, onNotifications, onZayavka, onModule)
            }
        }
    }

    if (cabinetSheet) workspace?.let { w -> CabinetSheet(w.cabinets, onPick = { vm.chooseCabinet(it); cabinetSheet = false }, onDismiss = { cabinetSheet = false }) }
    if (sheet) WorkplaceSheet(state.workplaces, state.selected, onPick = { vm.select(it); sheet = false }, onDismiss = { sheet = false })
    SignOutDialog(signOut, onSend = vm::sendThenSignOut, onKeep = vm::keepAndSignOut, onDelete = vm::deleteAndSignOut, onCancel = vm::cancelSignOut)
}

/** Unsent records at sign-out: send now / keep them on the device / delete them / stay signed in. */
@Composable
private fun SignOutDialog(ui: SignOutUi, onSend: () -> Unit, onKeep: () -> Unit, onDelete: () -> Unit, onCancel: () -> Unit) {
    when (ui) {
        SignOutUi.Idle -> Unit
        SignOutUi.Sending -> AlertDialog(
            onDismissRequest = {}, confirmButton = {},
            title = { Text(stringResource(R.string.p2_signout_title)) },
            text = { Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp); Spacer(Modifier.width(12.dp)); Text(stringResource(R.string.p2_signout_sending)) } },
        )
        is SignOutUi.Confirm -> AlertDialog(
            onDismissRequest = onCancel,
            title = { Text(stringResource(R.string.p2_signout_title)) },
            text = {
                Column {
                    Text(if (ui.afterSend) pluralStringResource(R.plurals.p2_signout_left, ui.count, ui.count) else pluralStringResource(R.plurals.p2_signout_body, ui.count, ui.count))
                    Spacer(Modifier.height(10.dp))
                    Text(stringResource(R.string.p2_signout_keep_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    Text(stringResource(R.string.p2_signout_delete_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = {
                Column(horizontalAlignment = Alignment.End) {
                    if (ui.canSend) TextButton(onClick = onSend) { Text(stringResource(R.string.p2_signout_send)) }
                    TextButton(onClick = onKeep) { Text(stringResource(R.string.p2_signout_keep)) }
                    TextButton(onClick = onDelete) { Text(stringResource(R.string.p2_signout_delete), color = MaterialTheme.colorScheme.error) }
                    TextButton(onClick = onCancel) { Text(stringResource(R.string.p1_cancel)) }
                }
            },
        )
    }
}

@Composable
private fun WorkplaceBar(selected: Workplace?, canSwitch: Boolean, workspace: uz.anncorp.smeta.core.data.Workspace?, onCabinets: () -> Unit, onClick: () -> Unit) {
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
                    color = MaterialTheme.colorScheme.onBackground, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
                if (canSwitch) Icon(Icons.Filled.ArrowDropDown, contentDescription = stringResource(R.string.workplace_switch), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            // The chip is the active CABINET (party) from the server; with several cabinets it opens the switcher. Old server: plain role chip.
            if (workspace != null && workspace.partyName.isNotBlank()) {
                val several = workspace.cabinets.size > 1
                Row(Modifier.then(if (several) Modifier.clickable(onClick = onCabinets) else Modifier), verticalAlignment = Alignment.CenterVertically) {
                    RoleChip(workspace.partyName)
                    if (several) Icon(Icons.Filled.ArrowDropDown, contentDescription = stringResource(R.string.ws_cabinet_switch), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else selected?.rol?.takeIf { it.isNotBlank() }?.let { RoleChip(it) }
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
private fun TabBody(
    state: HomeState, tab: Int, onRetry: () -> Unit, onOpenObject: (Long) -> Unit, onOpenFakt: (Long) -> Unit, onOpenApproval: (Long) -> Unit,
    onGoTab: (Int) -> Unit, onOutbox: () -> Unit, onPickFakt: () -> Unit, onPickPhoto: () -> Unit, onOnboard: () -> Unit, onJarvis: () -> Unit, onRahbar: () -> Unit, onNotifications: () -> Unit, onZayavka: () -> Unit, onModule: (NativeTarget) -> Unit,
    banner: BannerViewModel = hiltViewModel(),
) {
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
        } else if (tab == 0) {
            HubScreen(
                onNative = { target ->
                    when (target) {
                        NativeTarget.OBJECTS -> onGoTab(1)
                        NativeTarget.APPROVALS -> onGoTab(2)
                        NativeTarget.TODAY -> onGoTab(3)
                        NativeTarget.FAKT -> onPickFakt()
                        NativeTarget.PHOTO -> onPickPhoto()
                        NativeTarget.WAREHOUSE -> onGoTab(OMBOR_TAB)
                        NativeTarget.JARVIS -> onJarvis()
                        NativeTarget.RAHBAR -> onRahbar()
                        NativeTarget.ZAYAVKA -> onZayavka()
                        else -> onModule(target)
                    }
                },
                onObject = onOpenObject, onFakt = onOpenFakt, onOnboard = onOnboard, onNotifications = onNotifications,
            )
        } else if (state.selected == null && !state.loading) {
            Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(stringResource(R.string.workplace_none), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.workplace_none_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                TextButton(onClick = onOnboard) { Text(stringResource(R.string.hub_no_company_action)) }
            }
        } else if (tab == 1) {
            ObjectsScreen(onOpen = onOpenObject)
        } else if (tab == 2) {
            ApprovalsScreen(onOpen = onOpenApproval)
        } else {
            TodayScreen(onOpenApprovals = { onGoTab(2) }, onOutbox = onOutbox, showRahbar = isBossRole(state.selected?.rol), onRahbar = onRahbar)
        }
    }
}
