# File Truth & Secondary Replica v1 (FILE-TRUTH-001)

> **2026-11-15 - GOOGLE DRIVE OLIB TASHLANDI (egasi qarori).** Bu hujjatdagi Drive/replika qismlari (`98_T2ReplicaSync.js`, `/api/hujjat-r2`, `drive_sync`, replika navbati) TARIXIY: kod olib tashlandi. Yagona fayl haqiqati - private R2 (`r2Yoz`, `functions/_shared/r2-saqlash.ts`) + `t2_document_registry`. Har yuklangan ASL fayl R2 ga saqlanadi (`aslFaylSaqla` / `hujjat-yukla`). Drive ustunlarini DB dan olib tashlash: `20261230000000_t2_drive_ustunlar_drop_v1` (qo'llanmagan).


Status: DRAFT — SOURCE READY, NOT APPLIED. Owner: Claude (Lead Engineer/Architect).
Base: `origin/main @ 2361d10`. Production writes forbidden for this task.

---

## 0. Canonical law

| Layer | Role |
|---|---|
| **Supabase / Postgres** | **BUSINESS + METADATA TRUTH** — document identity, ownership, lineage, revision history, sync state, audit. |
| **Cloudflare R2** | **FILE / BINARY TRUTH** — every canonical document byte. Content-addressed keys. |
| **Google Drive** | **SECONDARY SYNCHRONIZED REPLICA** — a mirror of canonical documents into the company's Drive workspace (STOR-001 folders). Two-way for a small set of supported edits. |
| **Google Sheets** | **SECONDARY SYNCHRONIZED REPLICA** — structured-entity mirror (contract v1 only tonight). |
| **GAS** | **EXTERNAL BRIDGE ONLY** — the transport that reaches Drive/Sheets. Never on a core read/write path. |

**No core interactive TIZIM_02 path may depend on Drive, Sheets, or GAS.**
A user upload succeeds when R2 + Supabase succeed. A user download reads R2.
Drive/Sheets being down = *replica degraded*, canonical system stays UP.

---

## 1. R2 buckets — PRIVATE canonical, separate from legacy public archive

- **`R2_CANONICAL`** — NEW, **PRIVATE** binding for canonical construction
  documents. **No public custom domain.** The browser cannot fetch it directly;
  every read goes through the authenticated `/api/hujjat-ol` (users) or the
  secret-authed `/api/hujjat-r2` (replica worker). This is the file truth.
- **`R2_ARCHIVE`** — existing bucket with the public domain
  `https://r2.qurilish-os.uz/<key>`. Retained for the legacy public archive
  (RFQ attachments etc.) only. **Confidential canonical documents are never
  written to it.** `functions/api/upload.ts` stays as-is for legacy callers.
- Old model `t2_obyekt_hujjat` (0 rows) is superseded by `t2_document_registry`.
- Cloudflare Pages project bindings (dashboard): add `R2_CANONICAL` →
  a new **private** bucket (no custom domain), plus env `REPLICA_SYNC_SECRET`,
  `CANONICAL_HASH_INLINE_LIMIT` (default 26214400 = 25 MiB),
  `CANONICAL_MAX_UPLOAD_BYTES` (default 536870912 = 512 MiB).

## 2. Canonical R2 key scheme (deterministic from document_id)

```
docs/<kompaniya_id>/<loyiha_id|_>/<obyekt_id|_>/d<document_id>/r<revision_seq>
```

- Derived from the **allocated `document_id`** at reserve time — never from a
  display name, and stable before the bytes are uploaded (two-phase, §4).
- A new content revision = a new `document_id` + a new key (immutable objects).
  Old keys retained.
- `_` for `loyiha_id`/`obyekt_id` when absent.

## 3a. Large-file / streaming behavior (explicit)

- The **browser** computes `sha256` (Web Crypto) before upload — this is what
  makes the deterministic two-phase key possible and is the integrity anchor.
- Upload function, per file size:
  - **≤ `CANONICAL_HASH_INLINE_LIMIT`** (default 25 MiB): the function buffers
    the file once (bounded), **re-hashes server-side**, verifies it against the
    client hash, then `R2_CANONICAL.put(key, buffer)`. `sha256_verified=true`,
    `hash_source='server'`.
  - **larger**: `R2_CANONICAL.put(key, file.stream())` — a **true stream**, no
    whole-file RAM buffering. The client hash is trusted and stored
    `sha256_verified=false`, `hash_source='client'`; the reconcile/verify job
    may re-hash later out of band. Hard ceiling `CANONICAL_MAX_UPLOAD_BYTES`
    (default 512 MiB) → HTTP 413.
- No claim of "streaming SHA-256": Web Crypto has no incremental digest in
  Workers, so server-side hashing requires buffering and is limited to the
  inline limit.

## 3. `t2_document_registry` — canonical vs replica split (additive migration)

**Canonical identity (R2 truth):**
`id` (=document_id), `kompaniya_id`, `loyiha_id`, `obyekt_id?`, `document_type`,
`revision` (business label), `revision_seq` (int, monotonic), `original_filename`,
`mime_type`, `size_bytes`, `sha256`, `r2_bucket` (default `archive`), `r2_key`,
`canonical_storage_status` (`pending|stored|failed`), `status`
(`active|superseded|replica_missing|deleted`), `versiya` (optimistic lock),
`created_by`, `actor_id`, `created_at`, `updated_at`, `operation_id`.

**Drive replica info (separate, nullable):**
`drive_file_id`, `drive_parent_id`, `drive_revision`,
`drive_sync_status` (`not_configured|pending|syncing|synced|failed|conflict`),
`drive_last_sync_at`, `drive_last_error`.

**Sheets replica info (V1 reserved):** `sheets_entity_id`, `sheets_sync_status`,
`sheets_last_sync_at`.

`provider` / `external_file_id` / `external_parent_id` become **nullable** and
carry the legacy Drive value during migration; new writes leave them null and
use `drive_*`. `external_file_id` is NEVER the canonical document identity.

## 4. Canonical upload path — TWO-PHASE COMMIT (no orphan R2 objects)

```
Browser: sha256 = SHA-256(file)   [Web Crypto]
Browser --(multipart {fayl, kompaniya_id, loyiha_id?, obyekt_id?, turi,
           operation_id, sha256, size, revision?}, session cookie)-->
  Cloudflare Pages Function  /api/hujjat-yukla
    0. tekshir(cookie) -> actor_id ; enforce size <= CANONICAL_MAX_UPLOAD_BYTES
    1. PHASE 1  RPC t2_document_canonical_reserve_v1(actor, co, proj, obj,
         doc_type, filename, mime, expected_size, client_sha256, operation_id, revision?)
       -> allocates document_id ; canonical_storage_status='reserved' ;
          r2_key = docs/<co>/<proj|_>/<obj|_>/d<document_id>/r<revision_seq>
       -> idempotent on (kompaniya_id, operation_id)
    2. PHASE 2  bytes -> R2_CANONICAL.put(r2_key, ...)   [§3a: buffer+verify if
          small, true file.stream() if large]
    3. PHASE 3  RPC t2_document_canonical_finalize_v1(actor, document_id,
         operation_id, r2_key, sha256, size, sha256_verified, hash_source)
       -> canonical_storage_status='stored' ; status='active' ;
          supersede prior active revision ; enqueue t2_replica_sync_job
          (target='drive', operation='mirror', holat='pending')
    4. return {ok, document_id, r2_key, sha256, sha256_verified}  (Drive NOT awaited)
```

**Interruption between phase 2 and 3:** the row stays `reserved`. The reconcile
worker HEADs R2 for `r2_key`; if the object exists it calls
`t2_document_canonical_reconcile_v1` → `stored`; if not (after 15 min) → `failed`
and the key (if any partial) is removed. No ambiguous partial success.

**Idempotency:** same `operation_id` → `reserve` returns the existing row; a
`stored` row short-circuits (no re-PUT); the key is derived from `document_id`
so a retry writes to the same key. `finalize` on an already-`stored` row returns
`retry:true`.

## 5. Canonical read / download

```
UI --> /api/hujjat-ol?id=<document_id>   (session cookie — REQUIRED, 401 otherwise)
  1. tekshir(cookie) -> actor_id
  2. RPC t2_document_canonical_get_v1(actor, document_id)
     -> row only if actor is an active member of row.kompaniya_id AND
        canonical_storage_status='stored'; else 403 / CANONICAL_BINARY_MISSING
  3. R2_CANONICAL.get(row.r2_key) -> stream back, Content-Type row.mime_type,
     Content-Disposition attachment; filename* = row.original_filename,
     X-Canonical-Source: r2
  4. R2 object missing -> 502 CANONICAL_BINARY_MISSING (never fall back to Drive)
```

The private `R2_CANONICAL` bucket has **no public domain**, so this endpoint (or
the secret-authed internal `/api/hujjat-r2` for the replica worker) is the ONLY
way to a canonical byte.
```

Drive file absent → download still works (reads R2).

## 6. Drive = secondary synchronized replica

STOR-001 company/project/object folders are retained; their role is now
**replica destination**. After a canonical upload, a `t2_replica_sync_job`
(`target='drive'`, `operation='mirror'`) is processed by the sync worker (GAS
side) which:
- resolves the object's canonical Drive folder (`t2_object_storage_binding.folder_id`)
- creates/updates the Drive file from R2 bytes
- calls `t2_replica_job_synced_v1(job_id, drive_file_id, drive_revision)`
  → sets `drive_sync_status='synced'`, `drive_file_id`, `drive_last_sync_at`.

A Drive error sets `drive_sync_status='failed'` + `drive_last_error`; it **never**
rolls back the canonical upload.

## 7. Drive write-back (V1 supported edits)

Detected by a GAS poller (Drive changes feed / per-folder scan on the *replica*
folders only — never a global Drive scan) which maps `drive_file_id → document_id`
via `t2_document_registry` and calls one command per change:

| Change | Command | Behavior |
|---|---|---|
| **RENAME** | `t2_document_replica_rename_v1(actor, document_id, drive_file_id, new_name, drive_revision)` | validate binding; update `original_filename`; audit. Metadata only. |
| **MOVE** (between managed replica folders) | `t2_document_replica_move_v1(actor, document_id, drive_file_id, new_parent_id, drive_revision)` | resolve `new_parent_id` to a known object/project binding; if it maps → update `obyekt_id`/`loyiha_id` lineage + audit; if not → `drive_sync_status='conflict'`, no lineage change. |
| **CONTENT CHANGE** | `t2_document_replica_content_v1(actor, document_id, new_r2_key, new_sha256, new_size, drive_revision, base_version)` | if `base_version <> versiya` → `REPLICA_CONFLICT` (no write). Else: mark current row `status='superseded'`, insert a NEW registry row `revision_seq+1`, `r2_key=new_r2_key`, `sha256=new_sha256`, `versiya=1`; audit. The GAS worker uploads the changed Drive binary to a fresh canonical R2 key *before* calling this. |
| **DELETE** | `t2_document_replica_deleted_v1(actor, document_id, drive_file_id)` | `drive_sync_status='failed'`(missing) + `status` unchanged; enqueue a `review` job. **R2 is never hard-deleted.** A real delete is a separate authorized `t2_document_delete_v1` + retention policy (out of V1). |

## 8. Sheets = secondary synchronized replica (contract only, V1)

- Row number is NEVER identity. Each replicated entity carries a hidden stable
  `sheets_entity_id` and `base_version` in a side column / developer metadata.
- Sheets edit → GAS diff → `t2_<entity>_command_v1(actor, id, base_version, fields, operation_id)`
  → permission + validation + optimistic version → Supabase update → audit →
  replica refresh back to Sheets.
- Financial / contract / estimate fields: **fail closed on conflict** (no
  deterministic auto-merge). Safe metadata fields may declare an explicit policy.
- Tonight: only the reusable sync-contract types + backend boundary + tests.
  No Sheets module rebuild.

## 9. Conflict engine (shared)

Every replica write-back carries: `entity/document id`, `base_version`,
`source_revision_or_sha`, `operation_id`. If the canonical row changed since
`base_version` → **CONFLICT** (`REPLICA_CONFLICT` / `drive_sync_status='conflict'`
/ `sheets_sync_status='conflict'`). No blind last-write-wins on important fields.

## 10. Sync execution (job abstraction)

`t2_replica_sync_job`: `id, kompaniya_id, target('drive'|'sheets'), entity_type,
entity_id, operation('mirror'|'rename'|'move'|'content'|'delete'|'review'),
holat('pending'|'running'|'synced'|'failed'|'conflict'), attempts, last_error,
base_version, source_hash, operation_id, created_at, updated_at`.

- Core requests only INSERT a job row (fast). They never wait for Drive/Sheets.
- Worker = GAS (already the bridge). It claims jobs
  (`t2_replica_job_claim_v1(target, limit)` → `for update skip locked`),
  processes, reports back. No new paid infrastructure. Deployment requirement:
  a GAS time-driven trigger (every 1–5 min) calling `apiT2ReplicaSyncTick`.
- `attempts` + exponential backoff (`next_attempt_at`), cap at 8, then `failed`
  (surfaced in the Control Center `replica.conflicts` view).

## 11. Existing Drive-only documents — backfill

No deletion. `ops/backfill/FILE-TRUTH-001-backfill.md` describes:
1. For each `t2_document_registry` row with `external_file_id` and no `r2_key`:
   GAS fetches the Drive binary by its **stored** `external_file_id` (no name
   guessing), computes sha256, PUTs a canonical R2 key, calls
   `t2_document_canonical_backfill_v1(document_id, r2_key, sha256, size, mime, drive_revision)`.
2. Row becomes canonical (R2) with Drive as `drive_sync_status='synced'`.
3. AMBIGUOUS / MISSING Drive files → `review` job, never auto-bound.

## 12. Control Center capabilities (register)

`canonical.database` (Supabase), `canonical.file_storage_r2` (R2),
`document.registry`, `drive.replica_sync`, `sheets.replica_sync`,
`replica.conflicts`.

Health rollup:
- `R2 DOWN` → **canonical file system DEGRADED**.
- `Supabase DOWN` → **canonical system DEGRADED**.
- `Drive DOWN` → canonical UP; `drive.replica_sync` = DEGRADED.
- `Sheets DOWN` → canonical UP; `sheets.replica_sync` = DEGRADED.

## 13. Performance law

Core interactive paths: **zero** Drive scan, Sheets scan, global folder scan,
GAS round-trip dependency, O(n) project scan. Canonical reads = Supabase/R2 only.
Static guard: `frontend/testlar/t2_file_truth.test.cjs`.

## 14. Governance

This file is a new accepted contract under `docs/architecture/`. The Constitution
already states Supabase-first; §0 here sharpens "R2 = file truth, Drive/Sheets =
replica, GAS = bridge". Constitution patch proposed in
`ops/handoff/FILE-TRUTH-001-constitution-patch.md` (not applied — governance
branch owns `docs/governance/`).

## 15. Codex lane boundary

Do NOT touch `frontend/src/components/document-center/**` or
`frontend/src/admin/document-center/**` — Codex owns that UI lane. This task
delivers the backend/contract/functions/migrations/tests it will consume.
