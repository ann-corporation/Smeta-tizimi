package uz.anncorp.smeta.feature.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.NotificationItem
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.TodayRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.isExecutive
import javax.inject.Inject

data class TodayUi(
    val loading: Boolean = true,
    val executive: Boolean = false,
    val approvals: Int? = null,
    val f2Drafts: Int? = null,
    val faktDrafts: Int? = null,
    val unsent: Int = 0,
    val notifications: List<NotificationItem> = emptyList(),
    val unread: Int? = null,
    val failed: Boolean = false,
)

@HiltViewModel
class TodayViewModel @Inject constructor(private val repo: TodayRepository, private val ctx: WorkContext, outbox: OutboxRepository) : ViewModel() {
    private val local = MutableStateFlow(TodayUi())

    val state: StateFlow<TodayUi> = combine(local, outbox.queuedCount, outbox.failedCount) { ui, q, f -> ui.copy(unsent = q + f) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), TodayUi())

    fun refresh() {
        val w = ctx.current.value ?: run { local.value = local.value.copy(loading = false); return }
        viewModelScope.launch {
            local.value = local.value.copy(loading = local.value.notifications.isEmpty() && local.value.approvals == null)
            val d = repo.load(w.companyId, w.rol)
            val allNull = d.approvals == null && d.unread == null && d.f2Drafts == null && d.faktDrafts == null
            local.value = TodayUi(
                loading = false, executive = isExecutive(w.rol), approvals = d.approvals, f2Drafts = d.f2Drafts, faktDrafts = d.faktDrafts,
                notifications = d.notifications, unread = d.unread, failed = allNull,
            )
        }
    }

    /** Marks the given notifications read; the list updates locally right away and is confirmed by the server. */
    fun markRead(ids: List<Long>) {
        if (ids.isEmpty()) return
        val before = local.value
        local.value = before.copy(
            notifications = before.notifications.map { if (it.id in ids) it.copy(oqildi = true) else it },
            unread = before.unread?.let { (it - ids.size).coerceAtLeast(0) },
        )
        viewModelScope.launch { if (!repo.markRead(ids)) local.value = before }
    }
}
