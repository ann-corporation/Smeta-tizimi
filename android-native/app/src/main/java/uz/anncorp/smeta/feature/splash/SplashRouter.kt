package uz.anncorp.smeta.feature.splash

import uz.anncorp.smeta.core.data.DeviceCredential
import uz.anncorp.smeta.core.data.SessionCheck

enum class StartRoute { LOGIN, HOME }

/**
 * Decides where the app starts. No credential or an expired one -> Login. Otherwise the server is asked
 * (GET /api/sessiya through the BFF): valid -> Home; revoked (401) -> Login; no network or a server hiccup -> Home,
 * so being offline does not sign the user out.
 */
class SplashRouter(private val credential: () -> DeviceCredential?, private val check: suspend () -> SessionCheck, private val now: () -> Long = System::currentTimeMillis) {
    suspend fun decide(): StartRoute {
        val cred = credential() ?: return StartRoute.LOGIN
        if (cred.isExpired(now())) return StartRoute.LOGIN
        return when (check()) {
            is SessionCheck.Valid, SessionCheck.Offline, SessionCheck.ServerError -> StartRoute.HOME
            SessionCheck.Unauthorized -> StartRoute.LOGIN
        }
    }
}
