package uz.anncorp.smeta.feature.jarvis

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ChatMsg
import java.time.OffsetDateTime

class JarvisChatTest {
    @Test fun errorsAndBudgetCardsAreNotPartOfTheConversation() {
        val b = listOf(Bubble.Mine("savol"), Bubble.Problem(Bubble.Kind.NETWORK, null), Bubble.Jarvis("javob", false), Bubble.Budget(null))
        assertEquals(listOf(ChatMsg(true, "savol"), ChatMsg(false, "javob")), toMessages(b))
        assertEquals(listOf(Bubble.Mine("savol"), Bubble.Jarvis("javob", false)), toBubbles(toMessages(b)))
    }

    @Test fun restoreOnlyRecentChatsWithin48Hours() {
        val now = OffsetDateTime.parse("2026-11-15T12:00:00+00:00")
        assertTrue(isRecent("2026-11-14T12:00:00.123456+00:00", now))
        assertFalse(isRecent("2026-11-10T12:00:00+00:00", now))
        assertFalse(isRecent("not a date", now))
    }

    @Test fun newChatIdsAreServerAcceptable() {
        // t2_jarvis_suhbat_saqla_v1: klient_id ~ ^[A-Za-z0-9_.-]{1,40}$
        assertTrue(Regex("^[A-Za-z0-9_.-]{1,40}$").matches(newChatId()))
    }
}