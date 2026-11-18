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
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.input.nestedscroll.nestedScroll
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
        // Default language is Uzbek (Latin) whatever the phone's system language is (most phones here run English or Russian UI); only an explicit
        // choice in Settings (uz / ru / en) changes it. Must run once an activity exists: AppCompat ignores the call before that (API 33+), and it
        // persists the choice itself (autoStoreLocales). The platform recreates the activity once on the very first launch.
        if (androidx.appcompat.app.AppCompatDelegate.getApplicationLocales().isEmpty) androidx.appcompat.app.AppCompatDelegate.setApplicationLocales(androidx.core.os.LocaleListCompat.forLanguageTags("uz"))
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
private const val MODUL = "modul/{code}"
private const val PICK_SMETA = "pick/smeta"
private const val PICK_F2 = "pick/f2"
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
private const val F2REG = "f2reestr"
private const val NAKOP = "nakop/{id}"
private const val RESURS = "resurs/{id}"
private const val QARZDOR = "qarzdor"
private const val QABUL = "qabul"
private const val PICK_NAKOP = "pick/nakop"
private const val PICK_RESURS = "pick/resurs"
private const val PEOPLE_INVITE = "people/invite"
private const val PEOPLE_INVITES = "people/invites"
private const val SETTINGS = "settings"
private const val NAZORAT = "nazorat"

@Composable
private fun AppNav(events: AuthEvents, lock: AppLockController, start: String) {
    val nav = rememberNavController()
    var jarvisEpoch by androidx.compose.runtime.remember { androidx.compose.runtime.mutableIntStateOf(0) }
    val here by nav.currentBackStackEntryAsState()
    val route = here?.destination?.route.orEmpty()
    // Revoked/expired device or explicit sign-out: always back to Login with a clean stack.
    LaunchedEffect(Unit) {
        events.logout.collect {
            lock.reset()
            jarvisEpoch++
            nav.navigate(LOGIN) { popUpTo(nav.graph.id) { inclusive = true }; launchSingleTop = true }
        }
    }
    // Jarvis floating button: on every signed-in screen except where it would be in the way (start, sign-in, camera) or redundant (Jarvis itself).
    val jarvisHidden = route.isEmpty() || route == SPLASH || route == LOGIN || route == SIGNUP || route == INVITE || route.startsWith("jarvis") || route.startsWith("photo/")
    var fabHidden by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    val fabScroll = androidx.compose.runtime.remember {
        object : androidx.compose.ui.input.nestedscroll.NestedScrollConnection {
            override fun onPreScroll(available: androidx.compose.ui.geometry.Offset, source: androidx.compose.ui.input.nestedscroll.NestedScrollSource): androidx.compose.ui.geometry.Offset {
                if (available.y < -8f) fabHidden = true else if (available.y > 8f) fabHidden = false
                return androidx.compose.ui.geometry.Offset.Zero
            }
        }
    }
    LaunchedEffect(route) { fabHidden = false }
    Box(androidx.compose.ui.Modifier.fillMaxSize().nestedScroll(fabScroll)) {
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
                onPickFakt = { nav.navigate(PICK_FAKT) }, onPickPhoto = { nav.navigate(PICK_PHOTO) },
                onJarvis = { nav.navigate(JARVIS) }, onRahbar = { nav.navigate(RAHBAR) }, onZayavka = { nav.navigate(ZAYAVKA) },
                onModule = { t ->
                    when (t) {
                        uz.anncorp.smeta.core.data.NativeTarget.M29 -> nav.navigate(M29)
                        uz.anncorp.smeta.core.data.NativeTarget.NARYAD -> nav.navigate(NARYAD)
                        uz.anncorp.smeta.core.data.NativeTarget.F2REESTR -> nav.navigate(F2REG)
                        uz.anncorp.smeta.core.data.NativeTarget.NAKOP -> nav.navigate(PICK_NAKOP)
                        uz.anncorp.smeta.core.data.NativeTarget.QARZDOR -> nav.navigate(QARZDOR)
                        uz.anncorp.smeta.core.data.NativeTarget.QABUL -> nav.navigate(QABUL)
                        uz.anncorp.smeta.core.data.NativeTarget.RESURS -> nav.navigate(PICK_RESURS)
                        uz.anncorp.smeta.core.data.NativeTarget.NAZORAT -> nav.navigate(NAZORAT)
                        uz.anncorp.smeta.core.data.NativeTarget.SMETA -> nav.navigate(PICK_SMETA)
                        uz.anncorp.smeta.core.data.NativeTarget.F2 -> nav.navigate(PICK_F2)
                        uz.anncorp.smeta.core.data.NativeTarget.NARX, uz.anncorp.smeta.core.data.NativeTarget.MOLIYA, uz.anncorp.smeta.core.data.NativeTarget.BUXGALTERIYA, uz.anncorp.smeta.core.data.NativeTarget.AOSR,
                        uz.anncorp.smeta.core.data.NativeTarget.TENDER, uz.anncorp.smeta.core.data.NativeTarget.LOGISTIKA, uz.anncorp.smeta.core.data.NativeTarget.HR, uz.anncorp.smeta.core.data.NativeTarget.SOTUV,
                        uz.anncorp.smeta.core.data.NativeTarget.KOMPANIYA -> nav.navigate("modul/" + t.name.lowercase())
                        else -> nav.navigate("hujjat")
                    }
                }, onInvite = { nav.navigate(PEOPLE_INVITE) }, onInvites = { nav.navigate(PEOPLE_INVITES) },
                onNotifications = { nav.navigate(NOTIFICATIONS) }, onSettings = { nav.navigate(SETTINGS) },
            )
        }
        composable(SETTINGS) { uz.anncorp.smeta.feature.settings.SettingsScreen(onBack = { nav.popBackStack() }) }
        composable(NAZORAT) { uz.anncorp.smeta.feature.nazorat.NazoratScreen(onBack = { nav.popBackStack() }) }
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
        composable(MODUL, listOf(navArgument("code") { type = NavType.StringType })) { uz.anncorp.smeta.feature.modul.ModuleScreen(onBack = { nav.popBackStack() }, onDebtors = { nav.navigate(QARZDOR) }) }
        composable(PICK_SMETA) { PickObjectScreen(R.string.mod_estimate, onBack = { nav.popBackStack() }) { nav.navigate("smeta/$it") } }
        composable(PICK_F2) { PickObjectScreen(R.string.mod_f2, onBack = { nav.popBackStack() }) { nav.navigate("f2/$it") } }
        composable(PICK_FAKT) { PickObjectScreen(R.string.mod_fact, onBack = { nav.popBackStack() }) { nav.navigate("fakt/$it") } }
        composable(PICK_NAKOP) { PickObjectScreen(R.string.p8_nk_title, onBack = { nav.popBackStack() }) { nav.navigate("nakop/$it") } }
        composable(PICK_RESURS) { PickObjectScreen(R.string.p8_rv_title, onBack = { nav.popBackStack() }) { nav.navigate("resurs/$it") } }
        composable(F2REG) {
            uz.anncorp.smeta.feature.f2.F2RegistryScreen(
                onBack = { nav.popBackStack() }, onOpenF2 = { nav.navigate("f2/$it") }, onDocs = { nav.navigate("docs/$it?f2=true") }, onNakop = { nav.navigate("nakop/$it") },
            )
        }
        composable(NAKOP, idArg) {
            uz.anncorp.smeta.feature.nakop.NakopScreen(
                onBack = { nav.popBackStack() }, onResources = { nav.navigate("resurs/$it") }, onOpenF2 = { nav.navigate("f2/$it") },
            )
        }
        composable(RESURS, idArg) { uz.anncorp.smeta.feature.resurs.ResursScreen(onBack = { nav.popBackStack() }) }
        composable(QARZDOR) {
            uz.anncorp.smeta.feature.qarzdor.QarzdorScreen(
                onBack = { nav.popBackStack() }, onOpenObject = { nav.navigate("object/$it") },
            )
        }
        composable(QABUL) { uz.anncorp.smeta.feature.qabul.QabulScreen(onBack = { nav.popBackStack() }, onPhoto = { nav.navigate("photo/$it") }) }
        composable(PICK_PHOTO) { PickObjectScreen(R.string.mod_photo, onBack = { nav.popBackStack() }) { nav.navigate("photo/$it") } }
        composable("$JARVIS?obyekt={obyekt}", listOf(navArgument("obyekt") { type = NavType.LongType; defaultValue = -1L })) { JarvisScreen(onBack = { nav.popBackStack() }) }
        composable(RAHBAR) {
            RahbarScreen(onBack = { nav.popBackStack() }, onOpenObject = { nav.navigate("object/$it") }, onOpenApprovals = { nav.popBackStack() }, onDebtors = { nav.navigate(QARZDOR) })
        }
        composable(SMETA, idArg) { SmetaBrowseScreen(onBack = { nav.popBackStack() }, onDraft = { nav.navigate("draft/$it") }, onJarvis = { nav.navigate("$JARVIS?obyekt=$it") }) }
        composable(F2LIST, idArg) {
            F2ListScreen(
                onBack = { nav.popBackStack() }, onDocs = { nav.navigate("docs/$it?f2=true") },
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
    uz.anncorp.smeta.feature.jarvis.JarvisOverlay(visible = !jarvisHidden, epoch = jarvisEpoch, scrollHidden = fabHidden)
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


