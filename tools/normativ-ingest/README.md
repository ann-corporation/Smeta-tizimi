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
