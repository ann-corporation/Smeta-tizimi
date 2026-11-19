package uz.anncorp.smeta.feature.ombor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.db.ObyektEntity
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

/** Section/tab ids follow the site etalon (SAYT_OMBOR_ETALON.md). */
object SkladTab { const val KEEPER = 0; const val IN = 1; const val STOCK = 2; const val CONS = 3; const val OBJ = 4; const val HIST = 5; const val M29 = 6 }
object SkladSub { const val BERDIM = 0; const val IN = 1; const val OUT = 2; const val TODAY = 3; const val REPORT = 4; const val STOCK = 5; const val LUGAT = 6 }

data class SkladUi(
    val loaded: Boolean = false, val error: Boolean = false, val warehouses: List<Warehouse> = emptyList(), val skladId: Long? = null,
    val objects: List<ObyektEntity> = emptyList(), val rows: List<SkladRow> = emptyList(), val access: OmborAccess = OmborAccess.None,
    val tab: Int = SkladTab.KEEPER, val sub: Int = SkladSub.IN, val hint: Boolean = false,
    // BERDIM
    val central: List<StockRow> = emptyList(), val centralLoading: Boolean = false, val centralError: Boolean = false, val berdimBusy: Boolean = false, val berdimError: String? = null, val berdimSeq: Int = 0,
    // KELDI / chiqim panel
    val suggest: SuggestResult? = null, val kirimBusy: Boolean = false, val kirimError: String? = null, val vat: Double = QQS_DEFAULT, val priceMode: PriceMode = PriceMode.WITH,
    val doneMessage: Int? = null,
) { val warehouse: Warehouse? get() = warehouses.firstOrNull { it.id == skladId } }

@HiltViewModel
class OmborSkladViewModel @Inject constructor(private val api: BffApi, private val ctx: WorkContext, private val objects: ObjectsRepository, private val repo: OmborRepository) : ViewModel() {
    private val _ui = MutableStateFlow(SkladUi())
    val ui: StateFlow<SkladUi> = _ui
    private val berdimOp = BerdimOp { UUID.randomUUID().toString() }
    private var observeJob: Job? = null; private var suggestJob: Job? = null; private var centralJob: Job? = null

    private fun cid() = ctx.current.value?.companyId

    init { viewModelScope.launch { ctx.current.collect { w -> if (w != null) reload() } } }

    fun reload() {
        val c = cid() ?: return
        _ui.update { it.copy(access = OmborAccess.forRole(ctx.current.value?.rol), error = false) }
        viewModelScope.launch {
            val wh = api.bff("/api/sb", "POST", warehousesRequest(c)).let { r -> if (r.ok) parseSb(r.body)?.rows?.let(::parseWarehouses) else null }
            val st = api.bff("/api/sb", "POST", objectStockRequest(c)).let { r -> if (r.ok) parseSb(r.body)?.rows?.let(::parseSkladRows) else null }
            objects.refresh(c)
            val mode = repo.priceMode(c, _ui.value.skladId ?: 0L).let { if (it == "siz") PriceMode.WITHOUT else PriceMode.WITH }
            _ui.update { u ->
                val list = wh ?: u.warehouses
                u.copy(loaded = true, error = wh == null && st == null, warehouses = list, rows = st ?: u.rows, skladId = pickWarehouse(list, u.skladId == null && u.loaded, u.skladId), priceMode = mode)
            }
        }
        observeJob?.cancel(); observeJob = viewModelScope.launch { objects.observe(c).collect { list -> _ui.update { it.copy(objects = list) } } }
    }

    fun selectWarehouse(id: Long?) = _ui.update { it.copy(skladId = id, central = emptyList(), suggest = null, berdimError = null, kirimError = null) }
    fun setTab(t: Int) = _ui.update { it.copy(tab = t) }
    fun setSub(s: Int) = _ui.update { it.copy(sub = s, kirimError = null, berdimError = null, suggest = null) }
    fun consumeMessage() = _ui.update { it.copy(doneMessage = null) }
    /** BERDIM / KELDI buttons (site kirimOch / chiqimOch): they need a chosen warehouse; the page shows «Avval omborni tanlang.» otherwise. */
    fun open(sub: Int): Boolean {
        if (_ui.value.skladId == null) { _ui.update { it.copy(hint = true) }; return false }
        _ui.update { it.copy(tab = SkladTab.KEEPER, sub = sub, hint = false, kirimError = null, berdimError = null) }
        return true
    }

    // ---- BERDIM: material from the central stock (sklad_markaziy_qoldiq_v1), write sklad_berdim_v1 ----
    fun searchCentral(q: String) {
        val c = cid() ?: return; val s = _ui.value.skladId ?: return
        centralJob?.cancel()
        centralJob = viewModelScope.launch {
            _ui.update { it.copy(centralLoading = true, centralError = false) }
            if (q.isNotBlank()) delay(250)
            val body = centralStockRequest(c, s).let { b -> kotlinx.serialization.json.JsonObject(b + ("qidir" to kotlinx.serialization.json.JsonPrimitive(q.trim())) + ("limit" to kotlinx.serialization.json.JsonPrimitive(30))) }
            val r = api.bff("/api/sb", "POST", body)
            val rows = if (r.ok) parseCentralStock(r.body) else null
            _ui.update { it.copy(centralLoading = false, centralError = rows == null, central = rows.orEmpty()) }
        }
    }

    fun berdim(objectId: Long, material: StockRow, qty: String, to: String, date: String) {
        val c = cid() ?: return; val s = _ui.value.skladId ?: return
        val q = berdimQty(qty) ?: return
        if (_ui.value.berdimBusy) return
        val opId = berdimOp.idFor(c, s, objectId, material.nomi, material.birligi, q.toPlainString(), date, to)
        viewModelScope.launch {
            _ui.update { it.copy(berdimBusy = true, berdimError = null) }
            val code = omborCode(api.bff("/api/sb-yoz", "POST", transferPayload(c, s, objectId, material.nomi, material.birligi, q, date, to.trim().ifBlank { null }, null, opId)))
            if (code == null) { berdimOp.done(); _ui.update { it.copy(berdimBusy = false, doneMessage = uz.anncorp.smeta.R.string.bd_done, berdimSeq = it.berdimSeq + 1) }; reload() }
            else _ui.update { it.copy(berdimBusy = false, berdimError = code) }
        }
    }

    // ---- KELDI (kirim) / chiqim panel (site OmborKiritish): suggestions + one write ----
    fun suggest(q: String, kind: String, supplier: String?) {
        val c = cid() ?: return; val s = _ui.value.skladId ?: return
        suggestJob?.cancel()
        suggestJob = viewModelScope.launch {
            if (q.isNotBlank()) delay(200)
            val r = api.bff(COMMAND_PATH, "POST", suggestRequest(c, s, q, kind, supplier))
            parseSuggestResult(r.body)?.let { res -> _ui.update { it.copy(suggest = res, vat = res.vat) } }
        }
    }
    fun clearSuggest() { suggestJob?.cancel(); _ui.update { it.copy(suggest = null) } }

    fun setPriceMode(m: PriceMode) {
        val c = cid() ?: return; val s = _ui.value.skladId ?: return
        _ui.update { it.copy(priceMode = m) }
        viewModelScope.launch { repo.setPriceMode(c, s, m.wire) }
    }

    fun saveKirim(i: KirimInput, onSaved: () -> Unit) {
        val c = cid() ?: return; val s = _ui.value.skladId ?: return
        if (_ui.value.kirimBusy) return
        viewModelScope.launch {
            _ui.update { it.copy(kirimBusy = true, kirimError = null) }
            val code = omborCode(api.bff(COMMAND_PATH, "POST", yozBody(c, s, i)))
            if (code == null) { _ui.update { it.copy(kirimBusy = false, doneMessage = if (i.kind == "chiqim") uz.anncorp.smeta.R.string.ki_out_done else uz.anncorp.smeta.R.string.ki_in_done) }; onSaved(); reload() }
            else _ui.update { it.copy(kirimBusy = false, kirimError = code) }
        }
    }

    fun newOperationId(): String = UUID.randomUUID().toString()
    fun today(): String = LocalDate.now().toString()
}
