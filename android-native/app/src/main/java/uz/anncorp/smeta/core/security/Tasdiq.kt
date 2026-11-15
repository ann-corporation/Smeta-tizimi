package uz.anncorp.smeta.core.security

/**
 * The short-lived (server: 5 min) step-up marker issued after a verified PIN or device-key assertion. Kept IN MEMORY only (never written to disk),
 * sent with every BFF call as the envelope field `tasdiq`; the server decides whether it is required (STEP_UP_KERAK) and whether it is valid.
 * We expire it locally 30 s early so a request never leaves with a token that is about to lapse.
 */
class TasdiqStore(private val clock: () -> Long = System::currentTimeMillis) {
    @Volatile private var token: String? = null
    @Volatile private var until = 0L

    fun set(t: String, ttlMs: Long = TTL_MS) { token = t; until = clock() + ttlMs }
    fun current(): String? = token?.takeIf { clock() < until }
    fun clear() { token = null; until = 0 }

    companion object { const val TTL_MS = 5 * 60_000L - 30_000L }
}

/** Asks the user to confirm (PIN / biometrics). Returns true when [TasdiqStore] now holds a fresh token. Implemented by the UI-bound controller. */
interface StepUpHandler {
    suspend fun request(methods: List<String>): Boolean
}
