package uz.anncorp.smeta.feature.disk

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import uz.anncorp.smeta.core.data.BffApi
import uz.anncorp.smeta.core.data.arr
import uz.anncorp.smeta.core.data.num
import uz.anncorp.smeta.core.data.obj
import uz.anncorp.smeta.core.data.str
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode

/*
 * "Disk" (website: Mening diskim | Kompaniya diski | Ulashilgan | Savat). The phone and the Windows app read the SAME endpoint as the site:
 * GET /api/hujjat-maydoni?amal=royxat[&kompaniya_id=][&papka_id=][&savat=1]  and  ?amal=ulashilgan   (frontend/functions/api/hujjat-maydoni.ts).
 * Read-only browsing here (folders, files, trash, shared with me); uploads from the phone keep using /api/mobil/hujjat-yukla (DocumentsScreen).
 * Pure parsing, no Android: shared by both apps and unit-tested.
 */

enum class DiskTab { MINE, COMPANY, SHARED, TRASH }

data class DiskFolder(val id: Long, val name: String, val system: Boolean)
data class DiskFile(val id: Long, val name: String, val mime: String?, val bytes: Long?, val version: Int?, val updated: String?, val inTrash: Boolean, val comments: Int, val lockedBy: String?,
    /** System document (F-2, F-3 ...): where it was made (see [diskSystemTarget]). */
    val system: Boolean = false, val sourceType: String? = null, val sourceId: Long? = null, val objectId: Long? = null, val contractId: Long? = null, val key: String? = null,
)
data class DiskCrumb(val id: Long, val name: String)
data class DiskListing(val level: Int?, val companyId: Long?, val personal: Boolean, val path: List<DiskCrumb>, val folders: List<DiskFolder>, val files: List<DiskFile>)
data class DiskSharedItem(val kind: String, val id: Long, val name: String, val mime: String?, val from: String?, val level: String?, val until: String?)

/** Request path of one tab. [folderId] only applies to the two drive tabs; the trash lists the personal or the company bin. */
fun diskListPath(tab: DiskTab, companyId: Long?, folderId: Long? = null): String = when (tab) {
    DiskTab.MINE -> "/api/hujjat-maydoni?amal=royxat" + (folderId?.let { "&papka_id=$it" } ?: "")
    DiskTab.COMPANY -> "/api/hujjat-maydoni?amal=royxat&kompaniya_id=${companyId ?: 0}" + (folderId?.let { "&papka_id=$it" } ?: "")
    DiskTab.SHARED -> "/api/hujjat-maydoni?amal=ulashilgan"
    DiskTab.TRASH -> "/api/hujjat-maydoni?amal=royxat&savat=1" + (companyId?.let { "&kompaniya_id=$it" } ?: "")
}

fun parseDiskListing(body: JsonElement?): DiskListing? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    val folders = o["papkalar"].arr().orEmpty().mapNotNull { e ->
        val x = e.obj() ?: return@mapNotNull null
        DiskFolder(x["id"].num()?.toLong() ?: return@mapNotNull null, x["nom"].str().orEmpty().ifBlank { return@mapNotNull null }, (x["tizim"] as? JsonPrimitive)?.booleanOrNull == true)
    }
    val files = o["fayllar"].arr().orEmpty().mapNotNull { e ->
        val x = e.obj() ?: return@mapNotNull null
        DiskFile(
            x["id"].num()?.toLong() ?: return@mapNotNull null, x["nom"].str().orEmpty().ifBlank { return@mapNotNull null }, x["mime"].str(), x["bayt"].num()?.toLong(),
            x["versiya"].num()?.toInt(), x["yangilandi"].str(), x["savatda"].str() != null, x["izohlar"].num()?.toInt() ?: 0, x["qulf_ism"].str(),
            system = (x["tizim_hujjat"] as? JsonPrimitive)?.booleanOrNull == true, sourceType = x["manba_turi"].str(), sourceId = x["manba_id"].num()?.toLong(),
            objectId = x["obyekt_id"].num()?.toLong(), contractId = x["shartnoma_id"].num()?.toLong(), key = x["hujjat_kalit"].str(),
        )
    }
    val path = o["yol"].arr().orEmpty().mapNotNull { e -> val x = e.obj() ?: return@mapNotNull null; DiskCrumb(x["id"].num()?.toLong() ?: return@mapNotNull null, x["nom"].str().orEmpty()) }
    return DiskListing(o["daraja"].num()?.toInt(), o["kompaniya_id"].num()?.toLong(), (o["shaxsiy"] as? JsonPrimitive)?.booleanOrNull == true, path, folders, files)
}

fun parseDiskShared(body: JsonElement?): List<DiskSharedItem>? {
    val o = body.obj() ?: return null
    if ((o["ok"] as? JsonPrimitive)?.booleanOrNull != true) return null
    return o["royxat"].arr()?.mapNotNull { e ->
        val x = e.obj() ?: return@mapNotNull null
        DiskSharedItem(x["turi"].str() ?: "fayl", x["id"].num()?.toLong() ?: return@mapNotNull null, x["nom"].str().orEmpty().ifBlank { return@mapNotNull null }, x["mime"].str(), x["bergan"].str(), x["daraja"].str(), x["tugaydi"].str())
    }
}

/** "1,2 MB" style size (decimal comma, Uzbek style); null = unknown -> empty text. */
fun formatBytes(n: Long?): String {
    if (n == null || n < 0) return ""
    if (n < 1024) return "$n B"
    val units = listOf("KB", "MB", "GB", "TB")
    var v = BigDecimal(n).divide(BigDecimal(1024), 6, RoundingMode.HALF_UP); var i = 0
    while (v >= BigDecimal(1024) && i < units.lastIndex) { v = v.divide(BigDecimal(1024), 6, RoundingMode.HALF_UP); i++ }
    val s = v.setScale(if (v >= BigDecimal(100)) 0 else 1, RoundingMode.HALF_UP).toPlainString().replace('.', ',')
    return "$s ${units[i]}"
}

/** One result of a tab load: the listing / shared list, or why there is none (offline vs refusal vs server). */
sealed interface DiskResult {
    data class Listing(val value: DiskListing) : DiskResult
    data class Shared(val items: List<DiskSharedItem>) : DiskResult
    data class Failed(val offline: Boolean, val forbidden: Boolean) : DiskResult
}

class DiskRepository(private val api: BffApi) {
    suspend fun versions(fileId: Long): List<DiskVersion>? = api.diskVersions(fileId)
    suspend fun fetch(file: DiskFile, version: Int?): DiskBytes = api.diskFetch(file, version)

    private fun mapWrite(r: uz.anncorp.smeta.core.data.ApiResult): DiskOp =
        diskOpResult(r.status, r.code ?: (r.body.obj()?.get("code")).str(), (r.body.obj()?.get("ok") as? JsonPrimitive)?.booleanOrNull)

    /** Folder action through the site's own endpoint (POST /api/hujjat-maydoni {amal: papka}); permission/name rules are the server's. */
    suspend fun folder(companyId: Long?, op: String, folderId: Long? = null, name: String? = null, parentId: Long? = null): DiskOp =
        mapWrite(api.bff("/api/hujjat-maydoni", "POST", diskFolderBody(companyId, op, folderId, name, parentId)))

    /** File action (POST /api/hujjat-maydoni {amal: fayl}): nomla | kochir | savat | tikla. */
    suspend fun file(fileId: Long, op: String, name: String? = null, folderId: Long? = null): DiskOp =
        mapWrite(api.bff("/api/hujjat-maydoni", "POST", diskFileBody(fileId, op, name, folderId)))

    /** Uploads one file (<= [DISK_UPLOAD_MAX_BYTES]) through /api/mobil/hujjat-yukla; the same [operationId] on a retry makes the server answer "already done". */
    suspend fun upload(name: String, mime: String, bytes: ByteArray, companyId: Long?, folderId: Long?, operationId: String = java.util.UUID.randomUUID().toString()): DiskOp {
        if (bytes.size > DISK_UPLOAD_MAX_BYTES) return DiskOp.TOO_LARGE
        return mapWrite(api.diskUpload(diskUploadForm(name, mime, bytes, operationId, companyId, folderId)))
    }

    suspend fun load(tab: DiskTab, companyId: Long?, folderId: Long? = null): DiskResult {
        if ((tab == DiskTab.COMPANY) && companyId == null) return DiskResult.Failed(offline = false, forbidden = true)
        val r = api.bff(diskListPath(tab, companyId, folderId))
        if (r.networkError) return DiskResult.Failed(offline = true, forbidden = false)
        if (!r.ok) return DiskResult.Failed(offline = false, forbidden = r.status == 403)
        return if (tab == DiskTab.SHARED) parseDiskShared(r.body)?.let { DiskResult.Shared(it) } ?: DiskResult.Failed(false, false)
        else parseDiskListing(r.body)?.let { DiskResult.Listing(it) } ?: DiskResult.Failed(false, false)
    }
}

// ---------- one presenter for both apps ----------

/** A drive row as plain values; the apps map it to their own row widget (QDiskRow in :ui-common). */
data class DiskRowModel(val key: String, val folder: Boolean, val id: Long, val name: String, val sub: String?, val meta: String?, val trash: Boolean = false, val system: Boolean = false)

fun DiskListing.toRows(): List<DiskRowModel> =
    folders.map { DiskRowModel("p${it.id}", true, it.id, it.name, null, null, system = it.system) } +
        files.map { f -> DiskRowModel("f${f.id}", false, f.id, f.name, listOfNotNull(formatBytes(f.bytes).ifBlank { null }, f.version?.let { "v$it" }).joinToString("  \u00B7  ").ifBlank { null }, f.updated?.let { uz.anncorp.smeta.core.data.formatDate(it) }, trash = f.inTrash, system = f.system) }

fun List<DiskSharedItem>.toRows(): List<DiskRowModel> = map { DiskRowModel("${it.kind.take(1)}${it.id}", it.kind == "papka", it.id, it.name, it.from, it.until?.let { u -> uz.anncorp.smeta.core.data.formatDate(u) }) }

/**
 * State machine of the Disk screen (tab + folder stack + rows). The Android view model and the Windows module both own ONE of these, so the
 * navigation rules (open folder, up, switch tab) exist once.
 */
/** What the host app (Android / Windows) does with a file and with a link to a screen; the controller only decides WHEN. */
interface DiskHost {
    /** Hand the bytes to the OS: [open] = show in a viewer app, else save / share. */
    fun deliver(name: String, mime: String, bytes: ByteArray, open: Boolean)
    /** Ids (QNav) of the screens this app has; "Tizimda ochish" opens one of them, otherwise the website page. */
    val modules: Set<String> get() = emptySet()
    fun openModule(module: String, objectId: Long?) {}
    fun openWeb(path: String) {}
}

/** The file card: the file, its versions (null = loading, [versionsFailed] = could not load) and the last action result. */
data class DiskDetail(val file: DiskFile, val versions: List<DiskVersion>? = null, val versionsFailed: Boolean = false, val busy: Boolean = false, val notice: DiskNotice? = null)

class DiskController(private val repo: DiskRepository, private val scope: kotlinx.coroutines.CoroutineScope, private val companyId: () -> Long?) {
    /** Set by the host once; null = browsing only. */
    var host: DiskHost? = null
    private var known: Map<String, DiskFile> = emptyMap()
    private var detailJob: kotlinx.coroutines.Job? = null
    enum class Status { LOADING, READY, FAILED }
    data class State(
        val tab: DiskTab = DiskTab.MINE, val stack: List<DiskCrumb> = emptyList(), val rows: List<DiskRowModel> = emptyList(),
        val status: Status = Status.LOADING, val offline: Boolean = false, val forbidden: Boolean = false, val detail: DiskDetail? = null,
        /** Last result of a write (upload / folder / file action); the host shows it once and calls [clearOp]. */
        val op: DiskOp? = null, val working: Boolean = false,
    ) {
        val canGoUp get() = stack.isNotEmpty()
        /** Folder/file actions exist in the two drives only; Savat only restores, Ulashilgan is read-only. */
        val canWrite get() = tab == DiskTab.MINE || tab == DiskTab.COMPANY
    }

    private val _state = kotlinx.coroutines.flow.MutableStateFlow(State())
    val state: kotlinx.coroutines.flow.StateFlow<State> = _state
    private var job: kotlinx.coroutines.Job? = null

    fun select(tab: DiskTab) { _state.value = State(tab = tab); reload() }
    fun openFolder(id: Long, name: String) { _state.value = _state.value.copy(stack = _state.value.stack + DiskCrumb(id, name)); reload() }
    fun up() { val s = _state.value; if (s.stack.isEmpty()) return; _state.value = s.copy(stack = s.stack.dropLast(1)); reload() }

    /** Opens the card of a FILE row (folders are opened with [openFolder]): shows it at once, then loads its versions. */
    fun showFile(rowKey: String) {
        val f = known[rowKey] ?: return
        detailJob?.cancel()
        _state.value = _state.value.copy(detail = DiskDetail(f))
        detailJob = scope.launch {
            val v = repo.versions(f.id)
            // The card header shows the CURRENT version of the version list, so it can never disagree with the "joriy" row below it (QA B-O2).
            val cur = v?.firstOrNull { it.current }?.number
            _state.value.detail?.takeIf { it.file.id == f.id }?.let { d -> _state.value = _state.value.copy(detail = d.copy(file = if (cur != null) d.file.copy(version = cur) else d.file, versions = v, versionsFailed = v == null)) }
        }
    }

    fun closeFile() { detailJob?.cancel(); _state.value = _state.value.copy(detail = null) }

    /** View ([open]) or download the current file, or one [version] of it. A refusal is shown in the card as [DiskDetail.notice]. */
    fun deliver(version: Int?, open: Boolean) {
        val d = _state.value.detail ?: return
        if (d.busy) return
        _state.value = _state.value.copy(detail = d.copy(busy = true, notice = null))
        detailJob = scope.launch {
            val r = repo.fetch(d.file, version)
            val notice = when (r) {
                is DiskBytes.Ready -> { host?.deliver(r.name, r.mime, r.bytes, open); if (open) null else DiskNotice.SAVED }
                is DiskBytes.Failed -> r.notice
            }
            _state.value.detail?.takeIf { it.file.id == d.file.id }?.let { cur -> _state.value = _state.value.copy(detail = cur.copy(busy = false, notice = notice)) }
        }
    }

    /** Where the open file was made, or null (nothing to open). */
    fun systemTarget(): DiskSystemTarget? = _state.value.detail?.file?.let { diskSystemTarget(it) }

    /** "Tizimda ochish": the screen in this app when it has one, else the website page. */
    fun openInSystem() {
        val t = systemTarget() ?: return
        val h = host ?: return
        if (t.module != null && t.module in h.modules) h.openModule(t.module, t.objectId) else h.openWeb(t.webPath)
    }

    // ---------- writes (upload, folders, file actions): the same endpoints as the site, no second write path ----------

    fun clearOp() { _state.value = _state.value.copy(op = null) }

    /** The host refused something before any request (a file over the limit, an unreadable file): shown like any write result. */
    fun report(op: DiskOp) { _state.value = _state.value.copy(op = op) }

    private fun folderCompany(): Long? = if (_state.value.tab == DiskTab.COMPANY) companyId() else null
    private fun currentFolder(): Long? = _state.value.stack.lastOrNull()?.id

    /** Runs one write, then shows its result and refreshes the list when it worked. [closeCard] also closes the open file card. */
    private fun write(closeCard: Boolean = false, afterOk: () -> Unit = {}, call: suspend () -> DiskOp) {
        if (_state.value.working) return
        _state.value = _state.value.copy(working = true, op = null)
        scope.launch {
            val r = try { call() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { DiskOp.FAILED }
            _state.value = _state.value.copy(working = false, op = r, detail = if (closeCard && r == DiskOp.DONE) null else _state.value.detail)
            if (r == DiskOp.DONE) { afterOk(); reload() }
        }
    }

    /** Uploads one picked file (camera / gallery / file picker) into the open folder of the open drive. */
    fun upload(name: String, mime: String, bytes: ByteArray) {
        if (!_state.value.canWrite) return
        write { repo.upload(name, mime, bytes, folderCompany(), currentFolder()) }
    }

    fun createFolder(name: String) {
        if (!_state.value.canWrite || name.isBlank()) return
        write { repo.folder(folderCompany(), "yarat", name = name.trim(), parentId = currentFolder()) }
    }

    /** The open folder (last crumb): rename / delete / move up. */
    fun renameFolder(name: String) { val id = currentFolder() ?: return; if (name.isBlank()) return
        write(afterOk = { val s = _state.value; _state.value = s.copy(stack = s.stack.dropLast(1) + DiskCrumb(id, name.trim())) }) { repo.folder(folderCompany(), "nomla", folderId = id, name = name.trim()) } }
    fun deleteFolder() { val id = currentFolder() ?: return
        write(afterOk = { val s = _state.value; _state.value = s.copy(stack = s.stack.dropLast(1)) }) { repo.folder(folderCompany(), "ochir", folderId = id) } }
    fun moveFolder(targetId: Long?) { val id = currentFolder() ?: return
        write(afterOk = { val s = _state.value; _state.value = s.copy(stack = s.stack.dropLast(1)) }) { repo.folder(folderCompany(), "kochir", folderId = id, parentId = targetId) } }

    /**
     * Where a file ([forFolder] = false) or the open folder can be moved: the drive root ([DiskCrumb.id] 0, the UI names it), the folders above this one,
     * and - for a file only - the sub-folders of the open level. A folder is never offered a place inside itself.
     */
    fun moveTargets(forFolder: Boolean): List<DiskCrumb> {
        val s = _state.value
        val out = ArrayList<DiskCrumb>()
        if (s.stack.isNotEmpty()) { out += DiskCrumb(0L, ""); out += s.stack.dropLast(1).asReversed() }
        if (!forFolder) s.rows.filter { it.folder }.forEach { out += DiskCrumb(it.id, it.name) }
        return out.distinctBy { it.id }
    }
    /** File actions on the open card. */
    fun renameFile(name: String) { val d = _state.value.detail ?: return; if (name.isBlank()) return
        write(afterOk = { _state.value = _state.value.copy(detail = _state.value.detail?.let { c -> c.copy(file = c.file.copy(name = name.trim())) }) }) { repo.file(d.file.id, "nomla", name = name.trim()) } }
    fun moveFile(targetId: Long?) { val d = _state.value.detail ?: return; write(closeCard = true) { repo.file(d.file.id, "kochir", folderId = targetId) } }
    fun trashFile() { val d = _state.value.detail ?: return; write(closeCard = true) { repo.file(d.file.id, "savat") } }
    fun restoreFile() { val d = _state.value.detail ?: return; write(closeCard = true) { repo.file(d.file.id, "tikla") } }

    /** A file row as the picker of "Diskdan tanlash" returns it: the file plus its current bytes (the host attaches them to its own upload). */
    fun fileOf(rowKey: String): DiskFile? = known[rowKey]
    suspend fun bytesOf(file: DiskFile): DiskBytes = repo.fetch(file, null)
    fun reload() {
        job?.cancel()
        val s = _state.value
        _state.value = s.copy(status = Status.LOADING, offline = false, forbidden = false)
        job = scope.launch {
            val folder = s.stack.lastOrNull()?.id
            val results = if (s.tab == DiskTab.TRASH) listOfNotNull(repo.load(DiskTab.TRASH, null), companyId()?.let { repo.load(DiskTab.TRASH, it) }) else listOf(repo.load(s.tab, companyId(), folder))
            val ok = results.filter { it !is DiskResult.Failed }
            _state.value = if (ok.isEmpty()) {
                val f = results.filterIsInstance<DiskResult.Failed>().firstOrNull()
                _state.value.copy(status = Status.FAILED, offline = f?.offline == true, forbidden = f?.forbidden == true)
            } else _state.value.copy(
                status = Status.READY,
                rows = ok.flatMap { r -> when (r) { is DiskResult.Listing -> r.value.toRows(); is DiskResult.Shared -> r.items.toRows(); is DiskResult.Failed -> emptyList() } }.distinctBy { it.key },
            )
            known = ok.flatMap { r -> when (r) {
                is DiskResult.Listing -> r.value.files.map { "f${it.id}" to it }
                is DiskResult.Shared -> r.items.filter { it.kind != "papka" }.map { "${it.kind.take(1)}${it.id}" to DiskFile(it.id, it.name, it.mime, null, null, null, false, 0, null) }
                is DiskResult.Failed -> emptyList()
            } }.toMap()
        }
    }
}