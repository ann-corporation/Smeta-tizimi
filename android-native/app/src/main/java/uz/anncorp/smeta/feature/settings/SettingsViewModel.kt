package uz.anncorp.smeta.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ApiClient
import uz.anncorp.smeta.core.data.AppRelease
import uz.anncorp.smeta.core.data.DeviceCredential
import uz.anncorp.smeta.core.data.DocCache
import uz.anncorp.smeta.core.data.NotifGroup
import uz.anncorp.smeta.core.data.OutboxRepository
import uz.anncorp.smeta.core.data.Prefs
import uz.anncorp.smeta.core.data.ProfileRules
import uz.anncorp.smeta.core.data.SettingsError
import uz.anncorp.smeta.core.data.SettingsRepository
import uz.anncorp.smeta.core.data.SettingsResult
import uz.anncorp.smeta.core.data.SignOutOthers
import uz.anncorp.smeta.core.data.ThemeMode
import uz.anncorp.smeta.core.data.TgPrefs
import uz.anncorp.smeta.core.data.TokenStore
import uz.anncorp.smeta.core.data.UpdateChecker
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.WorkspaceRepository
import uz.anncorp.smeta.core.data.MyProfile
import javax.inject.Inject

/** One-shot messages shown as a snackbar; the screen maps each to a localized string. */
enum class SettingsMsg { SAVED, NETWORK, SERVER, BAD_NAME, BAD_PHONE, PHOTO_SAVED, PHOTO_REMOVED, PHOTO_BAD, PHOTO_BIG, OTHERS_OUT, CACHE_CLEARED, RATE, NOT_DEPLOYED, TG_FAILED }

sealed interface UpdateUi {
    data object Idle : UpdateUi
    data object Checking : UpdateUi
    data object UpToDate : UpdateUi
    data class Available(val release: AppRelease, val url: String) : UpdateUi
}

data class SettingsUi(
    val loading: Boolean = true,
    val profile: MyProfile? = null,
    val busy: Boolean = false,
    val message: SettingsMsg? = null,
    val tg: TgPrefs? = null,
    val update: UpdateUi = UpdateUi.Idle,
    val cacheBytes: Long = 0,
    val unsent: Int = 0,
    val theme: ThemeMode = ThemeMode.DARK,
    val muted: Set<NotifGroup> = emptySet(),
)

fun SettingsError.toMessage(): SettingsMsg = when (this) {
    SettingsError.NETWORK -> SettingsMsg.NETWORK
    SettingsError.BAD_NAME -> SettingsMsg.BAD_NAME
    SettingsError.BAD_PHONE -> SettingsMsg.BAD_PHONE
    SettingsError.BAD_IMAGE -> SettingsMsg.PHOTO_BAD
    SettingsError.TOO_LARGE -> SettingsMsg.PHOTO_BIG
    SettingsError.RATE_LIMIT -> SettingsMsg.RATE
    SettingsError.NOT_DEPLOYED -> SettingsMsg.NOT_DEPLOYED
    SettingsError.UNAUTHORIZED, SettingsError.SERVER -> SettingsMsg.SERVER
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repo: SettingsRepository,
    private val prefs: Prefs,
    private val api: ApiClient,
    @dagger.hilt.android.qualifiers.ApplicationContext private val appContext: android.content.Context,
    private val tokens: TokenStore,
    private val docCache: DocCache,
    private val updates: UpdateChecker,
    private val outbox: OutboxRepository,
    private val db: uz.anncorp.smeta.core.db.AppDb,
    private val work: WorkContext,
    private val workspaces: WorkspaceRepository,
) : ViewModel() {
    private val _ui = MutableStateFlow(SettingsUi(theme = prefs.theme.value, muted = prefs.mutedGroups.value, cacheBytes = docCache.sizeBytes()))
    val ui: StateFlow<SettingsUi> = _ui.asStateFlow()
    val avatar: StateFlow<ByteArray?> = repo.avatar

    init {
        viewModelScope.launch { prefs.mutedGroups.collect { m -> _ui.update { it.copy(muted = m) } } }
        viewModelScope.launch { prefs.theme.collect { t -> _ui.update { it.copy(theme = t) } } }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val p = repo.load()
            _ui.update { it.copy(loading = false, profile = (p as? SettingsResult.Ok)?.value ?: it.profile, unsent = 0) }
            _ui.update { it.copy(unsent = runCatching { outbox.unsent().size }.getOrDefault(0)) }
        }
        viewModelScope.launch { repo.refreshAvatar() }
        viewModelScope.launch { (repo.telegram() as? SettingsResult.Ok)?.let { r -> _ui.update { it.copy(tg = r.value) } } }
    }

    fun consumeMessage() = _ui.update { it.copy(message = null) }

    private fun run(okMsg: SettingsMsg?, block: suspend () -> SettingsResult<*>) {
        if (_ui.value.busy) return
        _ui.update { it.copy(busy = true) }
        viewModelScope.launch {
            val r = block()
            _ui.update { it.copy(busy = false, profile = repo.profile.value ?: it.profile, message = if (r is SettingsResult.Ok<*>) okMsg else (r as SettingsResult.Err).error.toMessage()) }
        }
    }

    /** Returns false (nothing sent) when the input is invalid, so the dialog can stay open. */
    fun saveName(raw: String): Boolean {
        if (!ProfileRules.nameOk(raw)) { _ui.update { it.copy(message = SettingsMsg.BAD_NAME) }; return false }
        if (raw.trim() == _ui.value.profile?.name) return true
        run(SettingsMsg.SAVED) { repo.update(name = raw) }
        return true
    }

    fun savePhone(raw: String): Boolean {
        val p = ProfileRules.phone(raw)
        if (p == ProfileRules.INVALID) { _ui.update { it.copy(message = SettingsMsg.BAD_PHONE) }; return false }
        run(SettingsMsg.SAVED) { repo.update(phone = p ?: "") }
        return true
    }

    /** The application locale is switched by the UI; the server copy is best effort. */
    fun languageChanged(tag: String) { viewModelScope.launch { repo.update(language = tag) } }

    fun setTheme(mode: ThemeMode) = prefs.setTheme(mode)
    fun setMuted(g: NotifGroup, muted: Boolean) = prefs.setGroupMuted(g, muted)

    fun setTelegram(key: String, value: Boolean) {
        val before = _ui.value.tg ?: return
        _ui.update { it.copy(tg = before.with(key, value)) }
        viewModelScope.launch {
            when (val r = repo.setTelegram(key, value)) {
                is SettingsResult.Ok -> _ui.update { it.copy(tg = r.value) }
                is SettingsResult.Err -> _ui.update { it.copy(tg = before, message = SettingsMsg.TG_FAILED) }
            }
        }
    }

    fun uploadAvatar(jpeg: ByteArray) = run(SettingsMsg.PHOTO_SAVED) { repo.uploadAvatar(jpeg) }
    fun removeAvatar() = run(SettingsMsg.PHOTO_REMOVED) { repo.removeAvatar() }
    fun photoRejected() = _ui.update { it.copy(message = SettingsMsg.PHOTO_BAD) }

    /** Ends every other session; this device is re-enrolled with the new token (or signs in again if the server could not). */
    fun signOutOthers() {
        if (_ui.value.busy) return
        _ui.update { it.copy(busy = true) }
        viewModelScope.launch {
            when (val r = repo.signOutOthers()) {
                is SettingsResult.Ok -> when (val v = r.value) {
                    is SignOutOthers.Renewed -> { if (!uz.anncorp.smeta.core.demo.Demo.enabled(appContext)) tokens.save(DeviceCredential(v.renewal.deviceId, v.renewal.token, v.renewal.expires)); _ui.update { it.copy(busy = false, message = SettingsMsg.OTHERS_OUT) } }
                    SignOutOthers.SignedOutHere -> { _ui.update { it.copy(busy = false) }; signOutNow() }
                }
                is SettingsResult.Err -> _ui.update { it.copy(busy = false, message = r.error.toMessage()) }
            }
        }
    }

    fun clearCache() {
        docCache.clear()
        _ui.update { it.copy(cacheBytes = docCache.sizeBytes(), message = SettingsMsg.CACHE_CLEARED) }
    }

    fun checkUpdate() {
        _ui.update { it.copy(update = UpdateUi.Checking) }
        viewModelScope.launch {
            val r = updates.newer()
            _ui.update { it.copy(update = if (r == null) UpdateUi.UpToDate else UpdateUi.Available(r, updates.url(r))) }
        }
    }

    /** Unsent field records stay on the device (they resume after the next sign-in); the caller already confirmed. */
    fun signOut() { viewModelScope.launch { signOutNow() } }

    private suspend fun signOutNow() {
        prefs.clearCompany()
        prefs.clearRecent()
        workspaces.clear()
        work.set(null)
        db.clearCaches()
        if (uz.anncorp.smeta.core.demo.Demo.enabled(appContext)) uz.anncorp.smeta.core.demo.Demo.exit(appContext) else api.signOut()
    }
}
