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
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import uz.anncorp.smeta.core.data.AuthEvents
import uz.anncorp.smeta.core.data.Prefs
import uz.anncorp.smeta.core.ui.QuraiTheme
import uz.anncorp.smeta.core.ui.isDarkFor
import uz.anncorp.smeta.feature.home.HomeScreen
import uz.anncorp.smeta.feature.login.LoginScreen
import uz.anncorp.smeta.feature.splash.SplashScreen
import uz.anncorp.smeta.feature.splash.StartRoute
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
            QuraiTheme(dark) { AppNav(events) }
        }
    }
}

private const val SPLASH = "splash"
private const val LOGIN = "login"
private const val HOME = "home"

@Composable
private fun AppNav(events: AuthEvents) {
    val nav = rememberNavController()
    // Revoked/expired device or explicit sign-out: always back to Login with a clean stack.
    LaunchedEffect(Unit) {
        events.logout.collect {
            nav.navigate(LOGIN) { popUpTo(nav.graph.id) { inclusive = true }; launchSingleTop = true }
        }
    }
    NavHost(nav, startDestination = SPLASH) {
        composable(SPLASH) {
            SplashScreen(onRoute = { r ->
                if (nav.currentDestination?.route == SPLASH) nav.navigate(if (r == StartRoute.HOME) HOME else LOGIN) { popUpTo(SPLASH) { inclusive = true } }
            })
        }
        composable(LOGIN) {
            LoginScreen(onSignedIn = { nav.navigate(HOME) { popUpTo(LOGIN) { inclusive = true } } })
        }
        composable(HOME) { HomeScreen() }
    }
}
