package uz.anncorp.smeta.feature.login

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.AuthError
import uz.anncorp.smeta.core.data.AuthOutcome
import uz.anncorp.smeta.core.data.AuthRepository
import uz.anncorp.smeta.core.data.TelegramOutcome
import uz.anncorp.smeta.core.data.TelegramPoller
import javax.inject.Inject

data class LoginState(
    val login: String = "",
    val password: String = "",
    val busy: Boolean = false,
    val error: AuthError? = null,
    val fillError: Boolean = false,
    val telegramWaiting: Boolean = false,
    val telegramCode: String? = null,
)

sealed interface LoginEvent {
    data object SignedIn : LoginEvent
    data class OpenLink(val url: String) : LoginEvent
}

@HiltViewModel
class LoginViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state.asStateFlow()
    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()
    private var telegramJob: Job? = null

    fun onLogin(v: String) = _state.update { it.copy(login = v, error = null, fillError = false) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, error = null, fillError = false) }

    fun signInPassword() {
        val s = _state.value
        if (s.busy) return
        if (s.login.isBlank() || s.password.isEmpty()) { _state.update { it.copy(fillError = true) }; return }
        run { session -> auth.loginPassword(session, s.login.trim(), s.password) }
    }

    fun signInGoogle(activityContext: Context) {
        if (_state.value.busy) return
        run { session ->
            val clientId = auth.googleClientId(session) ?: return@run AuthOutcome.Failure(AuthError.GOOGLE_UNAVAILABLE)
            when (val g = GoogleSignIn.idToken(activityContext, clientId)) {
                is GoogleResult.Token -> auth.loginGoogle(session, g.idToken)
                is GoogleResult.Failed -> AuthOutcome.Failure(g.error)
            }
        }
    }

    fun signInTelegram() {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null, fillError = false) }
        telegramJob = viewModelScope.launch {
            val session = auth.newSession()
            val (start, err) = auth.telegramStart(session)
            if (start == null) { fail(err ?: AuthError.SERVER); return@launch }
            _state.update { it.copy(telegramWaiting = true, telegramCode = start.code) }
            _events.send(LoginEvent.OpenLink(start.link))
            // `start.secret` stays in this coroutine's memory only.
            val outcome = TelegramPoller({ auth.telegramPoll(session, start.nonce, start.secret) }).run(start.expiresAtMs)
            when (outcome) {
                TelegramOutcome.READY -> when (val r = auth.finishTelegram(session)) {
                    AuthOutcome.Success -> succeed()
                    is AuthOutcome.Failure -> fail(r.error)
                }
                TelegramOutcome.DENIED -> fail(AuthError.TELEGRAM_DENIED)
                TelegramOutcome.EXPIRED, TelegramOutcome.TIMED_OUT -> fail(AuthError.TELEGRAM_EXPIRED)
                TelegramOutcome.NETWORK -> fail(AuthError.NETWORK)
            }
        }
    }

    fun cancelTelegram() {
        telegramJob?.cancel()
        _state.update { it.copy(busy = false, telegramWaiting = false, telegramCode = null) }
    }

    private fun run(block: suspend (uz.anncorp.smeta.core.data.LoginSession) -> AuthOutcome) {
        _state.update { it.copy(busy = true, error = null, fillError = false) }
        viewModelScope.launch {
            when (val r = block(auth.newSession())) {
                AuthOutcome.Success -> succeed()
                is AuthOutcome.Failure -> fail(r.error)
            }
        }
    }

    private suspend fun succeed() {
        _state.update { it.copy(busy = false, telegramWaiting = false, password = "") }
        _events.send(LoginEvent.SignedIn)
    }

    private fun fail(e: AuthError) = _state.update { it.copy(busy = false, telegramWaiting = false, telegramCode = null, error = e) }
}
