package uz.anncorp.smeta.feature.hub

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ModulesRepository
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.kpi
import uz.anncorp.smeta.core.data.Picks
import uz.anncorp.smeta.core.data.Prefs
import uz.anncorp.smeta.core.data.RowsRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.QatorEntity
import javax.inject.Inject

data class HubUi(
    val hasCompany: Boolean = false,
    val loading: Boolean = true,
    /** Null while unknown (offline / not loaded): the catalogue shows everything, like the website does while loading. */
    val permissions: Set<String>? = null,
    val offModules: Set<String> = emptySet(),
    val picks: Picks = Picks(),
    val query: String = "",
    val edit: Boolean = false,
    val objectHits: List<ObyektEntity> = emptyList(),
    val rowHits: List<QatorEntity> = emptyList(),
    val recent: List<ObyektEntity> = emptyList(),
    /** Cached objects (the workspace's "places"): recent first, then the rest. */
    val places: List<ObyektEntity> = emptyList(),
    val objectCount: Int = -1,
    /** Unread notifications (server counter) for the bell badge on the hub; null = unknown. */
    val unread: Int? = null,
    /** Server-driven role workspace of the selected cabinet (null = not loaded / old server: the plain module launcher is shown). */
    val workspace: uz.anncorp.smeta.core.data.Workspace? = null,
    /** Boss-panel numbers for the hub preview card (cached copy first; null = not a boss cabinet / nothing known yet). */
    val kpi: uz.anncorp.smeta.core.data.RahbarKpi? = null,
)

/** Pure: objects whose name contains the query (case-insensitive), at most [limit]. */
internal fun matchObjects(all: List<ObyektEntity>, query: String, limit: Int = 8): List<ObyektEntity> {
    val q = query.trim()
    return if (q.length < 2) emptyList() else all.filter { it.nom.contains(q, ignoreCase = true) }.take(limit)
}

/** Pure: recent ids resolved against the cached list, keeping recency order and dropping objects that no longer exist. */
internal fun resolveRecent(ids: List<Long>, all: List<ObyektEntity>): List<ObyektEntity> {
    val byId = all.associateBy { it.id }
    return ids.mapNotNull { byId[it] }
}

@OptIn(ExperimentalCoroutinesApi::class, kotlinx.coroutines.FlowPreview::class)
@HiltViewModel
class HubViewModel @Inject constructor(
    private val modules: ModulesRepository,
    private val objects: ObjectsRepository,
    private val rows: RowsRepository,
    private val work: WorkContext,
    private val prefs: Prefs,
    private val today: uz.anncorp.smeta.core.data.TodayRepository,
    private val workspaces: uz.anncorp.smeta.core.data.WorkspaceRepository,
    private val rahbar: uz.anncorp.smeta.core.data.RahbarRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(HubUi())
    val state: StateFlow<HubUi> = _state.asStateFlow()
    private val query = MutableStateFlow("")

    init {
        // Reload access + picks whenever the selected workplace changes.
        viewModelScope.launch {
            work.current.map { it?.companyId }.distinctUntilChanged().collect { id ->
                if (id == null) { _state.update { it.copy(hasCompany = false, loading = false) }; return@collect }
                _state.update { it.copy(hasCompany = true, loading = true) }
                launch { workspaces.refresh(id) }
                val picks = modules.picks(id)
                _state.update { it.copy(picks = picks) }
                val a = modules.access(id)
                _state.update { it.copy(permissions = a.permissions, offModules = a.offModules, loading = false) }
            }
        }
        // The workspace is shared with the top-bar cabinet switcher (HomeViewModel); the hub only renders it.
        viewModelScope.launch { workspaces.current.collect { w -> _state.update { it.copy(workspace = w) } } }
        // Boss KPI preview: the cached panel is shown at once, refreshed once per company switch. Only for boss roles (the server still decides access).
        viewModelScope.launch {
            work.current.flatMapLatest { w ->
                if (w == null || !uz.anncorp.smeta.core.data.isBossRole(w.rol)) flowOf(null) else rahbar.observe(w.companyId).map { it?.kpi() }
            }.collect { k -> _state.update { it.copy(kpi = k) } }
        }
        viewModelScope.launch {
            work.current.map { w -> w?.takeIf { uz.anncorp.smeta.core.data.isBossRole(it.rol) }?.companyId }.distinctUntilChanged().collect { id -> if (id != null) rahbar.refresh(id) }
        }
        // Objects of this workplace (cached) -> recent + count.
        viewModelScope.launch {
            combine(work.current.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) }, prefs.recent) { all, ids -> all to ids }
                .collect { (all, ids) -> val rec = resolveRecent(ids, all); _state.update { it.copy(recent = rec, places = (rec + all.filter { o -> rec.none { r -> r.id == o.id } }).take(8), objectCount = all.size) } }
        }
        // Debounced global search: modules are filtered in the UI; objects and cached smeta rows here.
        viewModelScope.launch {
            query.debounce(250).collect { q ->
                val w = work.current.value
                if (w == null || q.trim().length < 2) { _state.update { it.copy(objectHits = emptyList(), rowHits = emptyList()) }; return@collect }
                val all = objects.observe(w.companyId).first()
                val hits = matchObjects(all, q)
                val rowHits = runCatching { rows.searchCompany(w.companyId, q) }.getOrDefault(emptyList())
                _state.update { it.copy(objectHits = hits, rowHits = rowHits) }
            }
        }
    }

    /** Re-reads the unread counter (called each time the hub is shown). */
    fun refreshUnread() { if (work.current.value == null) return; viewModelScope.launch { _state.update { it.copy(unread = today.unread() ?: it.unread) } } }

    fun setQuery(v: String) { query.value = v; _state.update { it.copy(query = v) } }
    fun toggleEdit() = _state.update { it.copy(edit = !it.edit) }
    fun togglePin(code: String) = savePicks(_state.value.picks.toggle(code))
    fun move(code: String, delta: Int) = savePicks(_state.value.picks.move(code, delta))

    private fun savePicks(p: Picks) {
        _state.update { it.copy(picks = p) } // instant; the server copy is synced best-effort
        val id = work.current.value?.companyId ?: return
        viewModelScope.launch {
            val saved = modules.save(id, p)
            _state.update { it.copy(picks = it.picks.copy(version = saved.version)) }
        }
    }
}
