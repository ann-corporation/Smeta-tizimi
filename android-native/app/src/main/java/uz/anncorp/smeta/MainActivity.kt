package uz.anncorp.smeta

import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import kotlinx.coroutines.delay
import android.view.WindowManager
import uz.anncorp.smeta.core.security.AppLockController
import uz.anncorp.smeta.feature.lock.AppLockLayer
import uz.anncorp.smeta.feature.lock.ScreenSecurity
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import uz.anncorp.smeta.core.data.AuthEvents
import uz.anncorp.smeta.core.data.Prefs
import uz.anncorp.smeta.core.data.ThemeMode
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.ui.QuraiTheme
import uz.anncorp.smeta.core.ui.isDarkFor
import uz.anncorp.smeta.feature.approval.ApprovalDetailScreen
import uz.anncorp.smeta.feature.home.HomeScreen
import uz.anncorp.smeta.feature.photo.PhotoScreen
import uz.anncorp.smeta.feature.login.LoginScreen
import uz.anncorp.smeta.feature.splash.SplashScreen
import uz.anncorp.smeta.feature.splash.StartRoute
import uz.anncorp.smeta.feature.work.DraftScreen
import uz.anncorp.smeta.feature.work.FaktScreen
import uz.anncorp.smeta.feature.work.ObjectCardScreen
import uz.anncorp.smeta.feature.work.OutboxScreen
import uz.anncorp.smeta.feature.work.ObjectsScreen
import uz.anncorp.smeta.feature.web.WebModuleScreen
import uz.anncorp.smeta.feature.jarvis.JarvisScreen
import uz.anncorp.smeta.feature.rahbar.RahbarScreen
import uz.anncorp.smeta.feature.smeta.SmetaBrowseScreen
import uz.anncorp.smeta.feature.f2.F2ListScreen
import uz.anncorp.smeta.feature.docs.DocFiles
import uz.anncorp.smeta.feature.docs.DocumentsScreen
import uz.anncorp.smeta.feature.today.NotificationsScreen
import uz.anncorp.smeta.feature.people.CompanyInviteScreen
import uz.anncorp.smeta.feature.people.InvitesScreen
import uz.anncorp.smeta.feature.signup.InviteScreen
import uz.anncorp.smeta.feature.signup.SignUpScreen
import uz.anncorp.smeta.core.ui.WorkTopBar
import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject lateinit var prefs: Prefs
    @Inject lateinit var events: AuthEvents
    @Inject lateinit var lock: AppLockController
    @Inject lateinit var api: uz.anncorp.smeta.core.data.ApiClient
    @Inject lateinit var docCache: uz.anncorp.smeta.core.data.DocCache

    /** QULF: every touch/key counts as activity for the idle lock; background/foreground drive the lock timer. */
    override fun onUserInteraction() { super.onUserInteraction(); lock.touch() }
    override fun onStart() { super.onStart(); lock.onStart() }
    override fun onStop() { lock.onStop(); super.onStop() }

    private fun applyBars(dark: Boolean) {
        val bg = 0xFF0E1113.toInt()
        val light = 0xFFF5F7FB.toInt()
        enableEdgeToEdge(
            statusBarStyle = if (dark) SystemBarStyle.dark(bg) else SystemBarStyle.light(light, light),
            navigationBarStyle = if (dark) SystemBarStyle.dark(bg) else SystemBarStyle.light(light, light),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // B9: the status / navigation bars follow the APP theme from the very first frame (no light bar flash before Compose runs).
        val systemDark = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        applyBars(when (prefs.theme.value) { ThemeMode.DARK -> true; ThemeMode.LIGHT -> false; ThemeMode.SYSTEM -> systemDark })
        // Decrypted staging copies of opened documents never outlive the process; sign-out also wipes the encrypted document cache.
        DocFiles.cleanup(this)
        lifecycleScope.launch { events.logout.collect { docCache.clear() } }
        setContent {
            val mode by prefs.theme.collectAsStateWithLifecycle()
            val dark = isDarkFor(mode)
            LaunchedEffect(dark) { applyBars(dark) }
            val q by lock.qulf.collectAsStateWithLifecycle()
            LaunchedEffect(Unit) { lock.refresh(); while (true) { delay(1000); lock.tick() } }
            // FLAG_SECURE for the whole app while the lock is on (no screenshots, blank recents thumbnail).
            LaunchedEffect(q?.enabled, lock.protectScreen) {
                ScreenSecurity.global = lock.protectScreen
                if (lock.protectScreen) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            QuraiTheme(dark) {
                // Every screen sits on the theme background (a screen without its own background used to show the dark window colour in the light theme).
                Box(androidx.compose.ui.Modifier.background(androidx.compose.material3.MaterialTheme.colorScheme.background)) {
                    AppNav(events, lock, if (uz.anncorp.smeta.core.demo.Demo.enabled(this@MainActivity)) HOME else SPLASH)
                    AppLockLayer(lock, onSignOut = { lifecycleScope.launch { api.signOut() } })
                }
            }
        }
    }
}

private const val SPLASH = "splash"
private const val LOGIN = "login"
private const val HOME = "home"
private const val OBJECT = "object/{id}"
private const val FAKT = "fakt/{id}"
private const val DRAFT = "draft/{id}"
private const val OUTBOX = "outbox"
private const val APPROVAL = "approval/{id}"
private const val PHOTO = "photo/{id}?naryad={naryad}"
private const val SIGNUP = "signup"
private const val INVITE = "invite"
private const val WEB = "web?path={path}&title={title}"
private const val PICK_FAKT = "pick/fakt"
private const val PICK_PHOTO = "pick/photo"
private const val JARVIS = "jarvis"
private const val RAHBAR = "rahbar"
private const val ZAYAVKA = "zayavka"
private const val ZAYAVKA_NEW = "zayavka/new"
private const val M29 = "m29"
private const val NARYAD = "naryad"
private const val HUJJAT = "hujjat?xat={xat}"
private const val SMETA = "smeta/{id}"
private const val F2LIST = "f2/{id}"
private const val DOCS = "docs/{id}?f2={f2}"
private const val NOTIFICATIONS = "notifications"
private const val PEOPLE_INVITE = "people/invite"
private const val PEOPLE_INVITES = "people/invites"

@Composable
private fun AppNav(events: AuthEvents, lock: AppLockController, start: String) {
    val nav = rememberNavController()
    // Revoked/expired device or explicit sign-out: always back to Login with a clean stack.
    LaunchedEffect(Unit) {
        events.logout.collect {
            lock.reset()
            nav.navigate(LOGIN) { popUpTo(nav.graph.id) { inclusive = true }; launchSingleTop = true }
        }
    }
    NavHost(nav, startDestination = start) {
        composable(SPLASH) {
            SplashScreen(onRoute = { r ->
                if (nav.currentDestination?.route == SPLASH) nav.navigate(if (r == StartRoute.HOME) HOME else LOGIN) { popUpTo(SPLASH) { inclusive = true } }
            })
        }
        composable(LOGIN) {
            LoginScreen(onSignedIn = { nav.navigate(HOME) { popUpTo(LOGIN) { inclusive = true } } }, onSignUp = { nav.navigate(SIGNUP) }, onInvite = { nav.navigate(INVITE) })
        }
        composable(SIGNUP) {
            SignUpScreen(onBack = { nav.popBackStack() }, onSignedIn = { nav.navigate(HOME) { popUpTo(LOGIN) { inclusive = true } } })
        }
        composable(INVITE) {
            InviteScreen(onBack = { nav.popBackStack() }, onSignedIn = { nav.navigate(HOME) { popUpTo(LOGIN) { inclusive = true } } })
        }
        composable(HOME) {
            LaunchedEffect(Unit) { lock.refresh() }
            HomeScreen(
                onOpenObject = { nav.navigate("object/$it") }, onOpenFakt = { nav.navigate("fakt/$it") },
                onOpenApproval = { nav.navigate("approval/$it") }, onOutbox = { nav.navigate(OUTBOX) },
                onOpenWeb = { path, title -> nav.navigate("web?path=${Uri.encode(path)}&title=${Uri.encode(title)}") },
                onPickFakt = { nav.navigate(PICK_FAKT) }, onPickPhoto = { nav.navigate(PICK_PHOTO) },
                onJarvis = { nav.navigate(JARVIS) }, onRahbar = { nav.navigate(RAHBAR) }, onZayavka = { nav.navigate(ZAYAVKA) },
                onModule = { t -> when (t) { uz.anncorp.smeta.core.data.NativeTarget.M29 -> nav.navigate(M29); uz.anncorp.smeta.core.data.NativeTarget.NARYAD -> nav.navigate(NARYAD); else -> nav.navigate("hujjat") } }, onInvite = { nav.navigate(PEOPLE_INVITE) }, onInvites = { nav.navigate(PEOPLE_INVITES) },
                onNotifications = { nav.navigate(NOTIFICATIONS) },
            )
        }
        val idArg = listOf(navArgument("id") { type = NavType.LongType })
        composable(OBJECT, idArg) { CardRoute(nav) }
        composable(FAKT, idArg) {
            FaktScreen(onBack = { nav.popBackStack() }, onDraft = { nav.navigate("draft/$it") }, onOutbox = { nav.navigate(OUTBOX) })
        }
        composable(DRAFT, idArg) {
            DraftScreen(onBack = { nav.popBackStack() }, onOutbox = { nav.navigate(OUTBOX) }, onSaved = { nav.navigate(OUTBOX) { popUpTo(HOME) } })
        }
        composable(APPROVAL, idArg) { ApprovalDetailScreen(onBack = { nav.popBackStack() }) }
        composable(PHOTO, idArg + listOf(navArgument("naryad") { type = NavType.LongType; defaultValue = -1L })) {
            PhotoScreen(onBack = { nav.popBackStack() }, onQueued = { nav.navigate(OUTBOX) { popUpTo(PHOTO) { inclusive = true } } })
        }
        composable(WEB, listOf(navArgument("path") { type = NavType.StringType; defaultValue = "" }, navArgument("title") { type = NavType.StringType; defaultValue = "" })) { e ->
            WebModuleScreen(title = e.arguments?.getString("title").orEmpty(), onBack = { nav.popBackStack() })
        }
        composable(PICK_FAKT) { PickObjectScreen(R.string.mod_fact, onBack = { nav.popBackStack() }) { nav.navigate("fakt/$it") } }
        composable(PICK_PHOTO) { PickObjectScreen(R.string.mod_photo, onBack = { nav.popBackStack() }) { nav.navigate("photo/$it") } }
        composable("$JARVIS?obyekt={obyekt}", listOf(navArgument("obyekt") { type = NavType.LongType; defaultValue = -1L })) { JarvisScreen(onBack = { nav.popBackStack() }) }
        composable(RAHBAR) {
            RahbarScreen(onBack = { nav.popBackStack() }, onOpenObject = { nav.navigate("object/$it") }, onOpenApprovals = { nav.popBackStack() })
        }
        composable(SMETA, idArg) { SmetaBrowseScreen(onBack = { nav.popBackStack() }, onDraft = { nav.navigate("draft/$it") }, onJarvis = { nav.navigate("$JARVIS?obyekt=$it") }) }
        composable(F2LIST, idArg) {
            F2ListScreen(
                onBack = { nav.popBackStack() }, onDocs = { nav.navigate("docs/$it?f2=true") },
                onOpenWeb = { path, title -> nav.navigate("web?path=${Uri.encode(path)}&title=${Uri.encode(title)}") },
            )
        }
        composable(DOCS, idArg + listOf(navArgument("f2") { type = NavType.BoolType; defaultValue = false })) { DocumentsScreen(onBack = { nav.popBackStack() }) }
        composable(NOTIFICATIONS) { NotificationsScreen(onBack = { nav.popBackStack() }, onOpenApproval = { nav.navigate("approval/$it") }, onOpenLetter = { nav.navigate("hujjat?xat=$it") }) }
        composable(PEOPLE_INVITE) { CompanyInviteScreen(onBack = { nav.popBackStack() }) }
        composable(PEOPLE_INVITES) { InvitesScreen(onBack = { nav.popBackStack() }, onAccepted = { nav.navigate(HOME) { popUpTo(HOME) { inclusive = true } } }) }
        composable(ZAYAVKA) { uz.anncorp.smeta.feature.zayavka.ZayavkaListScreen(onBack = { nav.popBackStack() }, onNew = { nav.navigate(ZAYAVKA_NEW) }, onOutbox = { nav.navigate(OUTBOX) }) }
        composable(ZAYAVKA_NEW) { uz.anncorp.smeta.feature.zayavka.ZayavkaScreen(onBack = { nav.popBackStack() }, onOutbox = { nav.navigate(OUTBOX) }) }
        composable(M29) { uz.anncorp.smeta.feature.m29.M29Screen(onBack = { nav.popBackStack() }, onOutbox = { nav.navigate(OUTBOX) }) }
        composable(NARYAD) { uz.anncorp.smeta.feature.naryad.NaryadScreen(onBack = { nav.popBackStack() }, onOutbox = { nav.navigate(OUTBOX) }, onPhoto = { o, n -> nav.navigate("photo/$o?naryad=$n") }) }
        composable(HUJJAT, listOf(navArgument("xat") { type = NavType.LongType; defaultValue = -1L })) { uz.anncorp.smeta.feature.hujjat.HujjatScreen(onBack = { nav.popBackStack() }, onOpenChain = { nav.navigate("approval/$it") }) }
        composable(OUTBOX) { OutboxScreen(onBack = { nav.popBackStack() }, onEditDraft = { nav.navigate("draft/$it") }) }
    }
}

/** Full-screen object picker used by the hub's Fact and Photo modules. */
@Composable
private fun PickObjectScreen(@androidx.annotation.StringRes title: Int, onBack: () -> Unit, onPick: (Long) -> Unit) {
    androidx.compose.foundation.layout.Column(androidx.compose.ui.Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(androidx.compose.ui.res.stringResource(title), onBack)
        ObjectsScreen(onOpen = onPick, pickForFact = true)
    }
}

@Composable
private fun CardRoute(nav: androidx.navigation.NavHostController) {
    ObjectCardScreen(
        onBack = { nav.popBackStack() }, onEnterFakt = { nav.navigate("fakt/$it") }, onPhoto = { nav.navigate("photo/$it") }, onOutbox = { nav.navigate(OUTBOX) },
        onSmeta = { nav.navigate("smeta/$it") }, onF2 = { nav.navigate("f2/$it") },
        onDocs = { nav.navigate("docs/$it") }, onJarvis = { nav.navigate("$JARVIS?obyekt=$it") },
    )
}


