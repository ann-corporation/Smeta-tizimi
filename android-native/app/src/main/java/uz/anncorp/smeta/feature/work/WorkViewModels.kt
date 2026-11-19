package uz.anncorp.smeta.feature.work

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ConnectivityMonitor
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.F2Repository
import uz.anncorp.smeta.core.data.FaktRepository
import uz.anncorp.smeta.core.data.SectionProgress
import uz.anncorp.smeta.core.data.sectionProgress
import uz.anncorp.smeta.core.data.MoneyRepository
import uz.anncorp.smeta.core.data.ObjectMoney
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.HierarchyRepository
import uz.anncorp.smeta.core.data.HierarchySource
import uz.anncorp.smeta.core.data.ObjectLeaf
import uz.anncorp.smeta.core.data.Prefs
import uz.anncorp.smeta.core.data.ScopeOption
import uz.anncorp.smeta.core.data.TreeFilter
import uz.anncorp.smeta.core.data.TreeRow
import uz.anncorp.smeta.core.data.WorkScope
import uz.anncorp.smeta.core.data.allGroupKeys
import uz.anncorp.smeta.core.data.buildObjectTree
import uz.anncorp.smeta.core.data.flattenTree
import uz.anncorp.smeta.core.data.loyihaOptions
import uz.anncorp.smeta.core.data.normalizeScope
import uz.anncorp.smeta.core.data.objectLeaf
import uz.anncorp.smeta.core.data.shartnomaOptions
import uz.anncorp.smeta.core.data.toggleKey
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.RowsRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.Totals
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.db.DraftEntity
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.db.OutboxEntity
import uz.anncorp.smeta.core.db.QatorEntity
import java.time.LocalDate
import javax.inject.Inject

/** What the connectivity/outbox banner shows. */
data class BannerState(val online: Boolean = true, val queued: Int = 0, val failed: Int = 0) {
    val visible get() = !online || queued > 0 || failed > 0
}

@HiltViewModel
class BannerViewModel @Inject constructor(connectivity: ConnectivityMonitor, outbox: OutboxRepository) : ViewModel() {
    val state: StateFlow<BannerState> = combine(connectivity.online, outbox.queuedCount, outbox.failedCount) { o, q, f -> BannerState(o, q, f) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), BannerState())
}

data class ObjectsUi(
    /** Every object of the company (the empty state decides on this, not on the filtered tree). */
    val items: List<ObyektEntity> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val query: String = "",
    val noCompany: Boolean = false,
    val money: Map<Long, ObjectMoney> = emptyMap(),
    /** Loyiha > Shartnoma > Obyekt rows ready to draw (search keeps the tree and opens the parents). */
    val rows: List<TreeRow> = emptyList(),
    val shownCount: Int = 0,
    /** False while the grouping source is unreadable: the screen then shows the plain list and says so. */
    val hasHierarchy: Boolean = false,
    val scope: WorkScope = WorkScope(),
    val holat: String? = null,
    val statuses: List<String> = emptyList(),
    val loyihaOptions: List<ScopeOption> = emptyList(),
    val shartnomaOptions: List<ScopeOption> = emptyList(),
    val currentId: Long? = null,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ObjectsViewModel @Inject constructor(
    private val repo: ObjectsRepository, private val moneyRepo: MoneyRepository, private val ctx: WorkContext,
    private val hierRepo: HierarchyRepository, private val prefs: Prefs,
) : ViewModel() {
    private val query = MutableStateFlow("")
    private val holat = MutableStateFlow<String?>(null)
    private val sync = MutableStateFlow(SyncUi(loading = true))
    private data class SyncUi(val loading: Boolean = false, val refreshing: Boolean = false, val result: SyncResult? = null)
    private data class Inputs(val items: List<ObyektEntity>, val hier: HierarchySource?, val money: Map<Long, ObjectMoney>, val scope: WorkScope, val expanded: Set<String>?)

    private val company: Flow<Workplace?> = ctx.current
    @Volatile private var snap: Inputs? = null
    @Volatile private var companyId: Long? = null

    private val inputs: Flow<Inputs> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList<ObyektEntity>()) else repo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else hierRepo.observe(w.companyId) },
        moneyRepo.observeAll(),
        company.flatMapLatest { w -> if (w == null) flowOf(WorkScope()) else prefs.scopeFlow(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else prefs.expandedFlow(w.companyId) },
    ) { items, hier, money, scope, exp -> Inputs(items, hier, money, scope, exp).also { snap = it } }

    val state: StateFlow<ObjectsUi> = combine(
        inputs, company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.lastUpdated(w.companyId) }, query, holat, sync,
    ) { i, ts, q, h, s ->
        val leaves = leavesOf(i.items, i.money)
        val tree = buildObjectTree(leaves, i.hier, TreeFilter(q, i.scope.loyihaId, i.scope.shartnomaId, h))
        ObjectsUi(
            i.items, s.loading && i.items.isEmpty(), s.refreshing, s.result, ts, q, noCompany = ctx.current.value == null, money = i.money,
            rows = flattenTree(tree, i.expanded, forceOpen = q.isNotBlank()), shownCount = tree.leafCount, hasHierarchy = i.hier != null,
            scope = i.scope, holat = h, statuses = i.hier?.loyihalar?.mapNotNull { it.holat?.takeIf { x -> x.isNotBlank() } }?.distinct().orEmpty(),
            loyihaOptions = loyihaOptions(leaves, i.hier), shartnomaOptions = shartnomaOptions(leaves, i.hier, i.scope.loyihaId), currentId = i.scope.obyektId,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ObjectsUi())

    init {
        viewModelScope.launch { company.collect { w -> companyId = w?.companyId; if (w != null) refresh(initial = true) } }
    }

    fun setQuery(q: String) { query.value = q }
    fun setHolat(h: String?) { holat.value = h }

    private fun leaves(i: Inputs) = leavesOf(i.items, i.money)
    private fun currentTree(i: Inputs) = buildObjectTree(leaves(i), i.hier, TreeFilter(query.value, i.scope.loyihaId, i.scope.shartnomaId, holat.value))

    /** Context change from the filter row; the contract / object stay only while they still fit (see [normalizeScope]). */
    fun setScope(change: (WorkScope) -> WorkScope) {
        val cid = companyId ?: return; val i = snap ?: return
        prefs.setScope(cid, normalizeScope(change(i.scope), leaves(i), i.hier))
    }

    fun toggle(key: String) {
        val cid = companyId ?: return; val i = snap ?: return
        prefs.setExpanded(cid, toggleKey(i.expanded, currentTree(i), key))
    }

    fun expandAll(all: Boolean) {
        val cid = companyId ?: return; val i = snap ?: return
        prefs.setExpanded(cid, if (all) allGroupKeys(currentTree(i)) else emptySet())
    }

    /** An object was opened from the tree: it becomes the current context object. */
    fun picked(id: Long) {
        val cid = companyId ?: return; val i = snap ?: return
        prefs.setScope(cid, i.scope.copy(obyektId = id)); prefs.pushRecent(id)
    }

    fun refresh(initial: Boolean = false) {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.update { it.copy(loading = initial, refreshing = !initial) }
            val r = repo.refresh(w.companyId)
            sync.value = SyncUi(result = r)
            // Sum packages for the list and the grouping source (best effort: a role without the right keeps the dashes / the plain list).
            launch { hierRepo.refresh(w.companyId) }
            moneyRepo.refreshCompany(w.companyId)
        }
    }
}

/** Objects as tree leaves: the server estimate package when known, otherwise only the direct amount (never a guessed QQS / markup). */
internal fun leavesOf(items: List<ObyektEntity>, money: Map<Long, ObjectMoney>): List<ObjectLeaf> =
    items.map { o -> objectLeaf(o.id, o.nom, o.tur, o.qatorSoni, o.narxsiz, money[o.id], o.jami) }

/** Backs the shell's "Kontekst" switch: the chosen loyiha / shartnoma / obyekt, kept per company. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ScopeViewModel @Inject constructor(
    repo: ObjectsRepository, private val hierRepo: HierarchyRepository, private val ctx: WorkContext, private val prefs: Prefs,
) : ViewModel() {
    data class Ui(val leaves: List<ObjectLeaf> = emptyList(), val hier: HierarchySource? = null, val scope: WorkScope = WorkScope())
    private val company: Flow<Workplace?> = ctx.current
    val state: StateFlow<Ui> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList<ObyektEntity>()) else repo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else hierRepo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(WorkScope()) else prefs.scopeFlow(w.companyId) },
    ) { items, hier, scope -> Ui(items.map { ObjectLeaf(it.id, it.nom, it.tur) }, hier, scope) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Ui())

    init { viewModelScope.launch { company.collect { w -> if (w != null) hierRepo.refresh(w.companyId) } } }

    fun set(s: WorkScope) {
        val w = ctx.current.value ?: return; val ui = state.value
        prefs.setScope(w.companyId, normalizeScope(s, ui.leaves, ui.hier))
    }
}

data class CardUi(
    val obyekt: ObyektEntity? = null,
    val money: ObjectMoney? = null,
    val totals: Totals? = null,
    val rows: Int = 0,
    val source: String? = null,
    val updatedAt: Long? = null,
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val sections: List<SectionProgress> = emptyList(),
    /** Accepted / draft F-2 acts of this object (null = never loaded; empty = none). */
    val f2: List<F2Act>? = null,
    /** Result of the last money (server package) read: only a real 403 means "no permission"; null while it is still loading. */
    val moneyResult: SyncResult? = null,
)

@HiltViewModel
class ObjectCardViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val rows: RowsRepository, private val moneyRepo: MoneyRepository, private val ctx: WorkContext,
    private val f2Repo: F2Repository,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val sync = MutableStateFlow<Pair<Boolean, SyncResult?>>(true to null)
    private val moneyResult = MutableStateFlow<SyncResult?>(null)

    val state: StateFlow<CardUi> = combine(
        objects.observeOne(id), rows.totals(id), rows.rowCount(id), rows.source(id), rows.lastUpdated(id),
    ) { a, b, c, d, e -> CardUi(a, null, b, c, d, e) }
        .combine(moneyRepo.observe(id)) { ui, m -> ui.copy(money = m) }
        .combine(rows.all(id)) { ui, list -> ui.copy(sections = sectionProgress(list)) }
        .combine(f2Repo.observe(id)) { ui, f -> ui.copy(f2 = f) }
        .combine(moneyResult) { ui, m -> ui.copy(moneyResult = m) }
        .combine(sync) { ui, s -> ui.copy(syncing = s.first, result = s.second) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CardUi())

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            sync.value = true to null
            moneyResult.value = null
            val r = rows.sync(id)
            moneyResult.value = ctx.current.value?.let { moneyRepo.refreshObject(it.companyId, id) } ?: SyncResult.Failed("NO_WORKPLACE")
            f2Repo.refresh(id)   // best effort: a role without F-2 read keeps an empty timeline
            sync.value = false to r
        }
    }
}
data class FaktUi(
    val query: String = "",
    val results: List<QatorEntity> = emptyList(),
    val drafted: Map<Long, DraftEntity> = emptyMap(),
    val title: String = "",
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val rowCount: Int = 0,
    val updatedAt: Long? = null,
    val sections: List<String> = emptyList(),
    val section: String? = null,
)

@OptIn(ExperimentalCoroutinesApi::class, kotlinx.coroutines.FlowPreview::class)
@HiltViewModel
class FaktViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val rows: RowsRepository, private val fakt: FaktRepository,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val query = MutableStateFlow("")
    private val sync = MutableStateFlow<Pair<Boolean, SyncResult?>>(true to null)

    private val section = MutableStateFlow<String?>(null)
    private val results = combine(query.debounce(120), section) { q, s -> q to s }.flatMapLatest { (q, s) -> rows.search(id, q, s) }

    val state: StateFlow<FaktUi> = combine(
        query, results, fakt.drafts(id), objects.observeOne(id), sync,
    ) { q, r, d, o, s -> FaktUi(q, r, d.associateBy { it.qatorId }, o?.nom.orEmpty(), s.first, s.second) }
        .combine(rows.rowCount(id)) { ui, n -> ui.copy(rowCount = n) }
        .combine(rows.lastUpdated(id)) { ui, t -> ui.copy(updatedAt = t) }
        .combine(rows.sections(id)) { ui, list -> ui.copy(sections = list) }
        .combine(section) { ui, s -> ui.copy(section = s) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), FaktUi())

    init { refresh() }

    fun setQuery(q: String) { query.value = q }
    fun setSection(s: String?) { section.value = s }

    fun refresh() {
        viewModelScope.launch {
            sync.value = true to null
            sync.value = false to rows.sync(id)
        }
    }

    fun addToDraft(row: QatorEntity, hajm: Double) { viewModelScope.launch { fakt.addToDraft(row, hajm) } }
    fun removeFromDraft(qatorId: Long) { viewModelScope.launch { fakt.removeFromDraft(id, qatorId) } }
}

data class DraftUi(
    val title: String = "",
    val lines: List<DraftEntity> = emptyList(),
    val date: LocalDate = LocalDate.now(),
    val saving: Boolean = false,
    val savedId: String? = null,
    val role: String = "",
    /** Photos attached to this fact (one flow: fact + photo evidence + note), and the note they carry. */
    val photos: Int = 0,
    val note: String = "",
) {
    val exceeding get() = lines.count { it.exceeds }
    val belowZero get() = lines.count { it.goesBelowZero }
}

@HiltViewModel
class DraftViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val fakt: FaktRepository, private val ctx: WorkContext,
    private val processor: uz.anncorp.smeta.core.media.PhotoProcessor, private val photoQueue: uz.anncorp.smeta.core.data.PhotoRepository,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val date = MutableStateFlow(LocalDate.now())
    private val saving = MutableStateFlow<String?>(null)
    private val attached = MutableStateFlow<List<uz.anncorp.smeta.core.media.ProcessedPhoto>>(emptyList())
    private val noteFlow = MutableStateFlow("")

    val state: StateFlow<DraftUi> = combine(fakt.drafts(id), objects.observeOne(id), date, saving, ctx.current) { d, o, dt, s, w ->
        DraftUi(o?.nom.orEmpty(), d, dt, savedId = s, role = w?.rol.orEmpty())
    }.combine(attached) { ui, p -> ui.copy(photos = p.size) }
        .combine(noteFlow) { ui, n -> ui.copy(note = n) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DraftUi())

    fun setDate(d: LocalDate) { date.value = d }
    fun setNote(s: String) { noteFlow.value = s.take(500) }
    fun addPhoto(uri: android.net.Uri) { viewModelScope.launch { runCatching { processor.process(uri) }.getOrNull()?.let { p -> attached.update { it + p } } } }
    fun clearPhotos() { attached.value = emptyList() }
    fun updateLine(row: DraftEntity, hajm: Double) { viewModelScope.launch { fakt.addToDraftFromEntity(row, hajm) } }
    fun remove(qatorId: Long) { viewModelScope.launch { fakt.removeFromDraft(id, qatorId) } }
    fun clear() { viewModelScope.launch { fakt.clearDraft(id) } }

    fun save(onSaved: () -> Unit) {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            val nom = state.value.title.ifBlank { "#$id" }
            val firstRow = state.value.lines.firstOrNull()?.qatorId
            val op = fakt.save(w.companyId, w.rol, id, nom, date.value)
            saving.value = op
            if (op != null) {
                // Photo evidence rides along with the same save: queued once, linked to the first fact row, with the typed note (position never attached here).
                attached.value.forEach { p -> photoQueue.enqueue(uz.anncorp.smeta.core.media.ProcessedPhoto(p.jpeg, p.width, p.height, p.sha256, null, null), w.companyId, id, nom, firstRow, noteFlow.value, date.value) }
                attached.value = emptyList(); noteFlow.value = ""
                onSaved()
            }
        }
    }
}

data class OutboxUi(val active: List<OutboxEntity> = emptyList(), val done: List<OutboxEntity> = emptyList())

@HiltViewModel
class OutboxViewModel @Inject constructor(private val outbox: OutboxRepository, private val fakt: FaktRepository) : ViewModel() {
    val state: StateFlow<OutboxUi> = combine(outbox.active, outbox.recentDone) { a, d -> OutboxUi(a, d) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), OutboxUi())

    fun retry(id: String) { viewModelScope.launch { outbox.retry(id) } }
    fun delete(id: String) { viewModelScope.launch { outbox.delete(id) } }
    fun edit(id: String, onDraft: (Long) -> Unit) { viewModelScope.launch { fakt.reopenAsDraft(id)?.let(onDraft) } }
}

