package uz.anncorp.smeta.feature.profile

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import uz.anncorp.smeta.BuildConfig
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.ThemeMode
import uz.anncorp.smeta.feature.home.HomeState
import uz.anncorp.smeta.feature.home.RoleChip

@Composable
fun ProfileScreen(state: HomeState, onTheme: (ThemeMode) -> Unit, onSwitch: () -> Unit, onSignOut: () -> Unit, onInvite: () -> Unit = {}, onInvites: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp)) {
        Section(stringResource(R.string.profile_account)) {
            val email = state.session?.email.orEmpty()
            if (email.isNotBlank()) Text(email, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface)
            val sel = state.selected
            if (sel != null) {
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text(sel.nom, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f, fill = false))
                    if (sel.rol.isNotBlank()) RoleChip(sel.rol)
                }
                if (state.workplaces.size > 1) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = onSwitch, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.workplace_switch)) }
                }
            }
        }
        if (uz.anncorp.smeta.core.data.Features.USERNAME) {
            Spacer(Modifier.height(16.dp))
            uz.anncorp.smeta.feature.people.UsernameSection(onInvite = onInvite, onInvites = onInvites)
        }
        Spacer(Modifier.height(16.dp))
        Section(stringResource(R.string.qulf_section)) { uz.anncorp.smeta.feature.lock.QulfSettings() }
        Spacer(Modifier.height(16.dp))
        Section(stringResource(R.string.profile_language)) {
            val current = AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore(',').substringBefore('-').ifBlank { "" }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("uz" to R.string.lang_uz, "ru" to R.string.lang_ru, "en" to R.string.lang_en).forEach { (tag, label) ->
                    FilterChip(
                        selected = current == tag || (current.isEmpty() && tag == "uz"),
                        onClick = { AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag)) },
                        label = { Text(stringResource(label)) },
                    )
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Section(stringResource(R.string.profile_theme)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(ThemeMode.DARK to R.string.theme_dark, ThemeMode.LIGHT to R.string.theme_light, ThemeMode.SYSTEM to R.string.theme_system).forEach { (mode, label) ->
                    FilterChip(selected = state.theme == mode, onClick = { onTheme(mode) }, label = { Text(stringResource(label)) })
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onSignOut, modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium,
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
        ) { Text(stringResource(R.string.profile_logout), style = MaterialTheme.typography.titleMedium) }
        Spacer(Modifier.height(12.dp))
        Text(
            stringResource(R.string.profile_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}
