@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package uz.anncorp.qurai.desktop

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QIconButton
import uz.anncorp.qurai.ui.components.QInput
import uz.anncorp.qurai.ui.components.QNote
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.components.QTone
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.fakt.ABC_KATLAR
import uz.anncorp.smeta.core.fakt.ABC_KAT_NOMI
import uz.anncorp.smeta.core.fakt.ABC_MANBA_NOMI
import uz.anncorp.smeta.core.fakt.AbcBoshlang
import uz.anncorp.smeta.core.fakt.AbcIsh
import uz.anncorp.smeta.core.fakt.AbcRejim
import uz.anncorp.smeta.core.fakt.AbcResurs
import uz.anncorp.smeta.core.fakt.AbcSaqlaIsh
import uz.anncorp.smeta.core.fakt.AbcTahrir
import uz.anncorp.smeta.core.fakt.IshTuriVariant
import uz.anncorp.smeta.core.fakt.JurnalMalumot
import uz.anncorp.smeta.core.fakt.NarxVariant
import uz.anncorp.smeta.core.fakt.ResursVariant
import uz.anncorp.smeta.core.fakt.abcEngYaxshiNarx
import uz.anncorp.smeta.core.fakt.abcHisobla
import uz.anncorp.smeta.core.fakt.abcKatAniqla
import uz.anncorp.smeta.core.fakt.abcSaqlaPayload
import uz.anncorp.smeta.core.fakt.abcSaqlaResurslari
import uz.anncorp.smeta.core.fakt.abcSon
import uz.anncorp.smeta.core.fakt.abcTahrirPayload
import uz.anncorp.smeta.core.fakt.abcTekshir
import uz.anncorp.smeta.core.fakt.abcXato
import uz.anncorp.smeta.core.fakt.command
import uz.anncorp.smeta.core.fakt.ishTuriQidir
import uz.anncorp.smeta.core.fakt.manbaKorinishi
import uz.anncorp.smeta.core.fakt.narxTakliflari
import uz.anncorp.smeta.core.fakt.parseAbcNatija
import uz.anncorp.smeta.core.fakt.resursQidir
import uz.anncorp.smeta.core.fakt.zamenaAlmashtirishPayload
import uz.anncorp.smeta.core.i18n.SiteI18n
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.UUID

/*
 * "Smetadan tashqari ish" / "Ish zamenasi" / "Resurs zamenasi" = the site's IshAbcModal (frontend/src/admin/sahifalar/IshAbcModal.tsx), same steps and texts: typing a name (3+ letters) offers
 * work types / resources from the company's loaded estimates (with their composition and norms), the unit price comes from this estimate -> the contract's -> other contracts -> catalogue -> by hand,
 * resource volume = norma x work volume, a resource without price has an unknown sum (never 0); ONE write (`ish_abc_saqla_v1` / tahrir) with ONE operation id reused on every retry.
 * The estimate rows are never changed. NOT ported: the normative catalogue + the AI "describe and search" panel (the catalogue is R2 /api/norm-library, which the device BFF does not serve).
 */

private val BelowProvider = object : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize) = IntOffset(anchorBounds.left, anchorBounds.bottom)
}

private val RU = DecimalFormatSymbols().apply { groupingSeparator = ' '; decimalSeparator = ',' }
private fun fmt(v: Double?, d: Int = 2): String = if (v == null) Tx.dash else DecimalFormat("#,##0." + "#".repeat(d), RU).format(v)
/** JS String(n): an integral number has no ".0". */
private fun jsNum(v: Double): String = if (v == Math.floor(v) && Math.abs(v) < 1e15) v.toLong().toString() else v.toString()

/** A field that offers library variants while typing (debounce 300 ms, Up/Down/Enter/Esc) - the site's Taklifli. */
@Composable
private fun <T> Taklifli(
    qiymat: String, onChange: (String) -> Unit, qidir: suspend (String) -> List<T>, render: @Composable (T) -> Unit, tanla: (T) -> Unit, modifier: Modifier = Modifier, placeholder: String? = null, error: Boolean = false,
    kutubxonadan: String,
) {
    var ochiq by remember { mutableStateOf(false) }
    var variantlar by remember { mutableStateOf<List<T>>(emptyList()) }
    var faol by remember { mutableStateOf(0) }
    var yuk by remember { mutableStateOf(false) }
    LaunchedEffect(qiymat, ochiq) {
        if (!ochiq || qiymat.trim().length < 3) { variantlar = emptyList(); return@LaunchedEffect }
        delay(300); yuk = true
        val v = runCatching { qidir(qiymat) }.getOrDefault(emptyList())
        variantlar = v; faol = 0; yuk = false
    }
    Box(modifier) {
        QInput(
            qiymat, { onChange(it); ochiq = true },
            Modifier.fillMaxWidth().onFocusChanged { ochiq = it.hasFocus }.onPreviewKeyEvent { e ->
                if (e.type != KeyEventType.KeyDown || variantlar.isEmpty() || !ochiq) false else when (e.key) {
                    Key.DirectionDown -> { faol = minOf(faol + 1, variantlar.size - 1); true }
                    Key.DirectionUp -> { faol = maxOf(faol - 1, 0); true }
                    Key.Enter -> { tanla(variantlar[faol]); ochiq = false; true }
                    Key.Escape -> { ochiq = false; true }
                    else -> false
                }
            },
            placeholder = placeholder, isError = error,
        )
        if (ochiq && (yuk || variantlar.isNotEmpty())) Popup(popupPositionProvider = BelowProvider, properties = PopupProperties(focusable = false)) {
            Column(Modifier.widthIn(min = 380.dp, max = 720.dp).heightIn(max = 320.dp).background(Q.colors.surface, Q.shape.medium).border(BorderStroke(1.dp, Q.colors.border), Q.shape.medium).verticalScroll(rememberScrollState())) {
                if (yuk && variantlar.isEmpty()) Text(kutubxonadan, Modifier.padding(12.dp), style = Q.type.bodySmall, color = Q.colors.textMute)
                variantlar.forEachIndexed { i, v ->
                    Box(Modifier.fillMaxWidth().background(if (i == faol) Q.colors.accentSoft else Color.Transparent).clickable { tanla(v); ochiq = false }.padding(horizontal = 12.dp, vertical = 8.dp)) { render(v) }
                }
            }
        }
    }
}

@Composable
fun FaktIshAbcDialog(
    c: Ctx, obyektId: Long, sana: String, d: JurnalMalumot, rejim: AbcRejim, onYop: () -> Unit, onSaqlandi: (String) -> Unit,
    tahrir: AbcTahrir? = null, boshlang: AbcBoshlang? = null,
) {
    val lang = DesktopPrefs.lang
    fun t(k: String, p: Map<String, Any> = emptyMap()) = SiteI18n.t(k, lang, p)
    val resursRejim = rejim is AbcRejim.ResursZamena
    val bolimlar = remember(d) { d.rows.filter { it.tur == "rz" }.map { Triple(it.id, "· ".repeat(it.daraja ?: 0) + (it.nom ?: ""), it.versiya) } }
    var bolimId by remember { mutableStateOf<Long?>((rejim as? AbcRejim.Additional)?.bolimId) }
    var ish by remember { mutableStateOf(tahrir?.ish ?: boshlang?.ish ?: AbcIsh("", "", if (rejim is AbcRejim.Replacement) rejim.eski.birlik ?: "" else "", "")) }
    var resurslar by remember {
        mutableStateOf(
            tahrir?.resurslar ?: if (rejim is AbcRejim.ResursZamena) listOf(AbcResurs(abcKatAniqla(rejim.eski.kat, null, rejim.eski.birlik), "", "", rejim.eski.birlik ?: "", rejim.eski.norma?.let(::jsNum) ?: "", "", "", "qolda")) else emptyList(),
        )
    }
    var fakt by remember { mutableStateOf(tahrir?.fakt ?: boshlang?.fakt ?: "") }
    var sabab by remember { mutableStateOf(boshlang?.sabab ?: "") }
    var almHajm by remember { mutableStateOf("") }
    var band by remember { mutableStateOf(false) }
    var xato by remember { mutableStateOf("") }
    var koldaXato by remember { mutableStateOf(false) }
    var saqlangan by remember { mutableStateOf<Pair<String, Long?>?>(null) }
    val operationId = remember { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope()
    val api = c.sv.api

    // Resource replacement: the new resource's unit when it differs from the original -> "how much of the original it covers" (site: only with the replacement callback = resource replacement).
    val yangiBirlik = (if (rejim is AbcRejim.ResursZamena) resurslar.firstOrNull()?.birlik.orEmpty() else ish.birlik).trim()
    val eskiBirlik = (rejim as? AbcRejim.ResursZamena)?.eski?.birlik
    val birlikFarqli = rejim is AbcRejim.ResursZamena && tahrir == null && yangiBirlik.isNotEmpty() && !eskiBirlik.isNullOrEmpty() && !yangiBirlik.equals(eskiBirlik.trim(), ignoreCase = true)
    val ishHajm = if (rejim is AbcRejim.ResursZamena) rejim.ishHajm?.let(::jsNum) ?: "" else ish.hajm
    /** A lone resource (no parent work): the norm does not apply, the exact volume is typed. */
    val normaQollanadi = !(rejim is AbcRejim.ResursZamena && rejim.ishHajm == null)
    val hisobRes = remember(normaQollanadi, resurslar) { if (normaQollanadi) resurslar else resurslar.map { it.copy(norma = "") } }
    val hisob = remember(ishHajm, hisobRes) { abcHisobla(ishHajm, hisobRes) }
    val xatolar = remember(resursRejim, ish, hisobRes, sabab, fakt) { abcTekshir(!resursRejim, ish, hisobRes, sabab, fakt) }

    /** Fill the prices from the library (typed prices are kept). */
    fun narxlarniOl(rs: List<AbcResurs>, faqat: Int? = null) {
        val ind = rs.indices.filter { faqat == null || it == faqat }
        scope.launch {
            val v = runCatching { narxTakliflari(api, obyektId, ind.map { rs[it].nom to rs[it].birlik }) }.getOrDefault(emptyList())
            resurslar = resurslar.mapIndexed { i, r ->
                val k = ind.indexOf(i); if (k < 0) return@mapIndexed r
                val variantlar = v.getOrNull(k).orEmpty()
                val eng = abcEngYaxshiNarx(variantlar)
                if ((r.manba == "qolda" && r.narx.isNotBlank()) || abcSon(r.narx) == 0.0) r.copy(variantlar = variantlar) else if (eng != null) r.copy(variantlar = variantlar, narx = jsNum(eng.narx), manba = eng.manba) else r.copy(variantlar = variantlar)
            }
        }
    }
    fun ishTuriTanla(v: IshTuriVariant) {
        ish = ish.copy(kod = v.kod ?: "", nom = v.nom, birlik = v.birlik ?: ish.birlik)
        val rs = v.sostav.map { s -> AbcResurs(abcKatAniqla(s.kat, s.tur, s.birlik), s.kod ?: "", s.nom, s.birlik ?: "", s.norma.let { nm -> if (nm != null && nm > 0) jsNum(nm) else "" }, "", s.narx?.let(::jsNum) ?: "", if (s.narx != null) "smeta" else "qolda") }
        resurslar = rs; narxlarniOl(rs)
    }
    fun resursTanla(i: Int, v: ResursVariant) {
        val n = resurslar.mapIndexed { j, r -> if (j == i) r.copy(kat = v.kat?.let { abcKatAniqla(it) } ?: r.kat, kod = v.kod ?: "", nom = v.nom, birlik = v.birlik ?: r.birlik, narx = v.narx?.let(::jsNum) ?: r.narx, manba = if (v.narx != null) v.narxManba else r.manba) else r }
        resurslar = n; narxlarniOl(n, i)
    }
    fun yangila(i: Int, f: (AbcResurs) -> AbcResurs) { resurslar = resurslar.mapIndexed { j, r -> if (j == i) f(r) else r } }

    fun saqla() {
        if (xatolar.isNotEmpty() || band) { koldaXato = true; return }
        band = true; xato = ""
        scope.launch {
            try {
                saqlangan?.let { onSaqlandi(it.first); return@launch }
                val bolim = bolimlar.firstOrNull { it.first == bolimId }
                val ishP = if (resursRejim) null else AbcSaqlaIsh(ish.kod.trim().ifEmpty { null }, ish.nom.trim(), ish.birlik.trim(), abcSon(ish.hajm)!!)
                val resP = abcSaqlaResurslari(hisobRes)
                val faktHajm = if (resursRejim) null else abcSon(fakt)
                val payload = if (tahrir != null) abcTahrirPayload(c.place.companyId, obyektId, tahrir.qatorId, tahrir.kutilganVersiya, ishP, resP, faktHajm, sana, sabab.trim(), operationId)
                else abcSaqlaPayload(
                    c.place.companyId, obyektId, rejim.command,
                    when (rejim) { is AbcRejim.Additional -> bolim?.first; is AbcRejim.Replacement -> rejim.eski.otaId; is AbcRejim.ResursZamena -> null },
                    when (rejim) { is AbcRejim.Additional -> null; is AbcRejim.Replacement -> rejim.eski.id; is AbcRejim.ResursZamena -> rejim.eski.id },
                    when (rejim) { is AbcRejim.Additional -> bolim?.third; is AbcRejim.Replacement -> rejim.eski.otaVersiya; is AbcRejim.ResursZamena -> null },
                    ishP, resP, faktHajm, sana, sabab.trim(), operationId,
                )
                val r = api.bff("/api/sb-yoz", "POST", payload)
                val res = parseAbcNatija(r.body)
                if (r.networkError || res == null) { xato = t("Javob olinmadi. Qayta bosing — takroriy saqlash xavfsiz."); return@launch }
                if (!res.ok) { xato = t(abcXato(res.code ?: r.code, res.error, res.xabar)); return@launch }
                var almXabar = ""
                val almN = if (birlikFarqli) abcSon(almHajm) else null
                val yangiId = res.qatorId
                if (almN != null && almN > 0 && yangiId != null) {
                    val m = runCatching { parseAbcNatija(api.bff("/api/sb-yoz", "POST", zamenaAlmashtirishPayload(c.place.companyId, yangiId, almN)).body) }.getOrNull()
                    almXabar = if (m?.ok == true) " " + t("Almashtirilgan hajm: {n} {birlik}.", mapOf("n" to jsNum(almN), "birlik" to (eskiBirlik ?: ""))) else " " + t("Almashtirilgan hajm yozilmadi — keyin belgilang.")
                }
                val message = if (tahrir != null) "O‘zgartirishlar saqlandi."
                else if (rejim is AbcRejim.ResursZamena) "Resurs almashtirildi: «${resurslar.firstOrNull()?.nom.orEmpty()}».$almXabar"
                else "${if (rejim is AbcRejim.Replacement) "Zamena" else "Qo‘shimcha ish"} saqlandi: ${resurslar.size} resurs, summa ${fmt(hisob.jami)} so‘m${if (abcSon(fakt) != null && abcSon(fakt) != 0.0) ", fakt $fakt" else ""}.$almXabar"
                saqlangan = message to res.qatorId
                onSaqlandi(message)
            } finally { band = false }
        }
    }

    val sarlavha = (if (tahrir != null) "Tahrirlash: " else "") + when (rejim) { is AbcRejim.Additional -> "Qo‘shimcha ish (smetadan tashqari)"; is AbcRejim.Replacement -> "Ish zamenasi"; is AbcRejim.ResursZamena -> "Resurs zamenasi" }
    val yozilgan = saqlangan != null
    val qulf = band || yozilgan

    Dialog(onDismissRequest = { if (!band) onYop() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.widthIn(max = 1180.dp).fillMaxWidth(0.92f).heightIn(max = 840.dp).background(Q.colors.surface, Q.shape.large).border(BorderStroke(1.dp, Q.colors.border), Q.shape.large).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(t(sarlavha), style = Q.type.titleMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                    Text(t("Nom yozishni boshlang (3+ harf) — yuklangan smetalardagi ish turlari va resurslar taklif qilinadi."), style = Q.type.bodySmall, color = Q.colors.textDim)
                }
                QIconButton(QIcons.X, t("Yopish"), onYop, enabled = !band)
            }
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                when (rejim) {
                    is AbcRejim.Additional -> Unit
                    is AbcRejim.Replacement -> AslBlok(t("Almashtiriladigan ish:"), t("ISH"), rejim.eski.kod, rejim.eski.nom, rejim.eski.hajm, rejim.eski.birlik, null, null, ::t)
                    is AbcRejim.ResursZamena -> AslBlok(t("Almashtiriladigan resurs:"), rejim.eski.kat ?: "—", rejim.eski.kod, rejim.eski.nom, rejim.eski.hajm, rejim.eski.birlik,
                        (rejim.eski.ishNom?.let { t("Ish: {nom}", mapOf("nom" to it)) } ?: t("Alohida resurs (ishsiz)")) + (rejim.ishHajm?.let { " · ${t("ish hajmi")} ${fmt(it, 6)}" } ?: ""), rejim.ishHajm, ::t)
                }
                if (rejim is AbcRejim.Additional && tahrir == null) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(t("Bo‘lim"), style = Q.type.bodySmall, color = Q.colors.textDim)
                    QSelect(bolimId, listOf<Long?>(null) + bolimlar.map { it.first }, { id -> if (id == null) "«СМЕТАДАН ТАШҚАРИ ИШЛАР» (avtomatik bo‘lim)" else bolimlar.first { it.first == id }.second }, { bolimId = it }, placeholder = "«СМЕТАДАН ТАШҚАРИ ИШЛАР» (avtomatik bo‘lim)", minWidth = 420, enabled = !qulf)
                }

                // ---- the table: ISH row + resources ----
                Column(Modifier.fillMaxWidth().border(BorderStroke(1.dp, Q.colors.border), Q.shape.medium)) {
                    Row(Modifier.fillMaxWidth().background(Q.colors.surface2).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(t("Kat.") to 76, t("Shifr / kod") to 130).forEach { (s, w) -> Text(s, Modifier.width(w.dp), style = Q.type.labelSmall, color = Q.colors.textDim) }
                        Text(t("Ish turi / resurs nomi"), Modifier.weight(1f), style = Q.type.labelSmall, color = Q.colors.textDim)
                        listOf(t("Birlik") to 84, t("Norma") to 96, t("Hajm") to 110, t("Birlik narxi") to 230, t("Summa") to 120, "" to 36).forEach { (s, w) -> Text(s, Modifier.width(w.dp), style = Q.type.labelSmall, color = Q.colors.textDim) }
                    }
                    if (!resursRejim) Row(Modifier.fillMaxWidth().background(Q.colors.accentSoft).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(t("ISH"), Modifier.width(76.dp), style = Q.type.labelSmall, color = Q.colors.textMute)
                        QInput(ish.kod, { ish = ish.copy(kod = it) }, Modifier.width(130.dp), placeholder = "Е0802-002-03", enabled = !qulf)
                        Taklifli(ish.nom, { ish = ish.copy(nom = it) }, { q -> ishTuriQidir(api, obyektId, q) }, { v -> IshTuriSatr(v, ::t) }, ::ishTuriTanla, Modifier.weight(1f), "masalan: кладка перегородок", kutubxonadan = t("Kutubxonadan qidirilmoqda…"))
                        QInput(ish.birlik, { ish = ish.copy(birlik = it) }, Modifier.width(84.dp), enabled = !qulf)
                        Text("—", Modifier.width(96.dp), style = Q.type.bodySmall, color = Q.colors.textMute)
                        QInput(ish.hajm, { ish = ish.copy(hajm = it) }, Modifier.width(110.dp), enabled = !qulf)
                        Text(fmt(hisob.ishNarxi), Modifier.width(230.dp), style = Q.type.bodySmall, color = Q.colors.text)
                        Text(fmt(hisob.jami), Modifier.width(120.dp), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                        Box(Modifier.width(36.dp))
                    }
                    resurslar.forEachIndexed { i, r ->
                        val xatoli = koldaXato && xatolar.any { it.joy == "r$i" }
                        Row(Modifier.fillMaxWidth().padding(6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            QSelect(r.kat, ABC_KATLAR, { it }, { k -> yangila(i) { x -> x.copy(kat = k) } }, Modifier.width(76.dp), title = ABC_KAT_NOMI[r.kat], minWidth = 76, enabled = !qulf)
                            QInput(r.kod, { v -> yangila(i) { x -> x.copy(kod = v) } }, Modifier.width(130.dp), enabled = !qulf, isError = xatoli)
                            Taklifli(r.nom, { v -> yangila(i) { x -> x.copy(nom = v) } }, { q -> resursQidir(api, obyektId, q, r.kat) }, { v -> ResursSatr(v, ::t) }, { v -> resursTanla(i, v) }, Modifier.weight(1f).padding(start = 12.dp), "resurs nomi", xatoli, t("Kutubxonadan qidirilmoqda…"))
                            QInput(r.birlik, { v -> yangila(i) { x -> x.copy(birlik = v) } }, Modifier.width(84.dp), enabled = !qulf)
                            if (normaQollanadi) QInput(r.norma, { v -> yangila(i) { x -> x.copy(norma = v) } }, Modifier.width(96.dp), enabled = !qulf)
                            else Text("—", Modifier.width(96.dp), style = Q.type.bodySmall, color = Q.colors.textMute)
                            val n = abcSon(r.norma)
                            if (normaQollanadi && n != null && n > 0) Text(fmt(hisob.qatorlar.getOrNull(i)?.hajm, 6), Modifier.width(110.dp), style = Q.type.bodySmall, color = Q.colors.textDim)
                            else QInput(r.hajm, { v -> yangila(i) { x -> x.copy(hajm = v) } }, Modifier.width(110.dp), placeholder = t("aniq hajm"), enabled = !qulf)
                            Row(Modifier.width(230.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(t(ABC_MANBA_NOMI[r.manba] ?: r.manba), style = Q.type.labelSmall, color = Q.colors.textDim)
                                QInput(r.narx, { v -> yangila(i) { x -> x.copy(narx = v, manba = "qolda") } }, Modifier.weight(1f), enabled = !qulf)
                                if (r.variantlar.isNotEmpty()) QSelect<NarxVariant>(null, r.variantlar, { v -> fmt(v.narx) + " — " + v.izoh }, { v -> yangila(i) { x -> x.copy(narx = jsNum(v.narx), manba = v.manba) } }, Modifier.width(48.dp), placeholder = "▾", title = t("Narx variantlari"), minWidth = 48, enabled = !qulf)
                            }
                            val s = hisob.qatorlar.getOrNull(i)?.summa
                            if (s == null) Text(t("narxsiz"), Modifier.width(120.dp), style = Q.type.bodySmall, color = Q.colors.warn) else Text(fmt(s), Modifier.width(120.dp), style = Q.type.bodySmall, color = Q.colors.text)
                            if (!resursRejim) QIconButton(QIcons.Trash2, "${i + 1}-" + t("resursni olib tashlash"), { resurslar = resurslar.filterIndexed { j, _ -> j != i } }, enabled = !qulf) else Box(Modifier.width(36.dp))
                        }
                    }
                }

                if (!resursRejim) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    QButton(t("Resurs qo‘shish"), { resurslar = resurslar + AbcResurs("МАТ", "", "", "", "", "", "", "qolda") }, kind = QButtonKind.Secondary, icon = QIcons.Plus, enabled = !qulf)
                    FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        ABC_KATLAR.forEach { k -> Text("${t(ABC_KAT_NOMI.getValue(k))}: ${fmt(hisob.jamiKat[k])}", style = Q.type.labelSmall, color = Q.colors.textDim) }
                        Text("${t("Jami")}: ${fmt(hisob.jami)}", style = Q.type.labelSmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
                        if (hisob.narxsiz > 0) Text("${hisob.narxsiz} " + t("ta resurs narxsiz"), style = Q.type.labelSmall, color = Q.colors.warn)
                    }
                }

                if (birlikFarqli) Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    QInput(almHajm, { almHajm = it }, Modifier.widthIn(max = 420.dp), label = t("Asl resursning qancha hajmini almashtiradi") + " ($eskiBirlik)", placeholder = t("ixtiyoriy"), enabled = !qulf)
                    Text(t("Birliklar farqli ({a} → {b}): bo‘sh qoldirsangiz asl resurs zamenaning bajarilgan ulushida yopiladi.", mapOf("a" to (eskiBirlik ?: ""), "b" to yangiBirlik)), style = Q.type.labelSmall, color = Q.colors.textMute)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Bottom) {
                    if (!resursRejim) QInput(fakt, { fakt = it }, Modifier.width(190.dp), label = t("Bajarilgan hajm (fakt)"), placeholder = t("ixtiyoriy"), enabled = !qulf)
                    QInput(sabab, { sabab = it }, Modifier.weight(1f), label = t("Sabab (majburiy)"), placeholder = "masalan: loyihachi xati № …, buyurtmachi topshirig‘i", enabled = !qulf, isError = koldaXato && xatolar.any { it.joy == "sabab" })
                }
                if (tahrir != null) {
                    val eski = tahrir.oldAmount
                    val toliq = resurslar.isNotEmpty() && hisob.narxsiz == 0
                    Row(Modifier.fillMaxWidth().background(Q.colors.surface2, Q.shape.medium).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        Column { Text(t("Oldingi summa"), style = Q.type.labelSmall, color = Q.colors.textMute); Text(fmt(tahrir.oldAmount), style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold) }
                        Column { Text(t("Yangi summa"), style = Q.type.labelSmall, color = Q.colors.textMute); Text(fmt(if (toliq) hisob.jami else null), style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold) }
                        Column { Text(t("Summa farqi"), style = Q.type.labelSmall, color = Q.colors.textMute); Text(fmt(if (eski != null && toliq) hisob.jami - eski else null), style = Q.type.bodyMedium, color = Q.colors.text, fontWeight = FontWeight.SemiBold) }
                        if (eski == null || !toliq) Text(t("Narxlar to‘liq bo‘lmasa, summa farqi hisoblanmaydi."), style = Q.type.labelSmall, color = Q.colors.warn)
                    }
                }
                if (koldaXato && xatolar.isNotEmpty()) QNote(xatolar.joinToString("\n") { "• " + t(it.matn) }, tone = QTone.Warn)
                if (xato.isNotEmpty()) QNote(xato, tone = QTone.Danger)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                QButton(t("Bekor qilish"), onYop, kind = QButtonKind.Ghost, enabled = !band)
                QButton(if (band) t("Saqlanmoqda…") else if (yozilgan) t("Bog‘lanishlarni yangilash") else t("Saqlash"), { saqla() }, kind = QButtonKind.Primary, enabled = !band, loading = band)
            }
        }
    }
}

/** The "original row" box of a replacement (site data-testid zamena-asl). */
@Composable
private fun AslBlok(sarlavha: String, belgi: String, kod: String?, nom: String, hajm: Double?, birlik: String?, izoh: String?, ishHajm: Double?, t: (String, Map<String, Any>) -> String) {
    Column(Modifier.fillMaxWidth().border(BorderStroke(1.dp, Q.colors.warn), Q.shape.medium).padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(sarlavha, style = Q.type.bodySmall, color = Q.colors.textDim); Text(belgi, style = Q.type.labelSmall, color = Q.colors.accent, fontWeight = FontWeight.SemiBold)
            if (!kod.isNullOrEmpty()) Text(kod, style = Q.type.labelSmall, color = Q.colors.textMute)
            Text(nom, style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold)
            if (hajm != null) Text("${fmt(hajm, 6)} ${birlik ?: ""}", style = Q.type.bodySmall, color = Q.colors.textDim) else if (!birlik.isNullOrEmpty()) Text(birlik, style = Q.type.bodySmall, color = Q.colors.textDim)
        }
        if (izoh != null) Text(izoh, style = Q.type.labelSmall, color = Q.colors.textMute)
        Text(t("Asl qator o‘zgarmaydi — yangisi unga ishora qiladi; asl qoldig‘i zamena bajarilgan sari yopiladi.", emptyMap()), style = Q.type.labelSmall, color = Q.colors.textMute)
    }
}

@Composable
private fun IshTuriSatr(v: IshTuriVariant, t: (String, Map<String, Any>) -> String) {
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(v.nom, Modifier.weight(1f), style = Q.type.bodySmall, color = Q.colors.text, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(v.birlik ?: "", style = Q.type.bodySmall, color = Q.colors.textMute)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(v.kod ?: "", style = Q.type.labelSmall, color = Q.colors.textMute); Text("${v.sostav.size} resurs", style = Q.type.labelSmall, color = Q.colors.textMute)
            if (v.manba == "katalog") Text("ish turlari katalogi", style = Q.type.labelSmall, color = Q.colors.warn) else Text(if (v.shuObyekt) "shu obyekt smetasida" else "${v.soni} ta smetada", style = Q.type.labelSmall, color = Q.colors.textMute)
        }
    }
}

@Composable
private fun ResursSatr(v: ResursVariant, t: (String, Map<String, Any>) -> String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(v.nom, style = Q.type.bodySmall, color = Q.colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${v.kat ?: "—"} · ${v.birlik ?: ""} ${if (!v.kod.isNullOrEmpty()) "· ${v.kod}" else ""} ${if (v.manba == "katalog") "· ${manbaKorinishi(v.manbaNom)}" else "· ${v.soni} ta smetada"}", style = Q.type.labelSmall, color = Q.colors.textMute)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(fmt(v.narx), style = Q.type.bodySmall, color = Q.colors.text)
            Text(t(ABC_MANBA_NOMI[v.narxManba] ?: v.narxManba, emptyMap()), style = Q.type.labelSmall, color = Q.colors.textDim)
        }
    }
}
