package uz.anncorp.smeta.core.security

/**
 * App-lock state machine (pure JVM, unit-tested). Locks when the app stayed in the background, or sat idle in the foreground, for
 * at least [timeoutMin] minutes. A cold start with a stale persisted [initialLastActive] starts locked as well.
 * This is a PRIVACY lock (hides the data); money/signature actions are protected on the server by the step-up (STEP_UP_KERAK).
 */
class LockState(private val clock: () -> Long = System::currentTimeMillis, initialLastActive: Long = clock()) {
    var enabled = false; private set
    var timeoutMin = DEFAULT_MIN; private set
    var locked = false; private set
    var lastActive = initialLastActive; private set
    private var backgroundedAt: Long? = null

    private val timeoutMs get() = timeoutMin * 60_000L

    fun configure(enabled: Boolean, timeoutMin: Int) {
        this.enabled = enabled
        this.timeoutMin = clamp(timeoutMin)
        if (!enabled) locked = false
    }

    /** User interaction while unlocked and visible. */
    fun touch() { if (!locked) lastActive = clock() }

    fun onBackground() { if (backgroundedAt == null) { backgroundedAt = clock(); if (!locked) lastActive = backgroundedAt!! } }

    /** Returns true when the app must show the lock. */
    fun onForeground(): Boolean {
        val b = backgroundedAt
        backgroundedAt = null
        if (enabled && !locked) {
            val away = if (b != null) clock() - b else clock() - lastActive
            if (away >= timeoutMs) locked = true
        }
        return locked
    }

    /** Foreground idle check (call periodically). */
    fun tick(): Boolean {
        if (enabled && !locked && clock() - lastActive >= timeoutMs) locked = true
        return locked
    }

    fun lockNow() { if (enabled) locked = true }

    fun unlock() { locked = false; lastActive = clock(); backgroundedAt = null }

    companion object {
        const val DEFAULT_MIN = 10
        const val MIN = 1
        const val MAX = 60
        fun clamp(m: Int) = m.coerceIn(MIN, MAX)
    }
}
