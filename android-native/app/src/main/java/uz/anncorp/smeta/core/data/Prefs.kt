package uz.anncorp.smeta.core.data

import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ThemeMode { DARK, LIGHT, SYSTEM }

/** Non-secret UI preferences (selected workplace, theme, module picks copy, recent objects). Secrets live only in [TokenStore]. */
class Prefs(private val sp: SharedPreferences) : PicksStore, WorkspaceCache {
    private val _theme = MutableStateFlow(runCatching { ThemeMode.valueOf(sp.getString(KEY_THEME, null) ?: "") }.getOrDefault(ThemeMode.DARK))
    val theme: StateFlow<ThemeMode> = _theme.asStateFlow()

    private val _company = MutableStateFlow(sp.getLong(KEY_COMPANY, -1L).takeIf { it > 0 })
    val selectedCompany: StateFlow<Long?> = _company.asStateFlow()

    fun setTheme(mode: ThemeMode) { sp.edit().putString(KEY_THEME, mode.name).apply(); _theme.value = mode }
    fun selectCompany(id: Long) { sp.edit().putLong(KEY_COMPANY, id).apply(); _company.value = id }
    fun clearCompany() { sp.edit().remove(KEY_COMPANY).apply(); _company.value = null }

    /** Notification groups the user switched off on THIS device (the notification centre hides them). */
    private val _muted = MutableStateFlow(decodeGroups(sp.getString(KEY_MUTED, null)))
    val mutedGroups: StateFlow<Set<NotifGroup>> = _muted.asStateFlow()
    fun setGroupMuted(g: NotifGroup, muted: Boolean) {
        val n = if (muted) _muted.value + g else _muted.value - g
        sp.edit().putString(KEY_MUTED, encodeGroups(n)).apply(); _muted.value = n
    }

    // Module picks: local copy (works offline); the shared copy lives on the server (/api/modullarim).
    override fun get(companyId: Long): Picks? = sp.getString(KEY_PICKS + companyId, null)?.let(::decodePicks)
    override fun put(companyId: Long, picks: Picks) { sp.edit().putString(KEY_PICKS + companyId, encodePicks(picks)).apply() }

    // Server-driven workspace: last good answer per company (offline copy; non-secret, cleared with the company on sign-out).
    override fun workspaceGet(companyId: Long): String? = sp.getString(KEY_WS + companyId, null)
    override fun workspacePut(companyId: Long, raw: String) { sp.edit().putString(KEY_WS + companyId, raw).apply() }

    // Recent objects: device-local convenience, cleared on sign-out.
    private val _recent = MutableStateFlow(decodeIds(sp.getString(KEY_RECENT, null)))
    val recent: StateFlow<List<Long>> = _recent.asStateFlow()
    fun pushRecent(id: Long) {
        val n = pushRecentId(_recent.value, id)
        sp.edit().putString(KEY_RECENT, n.joinToString(",")).apply()
        _recent.value = n
    }
    fun clearRecent() { sp.edit().remove(KEY_RECENT).apply(); _recent.value = emptyList() }

    private companion object {
        const val KEY_THEME = "theme"
        const val KEY_COMPANY = "company"
        const val KEY_PICKS = "picks:"
        const val KEY_WS = "ws:"
        const val KEY_RECENT = "recent"
        const val KEY_MUTED = "muted_groups"
    }
}

/** Most recent first, no duplicates, at most [max] entries. */
fun pushRecentId(list: List<Long>, id: Long, max: Int = 5): List<Long> = (listOf(id) + list.filter { it != id }).take(max)
internal fun decodeIds(s: String?): List<Long> = s?.split(',')?.mapNotNull { it.toLongOrNull() } ?: emptyList()
internal fun encodePicks(p: Picks) = "${p.version};${p.pinned.joinToString(",")};${p.order.joinToString(",")}"
internal fun decodePicks(s: String): Picks? {
    val parts = s.split(';')
    if (parts.size != 3) return null
    fun list(x: String) = x.split(',').filter { it.isNotBlank() }
    return Picks(list(parts[1]), list(parts[2]), parts[0].toIntOrNull() ?: 0)
}
