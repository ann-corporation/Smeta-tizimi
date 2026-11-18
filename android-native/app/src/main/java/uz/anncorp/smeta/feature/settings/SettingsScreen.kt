package uz.anncorp.smeta.feature.settings

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.text.KeyboardOptions
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import uz.anncorp.smeta.BuildConfig
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.NotifGroup
import uz.anncorp.smeta.core.data.SettingsRepository
import uz.anncorp.smeta.core.data.ThemeMode
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.core.ui.formatStamp
import uz.anncorp.smeta.feature.lock.QulfSettings
import javax.inject.Inject

@HiltViewModel
class ProfileHeaderViewModel @Inject constructor(private val repo: SettingsRepository) : ViewModel() {
    val avatar = repo.avatar
    val profile = repo.profile
    init { viewModelScope.launch { repo.load(); repo.refreshAvatar() } }
}

/** Top of the Profile tab: photo + name + "Settings" (Telegram style). */
@Composable
fun ProfileHeader(fallbackName: String, onOpen: () -> Unit, vm: ProfileHeaderViewModel = hiltViewModel()) {
    val avatar by vm.avatar.collectAsStateWithLifecycle()
    val p by vm.profile.collectAsStateWithLifecycle()
    val name = p?.name?.takeIf { it.isNotBlank() } ?: fallbackName
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(Modifier.padding(16.dp).heightIn(min = TouchTarget), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            AvatarCircle(avatar, name, 56.dp, p?.avatarColor)
            Column(Modifier.weight(1f)) {
                Text(name.ifBlank { stringResource(R.string.p10_title) }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                Text(stringResource(R.string.p10_open_settings), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun SettingsMsg.res(): Int = when (this) {
    SettingsMsg.SAVED -> R.string.p10_msg_saved
    SettingsMsg.NETWORK -> R.string.p10_msg_network
    SettingsMsg.SERVER -> R.string.p10_msg_server
    SettingsMsg.BAD_NAME -> R.string.p10_msg_bad_name
    SettingsMsg.BAD_PHONE -> R.string.p10_msg_bad_phone
    SettingsMsg.PHOTO_SAVED -> R.string.p10_msg_photo_saved
    SettingsMsg.PHOTO_REMOVED -> R.string.p10_msg_photo_removed
    SettingsMsg.PHOTO_BAD -> R.string.p10_msg_photo_bad
    SettingsMsg.PHOTO_BIG -> R.string.p10_msg_photo_big
    SettingsMsg.OTHERS_OUT -> R.string.p10_msg_others_out
    SettingsMsg.CACHE_CLEARED -> R.string.p10_msg_cache_cleared
    SettingsMsg.RATE -> R.string.p10_msg_rate
    SettingsMsg.NOT_DEPLOYED -> R.string.p10_msg_not_deployed
    SettingsMsg.TG_FAILED -> R.string.p10_msg_tg_failed
}

private fun NotifGroup.label(): Int = when (this) {
    NotifGroup.APPROVALS -> R.string.p10_ng_approvals
    NotifGroup.LETTERS -> R.string.p10_ng_letters
    NotifGroup.DEADLINES -> R.string.p10_ng_deadlines
    NotifGroup.DRAWINGS -> R.string.p10_ng_drawings
    NotifGroup.OTHER -> R.string.p10_ng_other
}

private enum class Dlg { NONE, NAME, PHONE, PHOTO_MENU, OTHERS, LOGOUT }

/** Settings (Telegram-like): photo, name, phone, language, theme, notifications, PIN/biometrics, sessions, storage, about, log out. */
@Composable
fun SettingsScreen(onBack: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val avatar by vm.avatar.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val snack = remember { SnackbarHostState() }
    var dlg by rememberSaveable { mutableStateOf(Dlg.NONE) }
    var cropUri by remember { mutableStateOf<Uri?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) cropUri = uri }

    ui.message?.let { m ->
        val text = stringResource(m.res())
        LaunchedEffect(m) { snack.showSnackbar(text); vm.consumeMessage() }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snack) },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
        topBar = { WorkTopBar(stringResource(R.string.p10_title), onBack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val p = ui.profile
            val name = p?.name.orEmpty()

            // ---- Photo + name header ----
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                AvatarCircle(avatar, name, 96.dp, p?.avatarColor, Modifier.clickable { dlg = Dlg.PHOTO_MENU })
                TextButton(onClick = { dlg = Dlg.PHOTO_MENU }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_change_photo)) }
                if (name.isNotBlank()) Text(name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
                if (!p?.email.isNullOrBlank()) Text(p!!.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (ui.loading) LinearProgressIndicator(Modifier.fillMaxWidth())

            Section(stringResource(R.string.p10_sec_account)) {
                ValueRow(stringResource(R.string.p10_name), name.ifBlank { "вЂ”" }) { dlg = Dlg.NAME }
                ValueRow(stringResource(R.string.p10_phone), p?.phone ?: stringResource(R.string.p10_phone_none), if (p?.phone != null) stringResource(if (p.phoneVerified) R.string.p10_phone_verified else R.string.p10_phone_unverified) else null) { dlg = Dlg.PHONE }
            }

            Section(stringResource(R.string.profile_language)) {
                val current = AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore(',').substringBefore('-')
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("uz" to R.string.lang_uz, "ru" to R.string.lang_ru, "en" to R.string.lang_en).forEach { (tag, label) ->
                        FilterChip(selected = current == tag || (current.isEmpty() && tag == "uz"), onClick = {
                            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag)); vm.languageChanged(tag)
                        }, label = { Text(stringResource(label)) })
                    }
                }
            }

            Section(stringResource(R.string.profile_theme)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(ThemeMode.DARK to R.string.theme_dark, ThemeMode.LIGHT to R.string.theme_light, ThemeMode.SYSTEM to R.string.theme_system).forEach { (mode, label) ->
                        FilterChip(selected = ui.theme == mode, onClick = { vm.setTheme(mode) }, label = { Text(stringResource(label)) })
                    }
                }
            }

            Section(stringResource(R.string.p10_sec_notifications)) {
                Text(stringResource(R.string.p10_notif_device_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                NotifGroup.entries.forEach { g -> SwitchRow(stringResource(g.label()), g !in ui.muted) { on -> vm.setMuted(g, !on) } }
                val tg = ui.tg
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.p10_tg_title), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                when {
                    tg == null -> Text(stringResource(R.string.p10_tg_unknown), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    !tg.linked -> Text(stringResource(R.string.p10_tg_not_linked), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else -> {
                        SwitchRow(stringResource(R.string.p10_tg_tasks), tg.topshiriq) { vm.setTelegram("topshiriq", it) }
                        SwitchRow(stringResource(R.string.p10_tg_f2), tg.f2) { vm.setTelegram("f2", it) }
                        SwitchRow(stringResource(R.string.p10_tg_signals), tg.signal) { vm.setTelegram("signal", it) }
                    }
                }
            }

            Section(stringResource(R.string.qulf_section)) { QulfSettings() }

            Section(stringResource(R.string.p10_sec_sessions)) {
                Text(stringResource(R.string.p10_session_this, android.os.Build.MODEL ?: "Android"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                p?.sessionStart?.let { Text(stringResource(R.string.p10_session_since, formatStamp(it).orEmpty()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                p?.sessionEnd?.let { Text(stringResource(R.string.p10_session_until, formatStamp(it).orEmpty()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { dlg = Dlg.OTHERS }, enabled = !ui.busy, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_sessions_out_others)) }
            }

            Section(stringResource(R.string.p10_sec_storage)) {
                Text(stringResource(R.string.p10_cache_size, formatBytes(ui.cacheBytes)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                OutlinedButton(onClick = vm::clearCache, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_cache_clear)) }
                Text(stringResource(R.string.p10_cache_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Section(stringResource(R.string.p10_sec_about)) {
                Text(stringResource(R.string.profile_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                when (val u = ui.update) {
                    UpdateUi.Idle -> {}
                    UpdateUi.Checking -> Text(stringResource(R.string.p10_update_checking), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    UpdateUi.UpToDate -> Text(stringResource(R.string.p10_update_none), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                    is UpdateUi.Available -> {
                        Text(stringResource(R.string.upd_body, u.release.version), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        Button(onClick = { uz.anncorp.smeta.feature.home.startApkDownload(ctx, u.url) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.upd_get)) }
                    }
                }
                OutlinedButton(onClick = vm::checkUpdate, enabled = ui.update != UpdateUi.Checking, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_update_check)) }
            }

            Button(
                onClick = { dlg = Dlg.LOGOUT }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
            ) { Text(stringResource(R.string.profile_logout), style = MaterialTheme.typography.titleMedium) }
            Spacer(Modifier.height(12.dp))
        }
    }

    when (dlg) {
        Dlg.NAME -> TextDialog(stringResource(R.string.p10_name), ui.profile?.name.orEmpty(), KeyboardType.Text, onDismiss = { dlg = Dlg.NONE }) { if (vm.saveName(it)) dlg = Dlg.NONE }
        Dlg.PHONE -> TextDialog(stringResource(R.string.p10_phone), ui.profile?.phone.orEmpty(), KeyboardType.Phone, hint = stringResource(R.string.p10_phone_hint), onDismiss = { dlg = Dlg.NONE }) { if (vm.savePhone(it)) dlg = Dlg.NONE }
        Dlg.PHOTO_MENU -> AlertDialog(
            onDismissRequest = { dlg = Dlg.NONE }, title = { Text(stringResource(R.string.p10_change_photo)) },
            text = {
                Column {
                    TextButton(onClick = { dlg = Dlg.NONE; picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_photo_pick)) }
                    if (avatar != null) TextButton(onClick = { dlg = Dlg.NONE; vm.removeAvatar() }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p10_photo_remove), color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {}, dismissButton = { TextButton(onClick = { dlg = Dlg.NONE }) { Text(stringResource(R.string.p10_cancel)) } },
        )
        Dlg.OTHERS -> AlertDialog(
            onDismissRequest = { dlg = Dlg.NONE }, title = { Text(stringResource(R.string.p10_sessions_out_others)) }, text = { Text(stringResource(R.string.p10_sessions_out_body)) },
            confirmButton = { TextButton(onClick = { dlg = Dlg.NONE; vm.signOutOthers() }) { Text(stringResource(R.string.p10_confirm)) } },
            dismissButton = { TextButton(onClick = { dlg = Dlg.NONE }) { Text(stringResource(R.string.p10_cancel)) } },
        )
        Dlg.LOGOUT -> AlertDialog(
            onDismissRequest = { dlg = Dlg.NONE }, title = { Text(stringResource(R.string.profile_logout)) },
            text = { Text(if (ui.unsent > 0) stringResource(R.string.p10_logout_unsent, ui.unsent) else stringResource(R.string.p10_logout_body)) },
            confirmButton = { TextButton(onClick = { dlg = Dlg.NONE; vm.signOut() }) { Text(stringResource(R.string.profile_logout), color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { dlg = Dlg.NONE }) { Text(stringResource(R.string.p10_cancel)) } },
        )
        Dlg.NONE -> {}
    }

    cropUri?.let { uri ->
        AvatarCropDialog(uri, onCancel = { cropUri = null }, onUnreadable = { cropUri = null; vm.photoRejected() }, onDone = { bytes -> cropUri = null; vm.uploadAvatar(bytes) })
    }
}

internal fun formatBytes(b: Long): String = when {
    b < 1024 -> "$b B"
    b < 1024 * 1024 -> "${b / 1024} KB"
    else -> "%.1f MB".format(java.util.Locale.US, b / 1048576.0)
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            content()
        }
    }
}

@Composable
private fun ValueRow(label: String, value: String, note: String? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = TouchTarget).clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            if (note != null) Text(note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
        }
        Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
        Switch(checked, onChange)
    }
}

@Composable
private fun TextDialog(title: String, initial: String, keyboard: KeyboardType, hint: String? = null, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var v by rememberSaveable { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss, title = { Text(title) },
        text = {
            OutlinedTextField(v, { v = it }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = keyboard), modifier = Modifier.fillMaxWidth(),
                supportingText = hint?.let { { Text(it) } })
        },
        confirmButton = { TextButton(onClick = { onSave(v) }) { Text(stringResource(R.string.p10_save)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.p10_cancel)) } },
    )
}

