package uz.anncorp.smeta.feature.ombor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.db.ObyektEntity
import java.math.BigDecimal
import javax.inject.Inject

/** Voice / typed command state: recording, waiting for the server, the preview card to confirm, or a short message. */
data class CmdUi(val recording: Boolean = false, val working: Boolean = false, val preview: CommandPreview? = null, val message: CmdMessage? = null, val suggestions: List<NameSuggestion> = emptyList(), val question: AskQuestion? = null)
enum class CmdMessage { NO_MIC, TOO_SHORT, OFFLINE, FORBIDDEN, NOT_UNDERSTOOD, UNAVAILABLE, FAILED, LOW_STOCK, NO_WAREHOUSE }

data class OmborUi(
    val cmd: CmdUi = CmdUi(),
    /** True when the balance list is computed from the movement history (the server stock table is empty). */
    val computedBalance: Boolean = false,
    val access: OmborAccess = OmborAccess.None,
    val scope: OmborScope = OmborScope.AllObjects,
    val query: String = "",
    val rows: List<StockRow> = emptyList(),
    /** Unfiltered rows of the current scope (the entry form suggests material names from these). */
    val scopeRows: List<StockRow> = emptyList(),
    val allObjectRows: List<StockRow> = emptyList(),
    val objects: List<ObyektEntity> = emptyList(),
    val warehouses: List<Warehouse> = emptyList(),
    val syncing: Boolean = true,
    val result: SyncResult? = null,
    val updatedAt: Long? = null,
    val noCompany: Boolean = false,
    /** Every cached movement (kirim + chiqim) of the company; the screen filters it per tab / material. */
    val moves: List<OmborMove> = emptyList(),
    /** Remembered QQS choice ("bilan" / "siz") for a receipt price in the warehouse being commanded. */
    val priceMode: String = "bilan",
) {
    val objectNames: Map<Long, String> get() = objects.associate { it.id to it.nom }
    val scopes: List<OmborScope>
        get() = warehouses.map { OmborScope.Central(it.id, it.nomi) } + objects.map { OmborScope.Obyekt(it.id, it.nom) }
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class OmborViewModel @Inject constructor(
    private val repo: OmborRepository, private val objects: ObjectsRepository, private val ctx: WorkContext, private val history: OmborHistoryRepository,
    private val commands: OmborCommandApi, private val recorder: AudioRecorder,
) : ViewModel() {
    private val cmd = MutableStateFlow(CmdUi())
    private val priceMode = MutableStateFlow("bilan")
    private val query = MutableStateFlow("")
    private val scope = MutableStateFlow<OmborScope>(OmborScope.AllObjects)
    private data class Sync(val syncing: Boolean = true, val result: SyncResult? = null)
    private val sync = MutableStateFlow(Sync())

    private val company = ctx.current

    private data class Data(val rows: List<StockRow>, val wh: List<Warehouse>, val objs: List<ObyektEntity>, val central: List<StockRow>, val ts: Long?, val moves: List<OmborMove>)

    private val central: Flow<List<StockRow>> = combine(company, scope) { w, s -> w to s }.flatMapLatest { (w, s) ->
        if (w != null && s is OmborScope.Central) repo.centralStock(w.companyId, s.id) else flowOf(emptyList())
    }
    private val data: Flow<Data> = combine(
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else repo.objectStock(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else repo.warehouses(w.companyId) },
        company.flatMapLatest { w -> if (w == null) flowOf(emptyList()) else objects.observe(w.companyId) },
        central,
        company.flatMapLatest { w -> if (w == null) flowOf(null) else repo.updated(w.companyId) },
    ) { a, b, c, d, e -> Data(a, b, c, d, e, emptyList()) }.combine(company.flatMapLatest { w -> if (w == null) flowOf(emptyList<OmborMove>()) else history.observe(w.companyId) }) { d, f -> d.copy(moves = f) }

    val state: StateFlow<OmborUi> = combine(data, query, scope, sync, company) { d, q, s, sy, w ->
        val computed = s !is OmborScope.Central && d.rows.isEmpty() && d.moves.isNotEmpty()
        val base = if (s is OmborScope.Central) d.central else if (computed) balanceFromMoves(d.moves) else d.rows
        OmborUi(
            access = OmborAccess.forRole(w?.rol), scope = s, query = q,
            rows = filterStock(base, s, q), scopeRows = filterStock(base, s, ""), allObjectRows = d.rows,
            objects = d.objs, warehouses = d.wh, syncing = sy.syncing, result = sy.result, updatedAt = d.ts, noCompany = w == null, moves = d.moves, computedBalance = computed,
        )
    }.combine(cmd) { s, c -> s.copy(cmd = c) }.combine(priceMode) { s, m -> s.copy(priceMode = m) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), OmborUi())

    init {
        viewModelScope.launch { company.collect { if (it != null) refresh() } }
    }

    fun setQuery(q: String) { query.value = q }

    private fun lang(): String = if (java.util.Locale.getDefault().language == "ru") "ru" else "uz"

    /** Press: start the microphone. False = not allowed / not available (the screen asks for permission). */
    fun startRecording(): Boolean {
        val ok = recorder.start()
        cmd.value = if (ok) CmdUi(recording = true) else CmdUi(message = CmdMessage.NO_MIC)
        return ok
    }

    /** The central warehouse the command acts on: the one being viewed, else the company's first. Null = none to act on (the server needs a warehouse). */
    private fun commandWarehouse(): Long? = (scope.value as? OmborScope.Central)?.id ?: state.value.warehouses.firstOrNull()?.id

    /** Release: stop and send the recording; the server understands it and answers with a preview. */
    fun stopRecording() {
        val audio = recorder.stop()
        val w = ctx.current.value
        if (audio == null || w == null) { cmd.value = CmdUi(message = CmdMessage.TOO_SHORT); return }
        val sklad = commandWarehouse() ?: run { cmd.value = CmdUi(message = CmdMessage.NO_WAREHOUSE); return }
        lastText = ""
        launchCommand { priceMode.value = repo.priceMode(w.companyId, sklad); commands.audio(w.companyId, sklad, audio, lang()) }
    }

    fun cancelRecording() { recorder.cancel(); cmd.value = CmdUi() }

    fun sendCommand(text: String) {
        val w = ctx.current.value ?: return
        if (text.isBlank()) return
        val sklad = commandWarehouse() ?: run { cmd.value = CmdUi(message = CmdMessage.NO_WAREHOUSE); return }
        lastText = text
        launchCommand { val m = repo.priceMode(w.companyId, sklad); priceMode.value = m; commands.text(w.companyId, sklad, text, lang(), m) }
    }

    /** The text a clarifying question refers to (typed, or what the server heard for a recording). */
    private var lastText: String = ""

    /** Tap on an answer button: the same text is sent again with the choice. Without buttons the user just types more (the field stays). */
    fun answerQuestion(choice: AskOption) {
        val w = ctx.current.value ?: return
        val sklad = commandWarehouse() ?: run { cmd.value = CmdUi(message = CmdMessage.NO_WAREHOUSE); return }
        val text = lastText.ifBlank { cmd.value.question?.heard.orEmpty() }
        if (text.isBlank()) { cmd.value = CmdUi(message = CmdMessage.NOT_UNDERSTOOD); return }
        launchCommand { commands.answer(w.companyId, sklad, text, lang(), choice) }
    }

    private fun failMessage(o: CommandOutcome): CmdUi = when (o) {
        is CommandOutcome.Preview -> CmdUi(preview = o.preview)
        is CommandOutcome.Question -> CmdUi(question = o.question)
        CommandOutcome.Offline -> CmdUi(message = CmdMessage.OFFLINE)
        CommandOutcome.Forbidden -> CmdUi(message = CmdMessage.FORBIDDEN)
        CommandOutcome.NotUnderstood -> CmdUi(message = CmdMessage.NOT_UNDERSTOOD)
        CommandOutcome.LowStock -> CmdUi(message = CmdMessage.LOW_STOCK)
        CommandOutcome.Unavailable -> CmdUi(message = CmdMessage.UNAVAILABLE)
        is CommandOutcome.Failed -> CmdUi(message = CmdMessage.FAILED)
    }

    private fun launchCommand(call: suspend () -> CommandOutcome) {
        cmd.value = CmdUi(working = true)
        viewModelScope.launch { cmd.value = failMessage(call()) }
    }

    private var suggestJob: kotlinx.coroutines.Job? = null

    /**
     * Autocomplete for the name field: names this warehouse entered before (the server remembers them; most recent / most frequent first).
     * Debounced; an empty list when nothing matches or the network is down. A new name is simply accepted and suggested next time.
     */
    fun suggest(query: String) {
        suggestJob?.cancel()
        val w = ctx.current.value ?: return
        val sklad = commandWarehouse() ?: return
        suggestJob = viewModelScope.launch {
            kotlinx.coroutines.delay(200)
            val list = commands.suggest(w.companyId, sklad, query).orEmpty()
            cmd.update { it.copy(suggestions = list) }
        }
    }

    /**
     * Save the card: unchanged -> confirm the server's token as is; edited -> the server re-validates the edited values (fresh token), then confirm.
     * The server writes (permission, stock check, idempotent operation id); a stock shortfall or a refusal is shown as a message.
     */
    fun saveCommand(p: CommandPreview, name: String, unit: String, qty: Double?, party: String, note: String, objectName: String?, price: Double? = null, mode: String? = null, priceChanged: Boolean = false) {
        val w = ctx.current.value ?: return
        val sklad = commandWarehouse() ?: run { cmd.value = CmdUi(message = CmdMessage.NO_WAREHOUSE); return }
        val unchanged = p.token != null && name.trim() == p.name && unit.trim() == p.unit && qty == p.qty && party.trim() == p.party && note.trim() == p.note && !priceChanged
        cmd.value = CmdUi(working = true, preview = p)
        viewModelScope.launch {
            if (mode != null) { repo.setPriceMode(w.companyId, sklad, mode); priceMode.value = mode }
            val token = if (unchanged) p.token else if (qty == null) null else when (val o = commands.edited(w.companyId, sklad, p.kind, name, unit, qty, party, note, objectName, price, mode)) {
                is CommandOutcome.Preview -> o.preview.token
                else -> { cmd.value = failMessage(o); return@launch }
            }
            if (token == null) { cmd.value = CmdUi(message = CmdMessage.NOT_UNDERSTOOD); return@launch }
            cmd.value = when (commands.confirm(w.companyId, sklad, token)) {
                ConfirmOutcome.Saved -> { refresh(); CmdUi() }
                ConfirmOutcome.Offline -> CmdUi(message = CmdMessage.OFFLINE)
                ConfirmOutcome.Forbidden -> CmdUi(message = CmdMessage.FORBIDDEN)
                ConfirmOutcome.LowStock -> CmdUi(message = CmdMessage.LOW_STOCK)
                is ConfirmOutcome.Failed -> CmdUi(message = CmdMessage.FAILED)
            }
        }
    }
    fun dismissCommand() { cmd.value = CmdUi() }

    fun setScope(s: OmborScope) { scope.value = s; if (s is OmborScope.Central) refresh() }

    fun refresh() {
        val w = ctx.current.value ?: return
        val s = scope.value
        viewModelScope.launch {
            sync.update { it.copy(syncing = true) }
            val objectsDone = objects.refresh(w.companyId)
            val r = repo.refresh(w.companyId)
            val c = if (s is OmborScope.Central) repo.refreshCentral(w.companyId, s.id) else SyncResult.Ok
            launch { history.refresh(w.companyId) }
            sync.value = Sync(false, listOf(r, c, objectsDone).firstOrNull { it != SyncResult.Ok } ?: SyncResult.Ok)
        }
    }

    /**
     * Queues a receive/issue. [operationId] comes from the form (created when it opened), so a double tap enqueues once.
     * Returns the outcome for the screen: queued, already queued, or an input error.
     */
    fun submit(
        op: OmborOp, name: String, unit: String, quantity: String, date: String, source: OmborScope?, target: ObyektEntity?,
        party: String, partyType: String?, note: String, operationId: String, onDone: (Boolean) -> Unit,
    ) {
        val w = ctx.current.value ?: return onDone(false)
        val qty: BigDecimal = parseQuantity(quantity) ?: return onDone(false)
        if (validateEntry(op, name, unit, quantity, date, source, target?.id).isNotEmpty()) return onDone(false)
        viewModelScope.launch {
            val queued = when {
                op == OmborOp.RECEIVE && target != null -> repo.queue(
                    receivePayload(w.companyId, target.id, name, unit, qty, date, party, note, operationId),
                    AMAL_OMBOR_OBYEKT, operationId, target.id, target.nom,
                )
                op == OmborOp.ISSUE && source is OmborScope.Central && target != null -> repo.queue(
                    transferPayload(w.companyId, source.id, target.id, name, unit, qty, date, party, note, operationId),
                    AMAL_OMBOR_BERDIM, operationId, target.id, target.nom,
                )
                op == OmborOp.ISSUE && source is OmborScope.Obyekt -> repo.queue(
                    issueFromObjectPayload(w.companyId, source.id, name, unit, qty, date, party, partyType, note, operationId),
                    AMAL_OMBOR_OBYEKT, operationId, source.id, source.nom,
                )
                else -> false
            }
            // false = this operation id was already queued (double tap): the user still sees it in the outbox, so close the form.
            onDone(queued || repo.hasEntry(operationId))
        }
    }

    fun newOperationId(): String = repo.newOperationId()
}
