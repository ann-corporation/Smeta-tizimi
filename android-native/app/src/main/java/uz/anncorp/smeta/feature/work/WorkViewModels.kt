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
    val items: List<ObyektEntity> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val query: String = "",
    val noCompany: Boolean = false,
    val money: Map<Long, ObjectMoney> = emptyMap(),
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ObjectsViewModel @Inject constructor(private val repo: ObjectsRepository, private val moneyRepo: MoneyRepository, private val ctx: WorkContext) : ViewModel() {
    private val query = MutableStateFlow("")
    private val sync = MutableStateFlow(SyncUi(loading = true))
    private data class SyncUi(val loading: Boolean = false, val refreshing: Boolean = false, val result: SyncResult? = null)

    private val company: Flow<Workplace?> = ctx.current

    val state: StateFlow<ObjectsUi> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList<ObyektEntity>()) else repo.observe(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.lastUpdated(w.companyId) },
        query, sync, company,
    ) { items, ts, q, s, w ->
        val shown = if (q.isBlank()) items else items.filter { it.nom.contains(q.trim(), ignoreCase = true) || (it.tur ?: "").contains(q.trim(), ignoreCase = true) }
        ObjectsUi(shown, s.loading && items.isEmpty(), s.refreshing, s.result, ts, q, noCompany = w == null)
    }.combine(moneyRepo.observeAll()) { ui, m -> ui.copy(money = m) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ObjectsUi())

    init {
        viewModelScope.launch { company.collect { if (it != null) refresh(initial = true) } }
    }

    fun setQuery(q: String) { query.value = q }

    fun refresh(initial: Boolean = false) {
        val w = ctx.current.value ?: return
        viewModelScope.launch {
            sync.update { it.copy(loading = initial, refreshing = !initial) }
            val r = repo.refresh(w.companyId)
            sync.value = SyncUi(result = r)
            // Sum packages for the list (best effort: a role without the financial read right simply keeps the dashes).
            moneyRepo.refreshCompany(w.companyId)
        }
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

