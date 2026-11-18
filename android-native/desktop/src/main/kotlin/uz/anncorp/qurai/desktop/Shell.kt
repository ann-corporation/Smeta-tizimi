package uz.anncorp.qurai.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uz.anncorp.qurai.ui.components.QButton
import uz.anncorp.qurai.ui.components.QButtonKind
import uz.anncorp.qurai.ui.components.QLoading
import uz.anncorp.qurai.ui.components.QSelect
import uz.anncorp.qurai.ui.icons.QIcons
import uz.anncorp.qurai.ui.nav.QAppShell
import uz.anncorp.qurai.ui.nav.QNav
import uz.anncorp.qurai.ui.screens.QBubble
import uz.anncorp.qurai.ui.screens.QChatItem
import uz.anncorp.qurai.ui.screens.QJarvisChat
import uz.anncorp.qurai.ui.theme.Q
import uz.anncorp.smeta.core.data.ChatCursor
import uz.anncorp.smeta.core.data.ChatInfo
import uz.anncorp.smeta.core.data.ChatSnapshot
import uz.anncorp.smeta.core.data.ChatWrite
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.ChatMsg
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.TodayRepository
import uz.anncorp.smeta.core.data.Workplace
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.str
import uz.anncorp.smeta.feature.common.*
import java.util.UUID

/** Window-level shortcuts: the Window forwards key events here, the shell installs the handler while it is on screen. */
object Shortcuts {
    @Volatile var handler: ((KeyEvent) -> Boolean)? = null
    fun dispatch(e: KeyEvent): Boolean = handler?.invoke(e) ?: false
}

/** The pages this app implements: ids are those of the ONE navigation model ([QNav]) shared with Android and the website. */
enum class Mod(val id: String, val needsObject: Boolean) {
    Objects("obyektlar", false), Smeta("smeta", true), F2("f2", true), Fakt("fakt", true), Nakop("nakop", true),
    Narx("narx", false), Ombor("ombor", false), Money("moliya", false), Docs("hujjat", true), Notif("bildirish", false), Settings("sozlama", false);
    companion object { val ids: Set<String> = entries.map { it.id }.toSet(); fun of(id: String): Mod = entries.first { it.id == id } }
}

/** Jarvis chat state lives in the shell so the conversation survives switching modules and hiding the panel. */
class JarvisState {
    val msgs = mutableStateListOf<ChatMsg>()
    var chatId by mutableStateOf(UUID.randomUUID().toString())
    var busy by mutableStateOf(false)
    var chats by mutableStateOf<List<ChatInfo>>(emptyList())
    var etag by mutableStateOf<String?>(null)
    var showChats by mutableStateOf(false)
    var input by mutableStateOf("")
    fun reset() { msgs.clear(); chatId = UUID.randomUUID().toString(); etag = null; showChats = false }
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
    val sections = remember { QNav.visible(Mod.ids) }
    val order = remember(sections) { sections.flatMap { s -> s.items.map { it.id } } }

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
    DisposableEffect(order) {
        Shortcuts.handler = h@{ e ->
            if (e.type != KeyEventType.KeyDown) return@h false
            when {
                e.isCtrlPressed && e.key == Key.K -> { jarvisOpen = !jarvisOpen; if (jarvisOpen) focusTick++; true }
                e.isCtrlPressed && e.key == Key.E -> { jarvisOpen = true; focusTick++; true }
                e.key == Key.F5 -> { tick++; true }
                e.isCtrlPressed && e.key.keyCode in digitKeys.keys -> { digitKeys[e.key.keyCode]?.let { i -> order.getOrNull(i)?.let { mod = Mod.of(it); jarvisOpen = false } }; true }
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

    val jarvisPanel: @Composable () -> Unit = {
        if (p != null) JarvisPanel(sv, p, obj, jarvis, focusTick) { jarvisOpen = false }
    }
    QAppShell(
        sections, mod.id, { id -> mod = Mod.of(id); jarvisOpen = false },
        badges = mapOf("bildirish" to unread), hints = order.take(9).withIndex().associate { (i, id) -> id to "Ctrl+${i + 1}" },
        sidebarHeader = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                BrandMark(28)
                Text("QURAI", style = Q.type.titleMedium, color = Q.colors.text)
            }
        },
        sidebarFooter = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(me.email, style = Q.type.labelSmall, color = Q.colors.textMute, maxLines = 1)
                if (me.offline) Text(Tx.off, style = Q.type.labelSmall, color = Q.colors.danger)
                Text("v${BuildInfo.VERSION}", style = Q.type.labelSmall, color = Q.colors.textMute)
            }
        },
        topBar = {
            Row(Modifier.fillMaxWidth().padding(horizontal = Q.layout.gutter, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                QSelect(place, places, { it.nom.ifBlank { "Kompaniya" } + " (${it.rol})" }, { place = it; objId = null }, placeholder = "Kompaniya tanlang", minWidth = if (Q.layout.wide) 220 else 120, modifier = Modifier.weight(1f, fill = false))
                if (mod.needsObject) QSelect(obj, list, { it.nom }, { objId = it.id }, placeholder = "Obyekt tanlang", minWidth = if (Q.layout.wide) 240 else 120, modifier = Modifier.weight(1f, fill = false))
                Box(Modifier.weight(1f))
                QButton(if (Q.layout.wide) "Yangilash (F5)" else "", { tick++ }, icon = QIcons.RefreshCw)
                QButton(if (Q.layout.wide) "Jarvis (Ctrl+K)" else "", { jarvisOpen = !jarvisOpen; if (jarvisOpen) focusTick++ }, kind = if (jarvisOpen) QButtonKind.Primary else QButtonKind.Secondary, icon = QIcons.Sparkles)
            }
        },
        sidePanel = if (jarvisOpen && p != null && Q.layout.wide) ({
            Column(Modifier.width(420.dp).fillMaxHeight().background(Q.colors.surface)) { jarvisPanel() }
        }) else null,
    ) {
        Column(Modifier.fillMaxSize()) {
            objects?.Banner()
            if (jarvisOpen && p != null && !Q.layout.wide) jarvisPanel()
            else if (p == null) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { QLoading(text = "Kompaniya yuklanmoqda...") }
            else Box(Modifier.fillMaxSize().padding(Q.layout.gutter)) {
                if (objects == null && mod != Mod.Settings) QLoading() else {
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
}

private val digitKeys: Map<Long, Int> = listOf(Key.One, Key.Two, Key.Three, Key.Four, Key.Five, Key.Six, Key.Seven, Key.Eight, Key.Nine).mapIndexed { i, k -> k.keyCode to i }.toMap()

/** Jarvis panel: the same server brain as the web and Android (shared [uz.anncorp.smeta.core.data.JarvisRepository]) and the SAME chat UI as Android ([QJarvisChat]). */
@Composable
fun JarvisPanel(sv: Services, p: Workplace, obj: Obj?, st: JarvisState, focusTick: Int, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    LaunchedEffect(focusTick) { runCatching { focus.requestFocus() } }
    fun send(text: String) {
        val q = text.trim()
        if (q.isEmpty() || st.busy) return
        val history = st.msgs.toList()
        st.msgs.add(ChatMsg(true, q)); st.input = ""; st.busy = true; st.showChats = false
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
            runCatching {
                val all = st.msgs.toList()
                val tag = st.etag
                val cursor = ChatCursor(st.chatId, tag)
                val write = if (tag == null) sv.jarvis.writeMessages(p.companyId, cursor, JarvisRepository.chatTitle(all), all.takeLast(JarvisRepository.MAX_SAVED))
                else sv.jarvis.writeMessages(p.companyId, cursor, null, all.takeLast(2), UUID.randomUUID().toString())
                if (write is ChatWrite.Saved) st.etag = write.etag
            }
        }
    }
    val bubbles = st.msgs.map { if (it.mine) QBubble.Mine(it.text) else QBubble.Jarvis(it.text) }
    Column(Modifier.fillMaxSize()) {
        QJarvisChat(
            bubbles, st.busy, st.input, { st.input = it }, { send(st.input) },
            scope = obj?.nom?.let { "Obyekt: $it" },
            quick = listOf("Pul holati" to "Shu obyekt bo'yicha pul holati qanday?", "Bugun" to "Bugun nima qilishim kerak?", "Fakt" to "Oxirgi fakt qanday?"),
            onQuick = { send(it) },
            chats = st.chats.map { QChatItem(it.id, it.title) }, activeChat = st.chatId, showChats = st.showChats,
            onToggleChats = { st.showChats = !st.showChats; if (st.showChats) scope.launch { st.chats = sv.jarvis.syncChats(p.companyId)?.chats.orEmpty() } },
            onNewChat = { st.reset() },
            onOpenChat = { ch -> scope.launch { (sv.jarvis.syncChats(p.companyId, ChatCursor(ch.id))?.active as? ChatSnapshot.Changed)?.let { s -> st.msgs.clear(); st.msgs.addAll(s.messages.orEmpty()); st.chatId = ch.id; st.etag = s.etag; st.showChats = false } } },
            headerExtra = { QButton("", onClose, kind = QButtonKind.Ghost, icon = QIcons.X) },
            focus = focus,
        )
    }
}
