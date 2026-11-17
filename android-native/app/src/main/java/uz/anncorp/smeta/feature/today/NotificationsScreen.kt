package uz.anncorp.smeta.feature.today

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ApprovalItem
import uz.anncorp.smeta.core.data.ApprovalsRepository
import uz.anncorp.smeta.core.data.NotificationItem
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.TodayRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.group
import uz.anncorp.smeta.core.data.notifKind
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.SkeletonList
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

data class NotificationsUi(
    val loading: Boolean = true,
    val failed: Boolean = false,
    val unreadOnly: Boolean = false,
    val items: List<NotificationItem> = emptyList(),
    val unread: Int = 0,
    val waiting: List<ApprovalItem> = emptyList(),
    /** Groups switched off in Settings > Notifications (this device only). */
    val muted: Set<uz.anncorp.smeta.core.data.NotifGroup> = emptySet(),
) {
    val visible: List<NotificationItem> get() = uz.anncorp.smeta.core.data.visibleNotifications(items, muted) { notifKind(it.mavzu).group() }
    val shown: List<NotificationItem> get() = if (unreadOnly) visible.filter { !it.oqildi } else visible
}

/** Notifications centre: the full server list (read/unread filter, mark read) plus the approvals waiting in my queue. Same server reads as the Today tab. */
@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val today: TodayRepository, private val approvals: ApprovalsRepository, private val ctx: WorkContext, private val prefs: uz.anncorp.smeta.core.data.Prefs,
) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsUi(muted = prefs.mutedGroups.value))
    val state: StateFlow<NotificationsUi> = _state.asStateFlow()

    init { viewModelScope.launch { prefs.mutedGroups.collect { m -> _state.update { it.copy(muted = m) } } } }

    fun refresh() {
        viewModelScope.launch {
            val list = today.notifications(100)
            val companyId = ctx.current.value?.companyId
            val waiting = companyId?.let { approvals.inbox(it) }?.takeIf { it.first == SyncResult.Ok }?.second
            _state.update { cur ->
                if (list == null && waiting == null) cur.copy(loading = false, failed = cur.items.isEmpty() && cur.waiting.isEmpty())
                else cur.copy(loading = false, failed = false, items = list?.items ?: cur.items, unread = list?.unread ?: cur.unread, waiting = waiting ?: cur.waiting)
            }
        }
    }

    fun setUnreadOnly(v: Boolean) = _state.update { it.copy(unreadOnly = v) }

    /** Marks [ids] read: the list updates locally right away and is rolled back if the server refuses. */
    fun markRead(ids: List<Long>) {
        if (ids.isEmpty()) return
        val before = _state.value
        _state.value = before.copy(items = before.items.map { if (it.id in ids) it.copy(oqildi = true) else it }, unread = (before.unread - ids.size).coerceAtLeast(0))
        viewModelScope.launch { if (!today.markRead(ids)) _state.value = before }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(onBack: () -> Unit, onOpenApproval: (Long) -> Unit, onOpenLetter: (Long) -> Unit = {}, vm: NotificationsViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refresh() }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.nt_title), onBack)
        when {
            ui.loading -> SkeletonList(4)
            ui.failed -> CenterMessage(Icons.Filled.Warning, stringResource(R.string.p2_appr_err_load), null, stringResource(R.string.retry)) { vm.refresh() }
            else -> PullToRefreshBox(isRefreshing = false, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 4.dp, 16.dp, 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { WaitingCard(ui.waiting, onOpenApproval) }
                    item {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            FilterChip(selected = !ui.unreadOnly, onClick = { vm.setUnreadOnly(false) }, label = { Text(stringResource(R.string.nt_filter_all)) })
                            FilterChip(selected = ui.unreadOnly, onClick = { vm.setUnreadOnly(true) }, label = { Text(stringResource(R.string.nt_filter_unread) + if (ui.unread > 0) " (${ui.unread})" else "") })
                        }
                    }
                    if (ui.unread > 0) item { TextButton(onClick = { vm.markRead(ui.items.filter { !it.oqildi }.map { it.id }) }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.nt_mark_all)) } }
                    if (ui.shown.isEmpty()) item { CenterMessage(Icons.Filled.Notifications, stringResource(R.string.nt_empty), modifier = Modifier.padding(top = 24.dp)) }
                    items(ui.shown, key = { it.id }) { n -> NotificationRow(n, onOpenApproval, onOpenLetter, vm::markRead) }
                }
            }
        }
    }
}

@Composable
private fun WaitingCard(waiting: List<ApprovalItem>, onOpen: (Long) -> Unit) {
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.nt_waiting) + if (waiting.isNotEmpty()) " (${waiting.size})" else "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (waiting.isEmpty()) Text(stringResource(R.string.nt_waiting_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            waiting.take(5).forEach { a ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { onOpen(a.id) }, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(a.sarlavha.ifBlank { a.tur }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2)
                        a.egasi?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: NotificationItem, onOpenApproval: (Long) -> Unit, onOpenLetter: (Long) -> Unit, onMarkRead: (List<Long>) -> Unit) {
    WorkCard(modifier = Modifier.heightIn(min = TouchTarget), onClick = {
        onMarkRead(listOf(n.id).filter { !n.oqildi })
        if (n.zanjirId != null) onOpenApproval(n.zanjirId) else n.xatId?.let(onOpenLetter)
    }) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (n.oqildi) androidx.compose.ui.graphics.Color.Transparent else MaterialTheme.colorScheme.primary))
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text(
                    notifRes(notifKind(n.mavzu))?.let { stringResource(it) } ?: stringResource(R.string.nt_other),
                    style = MaterialTheme.typography.bodyMedium, color = if (n.oqildi) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                )
                n.yaratildi?.let { Text(uz.anncorp.smeta.core.data.formatIsoStamp(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (n.zanjirId != null || n.xatId != null) Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
