package uz.anncorp.smeta.core.data

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ThemeMode { DARK, LIGHT, SYSTEM }

/** Non-secret UI preferences (selected workplace, theme). Secrets live only in [TokenStore]. */
class Prefs(private val sp: SharedPreferences) {
    private val _theme = MutableStateFlow(runCatching { ThemeMode.valueOf(sp.getString(KEY_THEME, null) ?: "") }.getOrDefault(ThemeMode.DARK))
    val theme: StateFlow<ThemeMode> = _theme.asStateFlow()

    private val _company = MutableStateFlow(sp.getLong(KEY_COMPANY, -1L).takeIf { it > 0 })
    val selectedCompany: StateFlow<Long?> = _company.asStateFlow()

    fun setTheme(mode: ThemeMode) { sp.edit().putString(KEY_THEME, mode.name).apply(); _theme.value = mode }
    fun selectCompany(id: Long) { sp.edit().putLong(KEY_COMPANY, id).apply(); _company.value = id }
    fun clearCompany() { sp.edit().remove(KEY_COMPANY).apply(); _company.value = null }

    private companion object {
        const val KEY_THEME = "theme"
        const val KEY_COMPANY = "company"
    }
}
