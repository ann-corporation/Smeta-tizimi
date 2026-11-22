package uz.anncorp.smeta.feature.ombor

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.formatMoney
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

/** The tabs' single door to the same server endpoints the site calls (BFF allow-list: /api/ombor-buyruq, /api/sb, /api/sb-yoz). */
@HiltViewModel
class OmborDataViewModel @Inject constructor(private val api: BffApi, private val ctx: WorkContext) : ViewModel() {
    val companyId: Long? get() = ctx.current.value?.companyId
    suspend fun ombor(b: JsonObject): ApiResult = api.bff("/api/ombor-buyruq", "POST", b)
    suspend fun sb(b: JsonObject): ApiResult = api.bff("/api/sb", "POST", b)
    suspend fun sbYoz(b: JsonObject): ApiResult = api.bff("/api/sb-yoz", "POST", b)
    fun opId(): String = UUID.randomUUID().toString()
}

/** Site `omborXatoMatni`: the server's code -> a plain sentence. */
@Composable
internal fun skladErrText(code: String?): String = when (code) {
    "ALREADY_REVERSED" -> stringResource(R.string.sk2_x_reversed)
    "MOVEMENT_NOT_CORRECTABLE" -> stringResource(R.string.sk2_x_notcorr)
    "BYUDJET_TUGADI" -> stringResource(R.string.sk2_x_budget)
    "QOLDIQ_YETMAYDI", "PERMISSION_DENIED", "DATE_IN_FUTURE", "INVALID_INPUT", "OPERATION_ID_CONFLICT", "NETWORK", "TOKEN_YETMAYDI", "DATE_INVALID" -> omborErrorText(code)
    else -> stringResource(R.string.sk2_x_default)
}

internal fun fmtN(v: Double?): String = if (v == null) "—" else formatQty(v)
internal fun fmtMoney(v: Double?): String = if (v == null) "—" else formatMoney(v, 2)
private fun today(): String = LocalDate.now().toString()

@Composable
internal fun SkladSelect(label: String, options: List<Pair<String, String>>, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
            Text((options.firstOrNull { it.first == value }?.second ?: label), Modifier.weight(1f), maxLines = 1)
            Icon(Icons.Filled.ArrowDropDown, null)
        }
        DropdownMenu(open, { open = false }) { options.forEach { (k, v) -> DropdownMenuItem(text = { Text(v) }, onClick = { onChange(k); open = false }) } }
    }
}

// =========================== Hisobot (also the compact «Bugun» list) ===========================

/** Site OmborHisobotPaneli: period buttons, filters, totals, the table (Sana | Amal | Material | Miqdor | Kim / kimdan | Summa | QQS bilan) and paging. `compact` = «Bugun». */
@Composable
fun HisobotPanel(skladId: Long, compact: Boolean, canWrite: Boolean, tick: Int, vm: OmborDataViewModel = hiltViewModel()) {
    val cid = vm.companyId ?: return
    val scope = rememberCoroutineScope(); val context = LocalContext.current
    var davr by rememberSaveable { mutableStateOf(if (compact) "bugun" else "oy") }
    var dan by rememberSaveable { mutableStateOf("") }; var gacha by rememberSaveable { mutableStateOf("") }
    var op by rememberSaveable { mutableStateOf("") }; var qidir by rememberSaveable { mutableStateOf("") }
    var yet by rememberSaveable { mutableStateOf("") }; var qabul by rememberSaveable { mutableStateOf("") }; var obj by rememberSaveable { mutableStateOf("") }
    var offset by rememberSaveable { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<Hisobot?>(null) }; var err by remember { mutableStateOf<String?>(null) }; var loading by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var price by remember { mutableStateOf<Pair<Long, String>?>(null) }
    val f = HisobotFilter(davr, dan, gacha, op, qidir, yet, qabul, obj)
    LaunchedEffect(cid, skladId, f, offset, tick, reload) {
        if (qidir.isNotBlank() || yet.isNotBlank() || qabul.isNotBlank() || obj.isNotBlank()) delay(250)
        loading = true; err = null
        val r = vm.ombor(hisobotRequest(cid, skladId, f, offset))
        loading = false
        val h = if (r.ok) parseHisobot(r.body) else null
        if (h != null) data = h else { data = null; err = omborCode(r) ?: "x" }
    }
    fun upd(block: () -> Unit) { block(); offset = 0 }
    val saved = stringResource(R.string.sk2_narx_qoyildi)
    val errTxt = err?.let { skladErrText(it.takeIf { c -> c != "x" }) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!compact) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("bugun" to R.string.sk2_bugun, "hafta" to R.string.sk2_hafta, "oy" to R.string.sk2_oy, "otgan_oy" to R.string.sk2_otgan_oy, "ixtiyoriy" to R.string.sk2_ixtiyoriy).forEach { (k, r) ->
                    FilterChip(davr == k, { upd { davr = k } }, label = { Text(stringResource(r)) })
                }
            }
            if (davr == "ixtiyoriy") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SkladDateField(stringResource(R.string.sk2_dan), dan, { upd { dan = it } }, Modifier.weight(1f)); SkladDateField(stringResource(R.string.sk2_gacha), gacha, { upd { gacha = it } }, Modifier.weight(1f))
            }
            SkladSelect(stringResource(R.string.sk2_amal_turi), listOf("" to stringResource(R.string.sk2_kirim_chiqim), "prixod" to stringResource(R.string.sk2_faqat_kirim), "rasxod" to stringResource(R.string.sk2_faqat_chiqim)), op, { upd { op = it } })
            OutlinedTextField(qidir, { upd { qidir = it } }, singleLine = true, label = { Text(stringResource(R.string.sk2_material)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
            var more by rememberSaveable { mutableStateOf(false) }
            TextButton(onClick = { more = !more }) { Text(stringResource(R.string.sk2_koproq)) }
            if (more) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(yet, { upd { yet = it } }, singleLine = true, label = { Text(stringResource(R.string.sk2_yetkazuvchi)) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(qabul, { upd { qabul = it } }, singleLine = true, label = { Text(stringResource(R.string.sk2_kimga)) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(obj, { upd { obj = it } }, singleLine = true, label = { Text(stringResource(R.string.sk2_obyekt)) }, modifier = Modifier.fillMaxWidth())
            }
        }
        errTxt?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        data?.let { d -> HisobotJami(d, compact) }
        val rows = data?.rows.orEmpty().map { h ->
            val base = listOf(Cell(h.sana), Cell(stringResource(if (h.kirim) R.string.sk2_kirim else R.string.sk2_chiqim)), Cell(h.nomi), Cell(fmtN(h.miqdor) + " " + h.birligi, end = true),
                Cell((h.kontragent ?: "") + (h.obyekt?.let { " · $it" } ?: "")))
            if (compact) base else base + listOf(
                Cell(end = true, content = {
                    when {
                        h.summa != null -> Text(fmtMoney(h.summa), style = MaterialTheme.typography.bodySmall)
                        h.kirim -> if (price?.first == h.id) Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(price!!.second, { price = h.id to it }, singleLine = true, label = { Text(stringResource(R.string.sk2_narx_ixt)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                            TextButton(onClick = {
                                val p = price ?: return@TextButton
                                scope.launch {
                                    val r = vm.ombor(narxQoyBody(cid, skladId, h.id, p.second)); val c = omborCode(r)
                                    if (c == null) { price = null; Toast.makeText(context, saved, Toast.LENGTH_SHORT).show(); reload++ } else err = c
                                }
                            }) { Text(stringResource(R.string.sk2_saqlash)) }
                        } else Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(R.string.sk2_narxsiz), color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall)
                            if (canWrite) TextButton(onClick = { price = h.id to "" }) { Text(stringResource(R.string.sk2_narx_qoyish)) }
                        }
                        else -> {}
                    }
                }),
                Cell(h.summaQqs?.let { fmtMoney(it) } ?: "", end = true),
            )
        }
        val heads = listOf(R.string.sk2_sana, R.string.sk2_amal, R.string.sk2_material, R.string.sk2_miqdor, R.string.sk2_kim_kimdan, R.string.sk2_summa_siz, R.string.sk2_qqs_bilan).take(if (compact) 5 else 7).map { stringResource(it) }
        val widths = listOf(96.dp, 70.dp, 190.dp, 110.dp, 170.dp, 190.dp, 110.dp).take(heads.size)
        SkladTable(heads, widths, rows, if (!loading && data != null) stringResource(if (compact) R.string.sk2_bugun_bosh else R.string.sk2_topilmadi) else null, endCols = setOf(3, 5, 6).filter { it < heads.size }.toSet())
        data?.let { if (it.jamiQator > OMBOR_PAGE) SkladPager(it.jamiQator, offset, loading, { o -> offset = o }) }
    }
}

@Composable
private fun HisobotJami(d: Hisobot, compact: Boolean) {
    val j = d.jami
    WorkCard {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column {
                Text(stringResource(R.string.sk2_kirim) + ": " + j.kirimSoni, style = MaterialTheme.typography.titleSmall)
                Text(j.units.filter { it.kirim > 0 }.joinToString(" · ") { fmtN(it.kirim) + " " + it.unit }.ifEmpty { "—" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (j.kirimSumma > 0) {
                    Text(stringResource(R.string.sk2_summa_siz) + ": " + fmtMoney(j.kirimSumma), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.sk2_qqs_bilan) + " (${fmtN(j.qqsFoiz)}%): " + fmtMoney(j.kirimSummaQqs), style = MaterialTheme.typography.bodySmall)
                }
                if (j.narxsiz > 0) Text(stringResource(R.string.sk2_narxsiz_kirim) + ": " + j.narxsiz, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
            }
            Column {
                Text(stringResource(R.string.sk2_chiqim) + ": " + j.chiqimSoni, style = MaterialTheme.typography.titleSmall)
                Text(j.units.filter { it.chiqim > 0 }.joinToString(" · ") { fmtN(it.chiqim) + " " + it.unit }.ifEmpty { "—" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (d.chetlatilgan > 0 && !compact) Text(stringResource(R.string.sk2_chetlatilgan) + ": " + d.chetlatilgan, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// =========================== Qoldiq sub-tab: grouped balance + material card ===========================

/** Site QoldiqJadval: search, balance date, «Ko'proq» (only with balance), the grouped table; a row opens the material card (history + correction). */
@Composable
fun QoldiqSubPanel(skladId: Long, canWrite: Boolean, tick: Int, onChanged: () -> Unit, vm: OmborDataViewModel = hiltViewModel()) {
    val cid = vm.companyId ?: return
    var qidir by rememberSaveable { mutableStateOf("") }; var sana by rememberSaveable { mutableStateOf("") }; var musbat by rememberSaveable { mutableStateOf(true) }
    var offset by rememberSaveable { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<QPage?>(null) }; var err by remember { mutableStateOf<String?>(null) }; var loading by remember { mutableStateOf(false) }
    var card by remember { mutableStateOf<QGroup?>(null) }; var reload by remember { mutableIntStateOf(0) }
    val past = sana.isNotEmpty() && sana < today()
    LaunchedEffect(cid, skladId, qidir, sana, musbat, offset, tick, reload) {
        if (qidir.isNotBlank()) delay(250)
        loading = true; err = null
        val r = vm.ombor(qoldiqRequest(cid, skladId, qidir, musbat, if (past) sana else null, offset)); loading = false
        val p = if (r.ok) parseQoldiq(r.body) else null
        if (p != null) data = p else { data = null; err = omborCode(r) ?: "x" }
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(qidir, { qidir = it; offset = 0 }, singleLine = true, label = { Text(stringResource(R.string.sk2_qidirish_nom)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
        SkladDateField(stringResource(R.string.sk2_ostatka_sana), sana, { sana = it; offset = 0 }, Modifier.fillMaxWidth())
        var more by rememberSaveable { mutableStateOf(false) }
        TextButton(onClick = { more = !more }) { Text(stringResource(R.string.sk2_koproq)) }
        if (more) Row(Modifier.clickable { musbat = !musbat; offset = 0 }, verticalAlignment = Alignment.CenterVertically) { Checkbox(musbat, { musbat = it; offset = 0 }); Text(stringResource(R.string.sk2_faqat_ostatka)) }
        if (past) Text(stringResource(R.string.sk2_ostatka) + ": " + sana, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        err?.let { Text(skladErrText(it.takeIf { c -> c != "x" }), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        val groups = data?.rows.orEmpty()
        val rows = groups.map { g ->
            listOf(Cell(content = {
                Column { Text(g.nomi, style = MaterialTheme.typography.bodySmall.copy(fontSize = androidx.compose.ui.unit.TextUnit(13f, androidx.compose.ui.unit.TextUnitType.Sp)))
                    if (g.variantlar > 1) Text("(${g.variantlar} ${stringResource(R.string.sk2_yozuv)})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }), Cell(g.birligi), Cell(fmtN(g.kirim), end = true), Cell(fmtN(g.chiqim), end = true), Cell(fmtN(g.qoldiq), color = if (g.qoldiq < 0) MaterialTheme.colorScheme.error else null, bold = true, end = true))
        }
        SkladTable(listOf(R.string.sk2_material, R.string.sk2_birlik, R.string.sk2_kirim, R.string.sk2_chiqim, R.string.sk2_ostatka).map { stringResource(it) }, listOf(220.dp, 70.dp, 100.dp, 100.dp, 110.dp), rows,
            if (!loading && data != null) stringResource(R.string.sk2_topilmadi) else null, onRow = { card = groups[it] }, endCols = setOf(2, 3, 4))
        data?.let { SkladPager(it.jami, offset, loading, { o -> offset = o }) }
    }
    card?.let { g -> MaterialCard(cid, skladId, g, canWrite, vm, onDismiss = { card = null }, onChanged = { reload++; onChanged() }) }
}

/** Site MaterialKartasi: totals, the movement history, and «Tuzatish» (new quantity or cancel, reason required; operation id fixed per open form). */
@Composable
private fun MaterialCard(cid: Long, skladId: Long, g: QGroup, canWrite: Boolean, vm: OmborDataViewModel, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope(); val context = LocalContext.current
    var list by remember { mutableStateOf<List<THarakat>?>(null) }; var err by remember { mutableStateOf<String?>(null) }; var tick by remember { mutableIntStateOf(0) }
    var fix by remember { mutableStateOf<Long?>(null) }; var qty by remember { mutableStateOf("") }; var reason by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    var op by remember { mutableStateOf("") }
    LaunchedEffect(g, tick) {
        val r = vm.ombor(tarixRequest(cid, skladId, g.kalit, g.birligi)); val l = if (r.ok) parseTarix(r.body) else null
        if (l != null) list = l else err = omborCode(r) ?: "x"
    }
    val done = stringResource(R.string.sk2_tuzatildi); val need = stringResource(R.string.sk2_sabab_miqdor)
    fun send(cancel: Boolean, id: Long) {
        if (!tuzatValid(qty, reason, cancel)) { err = "need"; return }
        busy = true; err = null
        scope.launch {
            val r = vm.ombor(tuzatBody(cid, skladId, id, if (cancel) null else qty, reason, op)); val c = omborCode(r); busy = false
            if (c == null) { Toast.makeText(context, done, Toast.LENGTH_SHORT).show(); fix = null; tick++; onChanged() } else err = c
        }
    }
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(g.nomi, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    TextButton(onClick = onDismiss) { Text(stringResource(R.string.pk2_2)) }
                }
                Text(stringResource(R.string.sk2_ostatka) + ": " + fmtN(g.qoldiq) + " " + g.birligi + " · " + stringResource(R.string.sk2_kirim) + " " + fmtN(g.kirim) + " · " + stringResource(R.string.sk2_chiqim) + " " + fmtN(g.chiqim) +
                    if (g.variantlar > 1) " · ${g.variantlar} " + stringResource(R.string.sk2_variantlar_jamlangan) else "", style = MaterialTheme.typography.bodySmall)
                err?.let { Text(if (it == "need") need else skladErrText(it.takeIf { c -> c != "x" }), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                LazyColumn(Modifier.heightIn(max = 420.dp)) {
                    items(list.orEmpty(), key = { it.id }) { h ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val deco = if (h.teskari) TextDecoration.LineThrough else null
                            Row(verticalAlignment = Alignment.Top) {
                                Column(Modifier.weight(1f)) {
                                    Text(h.sana + " · " + (if (h.kirim) "+" else "−") + fmtN(h.miqdor) + " " + h.birligi, style = MaterialTheme.typography.bodyMedium, textDecoration = deco)
                                    Text(h.nomi + (h.postavshik?.let { " · $it" } ?: "") + (h.qabul?.let { " → $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textDecoration = deco)
                                }
                                if (canWrite && !h.teskari && h.manba in TUZATILADI) TextButton(onClick = { fix = h.id; qty = fmtPlain(h.miqdor); reason = ""; op = vm.opId(); err = null }) { Text(stringResource(R.string.sk2_tuzatish)) }
                            }
                            if (fix == h.id) {
                                OutlinedTextField(qty, { qty = it }, singleLine = true, label = { Text(stringResource(R.string.sk2_yangi_miqdor)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                                OutlinedTextField(reason, { reason = it }, singleLine = true, label = { Text(stringResource(R.string.sk2_sabab_maj)) }, modifier = Modifier.fillMaxWidth())
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    androidx.compose.material3.Button(onClick = { send(false, h.id) }, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk2_saqlash)) }
                                    OutlinedButton(onClick = { send(true, h.id) }, enabled = !busy, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk2_bekor_qilish)) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun fmtPlain(v: Double?): String = v?.let { java.math.BigDecimal.valueOf(it).stripTrailingZeros().toPlainString() } ?: ""
