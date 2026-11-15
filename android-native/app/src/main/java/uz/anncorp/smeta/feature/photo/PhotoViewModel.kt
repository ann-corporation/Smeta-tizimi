package uz.anncorp.smeta.feature.photo

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.ObjectsRepository
import uz.anncorp.smeta.core.data.PhotoRepository
import uz.anncorp.smeta.core.data.RowsRepository
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.db.QatorEntity
import uz.anncorp.smeta.core.media.PhotoProcessor
import uz.anncorp.smeta.core.media.ProcessedPhoto
import javax.inject.Inject

enum class PhotoStage { CAPTURE, PROCESSING, REVIEW, FAILED }

data class PhotoUi(
    val stage: PhotoStage = PhotoStage.CAPTURE,
    val photo: ProcessedPhoto? = null,
    val title: String = "",
    val note: String = "",
    val includeGps: Boolean = false,
    val row: QatorEntity? = null,
    val saving: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class PhotoViewModel @Inject constructor(
    handle: SavedStateHandle, objects: ObjectsRepository, private val rows: RowsRepository,
    private val processor: PhotoProcessor, private val photos: PhotoRepository, private val ctx: WorkContext,
) : ViewModel() {
    val id: Long = checkNotNull(handle["id"])
    private val local = MutableStateFlow(PhotoUi())
    private val title = objects.observeOne(id)

    val state: StateFlow<PhotoUi> = combine(local, title) { ui, o -> ui.copy(title = o?.nom.orEmpty()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), PhotoUi())

    private val pickQuery = MutableStateFlow("")
    val pickResults: Flow<List<QatorEntity>> = pickQuery.debounce(120).flatMapLatest { rows.search(id, it, null, 50) }
    fun setPickQuery(q: String) { pickQuery.value = q }

    /** A captured or picked image. The processed JPEG lives in memory until the person queues it; the source is not kept. */
    fun onImage(uri: Uri, cleanup: () -> Unit = {}) {
        local.value = local.value.copy(stage = PhotoStage.PROCESSING)
        viewModelScope.launch {
            val p = runCatching { processor.process(uri) }.getOrNull()
            cleanup()
            local.value = if (p == null) local.value.copy(stage = PhotoStage.FAILED, photo = null)
            else local.value.copy(stage = PhotoStage.REVIEW, photo = p, includeGps = false)
        }
    }

    fun onCaptureFailed() { local.value = local.value.copy(stage = PhotoStage.FAILED) }
    fun retake() { local.value = local.value.copy(stage = PhotoStage.CAPTURE, photo = null, includeGps = false) }
    fun setNote(s: String) { local.value = local.value.copy(note = s.take(500)) }
    fun setGps(on: Boolean) { local.value = local.value.copy(includeGps = on && local.value.photo?.lat != null) }
    fun setRow(r: QatorEntity?) { local.value = local.value.copy(row = r) }

    /** Moves the photo into the outbox (idempotent, resumable). The position is attached only if the person switched it on. */
    fun queue(onQueued: () -> Unit) {
        val ui = local.value
        val p = ui.photo ?: return
        val w = ctx.current.value ?: return
        if (ui.saving) return
        local.value = ui.copy(saving = true)
        viewModelScope.launch {
            val send = if (ui.includeGps) p else ProcessedPhoto(p.jpeg, p.width, p.height, p.sha256, null, null)
            photos.enqueue(send, w.companyId, id, ui.title.ifBlank { "#$id" }, ui.row?.qatorId, ui.note)
            local.value = PhotoUi()
            onQueued()
        }
    }
}
