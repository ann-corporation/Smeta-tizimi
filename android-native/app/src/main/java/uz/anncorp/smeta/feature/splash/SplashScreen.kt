package uz.anncorp.smeta.feature.splash

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.SessionRepository
import uz.anncorp.smeta.core.data.TokenStore
import uz.anncorp.smeta.core.ui.QurLogo
import javax.inject.Inject

@HiltViewModel
class SplashViewModel @Inject constructor(tokens: TokenStore, sessions: SessionRepository) : ViewModel() {
    private val _route = MutableStateFlow<StartRoute?>(null)
    val route: StateFlow<StartRoute?> = _route

    init {
        viewModelScope.launch {
            val started = System.currentTimeMillis()
            val r = SplashRouter({ tokens.load() }, { sessions.check() }).decide()
            // Keep the brand visible briefly so the transition does not flash.
            val left = 700 - (System.currentTimeMillis() - started)
            if (left > 0) delay(left)
            _route.value = r
        }
    }
}

@Composable
fun SplashScreen(onRoute: (StartRoute) -> Unit, vm: SplashViewModel = hiltViewModel()) {
    val route = vm.route
    LaunchedEffect(Unit) { route.collect { it?.let(onRoute) } }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                QurLogo(104.dp)
                Spacer(Modifier.height(24.dp))
                Text("QURAI", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.app_tagline), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
