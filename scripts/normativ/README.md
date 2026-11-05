# Нормативные документы: K1, локальное извлечение

K1 готовит данные для review, не публикует нормы и не обращается к сети/R2/БД.
Исходники, JSON chunks и результаты OCR **вне любого Git checkout**. В repo только код и генерируемые синтетические тесты.

```powershell
python -m pip install -r scripts/normativ/requirements.txt
python scripts/normativ/pipeline.py D:/private/source.pdf D:/private/normativ-output --norma-kod SYNTHETIC --tahrir TEST
python -m unittest discover -s scripts/normativ -p test_pipeline.py -v
```

Для тестов дополнительно `reportlab==4.4.9` (синтетический PDF). Python 3.12+.
OCR опционален: `--ocr C:/tools/tesseract.exe --lang rus+uzb_cyrl --threshold 90`.
Tesseract/language data устанавливаются отдельно; версия движка включается в job identity.
Без движка скан получает `OCR_REQUIRED`, не выдуманный текст. Непустой native текст с изображениями помечается `IMAGE_REGION_REVIEW`.
Binary DOC требует `--converter C:/tools/soffice.exe`; отдельный временный LibreOffice profile,
timeout60сек, версия конвертера в identity. Без конвертера `CONVERTER_REQUIRED`, не чтение бинарных байтов как текста.
Конвертированный DOCX сохраняется только в приватном job каталоге; original/derivative SHA и версия конвертера фиксируются отдельно.

## Контракт

- Job id = SHA256(sourceSHA + readerVersion + metadata/edition + точные версии reader/OCR/config).
- Все reader читают приватный snapshot именно хешированных байтов. Источник не перезаписывается.
- `UPLOADED → EXTRACTING → EXTRACTED → REVIEW_REQUIRED`; ошибка отдельно `ERROR`.
  Пустое/неподдержанное извлечение не получает `EXTRACTED`. `INDEXED/PUBLISHED` здесь недоступны.
- Atomic checkpoint после страницы/абзаца/таблицы/ZIP-члена; процессный lock; timeout документа180сек (`--timeout`).
  После ошибки/таймаута повторный запуск продолжает проверенные units, OCR повторно не оплачивается.
- `completed` — обработанные units, `extracted_units` — прочитанные; частичное/пустое OCR явно отмечено, пустой текст не объявляется EXTRACTED.
- Chunk: sourceSHA, reader, unit, norma_kod, tahrir, bob_punkt/jadval_kod, sahifa_pdf/sahifa_bosma,
  matn, spans/ячейки, flags, sha. Неизвестные семантика и печатная страница остаются `null`.
- PDF native: символы и bbox, PDF points/bottom-left. OCR: TSV word confidence и явно преобразованные bbox.
  Любое слово ниже threshold → `OCR_LOW_CONFIDENCE`; число ниже max(95,threshold) → `OCR_NUMERIC_REVIEW`.
  Ни разделители, ни прочерк, ни `0` не преобразуются в числовую норму. Окончательное состояние всегда REVIEW_REQUIRED.
- DOCX: абзацы/таблицы в document order; ячейки с colspan/vmerge и XML, сноски с origin;
  номер абзаца не становится страницей Word. Вложенные таблицы сохранены в XML, семантический разбор требует review.
- ZIP: CP866/UTF8, SHA и origin member, path traversal и размер ограничены; вложенные архивы не извлекаются.

Это extraction, а не подтверждённый разбор нормативных таблиц, OCR quality/edition approval или юридическая актуальность.
K2 — отдельный PR; зарезервирован **20261203001100_t2_normativ_v1**, применение L0.

Первичные API: [PDFium](https://pypdfium2.readthedocs.io/en/stable/readme.html),
[DOCX](https://python-docx.readthedocs.io/en/latest/api/document.html),
[Tesseract TSV](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).
При распространении PDFium/Tesseract binary/language data сохраняются их bundled license notices; бинарники здесь не включены.
