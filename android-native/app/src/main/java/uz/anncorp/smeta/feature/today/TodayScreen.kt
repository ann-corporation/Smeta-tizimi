package uz.anncorp.smeta.feature.today

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.NotifKind
import uz.anncorp.smeta.core.data.NotificationItem
import uz.anncorp.smeta.core.data.notifKind
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard

@StringRes
internal fun notifRes(k: NotifKind): Int? = when (k) {
    NotifKind.APPROVAL_WAITING -> R.string.p2_n_approval_waiting
    NotifKind.APPROVED -> R.string.p2_n_approved
    NotifKind.REJECTED -> R.string.p2_n_rejected
    NotifKind.RETURNED -> R.string.p2_n_returned
    NotifKind.LETTER -> R.string.p2_n_letter
    NotifKind.DEADLINE_NEAR -> R.string.p2_n_deadline_near
    NotifKind.DEADLINE_PASSED -> R.string.p2_n_deadline_passed
    NotifKind.DRAWING -> R.string.p2_n_drawing
    NotifKind.DRAWING_DECISION -> R.string.p2_n_drawing_decision
    NotifKind.OTHER -> null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(onOpenApprovals: () -> Unit, onOutbox: () -> Unit, vm: TodayViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refresh() }
    PullToRefreshBox(isRefreshing = false, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        if (ui.loading) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        } else if (ui.failed) {
            CenterMessage(null, stringResource(R.string.p2_appr_err_load), null, stringResource(R.string.retry)) { vm.refresh() }
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Counter(stringResource(R.string.p2_today_approvals), ui.approvals, onOpenApprovals)
                if (ui.executive) {
                    Counter(stringResource(R.string.p2_today_f2), ui.f2Drafts, null)
                    Counter(stringResource(R.string.p2_today_fakt), ui.faktDrafts, null)
                }
                if (ui.unsent > 0) Counter(stringResource(R.string.p2_today_outbox), ui.unsent, onOutbox)
                NotificationsCard(ui.notifications, ui.unread) { vm.markRead(it) }
            }
        }
    }
}

@Composable
private fun Counter(label: String, value: Int?, onClick: (() -> Unit)?) {
    WorkCard(onClick = onClick, modifier = Modifier.heightIn(min = TouchTarget)) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            Text(value?.toString() ?: "—", style = MaterialTheme.typography.headlineSmall, color = if ((value ?: 0) > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NotificationsCard(items: List<NotificationItem>, unread: Int?, onMarkRead: (List<Long>) -> Unit) {
    WorkCard {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.p2_today_notes), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                if ((unread ?: 0) > 0) Text(pluralStringResource(R.plurals.p2_today_unread, unread ?: 0, unread ?: 0), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(6.dp))
            if (items.isEmpty()) {
                Text(stringResource(R.string.p2_today_notes_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp))
            } else {
                items.forEach { n ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(enabled = !n.oqildi) { onMarkRead(listOf(n.id)) }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (n.oqildi) androidx.compose.ui.graphics.Color.Transparent else MaterialTheme.colorScheme.primary))
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(
                                notifRes(notifKind(n.mavzu))?.let { stringResource(it) } ?: n.mavzu,
                                style = MaterialTheme.typography.bodyMedium, color = if (n.oqildi) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                            )
                            n.yaratildi?.let { Text(it.replace('T', ' ').take(16), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    }
                }
                if (items.any { !it.oqildi }) {
                    TextButton(onClick = { onMarkRead(items.filter { !it.oqildi }.map { it.id }) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.p2_today_mark_read)) }
                }
            }
        }
    }
}
