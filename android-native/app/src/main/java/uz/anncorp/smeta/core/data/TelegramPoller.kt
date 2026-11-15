package uz.anncorp.smeta.core.data

import kotlinx.coroutines.delay

enum class TelegramOutcome { READY, DENIED, EXPIRED, TIMED_OUT, NETWORK }

/**
 * Polling state machine for the Telegram sign-in: asks every [intervalMs] until the server says ready/denied/expired,
 * the local deadline [expiresAtMs] passes, or [maxTransientFailures] consecutive network failures occur.
 * Time and delay are injectable so the machine is testable without real waiting.
 */
class TelegramPoller(
    private val poll: suspend () -> PollResult,
    private val now: () -> Long = System::currentTimeMillis,
    private val sleep: suspend (Long) -> Unit = { delay(it) },
    private val intervalMs: Long = 2_000,
    private val maxTransientFailures: Int = 5,
) {
    suspend fun run(expiresAtMs: Long): TelegramOutcome {
        var failures = 0
        while (now() < expiresAtMs) {
            when (poll()) {
                PollResult.Ready -> return TelegramOutcome.READY
                PollResult.Denied -> return TelegramOutcome.DENIED
                PollResult.Expired -> return TelegramOutcome.EXPIRED
                PollResult.Waiting -> failures = 0
                PollResult.Transient -> if (++failures >= maxTransientFailures) return TelegramOutcome.NETWORK
            }
            sleep(intervalMs)
        }
        return TelegramOutcome.TIMED_OUT
    }
}
