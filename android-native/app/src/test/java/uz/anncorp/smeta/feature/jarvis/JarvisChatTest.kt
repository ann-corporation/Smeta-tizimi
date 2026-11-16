package uz.anncorp.smeta.feature.jarvis

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.RequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import uz.anncorp.smeta.core.data.ApiResult
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.ChatInfo
import uz.anncorp.smeta.core.data.ChatMsg
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.Workplace
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

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test fun aRemoteUpdateMustWaitIfTheOperatorStartedTyping() = withJarvis { (vm, api, _) ->
        val row = ChatInfo("one", "Synthetic", "2026-11-15T10:00:00+00:00")
        api.answer = { snapshot(row.id, "a", "Before") }
        vm.open(row)
        runCurrent()
        assertEquals(listOf(ChatMsg(false, "Before")), toMessages(vm.ui.value.bubbles))
        var typing = false
        val response = CompletableDeferred<ApiResult>()
        api.answer = { response.await() }
        val refresh = async { vm.refresh { typing } }
        runCurrent()
        typing = true
        response.complete(snapshot(row.id, "b", "From web"))
        refresh.await()
        assertEquals(listOf(ChatMsg(false, "Before")), toMessages(vm.ui.value.bubbles))
        typing = false
        vm.refresh { typing }
        assertEquals(listOf(ChatMsg(false, "From web")), toMessages(vm.ui.value.bubbles))
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test fun aLateAnswerFromThePreviousCompanyCannotBeSavedIntoTheNextCompany() = withJarvis { (vm, api, workplace) ->
        val response = CompletableDeferred<ApiResult>()
        api.answer = { response.await() }
        vm.ask("Synthetic question")
        runCurrent()
        workplace.set(Workplace(18))
        runCurrent()
        response.complete(ApiResult(200, Json.parseToJsonElement("""{"ok":true,"javob":"Old company answer"}""")))
        runCurrent()
        assertTrue(vm.ui.value.bubbles.isEmpty())
        assertEquals(listOf("kasb_savol"), api.actions)
    }

    private class ChatApi : BffApi {
        var answer: suspend () -> ApiResult = { ApiResult(500, null) }
        val actions = mutableListOf<String>()
        override suspend fun bff(path: String, method: String, body: JsonElement?, etag: String?): ApiResult {
            actions.add(body!!.jsonObject.getValue("amal").jsonPrimitive.content)
            return answer()
        }
        override suspend fun upload(companyId: Long, obyektId: Long, body: RequestBody) = error("Unexpected upload")
    }
    private data class Fixture(val vm: JarvisViewModel, val api: ChatApi, val workplace: WorkContext)

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun withJarvis(test: suspend TestScope.(Fixture) -> Unit) = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val api = ChatApi()
            val workplace = WorkContext().apply { set(Workplace(17)) }
            val vm = JarvisViewModel(JarvisRepository(api), workplace, SavedStateHandle()) { error("No object selected") }
            try { test(Fixture(vm, api, workplace)) } finally { vm.viewModelScope.cancel() }
        } finally { Dispatchers.resetMain() }
    }

    private fun snapshot(id: String, tag: String, text: String) = ApiResult(200, Json.parseToJsonElement(
        """{"ok":true,"royxat":[],"suhbat":{"id":"$id","holat":"changed","etag":"${tag.repeat(32)}","qisqartma":null,"xabarlar":[{"r":"ai","m":"$text"}]}}""",
    ))
}
