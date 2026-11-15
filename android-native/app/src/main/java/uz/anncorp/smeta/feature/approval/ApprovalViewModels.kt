package uz.anncorp.smeta.feature.approval

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ApprovalDetail
import uz.anncorp.smeta.core.data.ApprovalDoc
import uz.anncorp.smeta.core.data.ApprovalItem
import uz.anncorp.smeta.core.data.ApprovalsRepository
import uz.anncorp.smeta.core.data.ConnectivityMonitor
import uz.anncorp.smeta.core.data.Decision
import uz.anncorp.smeta.core.data.DecisionError
import uz.anncorp.smeta.core.data.DecisionResult
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import javax.inject.Inject

data class InboxUi(val items: List<ApprovalItem> = emptyList(), val loading: Boolean = true, val result: SyncResult? = null)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class InboxViewModel @Inject constructor(private val repo: ApprovalsRepository, private val ctx: WorkContext) : ViewModel() {
    private val _state = MutableStateFlow(InboxUi())
    val state: StateFlow<InboxUi> = _state

    /** Reloads the inbox of the selected workplace (also called when the screen is shown again after a decision). */
    fun refresh() {
        val w = ctx.current.value ?: run { _state.value = InboxUi(loading = false); return }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.items.isEmpty())
            val (r, items) = repo.inbox(w.companyId)
            // A failed refresh keeps the last list on screen instead of blanking it.
            _state.value = if (r is SyncResult.Ok) InboxUi(items, false, r) else _state.value.copy(loading = false, result = r)
        }
    }
}

data class DetailUi(
    val loading: Boolean = true,
    val detail: ApprovalDetail? = null,
    val doc: ApprovalDoc? = null,
    val result: SyncResult? = null,
    val online: Boolean = true,
    val deciding: Boolean = false,
    val error: DecisionError? = null,
    val errorCode: String? = null,
    /** Set once a decision went through; the screen shows the confirmation and leaves. */
    val done: Decision? = null,
)

@HiltViewModel
class ApprovalDetailViewModel @Inject constructor(
    handle: SavedStateHandle, private val repo: ApprovalsRepository, private val ctx: WorkContext, connectivity: ConnectivityMonitor,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val local = MutableStateFlow(DetailUi())
    private var seenToken: String? = null

    val state: StateFlow<DetailUi> = combine(local, connectivity.online) { ui, on -> ui.copy(online = on) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DetailUi())

    init { load() }

    fun load() {
        val w = ctx.current.value ?: run { local.value = DetailUi(loading = false, result = SyncResult.Failed("NO_WORKPLACE")); return }
        viewModelScope.launch {
            local.value = local.value.copy(loading = true, error = null)
            val (r, d, doc) = repo.detail(w.companyId, id)
            seenToken = d?.stepToken
            local.value = local.value.copy(loading = false, detail = d, doc = doc, result = r)
        }
    }

    fun clearError() { local.value = local.value.copy(error = null, errorCode = null) }

    /** Online only: nothing is queued. The chain is re-read inside [ApprovalsRepository.decide] before anything is sent. */
    fun decide(d: Decision, comment: String?) {
        val w = ctx.current.value ?: return
        if (local.value.deciding) return
        if (d.needsComment && comment.isNullOrBlank()) return
        viewModelScope.launch {
            local.value = local.value.copy(deciding = true, error = null)
            when (val r = repo.decide(w.companyId, id, seenToken, d, comment)) {
                DecisionResult.Done -> local.value = local.value.copy(deciding = false, done = d)
                is DecisionResult.Error -> {
                    local.value = local.value.copy(deciding = false, error = r.kind, errorCode = r.code)
                    // The chain moved on: show the fresh state behind the message.
                    if (r.kind == DecisionError.NOT_YOUR_TURN || r.kind == DecisionError.CHANGED) load()
                }
            }
        }
    }
}
