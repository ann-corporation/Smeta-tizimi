package uz.anncorp.smeta.core.db

import androidx.room.Entity
import androidx.room.Fts4
import androidx.room.FtsOptions
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "obyekt")
data class ObyektEntity(
    @PrimaryKey val id: Long,
    val companyId: Long,
    val nom: String,
    val tur: String?,
    val qatorSoni: Int?,
    val jami: Double?,
    val narxsiz: Int?,
    val yangilandi: String?,
)

/** One work row (`bl`) of an object's estimate, cached for offline search and fact entry. */
@Entity(tableName = "qator", indices = [Index(value = ["obyektId", "qatorId"], unique = true)])
data class QatorEntity(
    @PrimaryKey(autoGenerate = true) val rid: Long = 0,
    val obyektId: Long,
    val qatorId: Long,
    val kod: String?,
    val nom: String,
    val birlik: String?,
    val smetaHajm: Double?,
    val narx: Double?,
    val smetaSumma: Double?,
    val faktHajm: Double,
    val faktSumma: Double,
    val f2Hajm: Double,
    val f2Summa: Double,
    val almashtirilgan: Double,
    /** Section (razdel) name from the packet's parent chain; null when the source has no hierarchy (row-status fallback). */
    val bolim: String? = null,
) {
    /** Open remainder: estimate - fact - replaced (never below zero is NOT enforced: negative means over the estimate). */
    val qoldiq: Double? get() = smetaHajm?.let { it - faktHajm - almashtirilgan }
}

@Fts4(contentEntity = QatorEntity::class, tokenizer = FtsOptions.TOKENIZER_UNICODE61)
@Entity(tableName = "qator_fts")
data class QatorFts(val kod: String?, val nom: String)

/**
 * One node of the estimate tree exactly as the object packet carries it: RZ (section) -> BL (work) -> RS / MAT / OB (resources).
 * [ord] is the depth-first position (children ordered by tartib, id: the order the web tree shows), [depth] the nesting level.
 * Volumes and the markup-free amounts are server values. A node without a value keeps null (not 0).
 */
@Entity(tableName = "smeta_node", primaryKeys = ["obyektId", "id"], indices = [Index(value = ["obyektId", "ord"])])
data class NodeEntity(
    val obyektId: Long,
    val id: Long,
    val parentId: Long?,
    val ord: Int,
    val depth: Int,
    /** rz | bl | rs | mat | ob */
    val tur: String,
    val kat: String?,
    val kod: String?,
    val nom: String,
    val birlik: String?,
    val hajm: Double?,
    val narx: Double?,
    val summa: Double?,
    val norma: Double?,
    val faktHajm: Double,
    val faktSumma: Double,
    val f2Hajm: Double,
    val f2Summa: Double,
    val almashtirilgan: Double,
    val hasChildren: Boolean,
) {
    val isRz get() = tur == "rz"
    val isBl get() = tur == "bl"
    val isResource get() = tur == "rs" || tur == "mat" || tur == "ob"
    val qoldiq: Double? get() = hajm?.let { it - faktHajm - almashtirilgan }
}

@Entity(tableName = "meta")
data class MetaEntity(@PrimaryKey val key: String, val value: String)

/** A line of the fact batch being prepared (a draft). Snapshot fields let the draft screen warn without re-reading rows. */
@Entity(tableName = "draft", primaryKeys = ["obyektId", "qatorId"])
data class DraftEntity(
    val obyektId: Long,
    val qatorId: Long,
    val hajm: Double,
    val kod: String?,
    val nom: String,
    val birlik: String?,
    val smetaHajm: Double?,
    val faktHajm: Double,
    val almashtirilgan: Double,
    val createdAt: Long,
) {
    /** Volume still open on the estimate when the line was added (null = estimate volume unknown). */
    val qoldiq: Double? get() = smetaHajm?.let { it - faktHajm - almashtirilgan }
    val exceeds: Boolean get() = qoldiq?.let { hajm > it + 1e-9 } ?: false
    /** A negative volume (normaga keltirish) that would take the row's total fact below zero. Only warns, like the server. */
    val goesBelowZero: Boolean get() = hajm < 0.0 && faktHajm + hajm < -1e-9
}

object OutboxState {
    const val PENDING = "PENDING"
    const val FAILED = "FAILED"
    const val PAUSED = "PAUSED"
    const val DONE = "DONE"
}

/** The queued write. [id] IS the server operation_id, so inserting the same id twice is a no-op and a replay is harmless. */
@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val payloadJson: String,
    val obyektId: Long,
    val obyektNom: String,
    val lineCount: Int,
    val state: String,
    val attempts: Int,
    val lastError: String?,
    /** Server result summary for DONE rows (JSON of the warnings), shown to the user. */
    val info: String?,
    val createdAt: Long,
)
