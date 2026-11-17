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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ChatInfo
import uz.anncorp.smeta.core.data.ChatMsg
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.TodayRepository
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str
import java.util.UUID

/** Window-level shortcuts: the Window forwards key events here, the shell installs the handler while it is on screen. */
object Shortcuts {
    @Volatile var handler: ((KeyEvent) -> Boolean)? = null
    fun dispatch(e: KeyEvent): Boolean = handler?.invoke(e) ?: false
}

enum class Mod(val title: String, val needsObject: Boolean) {
    Objects("Obyektlar", false), Smeta("Smeta", true), F2("F-2 aktlar", true), Fakt("Fakt", true), Nakop("Nakopitelniy / Slichitelniy", true),
    Narx("Narx / katalog", false), Ombor("Ombor", false), Money("Moliya", false), Docs("Hujjatlar", true), Notif("Bildirishnomalar", false), Settings("Sozlamalar", false),
}

/** Jarvis chat state lives in the shell so the conversation survives switching modules and hiding the panel. */
class JarvisState {
    val msgs = mutableStateListOf<ChatMsg>()
    var chatId by mutableStateOf(UUID.randomUUID().toString())
    var busy by mutableStateOf(false)
    var chats by mutableStateOf<List<ChatInfo>>(emptyList())
    fun reset() { msgs.clear(); chatId = UUID.randomUUID().toString() }
}

@Composable
fun MainScreen(sv: Services, me: SessionUser) {
    val repo = remember(sv) { Repo(sv) }
    var places by remember { mutableStateOf<List<Workplace>>(emptyList()) }
    var place by remember { mutableStateOf<Workplace?>(null) }
    var mod by remember { mutableStateOf(Mod.Objects) }
    var tick by remember { mutableStateOf(0) }
    var jarvisOpen by remember { mutableStateOf(false) }
    var focusTick by remember { mutableStateOf(0) }
    var objId by remember { mutableStateOf<Long?>(null) }
    var unread by remember { mutableStateOf(0) }
    val jarvis = remember { JarvisState() }

    LaunchedEffect(Unit) {
        val r = sv.read("joylarim", { sv.api.bff("/api/ish-joyi?bolim=joylarim") }) { b ->
            b.let { (it as? kotlinx.serialization.json.JsonObject)?.get("ish_joylari")?.arr()?.mapNotNull { e ->
                val o = e as? kotlinx.serialization.json.JsonObject ?: return@mapNotNull null
                Workplace(o["kompaniya_id"].num()?.toLong() ?: return@mapNotNull null, o["nom"].str().orEmpty(), o["turi"].str().orEmpty(), o["rol"].str().orEmpty(), o["obyektlar"].num()?.toInt() ?: 0, o["azolar"].num()?.toInt() ?: 0)
            } }
        }
        places = r.valueOrNull().orEmpty()
        place = place ?: places.firstOrNull()
    }
    DisposableEffect(Unit) {
        Shortcuts.handler = h@{ e ->
            if (e.type != KeyEventType.KeyDown) return@h false
            when {
                e.isCtrlPressed && e.key == Key.K -> { jarvisOpen = !jarvisOpen; if (jarvisOpen) focusTick++; true }
                e.isCtrlPressed && e.key == Key.E -> { jarvisOpen = true; focusTick++; true }
                e.key == Key.F5 -> { tick++; true }
                e.isCtrlPressed && e.key.keyCode in digitKeys.keys -> { digitKeys[e.key.keyCode]?.let { i -> Mod.entries.getOrNull(i)?.let { mod = it } }; true }
                else -> false
            }
        }
        onDispose { Shortcuts.handler = null }
    }
    val p = place
    LaunchedEffect(p?.companyId) {
        if (p == null) return@LaunchedEffect
        val tr = TodayRepository(sv.api)
        while (true) { tr.unread()?.let { unread = it }; delay(120_000) }
    }
    val objects = if (p == null) null else load(p.companyId, tick) { repo.objects(p.companyId) }
    val list = objects.valueOrNull().orEmpty()
    val obj = list.firstOrNull { it.id == objId } ?: list.firstOrNull()

    Row(Modifier.fillMaxSize()) {
        Column(Modifier.width(220.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("QURAI", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Mod.entries.forEachIndexed { i, m ->
                val sel = m == mod
                val label = if (m == Mod.Notif && unread > 0) "${m.title} ($unread)" else m.title
                Row(
                    Modifier.fillMaxWidth().background(if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.small).clickable { mod = m }.padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(label, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal, color = if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, maxLines = 1)
                    if (i < 9) Text("${i + 1}", style = MaterialTheme.typography.labelSmall, color = if (sel) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.weight(1f))
            Text(me.email, style = MaterialTheme.typography.labelSmall, maxLines = 1)
            if (me.offline) Text(Tx.off, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            Text("v${BuildInfo.VERSION}", style = MaterialTheme.typography.labelSmall)
        }
        Column(Modifier.weight(1f).fillMaxHeight()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Picker(place, places, "Kompaniya tanlang", { it.nom.ifBlank { "Kompaniya" } + " (${it.rol})" }, { place = it; objId = null })
                if (mod.needsObject) Picker(obj, list, "Obyekt tanlang", { it.nom }, { objId = it.id })
                Spacer(Modifier.weight(1f))
                OutlinedButton(onClick = { tick++ }) { Text("Yangilash (F5)") }
                if (jarvisOpen) Button(onClick = { jarvisOpen = false }) { Text("Jarvis (Ctrl+K)") } else OutlinedButton(onClick = { jarvisOpen = true; focusTick++ }) { Text("Jarvis (Ctrl+K)") }
            }
            objects?.Banner()
            HorizontalDivider()
            Surface(Modifier.fillMaxSize()) {
                if (p == null) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Kompaniya yuklanmoqda...") }
                else Box(Modifier.fillMaxSize().padding(16.dp)) {
                    if (objects == null && mod != Mod.Settings) Loading() else {
                        val ctx = Ctx(sv, repo, me, p, list, obj, tick)
                        when (mod) {
                            Mod.Objects -> ObjectsScreen(ctx) { objId = it.id; mod = Mod.Smeta }
                            Mod.Smeta -> SmetaScreen(ctx)
                            Mod.F2 -> F2Screen(ctx)
                            Mod.Fakt -> FaktScreen(ctx)
                            Mod.Nakop -> NakopScreen(ctx)
                            Mod.Narx -> NarxScreen(ctx)
                            Mod.Ombor -> OmborScreen(ctx)
                            Mod.Money -> MoneyScreen(ctx)
                            Mod.Docs -> DocsScreen(ctx)
                            Mod.Notif -> NotifScreen(ctx) { unread = 0 }
                            Mod.Settings -> SettingsScreen(ctx)
                        }
                    }
                }
            }
        }
        if (jarvisOpen && p != null) {
            Column(Modifier.width(400.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp)) {
                JarvisPanel(sv, p, obj, jarvis, focusTick) { jarvisOpen = false }
            }
        }
    }
}

private val digitKeys: Map<Long, Int> = listOf(Key.One, Key.Two, Key.Three, Key.Four, Key.Five, Key.Six, Key.Seven, Key.Eight, Key.Nine).mapIndexed { i, k -> k.keyCode to i }.toMap()

/** Jarvis side panel: the same server brain as the web and Android (shared [JarvisRepository]); chats are saved on the server like everywhere else. */
@Composable
fun androidx.compose.foundation.layout.ColumnScope.JarvisPanel(sv: Services, p: Workplace, obj: Obj?, st: JarvisState, focusTick: Int, onClose: () -> Unit) {
    var input by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ls = rememberLazyListState()
    val focus = remember { FocusRequester() }
    LaunchedEffect(focusTick) { runCatching { focus.requestFocus() } }
    LaunchedEffect(st.msgs.size) { if (st.msgs.isNotEmpty()) ls.animateScrollToItem(st.msgs.size - 1) }
    fun send() {
        val q = input.trim()
        if (q.isEmpty() || st.busy) return
        val history = st.msgs.toList()
        st.msgs.add(ChatMsg(true, q)); input = ""; st.busy = true
        scope.launch {
            val res = sv.jarvis.ask(q, p.companyId, history, obj?.id)
            Log.i("jarvis ${res::class.simpleName}")
            st.msgs.add(ChatMsg(false, when (res) {
                is JarvisResult.Answer -> res.text
                is JarvisResult.Budget -> res.message ?: "Token yetarli emas"
                is JarvisResult.Context -> res.message ?: "Kompaniya tanlang yoki ruxsat yo'q"
                JarvisResult.Network -> "Tarmoq yo'q: Jarvis faqat onlayn ishlaydi"
                is JarvisResult.Server -> res.message ?: "Server xatosi"
            }))
            st.busy = false
            runCatching { sv.jarvis.saveChat(p.companyId, st.chatId, st.msgs.toList()) }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Jarvis", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        Box {
            TextButton(onClick = { menu = true; scope.launch { st.chats = sv.jarvis.chats(p.companyId).orEmpty() } }) { Text("Tarix") }
            androidx.compose.material3.DropdownMenu(menu, { menu = false }) {
                if (st.chats.isEmpty()) androidx.compose.material3.DropdownMenuItem(text = { Text("Saqlangan suhbat yo'q") }, onClick = { menu = false })
                st.chats.take(15).forEach { ch ->
                    androidx.compose.material3.DropdownMenuItem(text = { Text(ch.title.ifBlank { "Suhbat" }, maxLines = 1) }, onClick = {
                        menu = false
                        scope.launch { sv.jarvis.openChat(p.companyId, ch.id)?.let { m -> st.msgs.clear(); st.msgs.addAll(m); st.chatId = ch.id } }
                    })
                }
            }
        }
        TextButton(onClick = { st.reset() }) { Text("Yangi") }
        TextButton(onClick = onClose) { Text("✕") }
    }
    obj?.let { Hint("Obyekt: ${it.nom}") }
    LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = ls, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (st.msgs.isEmpty()) item { Hint("Savol bering: obyektlar, qoldiq, F-2, narxlar haqida. Ctrl+K bilan istalgan bo'limda oching.") }
        items(st.msgs.size) { i ->
            val m = st.msgs[i]
            Row(Modifier.fillMaxWidth(), horizontalArrangement = if (m.mine) Arrangement.End else Arrangement.Start) {
                androidx.compose.foundation.text.selection.SelectionContainer {
                    Text(
                        m.text, color = if (m.mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.background(if (m.mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface, MaterialTheme.shapes.medium).padding(10.dp).width(320.dp),
                    )
                }
            }
        }
        if (st.busy) item { Hint("Jarvis o'ylayapti...") }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(input, { input = it }, label = { Text("Savol") }, modifier = Modifier.weight(1f).focusRequester(focus), singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { send() }))
        Button(onClick = { send() }, enabled = !st.busy && input.isNotBlank()) { Text("Yuborish") }
    }
}
