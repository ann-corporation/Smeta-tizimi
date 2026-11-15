package uz.anncorp.smeta.core.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface ObyektDao {
    @Query("SELECT * FROM obyekt WHERE companyId = :companyId ORDER BY nom COLLATE NOCASE")
    fun observe(companyId: Long): Flow<List<ObyektEntity>>

    @Query("SELECT * FROM obyekt WHERE id = :id")
    fun observeOne(id: Long): Flow<ObyektEntity?>

    @Query("SELECT * FROM obyekt WHERE id = :id")
    suspend fun get(id: Long): ObyektEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<ObyektEntity>)

    @Query("DELETE FROM obyekt")
    suspend fun clear()

    @Query("DELETE FROM obyekt WHERE companyId = :companyId")
    suspend fun deleteForCompany(companyId: Long)

    @Transaction
    suspend fun replaceForCompany(companyId: Long, rows: List<ObyektEntity>) {
        deleteForCompany(companyId); insertAll(rows)
    }
}

@Dao
interface QatorDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<QatorEntity>)

    @Query("DELETE FROM qator WHERE obyektId = :obyektId")
    suspend fun deleteForObyekt(obyektId: Long)

    @Transaction
    suspend fun replaceForObyekt(obyektId: Long, rows: List<QatorEntity>) {
        deleteForObyekt(obyektId); insertAll(rows)
    }

    @Query("SELECT COUNT(*) FROM qator WHERE obyektId = :obyektId")
    fun observeCount(obyektId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM qator WHERE obyektId = :obyektId")
    suspend fun count(obyektId: Long): Int

    @Query("SELECT * FROM qator WHERE obyektId = :obyektId ORDER BY qatorId LIMIT :limit")
    fun first(obyektId: Long, limit: Int): Flow<List<QatorEntity>>

    /** [match] is a prepared FTS4 expression (see [ftsMatch]). */
    @Query(
        "SELECT q.* FROM qator q JOIN qator_fts ON q.rid = qator_fts.rowid " +
            "WHERE qator_fts MATCH :match AND q.obyektId = :obyektId ORDER BY q.qatorId LIMIT :limit",
    )
    fun search(obyektId: Long, match: String, limit: Int): Flow<List<QatorEntity>>

    @Query("SELECT * FROM qator WHERE obyektId = :obyektId AND qatorId = :qatorId")
    suspend fun get(obyektId: Long, qatorId: Long): QatorEntity?

    @Query("DELETE FROM qator")
    suspend fun clear()
}

/** Turns what the user typed into an FTS4 AND-of-prefixes expression: В«beton m200В» -> В«beton* m200*В». Null when nothing searchable. */
fun ftsMatch(input: String): String? {
    val tokens = Regex("[\\p{L}\\p{N}]+").findAll(input.lowercase()).map { it.value }.toList()
    if (tokens.isEmpty()) return null
    return tokens.joinToString(" ") { "$it*" }
}

@Dao
interface MetaDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(m: MetaEntity)

    @Query("SELECT value FROM meta WHERE `key` = :key")
    suspend fun get(key: String): String?

    @Query("SELECT value FROM meta WHERE `key` = :key")
    fun observe(key: String): Flow<String?>

    @Query("DELETE FROM meta")
    suspend fun clear()
}

@Dao
interface DraftDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(d: DraftEntity)

    @Query("SELECT * FROM draft WHERE obyektId = :obyektId ORDER BY createdAt")
    fun observe(obyektId: Long): Flow<List<DraftEntity>>

    @Query("SELECT * FROM draft WHERE obyektId = :obyektId ORDER BY createdAt")
    suspend fun list(obyektId: Long): List<DraftEntity>

    @Query("DELETE FROM draft WHERE obyektId = :obyektId AND qatorId = :qatorId")
    suspend fun delete(obyektId: Long, qatorId: Long)

    @Query("DELETE FROM draft WHERE obyektId = :obyektId")
    suspend fun clear(obyektId: Long)

    @Query("DELETE FROM draft")
    suspend fun clearAll()
}

/** Kept small on purpose: the outbox state machine in [uz.anncorp.smeta.core.data.OutboxProcessor] is tested against a fake of this. */
@Dao
interface OutboxDao {
    /** Returns the new rowid, or -1 when an entry with this operation id already exists (duplicate replay). */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(e: OutboxEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(e: OutboxEntity)

    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun get(id: String): OutboxEntity?

    /** FIFO: oldest pending first. */
    @Query("SELECT * FROM outbox WHERE state = 'PENDING' ORDER BY createdAt, id LIMIT 1")
    suspend fun nextPending(): OutboxEntity?

    @Query("SELECT * FROM outbox WHERE state != 'DONE' ORDER BY createdAt, id")
    fun observeActive(): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE state = 'DONE' ORDER BY createdAt DESC LIMIT 20")
    fun observeRecentDone(): Flow<List<OutboxEntity>>

    @Query("SELECT COUNT(*) FROM outbox WHERE state IN ('PENDING','PAUSED')")
    fun observeQueuedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'FAILED'")
    fun observeFailedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox WHERE state = 'PENDING'")
    suspend fun pendingCount(): Int

    @Query("UPDATE outbox SET state = 'PAUSED' WHERE state = 'PENDING'")
    suspend fun pauseAllPending()

    @Query("UPDATE outbox SET state = 'PENDING' WHERE state = 'PAUSED'")
    suspend fun resumePaused()

    @Query("DELETE FROM outbox WHERE id = :id AND state != 'DONE'")
    suspend fun delete(id: String)

    @Query("DELETE FROM outbox WHERE state = 'DONE' AND createdAt < :before")
    suspend fun purgeDoneBefore(before: Long)
}

