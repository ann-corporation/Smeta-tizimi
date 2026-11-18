package uz.anncorp.smeta.core.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class TelegramPollerTest {
    private class Clock(var t: Long = 0) { fun now() = t }

    private fun poller(clock: Clock, results: List<PollResult>, slept: MutableList<Long> = mutableListOf(), max: Int = 5): Pair<TelegramPoller, () -> Int> {
        var i = 0
        val p = TelegramPoller({ results[minOf(i++, results.lastIndex)] }, clock::now, { clock.t += it; slept += it }, 2_000, max)
        return p to { i }
    }

    @Test fun readyAfterWaiting() = runTest {
        val clock = Clock(); val slept = mutableListOf<Long>()
        val (p, polls) = poller(clock, listOf(PollResult.Waiting, PollResult.Waiting, PollResult.Ready), slept)
        assertEquals(TelegramOutcome.READY, p.run(300_000))
        assertEquals(3, polls())
        assertEquals(listOf(2000L, 2000L), slept)
    }

    @Test fun deniedAndExpiredStopImmediately() = runTest {
        assertEquals(TelegramOutcome.DENIED, poller(Clock(), listOf(PollResult.Denied)).first.run(300_000))
        assertEquals(TelegramOutcome.EXPIRED, poller(Clock(), listOf(PollResult.Expired)).first.run(300_000))
    }

    @Test fun timesOutAtDeadlineOnTwoSecondTicks() = runTest {
        val clock = Clock()
        val (p, polls) = poller(clock, listOf(PollResult.Waiting))
        assertEquals(TelegramOutcome.TIMED_OUT, p.run(10_000))
        assertEquals(5, polls())
    }

    @Test fun consecutiveTransientFailuresGiveUpButWaitingResetsTheCount() = runTest {
        val (p, _) = poller(Clock(), listOf(PollResult.Transient), max = 3)
        assertEquals(TelegramOutcome.NETWORK, p.run(300_000))
        val (q, _) = poller(Clock(), listOf(PollResult.Transient, PollResult.Transient, PollResult.Waiting, PollResult.Transient, PollResult.Transient, PollResult.Ready), max = 3)
        assertEquals(TelegramOutcome.READY, q.run(300_000))
    }

    @Test fun alreadyExpiredDeadlineNeverPolls() = runTest {
        val clock = Clock(5_000)
        val (p, polls) = poller(clock, listOf(PollResult.Ready))
        assertEquals(TelegramOutcome.TIMED_OUT, p.run(5_000))
        assertEquals(0, polls())
    }
}
