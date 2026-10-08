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

## Второй этап: semantic candidates без подмены исходных данных

Добавлен source triage: каждую unmapped строку оператор получает с original cells/адресом и кандидатом (заголовок, номера колонок, подпись, note, финансовая строка, ресурсная группа, source summary, unknown). ISHCHILARNING MEHNAT XARAJATLARI сохраняется как labour_quantity summary с исходным ЧЕЛ-ЧАС и значением; зарплата/машины/материалы/перевозка/оборудование — самостоятельные source cost summaries, не нормы/не тарифы. `reviewRequired:true` не снимается даже у найденного кандидата.

Native/OCR text evidence даёт explicit title candidates для smeta/F2/F3/M29/АОСР/invoice/contract/lab, explicit contract/act numbers, customer/contractor, reporting period, literal valid calendar dates и source total. Каждый факт имеет page/line/raw/origin. Несколько разных контрактов/типов сохраняются, ID компании из названия не создаётся, OCR не превращается в approval. Номер формы №2 не используется как номер акта. Missing fields не заполняются.

## Итог второго этапа — 2026-10-09
97 regression tests / 15 files PASS в полном gate packet; дополнительные final focused 42/42 PASS и oxlint PASS. Real corpus расширен до 5 файлов: экспорт Google Drive/Tizim1 ТЕПЛОТРАССА_LRV_PLUS, 11545 физических ячеек проверены. Все исходные SHA до/после совпали. Navoiy: все 253 unassigned строки получили явные source candidates (203 summary, 21 resource_group, 7 header, 7 note, 9 title, 4 column_numbers, 2 financial); это review candidates, не semantic approval.
Drive sample имеет 4546 review issues; нельзя считать производную Tizim1 таблицу нормативным эталоном. В reference F3 остаются 16 unknown_text; Drive — 2 unknown_numeric и 1 unknown_text. Текстовая классификация не заменяет layout/OCR QA. SOURCE_TRANSPORT_VERIFIED / semanticAcceptance NOT_PROVEN. Файлы и receipts только D:/CatalogMigration/outputs/smeta-source-fidelity-20261008/. Claude N1–N3/накрутка/binding не изменены; новая owner сумма-known/zero политика прочитана, вычисления бизнес сумм этот evidence слой не меняет.
