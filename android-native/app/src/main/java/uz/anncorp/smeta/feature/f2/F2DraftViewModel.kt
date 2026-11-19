package uz.anncorp.smeta.feature.f2

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.F2Status
import uz.anncorp.smeta.core.data.F2TransitionRepository
import uz.anncorp.smeta.core.data.F2TransitionResult
import uz.anncorp.smeta.core.data.OFFLINE_WRITE_MESSAGE
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.serverErrorText
import uz.anncorp.smeta.core.db.AppDb
import javax.inject.Inject

/** A write the user is looking at: the server dry-run [preview] of [tool] (step [step] of [steps]); nothing is saved until [confirm]. */
data class Review(
    val preview: DraftPreview? = null, val busy: Boolean = true, val error: String? = null,
    val suggestion: Suggestion? = null, val step: Int = 0, val steps: Int = 1,
)

data class DraftUi(
    val loading: Boolean = true, val error: String? = null, val page: DraftPage? = null,
    val sections: List<Pair<String?, List<DraftRow>>> = emptyList(), val edits: DraftEdits = DraftEdits(),
    val suggestions: List<Suggestion> = emptyList(), val review: Review? = null, val message: String? = null, val stepBusy: Boolean = false,
)

@HiltViewModel
class F2DraftViewModel @Inject constructor(
    handle: SavedStateHandle, private val api: BffApi, private val ctx: WorkContext, private val db: AppDb,
    private val transitions: F2TransitionRepository,
) : ViewModel() {
    val objectId: Long = checkNotNull(handle["id"])
    val aktId: Long = checkNotNull(handle["akt"])
    private val _ui = MutableStateFlow(DraftUi())
    val ui: StateFlow<DraftUi> = _ui
    private var plan: List<AcceptStep> = emptyList()

    init { load() }

    private fun companyId(): Long? = ctx.current.value?.companyId

    fun load() {
        val cid = companyId() ?: return
        viewModelScope.launch {
            _ui.update { it.copy(loading = true, error = null) }
            val page = loadF2Draft(api, cid, aktId)
            if (page == null) { _ui.update { it.copy(loading = false, error = "load") }; return@launch }
            val nodes = runCatching { db.node().all(objectId).first() }.getOrDefault(emptyList())
            val parent = nodes.associate { it.id to it.parentId }; val kind = nodes.associate { it.id to (it.tur to it.nom) }
            val sections = groupBySection(page.rows, { it.qatorId }) { sectionOf(it, parent, kind) }
            val sug = api.bff(suggestionsPath(cid, aktId)).let { parseSuggestions(it.body) }.orEmpty()
            _ui.update { it.copy(loading = false, page = page, sections = sections, suggestions = sug) }
        }
    }

    // ---- local edits (nothing leaves the phone until the preview is confirmed) ----
    fun setChange(id: Long, c: RowChange?) = _ui.update { it.copy(edits = it.edits.change(id, c), message = null) }
    fun remove(id: Long) = _ui.update { it.copy(edits = it.edits.remove(id), message = null) }
    fun restore(id: Long) = _ui.update { it.copy(edits = it.edits.restore(id)) }
    fun discard() = _ui.update { it.copy(edits = DraftEdits()) }
    fun clearMessage() = _ui.update { it.copy(message = null) }

    // ---- preview -> Tasdiqlash ----
    fun review() {
        val cid = companyId() ?: return
        val e = _ui.value.edits
        if (e.isEmpty || !editFits(e)) return
        plan = listOf(AcceptStep("f2_qoralama_tahrir", f2EditArgs(aktId, e, _ui.value.page?.head?.versiya)))
        runStep(cid, 0, null)
    }

    private fun runStep(cid: Long, i: Int, s: Suggestion?) {
        _ui.update { it.copy(review = Review(busy = true, suggestion = s, step = i, steps = plan.size)) }
        viewModelScope.launch {
            val r = parseToolPreview(api.bff("/api/f2-buyruq", "POST", f2ToolBody(cid, plan[i].tool, plan[i].args)))
            _ui.update {
                it.copy(review = when (r) {
                    is ToolResult.Preview -> Review(r.value, false, r.value.message, s, i, plan.size)
                    is ToolResult.Error -> Review(null, false, draftErrorText(r), s, i, plan.size)
                })
            }
        }
    }

    fun cancelReview() { plan = emptyList(); _ui.update { it.copy(review = null) } }

    fun confirm() {
        val cid = companyId() ?: return
        val rv = _ui.value.review ?: return
        val token = rv.preview?.token ?: return
        if (rv.busy) return
        _ui.update { it.copy(review = rv.copy(busy = true, error = null)) }
        viewModelScope.launch {
            val err = parseConfirm(api.bff("/api/f2-buyruq", "POST", f2ConfirmBody(cid, token)))
            if (err != null) { _ui.update { it.copy(review = rv.copy(busy = false, error = draftErrorText(err))) }; return@launch }
            if (rv.step + 1 < plan.size) { runStep(cid, rv.step + 1, rv.suggestion); return@launch }
            val s = rv.suggestion
            plan = emptyList()
            if (s != null) decide(s, SuggestDecision.ACCEPTED, null)
            _ui.update { it.copy(review = null, edits = if (s == null) DraftEdits() else it.edits, message = "saved") }
            load()
        }
    }

    // ---- texnadzor suggestions ----
    fun accept(s: Suggestion) {
        val cid = companyId() ?: return
        val head = _ui.value.page?.head ?: return
        plan = acceptSteps(s, aktId, head.obyektId ?: objectId, head.versiya, head.editable)
        if (plan.isEmpty()) viewModelScope.launch { decide(s, SuggestDecision.ACCEPTED, null); load() } else runStep(cid, 0, s)
    }
    fun reject(s: Suggestion, reason: String) { if (reasonValid(SuggestDecision.REJECTED, reason)) viewModelScope.launch { decide(s, SuggestDecision.REJECTED, reason); load() } }
    fun later(s: Suggestion) { viewModelScope.launch { decide(s, SuggestDecision.LATER, null); load() } }

    private suspend fun decide(s: Suggestion, d: SuggestDecision, reason: String?) {
        val r = api.bff("/api/tekshiruv", "POST", decisionBody(s.id, d, reason))
        val code = (r.body as? kotlinx.serialization.json.JsonObject)?.get("code")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
        if (r.networkError) _ui.update { it.copy(message = uz.anncorp.smeta.core.data.OFFLINE_WRITE_MESSAGE) }
        else if (!r.ok) _ui.update { it.copy(message = suggestionErrorText(r.code ?: code)) }
    }

    // ---- lifecycle (server decides who may do what) ----
    fun step(to: F2Status, reason: String?) {
        val cid = companyId() ?: return
        val p = _ui.value.page ?: return
        if (_ui.value.stepBusy) return
        val a = F2Act(aktId, p.head.obyektId ?: objectId, p.head.raqam, p.head.oy, p.head.lifecycle, p.rows.size, p.unpriced, null, false, p.head.versiya)
        viewModelScope.launch {
            _ui.update { it.copy(stepBusy = true, message = null) }
            when (val r = transitions.transition(cid, a, to, java.util.UUID.randomUUID().toString(), reason)) {
                is F2TransitionResult.Done -> { _ui.update { it.copy(stepBusy = false, message = "step") }; load() }
                is F2TransitionResult.Error -> _ui.update { it.copy(stepBusy = false, message = if (r.offline) OFFLINE_WRITE_MESSAGE else serverErrorText(r.code)) }
            }
        }
    }
}
