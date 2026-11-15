package uz.anncorp.smeta.core.security

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LockStateTest {
    private var now = 1_000_000L
    private val min = 60_000L
    private fun state(enabled: Boolean = true, timeout: Int = 10, last: Long = now) =
        LockState({ now }, last).also { it.configure(enabled, timeout) }

    @Test fun staysUnlockedWithinTimeoutInBackground() {
        val s = state()
        s.onBackground(); now += 9 * min + 59_000
        assertFalse(s.onForeground())
    }

    @Test fun locksAfterTimeoutInBackground() {
        val s = state()
        s.onBackground(); now += 10 * min
        assertTrue(s.onForeground())
        assertTrue(s.locked)
    }

    @Test fun idleInForegroundLocksOnTick() {
        val s = state(timeout = 5)
        now += 4 * min; assertFalse(s.tick())
        s.touch(); now += 4 * min; assertFalse(s.tick())   // touch resets the idle clock
        now += 1 * min; assertTrue(s.tick())
    }

    @Test fun touchDoesNothingWhileLocked() {
        val s = state(timeout = 1)
        now += 2 * min; s.tick()
        val before = s.lastActive
        now += 10; s.touch()
        assertEquals(before, s.lastActive)
        assertTrue(s.locked)
    }

    @Test fun unlockResetsClock() {
        val s = state(timeout = 1)
        now += 2 * min; assertTrue(s.tick())
        s.unlock()
        assertFalse(s.locked)
        now += 30_000; assertFalse(s.tick())
    }

    @Test fun disabledNeverLocks() {
        val s = state(enabled = false)
        s.onBackground(); now += 600 * min
        assertFalse(s.onForeground()); assertFalse(s.tick())
        s.lockNow(); assertFalse(s.locked)
    }

    @Test fun disablingWhileLockedUnlocks() {
        val s = state(timeout = 1)
        now += 2 * min; s.tick(); assertTrue(s.locked)
        s.configure(false, 1)
        assertFalse(s.locked)
    }

    @Test fun coldStartWithStalePersistedTimeIsLocked() {
        val s = state(last = now - 30 * min)
        assertTrue(s.onForeground())
    }

    @Test fun coldStartWithRecentPersistedTimeIsOpen() {
        val s = state(last = now - 2 * min)
        assertFalse(s.onForeground())
    }

    @Test fun timeoutIsClampedToOneToSixty() {
        assertEquals(1, LockState.clamp(0)); assertEquals(1, LockState.clamp(-9))
        assertEquals(60, LockState.clamp(500)); assertEquals(25, LockState.clamp(25))
        val s = state(timeout = 999); s.onBackground(); now += 59 * min
        assertFalse(s.onForeground())
        s.onBackground(); now += 60 * min
        assertTrue(s.onForeground())
    }

    @Test fun lockNowLocksWhenEnabled() {
        val s = state(); s.lockNow(); assertTrue(s.locked)
    }

    @Test fun repeatedBackgroundKeepsFirstTimestamp() {
        val s = state()
        s.onBackground(); now += 6 * min; s.onBackground(); now += 5 * min
        assertTrue(s.onForeground())   // 11 min since the FIRST background event
    }
}