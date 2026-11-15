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
) {
    /** Open remainder: estimate - fact - replaced (never below zero is NOT enforced: negative means over the estimate). */
    val qoldiq: Double? get() = smetaHajm?.let { it - faktHajm - almashtirilgan }
}

@Fts4(contentEntity = QatorEntity::class, tokenizer = FtsOptions.TOKENIZER_UNICODE61)
@Entity(tableName = "qator_fts")
data class QatorFts(val kod: String?, val nom: String)

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
