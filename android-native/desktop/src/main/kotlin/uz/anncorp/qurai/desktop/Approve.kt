package uz.anncorp.qurai.desktop

import uz.anncorp.qurai.ui.components.*

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ApprovalDetail
import uz.anncorp.smeta.core.data.ApprovalDoc
import uz.anncorp.smeta.core.data.ApprovalItem
import uz.anncorp.smeta.core.data.ApprovalsRepository
import uz.anncorp.smeta.core.data.Decision
import uz.anncorp.smeta.core.data.DecisionError
import uz.anncorp.smeta.core.data.DecisionResult
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.F2Status
import uz.anncorp.smeta.core.data.F2TransitionRepository
import uz.anncorp.smeta.core.data.F2TransitionResult
import uz.anncorp.smeta.core.data.SyncResult
import uz.anncorp.smeta.core.data.decisionErrorText
import uz.anncorp.smeta.core.data.f2CanReject
import uz.anncorp.smeta.core.data.f2NextStep
import uz.anncorp.smeta.core.data.f2StepLabel
import uz.anncorp.smeta.core.data.serverErrorText
import java.util.UUID

/** Approve / return / reject one document of the approvals inbox (Windows). Logic is :shared (ApprovalsRepository.decide); this is only the window. */
@Composable
fun ApprovalDialog(c: Ctx, item: ApprovalItem, onClose: (changed: Boolean) -> Unit) {
    val repo = remember { ApprovalsRepository(c.sv.api) }
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<ApprovalDetail?>(null) }
    var doc by remember { mutableStateOf<ApprovalDoc?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf<String?>(null) }
    var comment by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    var seen by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(item.id, reload) {
        loading = true
        val (r, d, dc) = repo.detail(c.place.companyId, item.id)
        detail = d; doc = dc; seen = d?.stepToken
        failed = if (r is SyncResult.Ok) null else if (r is SyncResult.Offline) Tx.offlineWrite else "Yuklab bo'lmadi"
        loading = false
    }

    fun decide(d: Decision) {
        if (busy) return
        if (d.needsComment && comment.isBlank()) { msg = "Sababni yozing"; return }
        scope.launch {
            busy = true; msg = null
            when (val r = repo.decide(c.place.companyId, item.id, seen, d, comment)) {
                DecisionResult.Done -> { busy = false; onClose(true); return@launch }
                is DecisionResult.Error -> { msg = decisionErrorText(r.kind, r.code); if (r.kind == DecisionError.NOT_YOUR_TURN || r.kind == DecisionError.CHANGED) reload++ }
            }
            busy = false
        }
    }

    val dt = detail
    QDialog(
        item.sarlavha.ifBlank { "Hujjat" }, { if (!busy) onClose(false) },
        buttons = {
            if (dt?.myTurn == true) {
                QSecondaryButton(onClick = { decide(Decision.RETURN) }, enabled = !busy) { Text("Qaytarish") }
                QSecondaryButton(onClick = { decide(Decision.REJECT) }, enabled = !busy) { Text("Rad etish") }
                QPrimaryButton(onClick = { decide(Decision.APPROVE) }, enabled = !busy) { Text("Tasdiqlash") }
            }
            QGhostButton(onClick = { onClose(false) }, enabled = !busy) { Text("Yopish") }
        },
    ) {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (loading) QLoading()
                failed?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                doc?.let { d ->
                    QKv("Turi", d.tur); QKv("Raqam", d.raqam ?: Tx.dash); QKv("Obyekt", d.obyekt ?: Tx.dash); QKv("Sana", d.sana ?: Tx.dash)
                    QKv("Jami (QQS siz)", money(d.jami))
                }
                dt?.steps?.forEach { s -> QKv("${s.tartib}. ${s.rol}", s.holat + (if (s.men) " (siz)" else "")) }
                if (dt != null && !dt.myTurn) Text(serverErrorText("NAVBAT_EMAS"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (dt?.myTurn == true) QInput(comment, { comment = it }, label = "Izoh (rad etish va qaytarish uchun majburiy)", modifier = Modifier.fillMaxWidth(), minLines = 2)
                msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
    }
}

/** Next lifecycle step of an F-2 act (submit -> checked -> approved) and rejection of a checked act; the database enforces roles and separation of duties. */
@Composable
fun F2StepBar(c: Ctx, act: F2Act, onChanged: () -> Unit) {
    val repo = remember { F2TransitionRepository(c.sv.api) }
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    var reason by remember(act.id) { mutableStateOf("") }
    var rejecting by remember(act.id) { mutableStateOf(false) }
    val next = f2NextStep(act.state) ?: return
    fun go(to: F2Status, why: String?) {
        if (busy) return
        scope.launch {
            busy = true; msg = null
            when (val r = repo.transition(c.place.companyId, act, to, UUID.randomUUID().toString(), why)) {
                is F2TransitionResult.Done -> { rejecting = false; onChanged() }
                is F2TransitionResult.Error -> msg = if (r.offline) Tx.offlineWrite else serverErrorText(r.code)
            }
            busy = false
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QPrimaryButton(onClick = { go(next, null) }, enabled = !busy) { Text(f2StepLabel(act.state) ?: "") }
            if (f2CanReject(act.state)) QSecondaryButton(onClick = { rejecting = !rejecting }, enabled = !busy) { Text("Rad etish") }
        }
        if (rejecting) {
            QInput(reason, { reason = it }, label = "Rad etish sababi", modifier = Modifier.fillMaxWidth())
            QPrimaryButton(onClick = { if (reason.isBlank()) msg = serverErrorText("REASON_REQUIRED") else go(F2Status.REJECTED, reason) }, enabled = !busy) { Text("Rad etishni tasdiqlash") }
        }
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
/** Server totals of the selected act: QQS bilan (main), ustamali, ustamasiz - never computed here. */
@Composable
fun AktSummaStrip(c: Ctx, aktId: Long) {
    val repo = remember(c.sv) { uz.anncorp.smeta.core.data.AktSummaRepository(c.sv.api) }
    var res by remember(aktId) { mutableStateOf<uz.anncorp.smeta.core.data.AktSumma?>(null) }
    LaunchedEffect(aktId) { res = null; res = repo.load(aktId) }
    when (val r = res) {
        null -> QHint("Akt summasi yuklanmoqda...")
        is uz.anncorp.smeta.core.data.AktSumma.Known -> {
            PackStrip("Akt summasi (server)", r.pack)
            if ((r.unpriced ?: 0) > 0) QHint("Narxsiz qatorlar: ${r.unpriced} - ularning summasi jamiga kirmagan.")
        }
        is uz.anncorp.smeta.core.data.AktSumma.Unknown -> QHint(uz.anncorp.smeta.core.data.aktSummaUnknownText(r.code))
    }
}