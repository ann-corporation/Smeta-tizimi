# K4 — подготовка закрытой очереди
Скопируйте метаданные с титульной страницы после проверки редакции.
Частный JSON-массив содержит поля path (относительно корня), source_sha,
norma_kod, tahrir, title. Для ZIP добавьте точное имя member и sha256
самого извлечённого файла. Реальные манифесты и результаты держите вне Git.

    uv run --no-project --with-requirements scripts/normativ/requirements.txt python tools/normativ-ingest/prepare.py D:/ShNK D:/private/reviewed.json D:/private/k4

Проверьте ingest-queue.json и flags перед регистрацией. Каждая запись
содержит job_dir, source и title для scripts/normativ/r2_upload.py.
Неподтверждённые коды, редакции и OCR остаются на проверке.

Для подтверждённого блока добавьте annotations: объект с ключом unit (например page-1) и полями jadval_kod, bob_punkt, qidiruv_yorliq. Исходный SHA и разметка входят в идентичность задания; отсутствующая страница отклоняется.

## Публикация (L0)

1. Выполнить K2 dry-run для каждой строки ingest-queue.json и проверить
   оригинал, метаданные, главы, таблицы и флаги. Затем повторить с
   --apply --actor <id> по scripts/normativ/K2.md и сохранить id и версию
   регистрации. Не публиковать документы с неустранёнными флагами.
2. Используя подтверждённый job_sha и версию, вызвать существующую RPC
   t2_normativ_holat_v1 от service_role. Параметры: p_actor_id (DB
   superadmin), p_id (UUID документа), p_holat = INDEXED,
   p_kutilgan_versiya (версия), p_operation_id (новый UUID),
   p_review_sha (точный job_sha). При повторе использовать тот же payload
   и UUID. При STALE_VERSION перечитать состояние и сверить документ.
3. После ok:true вызвать ту же RPC с p_holat = PUBLISHED, версией из
   ответа и новым UUID операции. Затем проверить PTO-поиск, включая
   страницу, таблицу и фактический текст цитаты. Миграция для этих
   переходов не нужна.

Для отбора кандидатов таблиц: python tools/normativ-ingest/table_candidates.py <ingest-queue.json> <private-output.json>. Заголовки сверяются с PDF перед добавлением в annotations.

Поле iqtibos_anchor (до 160 символов) должно дословно присутствовать в извлечённом тексте. table_candidates.py проверяет только PDF units формата page-N.

## ShNK R2 search index (no database)
1. `node tools/normativ-ingest/shnk_repack.mjs --report <REPORT_DIR>` - one gzip bundle per document (Range-readable), index merged into 128 hashed buckets, `.doc` texts packaged as paragraph blocks (`source_type=doc`), `corpus.json.gz` with sha256 per object, `upload-manifest.json`.
2. `tools/normativ-ingest/r2_yukla_shnk.ps1 -ReportDir <REPORT_DIR>` - dry run by default; `-DryRun:$false` uploads to `smeta-tizimi-canonical` under `normativ/shnk/v1/` (ledger `upload.done`, corpus last).
3. Reader: `frontend/functions/_shared/normativ-r2-index.ts` (used by `api/normativ-qidir`). Env: `NORMATIV_R2_PREFIX`, `NORMATIV_R2_STATES` (default `PUBLISHED`), `NORMATIV_DB_FALLBACK=1` (old DB tables, only while the R2 corpus is missing).
