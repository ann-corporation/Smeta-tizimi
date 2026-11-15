package uz.anncorp.smeta.feature.signup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
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
import uz.anncorp.smeta.core.data.LoginSession
import uz.anncorp.smeta.core.data.parseInviteToken
import java.util.UUID
import javax.inject.Inject

enum class SignUpStep { EMAIL, CODE, DETAILS }

data class SignUpState(
    val step: SignUpStep = SignUpStep.EMAIL,
    val email: String = "",
    val code: String = "",
    val name: String = "",
    val password: String = "",
    val busy: Boolean = false,
    val error: AuthError? = null,
    val fillError: Boolean = false,
)

data class InviteState(
    /** A pasted /taklif/<token> link, or empty when the phone + 8-digit code are used. */
    val linkOrPhone: String = "",
    val code: String = "",
    val password: String = "",
    val busy: Boolean = false,
    val error: AuthError? = null,
    val fillError: Boolean = false,
)

/** Pure checks shared by the screens and the tests. The server re-validates everything. */
object SignUpRules {
    private val email = Regex("^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$")
    fun emailOk(s: String) = email.matches(s.trim())
    fun codeOk(s: String) = s.trim().matches(Regex("\\d{6}"))
    fun passwordOk(s: String) = s.length >= 8
    fun nameOk(s: String) = s.trim().length >= 2
    fun inviteCodeOk(s: String) = s.replace(Regex("\\s+"), "").matches(Regex("\\d{8}"))
}

sealed interface SignUpEvent { data object SignedIn : SignUpEvent }

@HiltViewModel
class SignUpViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(SignUpState())
    val state: StateFlow<SignUpState> = _state.asStateFlow()
    private val _invite = MutableStateFlow(InviteState())
    val invite: StateFlow<InviteState> = _invite.asStateFlow()
    private val _events = Channel<SignUpEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    private var session: LoginSession = auth.newSession()
    private var verificationId: String? = null
    private val operationId = UUID.randomUUID().toString() // one id per sign-up attempt: a retry after a lost answer is not a second account

    fun onEmail(v: String) = _state.update { it.copy(email = v, error = null, fillError = false) }
    fun onCode(v: String) = _state.update { it.copy(code = v.filter(Char::isDigit).take(6), error = null, fillError = false) }
    fun onName(v: String) = _state.update { it.copy(name = v, error = null, fillError = false) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, error = null, fillError = false) }

    fun back() = _state.update { it.copy(step = if (it.step == SignUpStep.DETAILS) SignUpStep.CODE else SignUpStep.EMAIL, error = null, fillError = false) }

    fun sendCode() {
        val s = _state.value
        if (s.busy) return
        if (!SignUpRules.emailOk(s.email)) { _state.update { it.copy(fillError = true) }; return }
        _state.update { it.copy(busy = true, error = null, fillError = false) }
        viewModelScope.launch {
            val (sent, err) = auth.requestEmailCode(session, s.email)
            if (sent == null) { _state.update { it.copy(busy = false, error = err ?: AuthError.SERVER) }; return@launch }
            verificationId = sent.verificationId
            _state.update { it.copy(busy = false, step = SignUpStep.CODE, code = "") }
        }
    }

    fun confirmCode() {
        val s = _state.value
        if (!SignUpRules.codeOk(s.code)) { _state.update { it.copy(fillError = true) }; return }
        _state.update { it.copy(step = SignUpStep.DETAILS, error = null, fillError = false) }
    }

    fun create() {
        val s = _state.value
        val vid = verificationId
        if (s.busy || vid == null) return
        if (!SignUpRules.nameOk(s.name) || !SignUpRules.passwordOk(s.password)) { _state.update { it.copy(fillError = true) }; return }
        _state.update { it.copy(busy = true, error = null, fillError = false) }
        viewModelScope.launch {
            when (val r = auth.signUpEmail(session, s.email, vid, s.code, s.name, s.password, operationId)) {
                AuthOutcome.Success -> { _state.update { it.copy(busy = false, password = "") }; _events.send(SignUpEvent.SignedIn) }
                is AuthOutcome.Failure -> _state.update {
                    // A wrong/used code sends the user back to the code step; other failures stay on the form.
                    it.copy(busy = false, error = r.error, step = if (r.error == AuthError.CODE_WRONG) SignUpStep.CODE else it.step)
                }
            }
        }
    }

    fun onInviteTarget(v: String) = _invite.update { it.copy(linkOrPhone = v, error = null, fillError = false) }
    fun onInviteCode(v: String) = _invite.update { it.copy(code = v.filter(Char::isDigit).take(8), error = null, fillError = false) }
    fun onInvitePassword(v: String) = _invite.update { it.copy(password = v, error = null, fillError = false) }

    fun acceptInvite() {
        val s = _invite.value
        if (s.busy) return
        val token = parseInviteToken(s.linkOrPhone)
        val phone = s.linkOrPhone.trim()
        val ok = SignUpRules.passwordOk(s.password) && (token != null || (phone.length >= 9 && SignUpRules.inviteCodeOk(s.code)))
        if (!ok) { _invite.update { it.copy(fillError = true) }; return }
        _invite.update { it.copy(busy = true, error = null, fillError = false) }
        viewModelScope.launch {
            when (val r = auth.acceptInvite(auth.newSession(), token, phone, s.code, s.password, operationId)) {
                AuthOutcome.Success -> { _invite.update { it.copy(busy = false, password = "") }; _events.send(SignUpEvent.SignedIn) }
                is AuthOutcome.Failure -> _invite.update { it.copy(busy = false, error = r.error) }
            }
        }
    }
}
