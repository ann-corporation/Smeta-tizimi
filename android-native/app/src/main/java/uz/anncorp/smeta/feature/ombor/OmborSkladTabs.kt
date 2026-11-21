package uz.anncorp.smeta.feature.ombor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.db.ObyektEntity
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard

/** The «Kirim» main tab's `Berdim → obyekt` and the create-warehouse notice live in the screen; this file holds the table tabs of the site's TestSklad. */

// =========================== Kirim (OmborKirimJadval) ===========================
@Composable
fun KirimTab(skladId: Long, canWrite: Boolean, tick: Int, vm: OmborDataViewModel = hiltViewModel()) {
    val cid = vm.companyId ?: return
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(KFilter()) }; var applied by remember { mutableStateOf(KFilter()) }
    var offset by rememberSaveable { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<KPage?>(null) }; var failed by remember { mutableStateOf(false) }; var loading by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var storno by remember { mutableStateOf<KRow?>(null) }
    LaunchedEffect(cid, skladId, applied, offset, tick, reload) {
        loading = true; failed = false
        val r = vm.sb(kirimRoyxatRequest(cid, skladId, applied, OMBOR_PAGE, offset)); loading = false
        val p = if (r.ok) parseKirimRoyxat(r.body) else null
        if (p != null) data = p else { data = null; failed = true }
    }
    LaunchedEffect(skladId) { draft = KFilter(); applied = KFilter(); offset = 0 }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(draft.qidir, { draft = draft.copy(qidir = it) }, singleLine = true, label = { Text(stringResource(R.string.sk2_mat_nomi)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
        OutlinedTextField(draft.yetkazuvchi, { draft = draft.copy(yetkazuvchi = it) }, singleLine = true, label = { Text(stringResource(R.string.sk2_yetkazuvchi)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SkladDateField(stringResource(R.string.sk2_sanadan), draft.dan, { draft = draft.copy(dan = it) }, Modifier.weight(1f)); SkladDateField(stringResource(R.string.sk2_sanagacha), draft.gacha, { draft = draft.copy(gacha = it) }, Modifier.weight(1f))
        }
        OutlinedTextField(draft.tur, { draft = draft.copy(tur = it) }, singleLine = true, label = { Text(stringResource(R.string.sk2_tur_misol)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { applied = draft; offset = 0 }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk2_qidirish)) }
            OutlinedButton(onClick = { draft = KFilter(); applied = KFilter(); offset = 0 }, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) { Text(stringResource(R.string.sk2_tozalash)) }
        }
        if (failed) Text(stringResource(R.string.sk2_kirim_oqib_bolmadi), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        if (loading && data == null) Text(stringResource(R.string.sk2_yuklanmoqda), style = MaterialTheme.typography.bodySmall)
        data?.let { d ->
            if (d.jami == 0) Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(stringResource(if (applied != KFilter()) R.string.sk2_shartga_mos_yoq else R.string.sk2_omborda_kirim_yoq), style = MaterialTheme.typography.titleSmall)
                Text(stringResource(R.string.sk2_excel_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                val rows = d.rows.map { q ->
                    listOf(Cell(q.sana), Cell(content = {
                        Column { Text(q.nomi, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                            if (q.storno) Text(stringResource(R.string.sk2_storno_belgi), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                    }), Cell(q.birligi), Cell(fmtN(q.miqdor), bold = true, end = true), Cell(q.postavshik ?: stringResource(R.string.sk2_korsatilmagan)), Cell(q.manbaTuri ?: q.tur ?: "—"),
                        Cell(stringResource(R.string.sk2_manba_qator, q.faylId?.toString() ?: "—", q.varaq ?: "—", q.qator?.toString() ?: "—"), color = MaterialTheme.colorScheme.onSurfaceVariant),
                        Cell(content = { if (canWrite && stornoPossible(q)) OutlinedButton(onClick = { storno = q }, modifier = Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.sk2_storno)) } }))
                }
                SkladTable(listOf(R.string.sk2_sana, R.string.sk2_material, R.string.sk2_birlik, R.string.sk2_miqdor, R.string.sk2_yetkazuvchi, R.string.sk2_tur, R.string.sk2_manba, R.string.sk2_storno).map { stringResource(it) },
                    listOf(96.dp, 200.dp, 70.dp, 100.dp, 160.dp, 90.dp, 200.dp, 120.dp), rows, null, endCols = setOf(3))
                Text(stringResource(R.string.sk2_korsatilmoqda, offset + 1, minOf(offset + OMBOR_PAGE, d.jami), d.jami), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SkladPager(d.jami, offset, loading, { offset = it })
                MaterialJami(d, stringResource(R.string.sk2_mat_jami_filtr), false)
            }
        }
    }
    storno?.let { row -> StornoDialog(row, onDismiss = { storno = null }, onSend = { reason, op, done -> scope.launch { val c = omborCode(vm.sbYoz(stornoPayload(cid, row.id, reason, op))); done(c); if (c == null) { storno = null; reload++ } } }, opId = vm.opId()) }
}

@Composable
private fun StornoDialog(row: KRow, opId: String, onDismiss: () -> Unit, onSend: (String, String, (String?) -> Unit) -> Unit) {
    var reason by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }; var err by remember { mutableStateOf<String?>(null) }
    val op = remember(row.id) { opId }
    val msgs = mapOf("window" to R.string.sk2_storno_24, "already" to R.string.sk2_storno_already, "not" to R.string.sk2_storno_not, "reason" to R.string.sk2_sabab_yozing, "fail" to R.string.sk2_storno_fail)
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() }, title = { Text(stringResource(R.string.sk2_storno_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(row.nomi, style = MaterialTheme.typography.bodyMedium); Text(stringResource(R.string.sk2_storno_izoh), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(reason, { reason = it.take(1000) }, label = { Text(stringResource(R.string.sk2_sabab_maj)) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                err?.let { Text(stringResource(msgs[stornoMessageKey(it)] ?: R.string.sk2_storno_fail), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = { TextButton(enabled = reason.isNotBlank() && !busy, onClick = { busy = true; err = null; onSend(reason, op) { c -> busy = false; err = c } }) { Text(stringResource(R.string.sk2_storno_qilish)) } },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(stringResource(R.string.sk2_bekor_qilish)) } },
    )
}

/** Site MaterialJami: per-material totals; `balance` adds Rasxod and Qoldiq (unknown expense is never shown as zero). */
@Composable
private fun MaterialJami(d: KPage, title: String, balance: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall)
        val heads = listOf(R.string.sk2_material, R.string.sk2_kirim, R.string.sk2_storno) + if (balance) listOf(R.string.sk2_rasxod, R.string.sk2_qoldiq) else listOf(R.string.sk2_sof_kirim)
        val rows = d.materiallar.map { m ->
            listOf(Cell(m.nomi + " " + m.birligi), Cell(fmtN(m.kirim), end = true), Cell(fmtN(m.storno), end = true)) +
                if (balance) listOf(Cell(if (d.rasxodKiritilgan) "—" else stringResource(R.string.sk2_kiritilmagan), color = MaterialTheme.colorScheme.tertiary, end = true), Cell(if (d.rasxodKiritilgan) fmtN(m.sofKirim) else "—", end = true))
                else listOf(Cell(fmtN(m.sofKirim), bold = true, end = true))
        }
        SkladTable(heads.map { stringResource(it) }, listOf(220.dp, 90.dp, 90.dp, 110.dp, 110.dp).take(heads.size), rows, null, endCols = (1 until heads.size).toSet())
    }
}

// =========================== Qoldiq (OmborQoldiqJadval) ===========================
@Composable
fun KirimQoldiqTab(skladId: Long, tick: Int, vm: OmborDataViewModel = hiltViewModel()) {
    val cid = vm.companyId ?: return
    var data by remember { mutableStateOf<KPage?>(null) }; var failed by remember { mutableStateOf(false) }
    LaunchedEffect(cid, skladId, tick) {
        failed = false
        val r = vm.sb(kirimRoyxatRequest(cid, skladId, KFilter(), 1, 0)); val p = if (r.ok) parseKirimRoyxat(r.body) else null
        if (p != null) data = p else { data = null; failed = true }
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (failed) Text(stringResource(R.string.sk2_qoldiq_oqib_bolmadi), color = MaterialTheme.colorScheme.error)
        data?.let { d ->
            if (!d.rasxodKiritilgan) WorkCard { Column(Modifier.padding(12.dp)) {
                Text(stringResource(R.string.sk2_rasxod_yoq), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.tertiary)
                Text(stringResource(R.string.sk2_qoldiq_formula), style = MaterialTheme.typography.bodySmall)
            } }
            if (d.materiallar.isEmpty()) Text(stringResource(R.string.sk2_omborda_kirim_yoq), Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            else MaterialJami(d, stringResource(R.string.sk2_mat_boyicha_qoldiq), true)
        }
        if (data == null && !failed) Text(stringResource(R.string.sk2_yuklanmoqda), style = MaterialTheme.typography.bodySmall)
    }
}

// =========================== Jamlangan ombor ===========================
private val OBJ_COLORS = listOf(Color(0xFF3B82F6), Color(0xFF10B981), Color(0xFFF59E0B), Color(0xFF8B5CF6), Color(0xFFEF4444), Color(0xFF06B6D4))

@Composable
fun KonsTab(skladId: Long?, tick: Int, vm: OmborDataViewModel = hiltViewModel()) {
    if (skladId == null) { Text(stringResource(R.string.sk2_omborni_tanlang), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); return }
    var rows by remember { mutableStateOf<List<KonsRow>?>(null) }
    LaunchedEffect(skladId, tick) { rows = null; val r = vm.sb(konsRequest(skladId)); rows = if (r.ok) parseSb(r.body)?.rows?.let(::parseKons) ?: emptyList() else emptyList() }
    val data = rows
    if (data == null) { Box(Modifier.fillMaxWidth().height(160.dp).background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(16.dp))); return }
    val colors = remember(data) { val m = linkedMapOf<Long, Color>(); data.forEach { k -> k.obyektlar.forEach { if (it.obyektId !in m) m[it.obyektId] = OBJ_COLORS[m.size % OBJ_COLORS.size] } }; m }
    val tableRows = data.map { k ->
        listOf(Cell(k.nomi, bold = true), Cell(fmtN(k.jami) + " " + k.birligi, bold = true, color = if (k.jami < 0) MaterialTheme.colorScheme.error else null, end = true), Cell(content = {
            val sh = konsShares(k.obyektlar)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(Modifier.fillMaxWidth().height(8.dp).background(MaterialTheme.colorScheme.surfaceContainerHighest, RoundedCornerShape(4.dp))) {
                    sh.filter { it.share > 0 }.forEach { Box(Modifier.weight(it.share.toFloat()).height(8.dp).background(colors[it.obj.obyektId] ?: Color.Gray)) }
                }
                sh.forEach { s ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(8.dp).background(colors[s.obj.obyektId] ?: Color.Gray, RoundedCornerShape(2.dp)))
                        Text(s.obj.nom, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        Text(fmtN(s.obj.qoldiq), style = MaterialTheme.typography.labelSmall, color = if (s.negative) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }))
    }
    SkladTable(listOf(R.string.sk2_material, R.string.sk2_jami_qoldiq, R.string.sk2_taqsimot).map { stringResource(it) }, listOf(170.dp, 130.dp, 280.dp), tableRows, stringResource(R.string.sk2_kons_bosh), endCols = setOf(1))
}

// =========================== Obyekt qoldiqlari ===========================
@Composable
fun ObjectFilter(objects: List<ObyektEntity>, objId: Long?, onPick: (Long?) -> Unit) {
    SkladSelect(stringResource(R.string.sk2_barcha_obyektlar), listOf("" to stringResource(R.string.sk2_barcha_obyektlar)) + objects.map { it.id.toString() to it.nom }, objId?.toString() ?: "", { onPick(it.toLongOrNull()) }, Modifier.fillMaxWidth())
}

@Composable
fun ObjQoldiqTab(rows: List<SkladRow>, objects: List<ObyektEntity>, objId: Long?, loading: Boolean, onPick: (Long?) -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }; var passport by remember { mutableStateOf<SkladRow?>(null) }
    val shown = rows.filter { (objId == null || it.obyektId == objId) && it.nomi.lowercase().contains(q.lowercase()) }
    val names = objects.associate { it.id to it.nom }
    val byObj = rows.groupBy { it.obyektId }.map { (id, l) -> (names[id] ?: "#$id") to l.size }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.sk2_obj_izoh), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (byObj.isNotEmpty()) Text(byObj.joinToString(" · ") { "${it.first}: ${it.second}" }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ObjectFilter(objects, objId, onPick)
        OutlinedTextField(q, { q = it }, singleLine = true, label = { Text(stringResource(R.string.sk2_mat_nom_boyicha)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
        if (loading) Box(Modifier.fillMaxWidth().height(120.dp).background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(16.dp)))
        else {
            val err = MaterialTheme.colorScheme.error; val warn = MaterialTheme.colorScheme.tertiary; val ok = MaterialTheme.colorScheme.primary
            val tableRows = shown.mapIndexed { i, r ->
                val qty = r.qty ?: 0.0
                listOf(Cell("#" + (r.id ?: (i + 1).toLong()).toString().padStart(4, '0'), color = MaterialTheme.colorScheme.onSurfaceVariant), Cell(r.nomi, bold = true),
                    Cell(fmtN(r.qty) + " " + r.birligi, bold = true, color = if (qty < 0) err else null, end = true),
                    Cell(stringResource(when (skladPositionState(qty)) { -1 -> R.string.sk2_manfiy; 0 -> R.string.sk2_tugagan; else -> R.string.sk2_bor }), color = when (skladPositionState(qty)) { -1 -> err; 0 -> warn; else -> ok }),
                    Cell(skladStamp(r.last), color = MaterialTheme.colorScheme.onSurfaceVariant),
                    Cell(content = { TextButton(onClick = { passport = r }) { Text(stringResource(R.string.sk2_qr_pasport)) } }))
            }
            SkladTable(listOf(R.string.sk2_id, R.string.sk2_material, R.string.sk2_qoldiq, R.string.sk2_holat, R.string.sk2_oxirgi_harakat, R.string.sk2_qr_pasport).map { stringResource(it) },
                listOf(70.dp, 200.dp, 120.dp, 90.dp, 140.dp, 130.dp), tableRows, stringResource(R.string.sk2_obj_bosh) + "\n" + stringResource(R.string.sk2_obj_bosh2), endCols = setOf(2))
        }
    }
    passport?.let { p ->
        AlertDialog(onDismissRequest = { passport = null }, title = { Text(stringResource(R.string.sk2_qr_pasport)) },
            text = { Column { Text(p.nomi, style = MaterialTheme.typography.titleSmall); Text(stringResource(R.string.sk2_qoldiq) + ": " + fmtN(p.qty) + " " + p.birligi); Text(stringResource(R.string.sk2_obyekt) + ": " + (names[p.obyektId] ?: "—")); Text(stringResource(R.string.sk2_oxirgi_harakat) + ": " + skladStamp(p.last)) } },
            confirmButton = { TextButton(onClick = { passport = null }) { Text(stringResource(R.string.pk2_2)) } })
    }
}

// =========================== Harakatlar tarixi (KirimKunlikJurnal) ===========================
@Composable
fun JurnalTab(objects: List<ObyektEntity>, objId: Long?, onPick: (Long?) -> Unit, tick: Int, vm: OmborDataViewModel = hiltViewModel()) {
    val cid = vm.companyId ?: return
    var rows by remember { mutableStateOf<List<Jurnal>>(emptyList()) }; var busy by remember { mutableStateOf(false) }; var failed by remember { mutableStateOf(false) }; var partial by remember { mutableStateOf(false) }
    var again by remember { mutableIntStateOf(0) }; var offset by remember { mutableIntStateOf(0) }
    LaunchedEffect(cid, objId, tick, again) {
        rows = emptyList(); failed = false; partial = false; offset = 0
        val o = objId ?: return@LaunchedEffect
        busy = true; val r = vm.sb(jurnalRequest(cid, o)); busy = false
        val p = if (r.ok) parseSb(r.body) else null
        if (p == null) failed = true else { rows = parseJurnal(p.rows); partial = !p.complete }
    }
    val unknown = stringResource(R.string.sk2_nomalum)
    fun u(s: String?) = s?.trim().takeUnless { it.isNullOrEmpty() } ?: unknown
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ObjectFilter(objects, objId, onPick)
        if (objId == null) Text(stringResource(R.string.sk2_jurnal_tanlang), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.sk2_jurnal_title), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.sk2_kompaniya) + ": " + cid + " · " + stringResource(R.string.sk2_obyekt) + ": " + (objects.firstOrNull { it.id == objId }?.nom ?: stringResource(R.string.sk2_tanlanmagan)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(onClick = { again++ }, enabled = !busy && objId != null, modifier = Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.sk2_yangilash)) }
        }
        Text(stringResource(R.string.sk2_jurnal_izoh), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (busy) Text(stringResource(R.string.sk2_jurnal_yuk), style = MaterialTheme.typography.bodySmall)
        if (failed) Text(stringResource(R.string.sk2_jurnal_xato), color = MaterialTheme.colorScheme.error)
        if (partial && !busy) Text(stringResource(R.string.sk2_jurnal_qism), color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall)
        if (!busy && !failed) {
            val page = rows.drop(offset).take(OMBOR_PAGE)
            val tr = page.map { r ->
                listOf(Cell(u(r.sana)), Cell(u(r.yaratildi)), Cell(u(r.holat)), Cell(when (r.amal) { "prixod" -> stringResource(R.string.sk2_keldi); "rasxod" -> stringResource(R.string.sk2_berdim); else -> u(r.amal) }),
                    Cell(content = { Column { Text(u(r.nomi), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface); Text(u(r.turi), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }),
                    Cell(if (r.miqdor == null) unknown else fmtN(r.miqdor) + " " + (r.birligi?.takeIf { it.isNotBlank() } ?: unknown), end = true), Cell(u(r.postavshik)), Cell(u(r.qabul)),
                    Cell((r.izoh?.trim().takeUnless { it.isNullOrEmpty() } ?: r.qabulTuri ?: unknown) + if (!r.izoh?.trim().isNullOrEmpty() && r.qabulTuri != null) " · ${r.qabulTuri}" else ""), Cell(u(r.kim)))
            }
            SkladTable(listOf(R.string.sk2_sana, R.string.sk2_yaratilgan_vaqt, R.string.sk2_holat, R.string.sk2_harakat, R.string.sk2_material, R.string.sk2_miqdor, R.string.sk2_yetkazuvchi, R.string.sk2_qabul_qiluvchi, R.string.sk2_maqsad_izoh, R.string.sk2_kim_kiritdi).map { stringResource(it) },
                listOf(96.dp, 170.dp, 90.dp, 90.dp, 200.dp, 120.dp, 140.dp, 140.dp, 220.dp, 120.dp), tr, stringResource(R.string.sk2_jurnal_bosh), endCols = setOf(5))
            SkladPager(rows.size, offset, false, { offset = it })
        }
        Text(stringResource(R.string.sk2_jurnal_soni, rows.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// =========================== M-29 hisobot ===========================
@Composable
fun M29Tab(onOpen: () -> Unit) {
    WorkCard(onClick = onOpen) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.sk2_m29_title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.sk2_m29_body), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.sk2_m29_open), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        }
    }
}
