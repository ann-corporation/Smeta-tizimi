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


private enum class Stage { Boot, Login, Main }

fun main(args: Array<String>) {
    val smoke = "--smoke" in args
    // Design QA: `--gallery=<login|objects|ombor|f2|jarvis>` shows the shared screens with SAMPLE data (no login, no network) for side-by-side comparison with the site.
    val gallery = args.firstOrNull { it.startsWith("--gallery=") }?.substringAfter("=")
    Log.i("start v${BuildInfo.VERSION} smoke=$smoke java=${System.getProperty("java.version")} os=${System.getProperty("os.name")}")
    val services = Services()
    application {
        Window(icon = BitmapPainter(useResource("qurai-icon.png", ::loadImageBitmap)), onCloseRequest = { Log.i("exit"); exitApplication() }, title = "QURAI", state = rememberWindowState(size = DpSize(1360.dp, 820.dp)), onPreviewKeyEvent = { Shortcuts.dispatch(it) }) {
            QuraiTheme { if (gallery != null) uz.anncorp.qurai.ui.screens.QGallery(gallery) else Root(services) }
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
        sv.events.logout.collect { stage = Stage.Login; me = null }
    }
    LaunchedEffect(Unit) {
        if (sv.tokens.token() == null) { Log.i("boot: no credential -> login"); stage = Stage.Login; return@LaunchedEffect }
        when (val c = sv.session.check()) {
            is SessionCheck.Valid -> { me = SessionUser(c.info.userId, c.info.email, c.info.rol, offline = false); sv.cache.scope(c.info.userId); saveMe(sv, me!!); stage = Stage.Main }
            SessionCheck.Unauthorized -> { Log.i("boot: credential rejected"); sv.cache.wipe(); stage = Stage.Login }
            SessionCheck.Offline -> {
                val u = loadMe(sv)
                if (u != null) { me = u.copy(offline = true); sv.cache.scope(u.id); Log.i("boot: offline with cached user"); stage = Stage.Main } else stage = Stage.Login
            }
            SessionCheck.ServerError -> stage = Stage.Login
        }
    }
    when (stage) {
        Stage.Boot -> BootScreen()
        Stage.Login -> LoginScreen(sv) { u -> me = u; sv.cache.scope(u.id); saveMe(sv, u); stage = Stage.Main }
        Stage.Main -> MainScreen(sv, me!!)
    }
}
