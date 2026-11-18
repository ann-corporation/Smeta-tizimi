package uz.anncorp.smeta.feature.photo

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.db.QatorEntity
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.TouchTarget
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import java.io.File

@Composable
fun PhotoScreen(onBack: () -> Unit, onQueued: () -> Unit, vm: PhotoViewModel = hiltViewModel()) {
    val ui by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var pickRow by remember { mutableStateOf(false) }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? -> if (uri != null) vm.onImage(uri) }
    val pickImage = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { WorkTopBar(ui.title.ifBlank { stringResource(R.string.p2_photo_title) }, onBack) },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (ui.stage) {
                PhotoStage.CAPTURE -> CaptureStage(
                    onFile = { uri, file -> vm.onImage(uri) { file.delete() } }, onError = vm::onCaptureFailed, onGallery = pickImage,
                )
                PhotoStage.PROCESSING -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
                    CircularProgressIndicator(); Spacer(Modifier.height(12.dp)); Text(stringResource(R.string.p2_photo_processing), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                PhotoStage.FAILED -> CenterMessage(Icons.Filled.CameraAlt, stringResource(R.string.p2_photo_failed), null, stringResource(R.string.p2_photo_retake)) { vm.retake() }
                PhotoStage.REVIEW -> ReviewStage(ui, vm, onPickRow = { pickRow = true }, onQueued = onQueued)
            }
        }
    }
    if (pickRow) RowPickerDialog(vm, onPick = { vm.setRow(it); pickRow = false }, onDismiss = { pickRow = false })
    // keep the context referenced for lint (no-op)
    context.hashCode()
}

@Composable
private fun CaptureStage(onFile: (Uri, File) -> Unit, onError: () -> Unit, onGallery: () -> Unit) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val request = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    if (!granted) {
        Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
            Icon(Icons.Filled.CameraAlt, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(44.dp))
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.p2_photo_cam_perm_title), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.p2_photo_cam_perm_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            Button(onClick = { request.launch(Manifest.permission.CAMERA) }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) { Text(stringResource(R.string.p2_photo_grant)) }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onGallery, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
                Icon(Icons.Filled.PhotoLibrary, null); Spacer(Modifier.width(8.dp)); Text(stringResource(R.string.p2_photo_gallery))
            }
        }
        return
    }
    CameraCapture(onFile, onError, onGallery)
}

@Composable
private fun CameraCapture(onFile: (Uri, File) -> Unit, onError: () -> Unit, onGallery: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    var busy by remember { mutableStateOf(false) }
    val fail = onError

    DisposableEffect(owner) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            runCatching {
                val provider = future.get()
                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                provider.unbindAll()
                provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
            }.onFailure { onError() }
        }, ContextCompat.getMainExecutor(context))
        onDispose { if (future.isDone) runCatching { future.get().unbindAll() } }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 32.dp, vertical = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) {
                IconButton(onClick = onGallery, modifier = Modifier.size(TouchTarget).background(Color(0x66000000), CircleShape)) {
                    Icon(Icons.Filled.PhotoLibrary, stringResource(R.string.p2_photo_gallery), tint = Color.White)
                }
            }
            Box(
                Modifier.size(76.dp).clip(CircleShape).background(Color.White.copy(alpha = if (busy) 0.4f else 1f))
                    .clickable(enabled = !busy, onClickLabel = stringResource(R.string.p2_photo_capture)) {
                        busy = true
                        val file = File(context.cacheDir, "capture-${System.nanoTime()}.jpg")
                        capture.takePicture(
                            ImageCapture.OutputFileOptions.Builder(file).build(), ContextCompat.getMainExecutor(context),
                            object : ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(output: ImageCapture.OutputFileResults) { busy = false; onFile(Uri.fromFile(file), file) }
                                override fun onError(exception: ImageCaptureException) { busy = false; file.delete(); fail() }
                            },
                        )
                    },
            ) {
                Box(Modifier.align(Alignment.Center).size(62.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
            }
            Box(Modifier.weight(1f))
        }
    }
}

@Composable
private fun ReviewStage(ui: PhotoUi, vm: PhotoViewModel, onPickRow: () -> Unit, onQueued: () -> Unit) {
    val photo = ui.photo ?: return
    val bitmap = remember(photo) { BitmapFactory.decodeByteArray(photo.jpeg, 0, photo.jpeg.size)?.asImageBitmap() }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp)) {
            if (bitmap != null) {
                Image(
                    bitmap, null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(14.dp)).background(Color.Black),
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.p2_photo_info, photo.width, photo.height, formatKb(photo.jpeg.size)),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = ui.note, onValueChange = vm::setNote, label = { Text(stringResource(R.string.p2_photo_note)) },
                minLines = 2, maxLines = 4, modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(14.dp))
            if (!ui.forNaryad) WorkCard(onClick = onPickRow) {
                Row(Modifier.padding(14.dp).heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.p2_photo_row), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        val r = ui.row
                        Text(
                            if (r == null) stringResource(R.string.p2_photo_row_none) else listOfNotNull(r.kod?.takeIf { it.isNotBlank() }, r.nom).joinToString(" "),
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (ui.row != null) IconButton(onClick = { vm.setRow(null) }) { Icon(Icons.Filled.Clear, null) }
                    else Text(stringResource(R.string.p2_photo_row_pick), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.p2_photo_gps), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                    Text(stringResource(R.string.p2_photo_gps_hint), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.width(12.dp))
                Switch(checked = ui.includeGps, onCheckedChange = vm::setGps, enabled = photo.lat != null)
            }
        }
        Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 3.dp) {
            Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = vm::retake, modifier = Modifier.heightIn(min = TouchTarget)) {
                    Icon(Icons.Filled.Refresh, null); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.p2_photo_retake))
                }
                Button(onClick = { vm.queue(onQueued) }, enabled = !ui.saving, modifier = Modifier.weight(1f).heightIn(min = TouchTarget)) {
                    Text(stringResource(R.string.p2_photo_queue), style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

private fun formatKb(bytes: Int): String = if (bytes >= 1_000_000) "%.1f MB".format(bytes / 1_000_000.0) else "${(bytes + 512) / 1024} KB"

@Composable
private fun RowPickerDialog(vm: PhotoViewModel, onPick: (QatorEntity) -> Unit, onDismiss: () -> Unit) {
    var query by remember { mutableStateOf("") }
    val results by vm.pickResults.collectAsStateWithLifecycle(emptyList())
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.p2_photo_pick_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = query, onValueChange = { query = it; vm.setPickQuery(it) }, singleLine = true,
                    placeholder = { Text(stringResource(R.string.p1_fakt_search)) }, leadingIcon = { Icon(Icons.Filled.Search, null) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(Modifier.heightIn(max = 360.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(results, key = { it.rid }) { r ->
                        Column(Modifier.fillMaxWidth().clickable { onPick(r) }.heightIn(min = 48.dp).padding(vertical = 8.dp)) {
                            r.kod?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
                            Text(r.nom, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.p1_cancel)) } },
    )
}
