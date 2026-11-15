package uz.anncorp.smeta.feature.splash

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import uz.anncorp.smeta.core.data.DeviceCredential
import uz.anncorp.smeta.core.data.SessionCheck
import uz.anncorp.smeta.core.data.SessionInfo
import uz.anncorp.smeta.core.data.Workplace

class SplashRouterTest {
    private val now = 1_000L
    private val valid = DeviceCredential("d", "t", 5_000)
    private fun router(cred: DeviceCredential?, check: SessionCheck, calls: MutableList<Int> = mutableListOf()) =
        SplashRouter({ cred }, { calls += 1; check }, { now })

    @Test fun noCredentialGoesToLoginWithoutNetwork() = runTest {
        val calls = mutableListOf<Int>()
        assertEquals(StartRoute.LOGIN, router(null, SessionCheck.Offline, calls).decide())
        assertEquals(0, calls.size)
    }

    @Test fun expiredCredentialGoesToLoginWithoutNetwork() = runTest {
        val calls = mutableListOf<Int>()
        assertEquals(StartRoute.LOGIN, router(DeviceCredential("d", "t", 1_000), SessionCheck.Offline, calls).decide())
        assertEquals(0, calls.size)
    }

    @Test fun validSessionGoesHome() = runTest {
        assertEquals(StartRoute.HOME, router(valid, SessionCheck.Valid(SessionInfo(ok = true))).decide())
    }

    @Test fun revokedDeviceGoesToLogin() = runTest {
        assertEquals(StartRoute.LOGIN, router(valid, SessionCheck.Unauthorized).decide())
    }

    @Test fun offlineOrServerHiccupStaysSignedIn() = runTest {
        assertEquals(StartRoute.HOME, router(valid, SessionCheck.Offline).decide())
        assertEquals(StartRoute.HOME, router(valid, SessionCheck.ServerError).decide())
    }
}
