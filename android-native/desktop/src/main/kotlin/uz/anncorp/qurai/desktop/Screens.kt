package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import uz.anncorp.smeta.core.data.AuthError
import uz.anncorp.smeta.core.data.AuthOutcome
import uz.anncorp.smeta.core.data.ChatMsg
import uz.anncorp.smeta.core.data.F2Act
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.SessionCheck
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.data.f2ListRequest
import uz.anncorp.smeta.core.data.f2MonthLabel
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.objectsRequest
import uz.anncorp.smeta.core.data.parseF2List
import uz.anncorp.smeta.core.data.parseSb
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.feature.ombor.OmborScope
import uz.anncorp.smeta.feature.ombor.StockRow
import uz.anncorp.smeta.feature.ombor.filterStock
import uz.anncorp.smeta.feature.ombor.formatQty
import uz.anncorp.smeta.feature.ombor.objectStockRequest
import uz.anncorp.smeta.feature.ombor.parseObjectStock
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class SessionUser(val id: Long, val email: String, val role: String, val offline: Boolean)

/** Last known user, so the app can open offline (the id selects the encrypted cache folder). */
fun saveMe(sv: Services, u: SessionUser) = sv.saveLastUser("${u.id}\n${u.email}\n${u.role}")
fun loadMe(sv: Services): SessionUser? = sv.loadLastUser()?.split("\n")?.takeIf { it.size >= 3 }?.let { v -> v[0].toLongOrNull()?.let { SessionUser(it, v[1], v[2], false) } }

// ---------- strings (Uzbek Latin; i18n of the desktop app comes with W2) ----------
private object S {
    const val login = "Kirish"; const val loginLabel = "Login (email yoki telefon)"; const val pass = "Parol"
    const val bad = "Login yoki parol noto'g'ri"; const val net = "Tarmoqqa ulanib bo'lmadi"; const val rate = "Juda ko'p urinish, biroz kuting"
    const val server = "Server xatosi, keyinroq urinib ko'ring"; const val limit = "Qurilmalar limiti to'lgan"; const val update = "Ilovani yangilash kerak"
    const val off = "Oflayn: oxirgi saqlangan nusxa"; const val forbidden = "Bu bo'limni ko'rishga ruxsat yo'q"; const val nodata = "Ma'lumot yo'q (oflayn va nusxa saqlanmagan)"
}

@Composable
fun BootScreen() = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
fun LoginScreen(sv: Services, onDone: (SessionUser) -> Unit) {
    var login by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun submit() {
        if (busy || login.isBlank() || pass.isEmpty()) return
        busy = true; err = null
        scope.launch {
            val s = sv.auth.newSession()
            val out = sv.auth.loginPassword(s, login.trim(), pass)
            pass = ""
            when (out) {
                AuthOutcome.Success -> {
                    val c = sv.session.check()
                    if (c is SessionCheck.Valid) { Log.i("login ok"); onDone(SessionUser(c.info.userId, c.info.email, c.info.rol, false)) } else { err = S.server; busy = false }
                }
                is AuthOutcome.Failure -> {
                    Log.i("login failed ${out.error}")
                    err = when (out.error) {
                        AuthError.NETWORK -> S.net; AuthError.RATE_LIMITED -> S.rate; AuthError.SERVER -> S.server
                        AuthError.DEVICE_LIMIT -> S.limit; AuthError.UPDATE_REQUIRED -> S.update; else -> S.bad
                    }
                    busy = false
                }
            }
        }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(Modifier.width(380.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("QURAI", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            OutlinedTextField(login, { login = it }, label = { Text(S.loginLabel) }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !busy)
            OutlinedTextField(
                pass, { pass = it }, label = { Text(S.pass) }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth(), enabled = !busy,
            )
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = { submit() }, enabled = !busy && login.isNotBlank() && pass.isNotEmpty(), modifier = Modifier.fillMaxWidth().height(44.dp)) {
                if (busy) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp) else Text(S.login)
            }
            Text("v${BuildInfo.VERSION}", style = MaterialTheme.typography.labelSmall)
        }
    }
}

private enum class Tab(val title: String) { Objects("Obyektlar"), F2("F-2 aktlar"), Ombor("Ombor qoldig'i"), Jarvis("Jarvis") }

@Composable
fun MainScreen(sv: Services, me: SessionUser) {
    var tab by remember { mutableStateOf(Tab.Objects) }
    var places by remember { mutableStateOf<List<Workplace>>(emptyList()) }
    var place by remember { mutableStateOf<Workplace?>(null) }
    var menu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        val r = sv.read("joylarim", { sv.api.bff("/api/ish-joyi?bolim=joylarim") }) { b ->
            (b as? JsonObject)?.get("ish_joylari")?.let { arr -> (arr as? kotlinx.serialization.json.JsonArray)?.mapNotNull { e ->
                val o = e as? JsonObject ?: return@mapNotNull null
                Workplace(o["kompaniya_id"].num()?.toLong() ?: return@mapNotNull null, o["nom"].str().orEmpty(), o["turi"].str().orEmpty(), o["rol"].str().orEmpty(), o["obyektlar"].num()?.toInt() ?: 0, o["azolar"].num()?.toInt() ?: 0)
            } }
        }
        places = when (r) { is Loaded.Fresh -> r.data; is Loaded.Offline -> r.data; else -> emptyList() }
        place = place ?: places.firstOrNull()
    }
    Row(Modifier.fillMaxSize()) {
        Column(Modifier.width(220.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("QURAI", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Box {
                OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth()) { Text(place?.nom?.ifBlank { "Kompaniya" } ?: "Kompaniya tanlang", maxLines = 1) }
                DropdownMenu(menu, { menu = false }) {
                    places.forEach { p -> DropdownMenuItem(text = { Text("${p.nom} (${p.rol})") }, onClick = { place = p; menu = false }) }
                }
            }
            Spacer(Modifier.height(8.dp))
            Tab.entries.forEach { t ->
                val sel = t == tab
                Text(
                    t.title, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                    color = if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.fillMaxWidth().background(if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small)
                        .clickable { tab = t }.padding(10.dp),
                )
            }
            Spacer(Modifier.weight(1f))
            Text(me.email, style = MaterialTheme.typography.labelSmall, maxLines = 1)
            if (me.offline) Text(S.off, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            TextButton(onClick = { scope.launch { sv.signOut() } }) { Text("Chiqish") }
            Text("v${BuildInfo.VERSION}", style = MaterialTheme.typography.labelSmall)
        }
        Surface(Modifier.fillMaxSize()) {
            val p = place
            if (p == null) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Kompaniya yuklanmoqda...") }
            else Box(Modifier.fillMaxSize().padding(16.dp)) {
                when (tab) {
                    Tab.Objects -> ObjectsTab(sv, p)
                    Tab.F2 -> F2Tab(sv, p)
                    Tab.Ombor -> OmborTab(sv, p)
                    Tab.Jarvis -> JarvisTab(sv, p)
                }
            }
        }
    }
}

// ---------- shared list plumbing ----------

data class Obj(val id: Long, val nom: String, val tur: String?, val rows: Int?, val unpriced: Int?)

private suspend fun loadObjects(sv: Services, companyId: Long): Loaded<List<Obj>> =
    sv.read("obyektlar:$companyId", { sv.api.bff("/api/sb", "POST", objectsRequest(companyId)) }) { b ->
        parseSb(b)?.rows?.mapNotNull { r ->
            Obj(r["id"].num()?.toLong() ?: return@mapNotNull null, r["nom"].str().orEmpty(), r["tur"].str(), r["qator_soni"].num()?.toInt(), r["narxsiz"].num()?.toInt())
        }
    }

@Composable
private fun Banner(l: Loaded<*>) {
    when (l) {
        is Loaded.Offline<*> -> Text("${S.off} (${stamp(l.savedAt)})", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
        Loaded.Forbidden -> Text(S.forbidden, color = MaterialTheme.colorScheme.error)
        Loaded.NoData -> Text(S.nodata, color = MaterialTheme.colorScheme.error)
        is Loaded.Failed -> Text("Xato: ${l.code}", color = MaterialTheme.colorScheme.error)
        is Loaded.Fresh<*> -> {}
    }
}

private fun stamp(ms: Long): String = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(ms))
private fun <T> Loaded<List<T>>.items(): List<T> = when (this) { is Loaded.Fresh -> data; is Loaded.Offline -> data; else -> emptyList() }

@Composable
private fun Title(s: String) = Text(s, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)

@Composable
private fun Loading() = Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

// ---------- Obyektlar ----------

@Composable
fun ObjectsTab(sv: Services, p: Workplace) {
    var state by remember(p.companyId) { mutableStateOf<Loaded<List<Obj>>?>(null) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(p.companyId) { state = null; state = loadObjects(sv, p.companyId) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Title("Obyektlar")
        val s = state
        if (s == null) { Loading(); return@Column }
        Banner(s)
        OutlinedTextField(q, { q = it }, label = { Text("Qidirish") }, singleLine = true, modifier = Modifier.width(360.dp))
        val list = s.items().filter { q.isBlank() || it.nom.contains(q, ignoreCase = true) }
        Text("${list.size} ta obyekt", style = MaterialTheme.typography.labelMedium)
        LazyColumn {
            items(list, key = { it.id }) { o ->
                Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Text(o.nom, fontWeight = FontWeight.Medium)
                    Text(listOfNotNull(o.tur, o.rows?.let { "$it qator" }, o.unpriced?.takeIf { it > 0 }?.let { "$it narxsiz" }).joinToString(" | "), style = MaterialTheme.typography.labelMedium)
                }
                HorizontalDivider()
            }
        }
    }
}

// ---------- F-2 (read-only) ----------

@Composable
fun F2Tab(sv: Services, p: Workplace) {
    var objs by remember(p.companyId) { mutableStateOf<Loaded<List<Obj>>?>(null) }
    var pick by remember(p.companyId) { mutableStateOf<Obj?>(null) }
    var menu by remember { mutableStateOf(false) }
    var acts by remember { mutableStateOf<Loaded<List<F2Act>>?>(null) }
    LaunchedEffect(p.companyId) { objs = loadObjects(sv, p.companyId); pick = objs?.items()?.firstOrNull() }
    LaunchedEffect(pick?.id) { val o = pick ?: return@LaunchedEffect; acts = null
        acts = sv.read("f2:${o.id}", { sv.api.bff("/api/sb", "POST", f2ListRequest(o.id)) }) { parseF2List(it) } }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Title("F-2 aktlar (faqat o'qish)")
        val o = objs
        if (o == null) { Loading(); return@Column }
        Banner(o)
        Box {
            OutlinedButton(onClick = { menu = true }) { Text(pick?.nom ?: "Obyekt tanlang", maxLines = 1) }
            DropdownMenu(menu, { menu = false }) { o.items().forEach { x -> DropdownMenuItem(text = { Text(x.nom) }, onClick = { pick = x; menu = false }) } }
        }
        val a = acts
        if (pick != null && a == null) { Loading(); return@Column }
        a?.let { Banner(it) }
        // Act sums are deliberately not shown: a sum is always QQS-first with both markup variants (owner rule); the full registry is on the website.
        LazyColumn {
            items(a?.items().orEmpty(), key = { it.id }) { f ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(f2MonthLabel(f.oy) ?: "-", Modifier.width(90.dp), fontWeight = FontWeight.Medium)
                    Text(f.raqam ?: "-", Modifier.width(120.dp))
                    Text(f.status ?: "-", Modifier.width(110.dp))
                    Text(listOfNotNull(f.rows?.let { "$it qator" }, f.unpriced?.takeIf { it > 0 }?.let { "$it narxsiz" }, f.negativeRows?.takeIf { it > 0 }?.let { "$it minus" }).joinToString(" | "))
                }
                HorizontalDivider()
            }
        }
    }
}

// ---------- Ombor qoldig'i (read-only) ----------

@Composable
fun OmborTab(sv: Services, p: Workplace) {
    var state by remember(p.companyId) { mutableStateOf<Loaded<List<StockRow>>?>(null) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(p.companyId) { state = null
        state = sv.read("ombor:${p.companyId}", { sv.api.bff("/api/sb", "POST", objectStockRequest(p.companyId)) }) { b -> parseSb(b)?.let { parseObjectStock(it.rows) } } }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Title("Ombor qoldig'i (obyektlar bo'yicha)")
        val s = state
        if (s == null) { Loading(); return@Column }
        Banner(s)
        OutlinedTextField(q, { q = it }, label = { Text("Material qidirish") }, singleLine = true, modifier = Modifier.width(360.dp))
        val rows = filterStock(s.items(), OmborScope.AllObjects, q)
        Text("${rows.size} ta qator", style = MaterialTheme.typography.labelMedium)
        LazyColumn {
            items(rows) { r ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(r.nomi, Modifier.weight(1f))
                    Text("${formatQty(r.qoldiq)} ${r.birligi}", fontWeight = FontWeight.Medium)
                }
                HorizontalDivider()
            }
        }
    }
}

// ---------- Jarvis ----------

@Composable
fun JarvisTab(sv: Services, p: Workplace) {
    val msgs = remember(p.companyId) { mutableStateListOf<ChatMsg>() }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    LaunchedEffect(msgs.size) { if (msgs.isNotEmpty()) listState.animateScrollToItem(msgs.size - 1) }
    fun send() {
        val q = input.trim()
        if (q.isEmpty() || busy) return
        val history = msgs.toList()
        msgs.add(ChatMsg(true, q)); input = ""; busy = true
        scope.launch {
            val res = sv.jarvis.ask(q, p.companyId, history)
            Log.i("jarvis ${res::class.simpleName}")
            msgs.add(ChatMsg(false, when (res) {
                is JarvisResult.Answer -> res.text
                is JarvisResult.Budget -> res.message ?: "Token yetarli emas"
                is JarvisResult.Context -> res.message ?: "Kompaniya tanlang yoki ruxsat yo'q"
                JarvisResult.Network -> "Tarmoq yo'q: Jarvis faqat onlayn ishlaydi"
                is JarvisResult.Server -> res.message ?: "Server xatosi"
            }))
            busy = false
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Title("Jarvis")
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(msgs.size) { i ->
                val m = msgs[i]
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start) {
                    Text(
                        m.text, color = if (m.mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.background(if (m.mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium).padding(10.dp).width(520.dp),
                    )
                }
            }
            if (busy) item { Text("Jarvis o'ylayapti...", style = MaterialTheme.typography.labelMedium) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(input, { input = it }, label = { Text("Savol") }, modifier = Modifier.weight(1f), singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { send() }))
            Button(onClick = { send() }, enabled = !busy && input.isNotBlank()) { Text("Yuborish") }
        }
    }
}