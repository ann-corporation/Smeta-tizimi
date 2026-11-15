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
)

/** Picks the selected workplace: the saved one if it still exists, otherwise the first. */
internal fun pickWorkplace(list: List<Workplace>, savedId: Long?): Workplace? = list.firstOrNull { it.companyId == savedId } ?: list.firstOrNull()

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val sessions: SessionRepository,
    private val api: ApiClient,
    private val prefs: Prefs,
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
        }
    }

    fun select(w: Workplace) {
        prefs.selectCompany(w.companyId)
        _state.update { it.copy(selected = w) }
    }

    fun setTheme(mode: ThemeMode) {
        prefs.setTheme(mode)
        _state.update { it.copy(theme = mode) }
    }

    fun signOut() {
        prefs.clearCompany()
        viewModelScope.launch { api.signOut() }
    }
}
