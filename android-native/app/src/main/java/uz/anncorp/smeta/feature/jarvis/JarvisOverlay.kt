package uz.anncorp.smeta.feature.jarvis

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.Features
import kotlin.math.roundToInt

/**
 * Jarvis everywhere: a small draggable floating button over every screen of the signed-in app; a tap opens the SAME chat screen
 * ([JarvisScreen] + [JarvisViewModel], unchanged) in a full-height bottom sheet. The chat survives closing the sheet (activity-scoped
 * view model); [epoch] changes on sign-out so the next account never sees the previous conversation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JarvisOverlay(visible: Boolean, epoch: Int) {
    if (!Features.JARVIS || !visible) return
    var open by rememberSaveable { mutableStateOf(false) }
    var dx by rememberSaveable { mutableFloatStateOf(0f) }
    var dy by rememberSaveable { mutableFloatStateOf(0f) }
    val imeOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = constraints.maxWidth.toFloat(); val h = constraints.maxHeight.toFloat()
        val size = with(LocalDensity.current) { 48.dp.toPx() }
        // Resting place: right edge, a little below the middle (clear of the top bar and the bottom navigation); the drag is kept on screen.
        if (!imeOpen && !open) Surface(
            shape = CircleShape, color = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary, shadowElevation = 6.dp,
            modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp)
                .offset { IntOffset(dx.roundToInt(), dy.roundToInt()) }
                .size(48.dp)
                .pointerInput(w, h) {
                    detectDragGestures { change, drag ->
                        change.consume()
                        dx = (dx + drag.x).coerceIn(-(w - size - 16f), 0f)
                        dy = (dy + drag.y).coerceIn(-(h / 2 - size), h / 2 - size)
                    }
                }
                .clickable { open = true },
        ) { Icon(Icons.Filled.AutoAwesome, stringResource(R.string.mod_jarvis), Modifier.padding(12.dp)) }
    }

    if (open) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { open = false }, sheetState = sheet, contentWindowInsets = { WindowInsets(0) }) {
            JarvisScreen(onBack = { open = false }, vm = hiltViewModel<JarvisViewModel>(key = "jarvis-overlay-$epoch"))
        }
    }
}
