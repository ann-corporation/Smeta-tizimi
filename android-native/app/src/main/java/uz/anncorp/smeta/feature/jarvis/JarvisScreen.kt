package uz.anncorp.smeta.feature.jarvis

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.JarvisRepository
import uz.anncorp.smeta.core.data.JarvisResult
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.ui.WorkTopBar
import javax.inject.Inject

/** One bubble in the chat. Errors are first-class so a 402 (no tokens) is shown as a clear card, not a generic failure. */
sealed interface Bubble {
    data class Mine(val text: String) : Bubble
    data class Jarvis(val text: String, val local: Boolean) : Bubble
    data class Budget(val message: String?) : Bubble
    data class Problem(val kind: Kind, val message: String?) : Bubble
    enum class Kind { NETWORK, SERVER, CONTEXT }
}

data class JarvisUi(val bubbles: List<Bubble> = emptyList(), val busy: Boolean = false)

@HiltViewModel
class JarvisViewModel @Inject constructor(private val repo: JarvisRepository, private val ctx: WorkContext) : ViewModel() {
    private val _ui = MutableStateFlow(JarvisUi())
    val ui: StateFlow<JarvisUi> = _ui.asStateFlow()

    fun ask(text: String) {
        val q = text.trim()
        if (q.isEmpty() || _ui.value.busy) return
        _ui.update { it.copy(bubbles = it.bubbles + Bubble.Mine(q), busy = true) }
        viewModelScope.launch {
            val reply: Bubble = when (val r = repo.ask(q, ctx.current.value?.companyId)) {
                is JarvisResult.Answer -> Bubble.Jarvis(r.text, r.local)
                is JarvisResult.Budget -> Bubble.Budget(r.message)
                is JarvisResult.Context -> Bubble.Problem(Bubble.Kind.CONTEXT, r.message)
                JarvisResult.Network -> Bubble.Problem(Bubble.Kind.NETWORK, null)
                is JarvisResult.Server -> Bubble.Problem(Bubble.Kind.SERVER, r.message)
            }
            _ui.update { it.copy(bubbles = it.bubbles + reply, busy = false) }
        }
    }
}

@Composable
fun JarvisScreen(onBack: () -> Unit, vm: JarvisViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var text by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(ui.bubbles.size, ui.busy) { if (ui.bubbles.isNotEmpty()) list.animateScrollToItem(ui.bubbles.size) }
    val send = { val t = text; text = ""; vm.ask(t) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        WorkTopBar(stringResource(R.string.mod_jarvis), onBack)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (ui.bubbles.isEmpty()) item {
                Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(R.string.ja_welcome), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                    Spacer(Modifier.height(6.dp))
                    Text(stringResource(R.string.ja_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(ui.bubbles) { b -> BubbleView(b) }
            if (ui.busy) item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text(stringResource(R.string.ja_thinking), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        val q1 = stringResource(R.string.ja_q_today_text)
        val q2 = stringResource(R.string.ja_q_fact_text)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SuggestionChip(onClick = { vm.ask(q1) }, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_q_today)) })
            SuggestionChip(onClick = { vm.ask(q2) }, enabled = !ui.busy, label = { Text(stringResource(R.string.ja_q_fact)) })
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                text, { text = it.take(JarvisRepository.MAX_QUESTION) }, Modifier.weight(1f), placeholder = { Text(stringResource(R.string.ja_input)) }, maxLines = 4,
                shape = MaterialTheme.shapes.large, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            )
            IconButton(onClick = send, enabled = text.isNotBlank() && !ui.busy) {
                Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.ja_send), tint = if (text.isNotBlank() && !ui.busy) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun BubbleView(b: Bubble) {
    when (b) {
        is Bubble.Mine -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.widthIn(max = 300.dp)) {
                Text(b.text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.padding(12.dp))
            }
        }
        is Bubble.Jarvis -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
            Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.widthIn(max = 340.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(b.text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                }
            }
        }
        is Bubble.Budget -> Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Text(stringResource(R.string.ja_budget_title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onErrorContainer)
                Text(b.message ?: stringResource(R.string.ja_budget_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(top = 4.dp))
                Text(stringResource(R.string.ja_budget_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(top = 6.dp))
            }
        }
        is Bubble.Problem -> Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Text(
                b.message?.takeIf { b.kind != Bubble.Kind.NETWORK } ?: stringResource(if (b.kind == Bubble.Kind.NETWORK) R.string.err_network else R.string.err_server),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp),
            )
        }
    }
}
