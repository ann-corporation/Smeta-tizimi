package uz.anncorp.smeta.feature.home

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.AppRelease
import uz.anncorp.smeta.core.data.UpdateChecker
import uz.anncorp.smeta.core.ui.TouchTarget
import javax.inject.Inject

@HiltViewModel
class UpdateViewModel @Inject constructor(private val checker: UpdateChecker) : ViewModel() {
    private val _release = MutableStateFlow<AppRelease?>(null)
    val release: StateFlow<AppRelease?> = _release.asStateFlow()
    init { if (uz.anncorp.smeta.BuildConfig.SELF_UPDATE) viewModelScope.launch { _release.value = checker.newer() } }
    fun url(r: AppRelease): String = checker.url(r)
}

/** "Yangi versiya" strip under the top bar: opens the APK link (same host as the API) in the browser; "Keyin" hides it until the next launch. */
@Composable
fun UpdateBanner(vm: UpdateViewModel = hiltViewModel()) {
    val r by vm.release.collectAsStateWithLifecycle()
    var hidden by rememberSaveable { mutableStateOf(false) }
    val rel = r
    if (rel == null || hidden) return
    val ctx = LocalContext.current
    Surface(color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 16.dp, end = 4.dp).heightIn(min = TouchTarget), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                Text(stringResource(R.string.upd_title), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text(stringResource(R.string.upd_body, rel.version), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            TextButton(onClick = { hidden = true }, modifier = Modifier.heightIn(min = TouchTarget)) { Text(stringResource(R.string.upd_later)) }
            TextButton(
                onClick = { startApkDownload(ctx, vm.url(rel)) },
                modifier = Modifier.heightIn(min = TouchTarget),
            ) { Text(stringResource(R.string.upd_get)) }
        }
    }
}
