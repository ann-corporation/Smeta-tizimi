package uz.anncorp.smeta

import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject lateinit var prefs: Prefs
    @Inject lateinit var events: AuthEvents

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val mode by prefs.theme.collectAsStateWithLifecycle()
            val dark = isDarkFor(mode)
            LaunchedEffect(dark) {
                val bg = 0xFF0E1113.toInt()
                val light = 0xFFF5F7FB.toInt()
                enableEdgeToEdge(
                    statusBarStyle = if (dark) SystemBarStyle.dark(bg) else SystemBarStyle.light(light, light),
                    navigationBarStyle = if (dark) SystemBarStyle.dark(bg) else SystemBarStyle.light(light, light),
                )
            }
            QuraiTheme(dark) { AppNav(events, if (uz.anncorp.smeta.core.demo.Demo.enabled(this@MainActivity)) HOME else SPLASH) }
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
private const val PHOTO = "photo/{id}"

@Composable
private fun AppNav(events: AuthEvents, start: String) {
    val nav = rememberNavController()
    // Revoked/expired device or explicit sign-out: always back to Login with a clean stack.
    LaunchedEffect(Unit) {
        events.logout.collect {
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
            LoginScreen(onSignedIn = { nav.navigate(HOME) { popUpTo(LOGIN) { inclusive = true } } })
        }
        composable(HOME) {
            HomeScreen(
                onOpenObject = { nav.navigate("object/$it") }, onOpenFakt = { nav.navigate("fakt/$it") },
                onOpenApproval = { nav.navigate("approval/$it") }, onOutbox = { nav.navigate(OUTBOX) },
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
        composable(PHOTO, idArg) {
            PhotoScreen(onBack = { nav.popBackStack() }, onQueued = { nav.navigate(OUTBOX) { popUpTo(PHOTO) { inclusive = true } } })
        }
        composable(OUTBOX) { OutboxScreen(onBack = { nav.popBackStack() }, onEditDraft = { nav.navigate("draft/$it") }) }
    }
}

@Composable
private fun CardRoute(nav: androidx.navigation.NavHostController) {
    ObjectCardScreen(onBack = { nav.popBackStack() }, onEnterFakt = { nav.navigate("fakt/$it") }, onPhoto = { nav.navigate("photo/$it") }, onOutbox = { nav.navigate(OUTBOX) })
}


