# T2-SMETA-SOURCE-FIDELITY-DATA-20261008 — понимание документа с исходными доказательствами

Owner: Codex · machine: noutbuk · branch: `codex/document-understanding-v1`.
Основание: прямое поручение владельца понимать любые сметы/Ф2/документы и правильно передавать данные системе; Obsidian `PTO_PRO_V1_DIREKTIVA` §7a.

## Изменение

Раньше общий бинарный reader оставлял значения, но терял формулы/outline и точную десятичную запись OOXML. Теперь сохраняет optional `formulalar`, `outline`, `numericText`. Legacy XLS сохраняет физическое начало A1: документ, начинающийся с C3, не сдвигается в A1. Существующие значения `rows` и финансовая логика не переписаны.

`kitobAnatomiyasi()` аддитивно возвращает `sourceEvidence`: каждая непустая или формульная ячейка с исходным адресом, точный десятичный текст без арифметики Number, исходная формула, прямые ссылки, неизвестные зависимости, явно заданные проценты и суммы-кандидаты, все строки вне семантической карты. Это доказательства, не вторая математическая модель.

Порт `readDocumentFile(file, bytes)`:

- XLS/XLSX/XLSM: существующий общий binary reader → существующий smeta/F2 reader → source envelope. Нового параллельного парсера сметы нет.
- PDF: native текст по страницам; пустая страница → OCR_REQUIRED. Никаких выдуманных OCR результатов.
- DOCX: body, headers/footers, footnotes/endnotes; исходный XML и текст со структурными границами. Адрес — logical_part, НЕ физическая страница Word. Relationship/media/styles и layout не доказаны.
- UTF-8 TXT/CSV/TSV: исходный текст/строки, без угадывания схемы; неизвестная кодировка отклоняется.
- Остальные форматы: SHA256/size + FORMAT_ADAPTER_REQUIRED.

## Инварианты и границы

`importAllowed:false` у нового evidence порта: операторские данные не становятся сертифицированной истиной. Эта метка НЕ блокирует старые unrelated бизнес-команды сама по себе. Существующие canonical RPC/tenant/actor/optimistic-lock остаются обязательными. Исторический F2 не меняется, норм/ставок/цен не создаём. Формулы не исполняются. Неизвестная ставка не становится default или нулём. Конфликт ставок идёт в review. Прямые ссылки — lexical evidence, НЕ результат вычисления Excel и НЕ доказательство полноты dependency graph.

`FORMULA_METADATA_UNAVAILABLE` явно показывает caller, который передал только rows. Для полного source evidence caller должен использовать новый readDocumentFile/readDocumentWorkbook либо передать optional поля из общего XlsxSheet. Большие документы должны читаться в Worker; source envelope может увеличивать память. Оригинальные байты остаются у владельца/canonical R2 pipeline; их этот порт не загружает и не перезаписывает.

## Что получает Claude

Новый читающий порт и source evidence уже доступны из канонического `kitobAnatomiyasi`; полный импорт/экспорт UI и все старые adapters не переведены автоматически. Следующий этап: перенести metadata в locked Smeta/F2/Oferta caller adapters, показать review оператору и привязать подтверждённые факты к существующим canonical commands. PDF/Word domain mapping, OCR verification, все виды процентов/коэффициентов и byte/cell-level export roundtrip требуют отдельного реального acceptance. `Любой документ 100% понят` НЕ заявляется.

## Проверки

Результаты финальных gates и real corpus receipt добавляются после завершения. Реальные файлы находятся только локально; `DOCUMENT_CORPUS_MANIFEST` задаёт path/SHA/kind, `DOCUMENT_CORPUS_RECEIPT` — локальный receipt. Кorpus проверяет исходные hash до/после, физические ячейки и значения; статус SOURCE_TRANSPORT_VERIFIED отделён от semanticAcceptance NOT_PROVEN. Без manifest corpus test skipped, не PASS.

## Проверено 2026-10-09

Final gates receipt: D:/CatalogMigration/outputs/smeta-source-fidelity-20261008/validation/results.json. App/Functions TypeScript, scope regression, full src lint, tekshir, site-map check, Vite build и governance PASS. Полный Vitest suite не запускался. Warnings baseline не приравниваются к ошибкам.

4 реальных source файлы: Navoiy STR_ALL_SM XLS — 375609 физических ячеек совпали по адресу/значению; 57603 source rows, 57350 represented и 253 unassigned сохранены. Reference F3 XLSX — 156 cached value cells сверены и 22 формулы сохранены; source cells 159 (включая formula-only), 22 rows unassigned. DOCX hidden-work акт — raw Word document XML; AOSR PDF — 2 native страницы, OCR_REQUIRED=0. SHA всех оригиналов до/после совпал. Receipt local: D:/CatalogMigration/outputs/smeta-source-fidelity-20261008/real-corpus-receipt.json. SOURCE_TRANSPORT_VERIFIED не равно semanticAcceptance: она NOT_PROVEN.

Кандидаты ставок на work/resource rows исключены: транспортная работа и материал с процентом в названии не становятся накруткой. Нераспознанные source rows не выброшены и не включены в canonical business truth автоматически.
