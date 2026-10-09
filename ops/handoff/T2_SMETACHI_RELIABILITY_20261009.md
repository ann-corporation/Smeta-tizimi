# Smetachi AI: корректность ответа и выбора нормы

Owner: Codex@nоutbuk. Branch: codex/smeta-ai-reliability-v2.
Base: bfe6d13369583667bb9d261cf3eb2037a45c7819.

Anvar поручил продолжить после исчерпания лимита Claude. Его изменения
425ade48 (входы парсера через анатомию) и bfe6d133 (JSON/retry) уже в origin/main.
Рабочие каталоги Claude и пользовательский dirty main не изменялись.

Исправления: чужой JSON и обещание готовой сметы без структурированных работ
вызывают повторный запрос; неоднозначный код нормы не выбирается; изменение
материала сбрасывает старый выбор; неопределённые условия и конфликт единиц
не допускают ADD_OCCURRENCE. Отказ AI не заменяется автоматическим выбором.
UI показывает ревизию каталога, код, единицу, материал и причину. Память чата
разделена по компании и черновику; поздний ответ старого контекста игнорируется.
Пустой разговорный ответ не уничтожает существующие предложения.

Проверено: 126 regression passed / 11 corpus skipped; новые AI/UI проверки
46 passed. Полный corpus требует внешних исходников. Повторные gates и релиз
фиксируются последующим checkpoint. SQL/R2/business writes не выполнялись.

Ограничения: рекомендации не доказывают юридическую действительность редакции.
Реальный ответ Gemini и authenticated owner smoke ещё не проверены.
Для случая владельца объём котлована 50×0.5×1.5=37.5 м3, бетона
48×0.6×1.2=34.56 м3, арматура 1.2+0.6=1.8 т. Ширина/длина подготовки
и факт выполнения опалубки отдельно не подтверждены — 2.88 м3/115.2 м2
не должны автоматически считаться доказанными. Нормы/цены не выдумываются.

Final gates: full Vitest maxWorkers=2 238 files passed / 1690 tests passed / 17 skipped (435.94s); focused AI+UI 49 passed; final app TSC exit0; Functions TSC/lint/tekshir/build/governance/diff PASS. Initial unlimited-worker timeouts were reproduced as green in bounded full run. Release candidate includes follow-up list preservation and formula edits preserving unresolved conditions. Authenticated provider smoke remains UNKNOWN.

Live Gemini 3.5 Flash smoke on production 42bc95eb: 5 proposals visible, add button visible; model invented B7.5/conditional width and selected plain-concrete foundation despite reinforcement. These are NOT accepted successes. Follow-up guards mark conditional quantities/unprovided A/B material grades as review; same-section reinforcement context is supplied and contradictory plain-concrete AI picks are blocked. 51 focused tests PASS; new full build incl both TS gates PASS; oxlint/governance/diff PASS. Norm search quality/complete recipe coverage and final saved priced estimate remain unproven.

Final hydration/UI guard: restored proposals revalidated against stored user messages; conditional/invented material proposals lose ready status and stale choice. Proposed work cards are shown before slow norm-selection completion. 52 focused tests PASS, final UI 6 PASS, build app/functions PASS, lint/governance/diff PASS. Final production/provider receipt will be recorded in Obsidian with exact SHA.

## 2026-10-09 — пределы выдачи и нормативные источники

Прямое поручение владельца после weekly-limit Claude: продолжить Studio. Точная
передача resource-match.ts/test.ts и SmetaStudioNarxlash.tsx отражена в registry;
остальные пути прежнего task сохранены отдельными locks. Governance77 PASS.

Локальный XLSX владельца проверен read-only, SHA256
11f24e80ec827171b77a85b549b9b375e5b9e149a0844f8042c922cd9b6e5e50:
RES26 ресурсных строк, одна цена G21=148613,25 неизвестных. Это не полностью
оценённая смета. Нельзя исправлять отсутствующие цены нулями/догадками.

CODE: ручной постраничный поиск норм независимо от AI shortlist12; расширение
ресурсных предложений8→33→58 и далее до найденного пула; confidence считается
по всему проверенному пулу, а не видимому срезу. Неизвестная единица не даёт
EXACT автоцену даже при совпавшем названии. Ошибка company-price lookup явно
показана и доступна повтору; unresolved экспорт обозначен DRAFT/«qoralama».
Для E6-1-1-22/23 UI показывает source reference ШНК4.02.06-04 таблица6-01-001,
PDFстр12, состав работ и предупреждение о повторном учёте армирования/опалубки.
Это ссылка на конкретное старое издание, не юридическая активация базы.

TESTED:120 тестов/16files AI+Studio+provider PASS; Studio UI6 PASS отдельно.
Текущий build/CI/release status фиксируется отдельным checkpoint. При изменении
числа visible candidates автоматическая confidence не повышается. Оригиналы
в git не добавлены, бизнес DB/R2 writes не выполнялись.

UNKNOWN/NOT_DONE: полная проверка текущих цен на все26 ресурсов; технические
коэффициенты как отдельные scoped commands; универсальная included-work dedup;
полный поиск материалов вне bounded matcher pool; upload/OCR/review/index/RAG
для190 PDF/Word. Владелец подтвердил, что файлы пока только в Telegram.
Контракт/acceptance записан в private Obsidian SHNQ_KNOWLEDGE_V1_2026-10-09.md.
Канонический reader остаётся единственным parser; R2 хранит immutable оригинал,
AI получает источники конкретной редакции/page/cell через retrieval. Fine-tuning
не заменяет источник, актуальность и детерминированный финансовый расчёт.

RES follow-up: неизвестные значения не скрываются за титулом полных прямых
затрат. Экспорт сохраняет известные суммы (правило владельца2026-10-08), но
в начале RES показывает НЕПОЛНЫЙ, число unresolved resource lines и
ПРЯМЫЕ ЗАТРАТЫ (ИЗВЕСТНАЯ ЧАСТЬ).4 workbook tests PASS; final app TSC exit0.
Live second chat reply returned grounded proposals/questions, but norm-selection
stage reported BYUDJET_TUGADI (AI monthly limit). No budget increase/bypass,
no further provider calls, no ADD/save. This is a concrete runtime limitation.

Владелец затем сам увеличил AI limit и разрешил повторный provider smoke.
В исходном LRV обнаружен E30-1-11-1 (арматурные сетки мостовых опор/труб),
а E6-1-1-22 уже имеет ресурс арматуры. Добавлен context gate: для обычного
fundament AI не выбирает мост/котёл/трубопровод, если такой объект не указан.
Реальный мост разрешён; «котлован» не спутан с «котлами».50 AI/UI tests PASS,
16 worker tests PASS final; app TSC exit0. Старый пользовательский draft не
переписывается; отдельное исправление resource armature quantity/recipe ещё
требует доказанного проекта и проверки included-work scope.
