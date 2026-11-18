package uz.anncorp.qurai.desktop

import uz.anncorp.qurai.ui.theme.QuraiTheme
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.res.loadImageBitmap
import androidx.compose.ui.res.useResource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import kotlinx.coroutines.delay
import uz.anncorp.smeta.core.data.SessionCheck


private enum class Stage { Boot, Choose, Login, Main }

fun main(args: Array<String>) {
    val smoke = "--smoke" in args
    // Design QA: `--gallery=<login|objects|ombor|f2|jarvis>` shows the shared screens with SAMPLE data (no login, no network) for side-by-side comparison with the site.
    val gallery = args.firstOrNull { it.startsWith("--gallery=") }?.substringAfter("=")
    Log.i("start v${BuildInfo.VERSION} smoke=$smoke java=${System.getProperty("java.version")} os=${System.getProperty("os.name")}")
    val services = Services()
    application {
        Window(icon = BitmapPainter(useResource("qurai-icon.png", ::loadImageBitmap)), onCloseRequest = { Log.i("exit"); exitApplication() }, title = "QURAI", state = rememberWindowState(size = DpSize(1360.dp, 820.dp)), onPreviewKeyEvent = { Shortcuts.dispatch(it) }) {
            QuraiTheme(DesktopPrefs.dark) { if (gallery != null) uz.anncorp.qurai.ui.screens.QGallery(gallery) else Root(services) }
            if (smoke) LaunchedEffect(Unit) {
                delay(6_000)
                Log.i("smoke: window alive after 6s, exiting")
                exitApplication()
            }
        }
    }
}

@Composable
private fun Root(sv: Services) {
    var stage by remember { mutableStateOf(Stage.Boot) }
    var me by remember { mutableStateOf<SessionUser?>(null) }

    LaunchedEffect(Unit) {
        sv.events.logout.collect { me = null; stage = if (sv.tokens.token() != null) Stage.Choose else Stage.Login }
    }
    LaunchedEffect(Unit) {
        if (System.getenv("QURAI_DEMO") == "1") { sv.enterDemo(); me = SessionUser(1L, "demo@example.test", "admin", offline = false); stage = Stage.Main; return@LaunchedEffect }
        if (sv.tokens.token() == null) { Log.i("boot: no credential -> login"); stage = Stage.Login; return@LaunchedEffect }
        when (val c = sv.session.check()) {
            is SessionCheck.Valid -> { me = SessionUser(c.info.userId, c.info.email, c.info.rol, offline = false); sv.cache.scope(c.info.userId); saveMe(sv, me!!); stage = Stage.Choose }
            SessionCheck.Unauthorized -> { Log.i("boot: credential rejected"); sv.cache.wipe(); stage = Stage.Login }
            SessionCheck.Offline -> {
                val u = loadMe(sv)
                if (u != null) { me = u.copy(offline = true); sv.cache.scope(u.id); Log.i("boot: offline with cached user"); stage = Stage.Choose } else stage = Stage.Login
            }
            SessionCheck.ServerError -> stage = Stage.Login
        }
    }
    fun startDemo() { sv.enterDemo(); me = SessionUser(1L, "demo@example.test", "admin", offline = false); stage = Stage.Main }
    when (stage) {
        Stage.Boot -> BootScreen()
        Stage.Choose -> ChooseScreen(me?.email.orEmpty(), { stage = Stage.Main }, { sv.signOut() }, { startDemo() })
        Stage.Login -> LoginScreen(sv, { startDemo() }) { u -> me = u; sv.cache.scope(u.id); saveMe(sv, u); stage = Stage.Main }
        Stage.Main -> MainScreen(sv, me!!)
    }
}
