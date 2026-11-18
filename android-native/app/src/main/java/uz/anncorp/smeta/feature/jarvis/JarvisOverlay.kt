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
fun JarvisOverlay(visible: Boolean, epoch: Int, scrollHidden: Boolean = false) {
    if (!Features.JARVIS || !visible) return
    var open by rememberSaveable { mutableStateOf(false) }
    // The dragged position is remembered across launches (offsets from the resting place, in px).
    val prefs = androidx.compose.ui.platform.LocalContext.current.getSharedPreferences("jarvis_fab", android.content.Context.MODE_PRIVATE)
    var dy by rememberSaveable { mutableFloatStateOf(prefs.getFloat("dy", 0f)) }
    val imeOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = constraints.maxWidth.toFloat(); val h = constraints.maxHeight.toFloat()
        val size = with(LocalDensity.current) { 40.dp.toPx() }
        // QA 2026-11-18: the round button sat on top of numbers, lists and the save button. It is now a slim edge handle (22 dp, inside the 16 dp screen gutter
        // plus the card edge), centred on the right edge: it never covers content, hides while scrolling down or typing, and can still be dragged up/down (remembered).
        androidx.compose.animation.AnimatedVisibility(
            visible = !imeOpen && !open && !scrollHidden, modifier = Modifier.align(Alignment.CenterEnd),
            enter = androidx.compose.animation.fadeIn(), exit = androidx.compose.animation.fadeOut(),
        ) { Surface(
            shape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = 14.dp, bottomStart = 14.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f), contentColor = MaterialTheme.colorScheme.onPrimary, shadowElevation = 2.dp,
            modifier = Modifier.offset { IntOffset(0, dy.roundToInt()) }
                .size(width = 20.dp, height = 56.dp)
                .pointerInput(w, h) {
                    detectDragGestures(onDragEnd = { prefs.edit().putFloat("dy", dy).apply() }) { change, drag ->
                        change.consume()
                        dy = (dy + drag.y).coerceIn(-(h / 2f - size - 120f), h / 2f - size - 220f)
                    }
                }
                .clickable { open = true },
        ) { Icon(Icons.Filled.AutoAwesome, stringResource(R.string.mod_jarvis), Modifier.padding(start = 2.dp, top = 20.dp, bottom = 20.dp, end = 2.dp)) } }
    }

    if (open) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { open = false }, sheetState = sheet, contentWindowInsets = { WindowInsets(0) }) {
            JarvisScreen(onBack = { open = false }, vm = hiltViewModel<JarvisViewModel>(key = "jarvis-overlay-$epoch"), embedded = true)
        }
    }
}
