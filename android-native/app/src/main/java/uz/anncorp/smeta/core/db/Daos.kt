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

    /** [bolim] null = every section. */
    @Query("SELECT * FROM qator WHERE obyektId = :obyektId AND (:bolim IS NULL OR bolim = :bolim) ORDER BY qatorId LIMIT :limit")
    fun first(obyektId: Long, bolim: String?, limit: Int): Flow<List<QatorEntity>>

    /** Every cached row of one object in estimate order (the smeta browser groups them by section). */
    @Query("SELECT * FROM qator WHERE obyektId = :obyektId ORDER BY qatorId")
    fun all(obyektId: Long): Flow<List<QatorEntity>>

    @Query("SELECT DISTINCT bolim FROM qator WHERE obyektId = :obyektId AND bolim IS NOT NULL ORDER BY bolim COLLATE NOCASE")
    fun sections(obyektId: Long): Flow<List<String>>

    /** [match] is a prepared FTS4 expression (see [ftsMatch]). */
    @Query(
        "SELECT q.* FROM qator q JOIN qator_fts ON q.rid = qator_fts.rowid " +
            "WHERE qator_fts MATCH :match AND q.obyektId = :obyektId AND (:bolim IS NULL OR q.bolim = :bolim) ORDER BY q.qatorId LIMIT :limit",
    )
    fun search(obyektId: Long, match: String, bolim: String?, limit: Int): Flow<List<QatorEntity>>

    /** Rows of every cached object of one workplace (global search). Only objects opened before have cached rows. */
    @Query(
        "SELECT q.* FROM qator q JOIN qator_fts ON q.rid = qator_fts.rowid JOIN obyekt o ON o.id = q.obyektId " +
            "WHERE qator_fts MATCH :match AND o.companyId = :companyId ORDER BY q.obyektId, q.qatorId LIMIT :limit",
    )
    suspend fun searchCompany(companyId: Long, match: String, limit: Int): List<QatorEntity>

    @Query("SELECT * FROM qator WHERE obyektId = :obyektId AND qatorId = :qatorId")
    suspend fun get(obyektId: Long, qatorId: Long): QatorEntity?

    @Query("DELETE FROM qator")
    suspend fun clear()
}

@Dao
interface NodeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<NodeEntity>)

    @Query("DELETE FROM smeta_node WHERE obyektId = :obyektId")
    suspend fun deleteForObyekt(obyektId: Long)

    @Transaction
    suspend fun replaceForObyekt(obyektId: Long, rows: List<NodeEntity>) {
        deleteForObyekt(obyektId); rows.chunked(2000).forEach { insertAll(it) }
    }

    /** The whole tree of one object in depth-first (web) order. Re-emits when the packet is synced again. */
    @Query("SELECT * FROM smeta_node WHERE obyektId = :obyektId ORDER BY ord")
    fun all(obyektId: Long): Flow<List<NodeEntity>>

    @Query("SELECT COUNT(*) FROM smeta_node WHERE obyektId = :obyektId")
    suspend fun count(obyektId: Long): Int

    @Query("DELETE FROM smeta_node")
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

    /** All entries whose key starts with [prefix] (e.g. `money:`). */
    @Query("SELECT * FROM meta WHERE `key` LIKE :prefix || '%'")
    fun observePrefix(prefix: String): Flow<List<MetaEntity>>

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

    /** Everything not yet delivered (queued, paused, rejected): what a sign-out would strand. */
    @Query("SELECT * FROM outbox WHERE state != 'DONE' ORDER BY createdAt, id")
    suspend fun unsent(): List<OutboxEntity>

    @Query("DELETE FROM outbox WHERE state != 'DONE'")
    suspend fun deleteUnsent()

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

