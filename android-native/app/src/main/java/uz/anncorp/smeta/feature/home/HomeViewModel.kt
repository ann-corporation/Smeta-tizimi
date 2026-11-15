package uz.anncorp.smeta.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ApiClient
import uz.anncorp.smeta.core.data.Prefs
import uz.anncorp.smeta.core.data.SessionCheck
import uz.anncorp.smeta.core.data.SessionInfo
import uz.anncorp.smeta.core.data.SessionRepository
import uz.anncorp.smeta.core.data.ThemeMode
import uz.anncorp.smeta.core.data.Workplace
import javax.inject.Inject

data class HomeState(
    val loading: Boolean = true,
    val offline: Boolean = false,
    val failed: Boolean = false,
    val session: SessionInfo? = null,
    val workplaces: List<Workplace> = emptyList(),
    val selected: Workplace? = null,
    val theme: ThemeMode = ThemeMode.DARK,
    val onboardBusy: Boolean = false,
    val onboardError: uz.anncorp.smeta.core.data.OnboardError? = null,
    /** The user chose to carry on without a company (the account stays company-less; the hub explains how to start). */
    val skipped: Boolean = false,
)

sealed interface SignOutUi {
    data object Idle : SignOutUi
    data object Sending : SignOutUi
    /** [afterSend]: a send attempt just ran and [count] records are still unsent (offline or rejected). */
    data class Confirm(val count: Int, val canSend: Boolean, val afterSend: Boolean) : SignOutUi
}

/** Picks the selected workplace: the saved one if it still exists, otherwise the first. */
internal fun pickWorkplace(list: List<Workplace>, savedId: Long?): Workplace? = list.firstOrNull { it.companyId == savedId } ?: list.firstOrNull()

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val sessions: SessionRepository,
    private val api: ApiClient,
    private val prefs: Prefs,
    private val work: uz.anncorp.smeta.core.data.WorkContext,
    private val outbox: uz.anncorp.smeta.core.data.OutboxRepository,
    private val db: uz.anncorp.smeta.core.db.AppDb,
    private val processor: uz.anncorp.smeta.core.data.OutboxProcessor,
    private val company: uz.anncorp.smeta.core.data.CompanyRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeState(theme = prefs.theme.value))
    val state: StateFlow<HomeState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, failed = false) }
        viewModelScope.launch {
            val check = sessions.check()
            val session = (check as? SessionCheck.Valid)?.info
            val list = sessions.workplaces()
            if (session != null) outbox.resumeAfterLogin()
            _state.update {
                val wp = list ?: it.workplaces
                it.copy(
                    loading = false,
                    offline = check is SessionCheck.Offline,
                    failed = list == null && it.workplaces.isEmpty() && check !is SessionCheck.Offline,
                    session = session ?: it.session,
                    workplaces = wp,
                    selected = pickWorkplace(wp, prefs.selectedCompany.value),
                )
            }
            work.set(_state.value.selected)
        }
    }

    fun select(w: Workplace) {
        prefs.selectCompany(w.companyId)
        _state.update { it.copy(selected = w) }
        work.set(w)
    }

    fun createCompany(name: String, inn: String) = onboard { company.create(name, inn.ifBlank { null }) }
    fun joinCompany(code: String) = onboard { company.join(code) }
    fun resumeOnboarding() = _state.update { it.copy(skipped = false) }
    fun skipOnboarding() = _state.update { it.copy(skipped = true) }
    fun clearOnboardError() = _state.update { it.copy(onboardError = null) }
    /** Remembers the object as recently opened (shown in the hub). */
    fun opened(objectId: Long) = prefs.pushRecent(objectId)

    private fun onboard(block: suspend () -> uz.anncorp.smeta.core.data.OnboardResult) {
        if (_state.value.onboardBusy) return
        _state.update { it.copy(onboardBusy = true, onboardError = null) }
        viewModelScope.launch {
            when (val r = block()) {
                is uz.anncorp.smeta.core.data.OnboardResult.Done -> {
                    r.companyId?.let { prefs.selectCompany(it) }
                    _state.update { it.copy(onboardBusy = false, skipped = false) }
                    load()
                }
                is uz.anncorp.smeta.core.data.OnboardResult.Failed -> _state.update { it.copy(onboardBusy = false, onboardError = r.error) }
            }
        }
    }

    fun setTheme(mode: ThemeMode) {
        prefs.setTheme(mode)
        _state.update { it.copy(theme = mode) }
    }

    private val _signOut = MutableStateFlow<SignOutUi>(SignOutUi.Idle)
    val signOutUi: StateFlow<SignOutUi> = _signOut.asStateFlow()

    /** Sign-out asks first when records are still unsent: send now, keep them on the device, or delete them. */
    fun requestSignOut() {
        viewModelScope.launch {
            val unsent = outbox.unsent()
            if (unsent.isEmpty()) signOutNow() else _signOut.value = SignOutUi.Confirm(unsent.size, canSend = unsent.any { it.state != uz.anncorp.smeta.core.db.OutboxState.FAILED }, afterSend = false)
        }
    }

    fun sendThenSignOut() {
        viewModelScope.launch {
            _signOut.value = SignOutUi.Sending
            outbox.resumeAfterLogin()
            runCatching { processor.drain() }
            val left = outbox.unsent()
            if (left.isEmpty()) signOutNow()
            else _signOut.value = SignOutUi.Confirm(left.size, canSend = left.any { it.state != uz.anncorp.smeta.core.db.OutboxState.FAILED }, afterSend = true)
        }
    }

    fun keepAndSignOut() { viewModelScope.launch { signOutNow() } }
    fun deleteAndSignOut() { viewModelScope.launch { outbox.deleteUnsent(); signOutNow() } }
    fun cancelSignOut() { _signOut.value = SignOutUi.Idle }

    private suspend fun signOutNow() {
        _signOut.value = SignOutUi.Idle
        prefs.clearCompany()
        prefs.clearRecent()
        work.set(null)
        db.clearCaches()   // before the logout event: leaving the screen may cancel this scope
        api.signOut()
    }
}

