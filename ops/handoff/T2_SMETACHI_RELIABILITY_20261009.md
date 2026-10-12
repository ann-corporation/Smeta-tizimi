# Smetachi AI: корректность ответа и выбора нормы

## 2026-10-10 — цена по названию/единице и сравнение рынка

Прямое решение Anvar: исключить шифр из идентификации цены. Код остаётся
метаданными источника. Каталог — первичный источник; сметы компании —
вторичные наблюдения с именем объекта/файла. Нельзя объявлять все позиции
оценёнными, если класс/диаметр/единица или реальная цена неизвестны.

CODE: matcher проверяет семейство, класс, диаметр, фракцию, электроды,
машины/мощность и рабочий/машинист. Только точные переводы цены kg↔t и m↔km;
объём и исходный каталог не меняются. Исправлена неверная колонка `obyekt`
в company lookup: используется `obyekt_id`, tenant scope и canonical registry
filename. Ошибка/неполный ответ не кешируются как успешное отсутствие цены.
Сохраняется первенство каталога, повтор после выбора региона/смены ресурса,
игнорирование старого tenant/draft ответа. Компания индексируется один раз
на неизменную ревизию. AI transport ID отделён от локального fingerprint;
evidence <=300 содержит ID источника и доказанный перевод единицы.

Read-only панель Studio, Oferta, NarxNazorat, Narxlar, Holat: реальный квартал
и регион, среднее предложений одного продукта, минимум/максимум, разница и
процент от цены сметы. Известные нули сохранены; неизвестные/включающие НДС
предложения не попадают в среднее без НДС. Это среднее каталога, не индекс
всего рынка. Часовые строки пока сравниваются своим существующим слоем,
не материалами. Pagination/progress, immutable baseline и stale-response guards.

DB DEPLOYED: additive `t2_smeta_narxla_res_v2`, SHA256 migration source
4e01fd449fbb0be623454efd56f34f7672290b60da56e04d1c895a138d5294f1.
V1 сохранён для rollback. V2 заполняет только NULL по nom+birlik; разные
цены одного продукта с разными шифрами создают конфликт. Явный 0 не теряется.
Tenant/actor, audit, operation id + advisory lock сохранены/усилены.
Перед apply выполнен trial со всеми assertions и намеренным RAISE EXCEPTION
T2_SMETA_PRICE_NAME_UNIT_V2_ALL_ASSERTIONS_PASS_ROLLBACK; rollback подтверждён.
После apply acceptance PASS и точное prosrc совпадение true. Grants:
anon_execute=false, service_execute=true, fixed search_path public,pg_temp.
До/после: qator140600, companies4, objects37, test residue0.
Реальные позиции не нарховались через RPC; тестовые fixtures откатились.
Rollback сначала возвращает gateway на V1, затем .rollback.sql (только V2).

TESTED: focused matcher/company/comparison/semantic tests PASS; full suite
первый проход1824 PASS/4 FAIL выявил i18n false positives, источник региональных
worker rates, старое source-only guard assertion и alert scope. Исправления
проверены47 targeted tests PASS. Финальный full suite и build receipt будут
добавлены ниже; frontend production этой версии пока NOT_DEPLOYED.

UNKNOWN: весь исходный RES не доказан оценённым. В локальном verified snapshot
44173 строк ни одна из15 нечасовых исходных строк пока не имеет уверенного
автоподбора: отсутствуют/неуточнены характеристики. Компания имеет74308
положительных наблюдений, не уникальных товаров; наличие одинакового кода
больше не доказательство совпадения. General ShNQ190 ingestion/RAG — отдельная lane.

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

CI35c7/b97 обнаружил пропущенные RU/EN переводы9 новых UI ключей и false
positive JSX text-ratchet на inline comparison. Исправлены словари (передача
этих2 путей из предыдущего Codex catalog task), условие вынесено в hasMore.
Добавлены переводы source operations/caution; guard не ослаблен.26 tests,
включая i18n ratchet PASS; final build/app+Functions TS PASS. Пагинация не
предлагает пустую страницу после последнего результата. Итоговый CI требует
повторной проверки exact SHA; предыдущий failure нельзя назвать success.

Повторный реальный Gemini smoke после увеличения лимита владельцем выявил
ложное утверждение: armatura якобы обычно не входит в норму ленточного
фундамента. UI ссылка сама по себе не попадала в server prompt. Исправлено:
server добавляет проверенный ШНК 4.02.06-04, таблица 6-01-001, PDF12 для
контекста ленточного фундамента. Узкий semantic guard отклоняет наблюдавшееся
противоречие и запускает существующий budget-accounted repair. Это не общий
валидатор всех ШНК.9 targeted tests PASS; build/app+Functions TS PASS;
governance77 PASS (stale CURRENT_STATE warning). Новый live smoke после
production deployment ещё требуется. Цена и пользовательский draft не менялись.

## 2026-10-10 — included-work review
Предыдущий4cc55c35: frontend+CF CI success, реальный provider smoke подтверждён.
Новый deterministic gate проверяет отдельные установки арматуры/опалубки
рядом с E6-1-1-22/23 в одном разделе, включая existing draft placements.
Блокируются обе конфликтующие позиции до review; ADD повторяет проверку,
ручной выбор и порядок предложений не обходят её. UI показывает источник
и убирает ложный ready tick. Изготовление/демонтаж alone не обобщаются.
Значения и snapshot не удаляются.97 tests/10files PASS (AI/UI/i18n),
app+Functions TS/build, tekshir8/8, oxlint src exit0, governance77 PASS;
stale CURRENT_STATE SHA warning остаётся. Boundary: same-section potential
conflict, edition/element scope requires review; general ShNQ ingestion,
resource-fact→override и полный pricing ещё NOT_DONE. Live новый UI требует
production deployment и повторной проверки; ADD/save в smoke не выполнять.

### 2026-10-10 — VERIFIED PRODUCTION
CODE/main ff1a2fdae0cbeddc2f8bf88030e5c022ea2fad6b; canonical production
https://e0ff8ea7.smeta-tizimi.pages.dev deploy success. GitHub frontend and
Cloudflare Pages conclusion success. Authenticated NEW TIMES BUILDINGS:
existing test proposals restored;3 source-linked warnings (foundation+A3+A1),
ADD(0) disabled; quantity34.56m3 preserved. Existing draft unchanged; no
ADD/save/provider call in this smoke. Screenshot outside git:
C:/Temp/smeta-included-work-live-20261010.jpg.97 focused tests/10files plus
build/app+Functions TS/tekshir8/8/lint/governance PASS. General ShNQ retrieval,
reviewed element scope, resource actual quantities→overrides and complete
pricing remain NOT_DONE. This receipt-only follow-up is branch documentation;
it does not change production code or deployment SHA.

### FINAL LOCAL GATES
1829 tests PASS,17 intentionally skipped,244 suites PASS/8 skipped.
Последующие3 focused suites20 tests PASS после последней unit/AI guard правки.
App TS и Functions TS PASS; build PASS; tekshir PASS (site-map rebuilt),
oxlint exit0 с существующими warnings; governance77 PASS с историческим stale
CURRENT_STATE предупреждением. Evidence: C:/Temp/pricing-vitest-final-20261010.txt,
pricing-build-final-20261010.txt, pricing-all-gates-20261010.txt вне git.
DB acceptance/source/grants verified; frontend branch/main/release ждут push/CI.

## 2026-10-10 — Codex/noutbuk: PRICING VERIFIED RELEASE; GLASS IN_PROGRESS
CODE/PUSHED/main: ee44cef94b1b19fc8686c95e1f42493ecdf7ed81.
TESTED: 244 suites,1829 tests PASS,17 skipped; последующие20 focused PASS.
App/functions TS,build,tekshir,lint,governance77 PASS (старый stale main_sha warning).
GitHub frontend и Cloudflare Pages check-runs: conclusion success для ee44cef9.
DEPLOYED: https://1491b318.smeta-tizimi.pages.dev; canonical deploy success.
RES RPC v2 в Supabase проверена в rollback-транзакции, применена, acceptance PASS,
точное тело и grants verified;140600 qator/4 компании/37 объектов, fixture residue0.
Подбор Studio/RES использует название+характеристики+единицу; каталог первичен,
цены компании вторичны с источником. Устаревшие ответы не применяются к новому scope.
Readonly сравнение добавлено Studio/Oferta/NarxNazorat/Narxlar/Holat.
Authenticated smoke /admin/narxlar,NEW TIMES BUILDINGS,Amfiteatr:
2026Q1 и13 регионов;9488 исходных строк полностью обработаны,
4659 материалов имеют отклонение ИЛИ неизвестный результат,4829 часовых строк
вне material comparison. Эти4659 НЕ означают4659 найденных цен!
Первые50 строк содержали UNKNOWN/REVIEW; actual numeric delta на live пока не доказан.
Смена региона сбрасывает старый результат; existing draft/сметные цены не изменялись.
Screenshot C:/Temp/smeta-pricing-live-20261010.png вне git.
UNKNOWN: исходный RES27 ресурсов1 цена26 missing; повторный локальный snapshot
44173 строки не дал уверенного авто-match15 нечасовых ресурсов. Исправлены
ложные семейства известь→растворитель и арматурная сетка→СеткаДыня.
Общая полнота каталога/всех машин и190 ShNQ ingestion остаются открыты.
GitHub PR connector403; branch иmain опубликованы обычным git,CI success.
Новый прямой запрос владельца: iOS Liquid Glass. Свободный index.css взят
в owns этого task; только оболочка admin, без изменения бизнес-логики.
Статус IN_PROGRESS для визуального follow-up; pricing release выше завершён.

### Liquid Glass 2026-10-10
Owner direct request: iOS-style Liquid Glass. Index.css ранее не был занят;
scope добавлен в owns. CSS только внутри os-app-shell: градиентный фон,
translucent панели,rounded controls,blur24px только sidebar/context bar;
числовые ячейки без blur. Reduced-transparency/forced-colors/keyboard focus
и opaque fallback сохранены. CODE/main3cc4e1e6e248cef4dd18a3dc402d494992d77391;
GitHub frontend+Cloudflare Pages success,production aa8af8f1 success.
Desktop authenticated1280px: scrollWidth1280,header computed blur24px,
card radius21.6px,visual verified. На390px выявлено обрезание PTO selects:
последующий CSS fix делает scope отдельной двухколоночной строкой,
не меняет PTOWorkspaceContext/его lock. Local app/functions TS+build PASS.
Последующий mobile fix ожидает release и повторного screenshot.

## 2026-10-10 — Codex/noutbuk: LIQUID GLASS VERIFIED RELEASE
CODE/PUSHED/main:193058dbcb40fee45e6e0cf1e220df99e1cf97a6 (pricing ee44cef9,
glass3cc4e1e6, mobile193058db). DEPLOYED canonical Cloudflare production:
https://f448ad8f.smeta-tizimi.pages.dev, deploy success.
TESTED: app/functions TS+build,tekshir,governance77 PASS; для pricing1829 tests
PASS17 skipped,244 suites; для3cc4e1e6 GitHub frontend+Pages conclusion success.
Для финального193058db frontend/Pages/tekshir conclusions success проверены.
Authenticated /admin/narxlar:1280px viewport=scrollWidth; blur24px/saturate145%,
card radius21.6px. Mobile390px viewport=scrollWidth; все5 PTO select границы
left15.2/199,right191/374.8 внутри390px. Меню открывается,aria-expanded=false
после закрытия. Temporary viewport reset; финальная страница /admin/narxlar.
Screenshots вне git:C:/Temp/smeta-liquid-glass-desktop-20261010.png и
C:/Temp/smeta-liquid-glass-mobile-20261010.png. Реальные данные/draft не записаны.
Визуальный scope: authenticated os-app-shell,общие карты,поля,кнопки,навигация,
контекст. Не индивидуальная переработка каждого компонента/всех экранов.
UNKNOWN: полная автоматическая цена исходного RES не подтверждена;15 нечасовых
ресурсов локального audit без уверенного match. В live9488 строк обработаны,
4659 material exceptions включают UNKNOWN,это НЕ число найденных цен.
190 ShNQ ingestion,расширение фактических catalog/hour sources остаются открыты.
Task status ready_for_review; это release receipt,не объявление всей программы DONE.

## 2026-10-11 — Codex/noutbuk: восстановлено открытие Amfiteatr va sahna
Запрос владельца: NEW TIMES BUILDINGS после повторного импорта; объект127 не открывался,128 Stella открывался.
DB project tuoyrzadkgoltpqkdiyx:127 содержит10537 строк (220 rz);128 содержит1360 строк. После обслуживания количества повторно проверены:10537/1360.
До обслуживания: authenticated /api/sb при открытии127 возвращал502 для чтения состояния; в pg_stat_activity чтение t2_qator_holat работало28.01с. EXPLAIN оценивал новый объект в1 строку и выбирал Nested Loop с повторным агрегированием родителя. Статистика t2_qator не обновлялась после нового импорта (last_autoanalyze2026-10-08T22:57:28Z).
APPLIED, production DB maintenance: ANALYZE public.t2_qator; ANALYZE public.t2_akt_qator; ANALYZE public.t2_akt;. Бизнес-строки, цены, исходники, RLS и схема не изменялись этим обслуживанием.
После: Hash Join, оценка10390 против фактических10537; EXPLAIN ANALYZE SELECT из t2_qator_holat WHERE obyekt_id=127 LIMIT10000 — Execution Time475.701ms, Planning48.956ms. Это время SQL, не полное время браузера.
TESTED authenticated production:127 открылся после reload и повторного входа,26 корневых ветвей видимы;128 открыт через список объектов,6 ветвей видимы. Сообщение ошибки отсутствует в обоих случаях. Screenshot вне git:C:/Temp/smeta-amfiteatr-reload-fixed-20261011.png.
CODE_UNCHANGED / NO_NEW_DEPLOY: main193058dbcb40fee45e6e0cf1e220df99e1cf97a6; исправление применено обслуживанием DB, не новым frontend release.
OPEN recurrence: автоматическое обновление статистики после bulk-import либо устойчивый план чтения t2_qator_holat требует отдельного owned backend scope и проверки финансовой семантики. Текущий инцидент устранён; постоянная защита от повторения не объявлена готовой. Не ослаблять tenant/RLS и не подменять NULL/0. Другие agent locks не затронуты.

## 2026-10-11 — Codex/noutbuk: LARGE IMPORT TOTALS / mandatory rollup v2
Owner follow-up: крупные разделы127 Amfiteatr и129 Suniy ko'l показывают0/NULL,128 Stella работает.
ROOT CAUSE VERIFIED: обе live finalizer *_yakunla_unlocked_v1 имели if v_soni<5000 вокруг t2_rollup + signal refresh. Поэтому127(10537 строк),129(25030 строк) пропускали финансовый расчёт,128(1360 строк) его выполнял. Это отдельная проблема от статистики чтения из предыдущего receipt.
CODE:20261106420000_t2_import_mandatory_rollup_v2.sql + exact-definition rollback + acceptance. Rollup обязателен ДО size guard и вне optional signal exception; ошибки rollup больше не превращаются в финансовый success. Для крупных импортов ANALYZE t2_qator перед расчётом; размерный лимит остаётся только для полного signal refresh. Auth,tenant,object lock,command log,idempotency не изменены.
TESTED DB: migration+exact rollback в транзакции (RAISE EXCEPTION ROLLBACK_EVIDENCE); оба finalizer определения восстановлены точно. Acceptance на live PASS. Два реальных объекта: пробный rollup с rollback, затем повторный rollup в одной атомарной транзакции — totals idempotent, полный JSON hash всех rs/mat/ob до/после совпал. Оба объекта company17; advisory object locks использованы.
APPLIED: Supabase apply_migration t2_import_mandatory_rollup_v2 success; затем восстановлены только производные bl/rz суммы существующих127/129. Backup4182 производных строк:C:/Temp/t2-rollup-before-127-129-20261011.json, вне git. Файлы/ресурсные цены/количества не изменены. Stella128 не пересчитывалась и сохранила6122177092.11.
RESULT source resource sums (не проверка рыночной цены/НДС/надбавок):127=43596859620.83,129=161561634068.10. BL ресурсы не добавлялись повторно поверх BL total. RZ в DB хранит только прямые позиции; frontend уже поднимает nested RZ снизу вверх, поэтому верхние RZ NULL в DB НЕ заменяются дублирующими totals.
Authenticated production /admin/holat/127: объект total43596859620.83, конструктивная часть11326062533.88, архитектурная12764334352.32 видимы. /admin/obyektlar:127/129 totals видимы,128 unchanged. Frontend source/build не менялся; DB fix уже live, новый frontend deploy не нужен для эффекта.
UNKNOWN: свежий полный>=5000 import от загрузки нового файла после миграции ещё не воспроизведён; existing real large-object calculation и finalizer control flow проверены. Rollup completeness не доказывает правильность исходных нулевых цен. Signal refresh large objects остаётся отдельным scope. Известная смена Kanonik obyekt с сохранённым PTO source query возвращает старый scope; проверка через список объектов, follow-up отдельный.

### LARGE READ follow-up — deuxième cause verified, 2026-10-11
Authenticated129 после DB repair показывал152598228612.29 вместо161561634068.10: gateway MAX_SORO20 × server max_rows1000 возвращал20000/25030 с toliq:false, useT2Daraxt не отклонял partial ok:true.
CODE: t2-toliq-oqish.ts + tests; sbT2DaraxtOl/sbT2QatorHolatOl читают остаток stable id/qator_id keyset, сохраняют object/tenant filter, проверяют total/count/cursor, при ошибке возвращают ok:false и НИ ОДНОЙ partial financial row. После full read дерево сортируется по original tartib/id. Лимит200000 остаётся явной защитой, а не скрытым truncation. Holat market comparison использует те же полностью прочитанные resource lines вместо второго ограниченного20000 read. Gateway/auth/RLS не изменены.
LOCAL TESTED: app/functions TS+build PASS,tekshir PASS,oxlint src exit0(existing warnings),governance77 PASS. Full parallel Vitest1832 PASS17 skipped3 transient failures (2 exports20s timeout,1 UI async wait); affected6 files rerun --no-file-parallelism33/33 PASS, unchanged assertions/timeouts. Новые tests покрывают20000+5030,thin qator_id projection,NULL/explicit0,stalled/duplicate/failing/missing remainder. UI fix требует нового release+authenticated smoke; предыдущий DB receipt не доказательство full page total129.


## 2026-10-11 — F2 unresolved corrective rows / durable working draft

Причина: F2ImportV3 заменил старый resumable importer, но перестал вызывать существующие job/draft RPC. Все решения находились только в памяти React. Кнопка «F2 qoralamasini saqlash» была на самом деле gated canonical act writer и блокировалась неразрешёнными отрицательными строками.

CODE: f2-ishchi-qoralama.ts + F2ImportV3 persistence/resume; существующий system-file picker T2-ZAKAZCHIK-TOMON-001 не изменён. Локальный IndexedDB сохраняет исходный Blob, все акты, Map/Set решений, период, razdel mapping и идемпотентные operation IDs. Серверная кнопка «F2 qoralamasini saqlash» сохраняет источник в R2 и ВСЕ строки (в том числе unresolved/negative/NULL/explicit0) через уже существующие t2_f2_import_job/draft RPC, chunks1000. Акт/Nakopitelniy не создаются. Проверенный writer переименован «Tekshirilgan F2 aktini yaratish» и сохраняет прежние финансовые проверки.

RESUME: локально по компании/объекту; с другого браузера по номеру серверного черновика. Источник повторно берётся из registry/R2, проверяются UID/значения против server draft, актуальная смета перечитывается; удалённые canonical IDs разрываются. Авто-matching не стирает восстановленные ручные решения. Server versions проверяются: stale не перезаписывается вслепую; partial checkpoint complete:false, success только после полного сохранения всех chunks и complete:true. Отрицательные строки получают только подтверждаемые предложения по единственной уже установленной подписи/пути/единице этого акта, никаких silent exclusions.

TESTED: dedicated component persistence/error/server-save/cross-browser-resume mocks; unresolved negative retains final-act gate; 1001 source rows ->1000+1 server chunks; NULL vs explicit0; transaction success only on commit; abort/quota; stale/partial failure; ambiguous/cross-section/unit/grade proposals rejected. Real existing DB RPC probe saved unresolved -10,NULL,explicit0 and rejected stale version, then deliberate RAISE EXCEPTION ROLLBACK_EVIDENCE rolled everything back. Probe job7 absent afterward, original2 jobs unchanged. No migration/API gateway/auth/RLS changes in this F2 patch.

UNKNOWN: owner’s two-hour working session is on a different office PC and its tab is not exposed by current browser inventory. Logging into the same account does not prove that its React state was saved; we did not refresh/navigate that tab. Existing old tab cannot acquire the new persistence code without reload. Do NOT advise reload before preserving its work. Desktop Chrome new verification tab is accessible, old claimed tab reported debugger unattached.

BOUNDARY: working draft permits unresolved and zero rows; canonical act is still strict. Production t2_akt_qator has hajm<>0 constraint: exactly cancelling signed chunks (net zero quantity) may require a separate audited canonical correction contract before an act can be written. No fabricated quantities or silent source-row drops added here.

FINAL LOCAL GATES: app/functions TypeScript + npm build PASS; tekshir PASS; oxlint src exit0(existing warnings); governance77 PASS; full sequential Vitest247 files PASS,1845 tests PASS,17 skipped. Earlier i18n ratchet failure fixed with real ru/en translations, baseline/test not weakened. Receipt logs outside repo:C:/Temp/t2-f2-draft-build.log,C:/Temp/t2-f2-draft-vitest.log,C:/Temp/t2-f2-draft-tekshir.log,C:/Temp/t2-f2-draft-oxlint.log.

RELEASE VERIFIED: code SHA bf1057a98f5add4a6dbb7f67920da935a7ac4616 on origin/main. GitHub frontend and Cloudflare Pages conclusion success. Cloudflare production/main deployment8fb780eb-b4b4-4006-8b28-5b8d76ab92fe exact commit hash,deploy success2026-10-11T09:39:56Z. Authenticated production F2 working-draft/resume UI visible,IndexedDB init no error; actual owner server save/resume remains UNKNOWN. Authenticated Suniy129 full total161561634068.10,upper RZ384398337.90 and9113417955.16 visible; screenshots outside git:C:/Temp/f2-working-draft-production-20261011.png,C:/Temp/smeta-suniy-full-total-production-20261011.png. Old office-PC two-hour draft still inaccessible/unrescued; that tab was never refreshed. This receipt-only commit goes to task branch; production code SHA stays bf1057a9.

## 2026-10-11 — Уточнение владельца: частичный ЧЕРНОВОЙ АКТ, не только рабочая копия
Владелец прямо потребовал сохранять в Ф2 уже подтверждённые связи, даже если отрицательные/другие строки не связаны. Требование заменяет прежний запрет черновика при любой нерешённой строке; исходные строки не исключаются из рабочего состояния.
CODE: f2QoralamaYozish строит неизменяющую решения проекцию подтверждённых связей. Предложения и несвязанные строки остаются в полном серверном рабочем черновике. Кнопка «Сохранить черновик акта Ф2» вызывает существующий t2_akt_yarat_v2 после успешного сохранения полного рабочего состояния; raw_snapshot содержит import_job_id/partial/unresolved_count. Отдельная кнопка сервера названа «Сохранить рабочее состояние на сервере». Предупреждение и раскрываемый список показывают строки вне акта; невключённые минусы не уменьшают прежние объёмы. Автотасдиқ/новая миграция не добавлены.
TESTED: focused16/16; full1849 passed,17 skipped (247 files passed,8 skipped); tsc application/functions via build PASS; tekshir PASS; frontend oxlint PASS; governance77 PASS (existing stale main_sha warning); diff-check PASS. Tests: confirmed +12 -> amount1200 despite unresolved -10; both confirmed -> +2/200; proposals not committed; NULL quantities/conflicting confirmed prices blocked; full backup failure prevents act.
DB PROOF: actual saved job8=1906 rows,846 negatives,1060 confirmed,confirmed missing quantity0,priced missing amount0. Existing RPC accepted a partial draft from one real confirmed source row with exact amount/quantity and partial metadata; deliberate RAISE EXCEPTION ROLLBACK_EVIDENCE rolled all probe writes back; probe count afterward0. Job8 original untouched. This does not prove all1060-row aggregation: production UI restore and financial errors remain to be verified.
RELEASE: pending commit/push/deployment receipt. Real owner act not created by agent.

## 2026-10-11 15:29 Asia/Tashkent — RELEASE + РЕАЛЬНЫЙ ЧЕРНОВИК СОХРАНЁН
CODE/PUSHED/DEPLOYED: 01276ea028ba6bcd371c03b59a61b4b7c4305a4c в main и codex/smeta-ai-reliability-v2. GitHub frontend SUCCESS, Pages check SUCCESS. Именно production/main deployment300c801c-0b82-4163-84c3-5a9a4cb5618a: deploy success2026-10-11T10:26:43.654091Z.
AUTHENTICATED OWNER SMOKE: в отдельном ноутбучном tab production восстановлен server job8. Показаны846 unresolved, кнопка чернового акта ACTIVE на1053 канонические строки. По прямому уточнению владельца выполнено сохранение только подтверждённых связей: акт261,company17,object127,2025-10-01,status=qoralama. UI и независимый DB read подтверждают1053 актовые строки со всеми1060 исходными подтверждёнными связями в raw_snapshot,partial=true,unresolved_count=846. Ни одного отрицательного количества в акте. Полный job8 сохраняет1906 исходных строк,846 минусов; их не исключали из рабочего состояния. Финансовая сумма акта8151662266.273387530006109 — сумма выбранной проекции, не сумма полного исходного файла. Акт НЕ подтверждён; Nakopitelniy не записывался.
LIMITATIONS: исходный парсер показывает25 строк/заголовков для проверки и расхождение прямого итога с исходными строками -125960282.03 (-3.87%). Эти предупреждения не скрыты и не исправлены догадкой. Данный release доказывает requested partial draft save, не полную семантическую точность исходного F2. Office original tab не трогали. Не создавать второй акт261 повторным импортом: уже сохранённый доступен в истории F2.
SCREENSHOT outside git:C:/Temp/f2-partial-draft-act-261-production-20261011.png. Existing tests1849 passed17 skipped; source unchanged после gate.

## 2026-10-11 — Системное ускорение чтения объектов (все компании)
ROOT CAUSE / BASELINE: authenticated production127,10748 rows: tree20855ms (first13444ms,remaining7008ms), state11396ms(first1446ms,remaining8911ms). Gateway requested exact COUNT for every page. Actual wide ordered query used primary-key scan, discarded140600 unrelated rows; EXPLAIN ANALYZE556.392ms. This is a shared read path, not company-specific repair.
CODE: count=exact only first page of each gateway batch; exact total, page cap, complete-read continuation and tenant filters unchanged. Additive index public.t2_qator(obyekt_id,id), rollback+acceptance supplied. No business data, source values, auth/RLS, IJRO whitelist or financial formulas changed.
DB APPLIED: t2_object_cursor_read_index_v1 via Supabase MCP after transaction probe with intentional RAISE EXCEPTION rollback. Probe actual127/129 used new index. Live acceptance passed on three largest objects, index valid+ready. No object/company IDs hardcoded in migration/acceptance. Wall-clock production improvement remains pending gateway deployment and authenticated remeasure.
TESTING: five new gateway cases cover both financial views, company filter, cross-company rejection, >20000 continuation and upstream failure; full final receipt pending below. Build and tekshir passed; application lint exit0 with existing warnings, functions TypeScript passed, governance77 passed (existing stale main_sha warning).
FINAL TESTED: 248 files passed,8 skipped;1854 tests passed,17 skipped. Final log C:/Temp/t2-object-speed-vitest-final.log. Gateway completeness and tenant assertions pass; no test baseline weakened.

## 2026-10-11 — OBJECT READ RELEASE / authenticated runtime evidence
CODE/PUSHED/DEPLOYED:1119e71294db4a3943a56f7d9aaa735b1c78299f main. GitHub frontend SUCCESS and Pages SUCCESS. Cloudflare production deployment bf8b2b7c-d282-4a3a-a6f9-f6ae512527fe deploy SUCCESS2026-10-11T11:01:57.855435Z. Index live valid/ready.
AUTHENTICATED127: unchanged10748 rows; tree20.855s ->5.383s; state11.396s ->6.000s; both toliq=true. Tree server first13.444s ->1.308s; remaining7.008s ->3.108s. UI total43596859620.83 and root sections visible. Wall figures are request durations, not a guaranteed full-page load SLA.
AUTHENTICATED129:25030 complete rows: first20000 (tree6.787s,state7.062s) then5030 (tree3.069s,state3.227s), financial full-read continuation retained; endpoint false on budget batch is NOT a complete object. End-to-end state requests from first start through continuation finish10.361s. UI total161561634068.10 unchanged; section384398337.90 and9113417955.16 visible. Screenshot C:/Temp/t2-object-speed-suniy-production-20261011.png. Raw timing receipts outside git C:/Temp/t2-object-speed-baseline-127.json,after-127.json,after-129.json.
LIMITATIONS: browser ScriptDuration after127 reload9.115s; catalog comparisons run in background. No proof that every device/network opens instantly, and no fabricated129 before-patch baseline. Existing canonical object selector briefly reverted129 selection to URL127 via scope sync; direct URL129 works. Separate scope-navigation issue recorded for follow-up, unrelated to this DB/read patch. Original owner F2 browser/draft not touched. Source business data and sums unchanged.
TESTED:1854 passed17 skipped;248 files passed8 skipped;build,tekshir,application lint(existing warnings),functions TS,governance77 PASS. This release is systemic across companies/objects: no hardcoded customer IDs in implementation or index migration.

## 2026-10-12 — P0 Накопительная/F3: суммы работ и разделов
OWNER direct: section/work totals absent; estimate side much smaller than accepted and physical percentages exceed100%. Own lease extends inactive/released document lanes: forma3-export+tests,nakopitelniy-export+tests,NakopitelniyVedomost UI. Other active agent locks retained.
ROOT CAUSE: F3 ишYig propagated one NULL resource into complete work/section NULL, while total cached category sums stayed known; Excel recalculation dropped these work amounts. Nested parent sections with no direct work were omitted. Nakop export merged section headings across all financial columns. UI work monetary F2 fields showed row-level NULL/0 instead of child resource rollup.
CODE: known-value subtotal preserves unknown leaf+attention list; all-unknown work remains blank. Parent F3 sections aggregate descendant work ranges; object total counts only roots (no double counting). Nakop section headers show same descendant monetary formulas as section totals. UI work amounts aggregate resources independently of physical quantities; all-unknown smeta shows dash. Approved volumes, prices, source and business DB unchanged. F3/Nakop attention exposes actual physical overrun, percentages not capped.
TESTED intermediate:27 focused tests,1856full PASS17skip before last UI NULL projection; final full rerun1856PASS17skip. Build(app/functionsTS),tekshirPASS;oxlint exit0(existingwarnings);governance77PASS. Actual Excel COM CalculateFullRebuild for nested+NULL fixtures: parent/child/work and F3object total15000000 after recalculation, F2money200000000; no duplicate count. Source NULL retained, physical2000% deliberately retained as genuine fixture overrun. Receipts outsidegit C:/Temp/t2-document-rollup-validation/*.receipt.json.
READONLY source audit: approved partial act261 q742587 baseline0.0994 vsF22.2922,unit100М3; no silent financial correction. New live page now has additional approved months2025-12/2026-03/2026-08 and total14296417432.44: previous8151662266.27receipt is historical. Further physical source audit remains separate.
BACKLOG: Obsidian NEZAVERSHENNYE_RABOTY_2026-10-12.md records14open items with distinct implementation/release/evidence status; old closed F2draft and speed/glass releases excluded. Actual beforeF3 downloaded viaUI despite download-event timeout; filetimestamp2026-10-12T08:45:20+05:00 verified. Private copy C:/Temp/t2-document-rollup-validation/amfiteatr-f3-before.xlsx. No real workbook in git.
RELEASE/LIVE AFTER: pending below.

## 2026-10-12 — Source precision follow-up after real Excel acceptance
First code release d8316ebd production67625af3-9fcd-4620-bacb-8b57f09a6e2f SUCCESS03:50:10Z;frontend+PageschecksSUCCESS. AuthenticatedUI work resource amounts now visible; screenshot C:/Temp/t2-document-rollup-validation/amfiteatr-ui-work-rollup.png. Actual F3 before37,551,837,324.56→after43,596,859,620.83;30 missing work amounts restored,remaining23 genuine unknown. Aftercopy ExcelCalculateFullRebuild EXACT43,596,859,620.83; sourceF2 periods unchanged.
Real Nakop Excel revealed additional source precision drift: raw downloaded cache43,596,859,620.83 vsrecalc43,596,859,594.99008. Earlier COM open auto-recalculated before firstValue2 read, therefore that zero-difference receipt is NOT cache parity proof. Independent rawXML comparison found2251changedGcells inclaggregates. SourceoriginalDownloads remained untouched; recalculation onlyC:/Tempcopy.
Follow-upCODE: if roundednorm would alter originalresourcequantity, unchanged parentvolume returns originalresourcequantity; editedvolume stillnorm×qty. Ifsourceamountdiffersfromroundedqty×price, unchangedqtyandprice returnactualsourceamount; editedinput recalculates normally. ROUND monetarySUMIFto2decimals matches cache/tiyin semantics. No inventednorm/price andsourceNULL remainsNULL. NativeExcel regressionoriginal10.07,edited20.00,restored10.07. Sourcefile snapshots notmodified bythis fix.
FINALLOCAL:1857PASS17skip,248filesPASS8skip;build(app/functionsTS),tekshirPASS;new testpreservesliveformula/sourcepriority. Real finalNakop replay pendingnextrelease. PhysicalsourceauditR02stillopen,noapprovedactrewrite.

## 2026-10-12 — Native Excel exact source parity (final follow-up)
Native replay of616390ef found residual0.52sum; not declared exact. Investigation of42leaf cells proved Excel constant parser truncates17digit binary-price tails while source cell rounds to15significant digits (e.g4156249.9999999995). Follow-up always protects original norm-quantity/source-amount when inputs unchanged and uses15significant digits in comparison operands only. Original sourceprice/quantity cells and DB remain unchanged; edits stillcalculate.
Local candidate using actual downloaded Amfiteatr data: nativeExcel cached43,596,859,620.83→CalculateFullRebuild43,596,859,620.83,difference0.00. This candidate is outsidegit and NOT production evidence; final app-generated replay required. New regression for binary-price tails; FINAL1858PASS17skip,248filesPASS8skip;build+functionsTS,tekshir,focusedoxlintPASS. Sourcepriority/liveeditnativefixture10.07→20.00→10.07 remains verified.
Found related read-only follow-up in other exporters: Slichitelniy/Ostatka rz v.bolim, Slich normROUND. Recorded underbacklogR03, not fixed or claimed verified bythis lane.

## 2026-10-12 — FINAL RELEASE + LIVE/NATIVE PASS
CODE/PUSHED/DEPLOYED64fc8b996ebe450513276272ba0279f4992defd0 main. Cloudflareproduction1f2bf02b-3055-43c8-b2a1-778be5917b5ddeploySUCCESS2026-10-12T04:16:25.256182Z. GitHubfrontend/PagesSUCCESS; finalfrontendjob completed04:19:45Z.1858localtestsPASS17skip;build/functionsTS/tekshir/lint/governancePASS.
AUTHENTICATED: UI resource-derived monetary work amounts visible. Final realNakopdownload timestamp2026-10-12T09:18:02+05:00. ORIGINAL file copied,not overwritten. NativeExcelmanualmodeBEFOREopen→CalculateFullRebuild:baseline43,596,859,620.83→43,596,859,620.83,delta0.00; no monetarycolumnmismatch ongrandrow. ReceiptC:/Temp/t2-document-rollup-validation/amfiteatr-nakop-production-64fc8b99.receipt.json. PreviousrealF3native43,596,859,620.83unchanged;30workamountsrestoredvsold37,551,837,324.56. Unknown23workamounts remain unknown. ScreenshotC:/Temp/t2-document-rollup-validation/amfiteatr-ui-64fc8b99.png.
ObsidianbacklogNEZAVERSHENNYE_RABOTY_2026-10-12.md:13openitems,R01closedwithinNakop/F3scope. R02sourceactualquantity/scope andR03otherexports/globalNULLremainopen;sourceqty2.2922(unit100М3) inmanualsource1061confirmed,notfabricatedunitconversion. No approvedact/businessDB rewrite,originalownerF2tabuntouched. Slich/Ostatv.bolim/norm-roundfollow-uprecorded,notfixedbythispatch. All privateworkbooks outsidegit.

## 2026-10-12 — F2 explicit bulk linking / crane resource identity / two panels
Owner clarification: keep one-button linking of ALL reliable matches; selecting source/estimate must never initiate linking. Existing local/server draft and partial-act save retained. Explicit worker action preserves confirmed decisions; confirmed parent IDs constrain resource matching. Linked-row selection reveals the exact target and full section/work path, clears incompatible target search/filter, prioritises selected highlight. Compact quantity/unit/amount/action columns; optional norm/price columns; equal/wider/stacked panels; sticky selection detail; units never wrap.
Crane root evidence: duplicate code+name+unit resources under the SAME work have DIFFERENT explicit norms (e.g0.1/0.12). Exact source norma + canonical t2_daraxt norma can distinguish one candidate, not by price/partial quantity/order. Missing/equal norms remain unresolved; capacity/chassis/application difference is a hard review gate. Known full construction-crane exclusion-clause spelling supported in automatic and manual parent-link paths. No global cross-work resource rescue.
REAL READ-ONLY corpus: Downloads/Telegram Desktop/Амфитеатр.xlsx,sha2566a4885ad13e9a55f08aadc7ce41602c7af299642f5b32d94dc2a4e417cfe01e5.1158source rows exactly match job10UIDs. Current canonical object127snapshot10813rows.104previously confirmed parent-work links (resource decisions deliberately excluded):51/51ten-tonne crane rows resolve. Fresh matcher without those parent decisions38/51; source scope still requires operator where ambiguous. Older test without norm tie-break had26/51→35/51with parents; that intermediate is NOT final evidence.
Private receipt:C:/Temp/t2-f2-ui-preview/real-audit.receipt.json. Source bytes untouched. No act/business DB/R2 write or changes to existing owner F2 tab. Existing confirmed links, including human-selected substitutes, are preserved, not silently corrected.
TESTED:1867PASS17skip,249filesPASS8skip; app/functionsTS+build,tekshir,oxlint and governancePASS. Last action-column width-only follow-up:14operator testsPASS, finalbuild pending at commit preparation. Synthetic isolated browser preview confirms one-button batch + linked path/highlight/detail columns/pane proportions. UNKNOWN: authenticated production import with a fresh source; no live act save performed. Deployment not claimed by this pre-release packet.

## 2026-10-12 — FINAL F2 RELEASE
DEPLOYED main c35c672471db3177910e249f9c6aadf027a6314b. Cloudflare production e62f009c-a376-4fc0-bf5c-e0a0c9afb35a success2026-10-12T05:59:06.42516Z (10:59 Asia/Tashkent). GitHub frontend иPages conclusion success. Последняя ширина action-column:14operator tests+app/functionsTS/buildPASS. Full1867testsPASS17skip,249suitesPASS8skip;tekshir/oxlint/governancePASS.
AUTHENTICATED production /admin/f2?obyekt=127 открылся с NEW TIMES BUILDINGS/Amfiteatr и existing resume card Амфитеатр kiritilgan.xlsx2025-10. Карта НЕ активирована, файл НЕ выбран: существующий localdraft и открытая owner F2страница не перезаписаны. Синтетический isolated UI:начальное0связей→одна кнопка3связи,точная пара/путь,правильное выделение;Smeta scrollWidth=clientWidth742px,1536viewport без pageoverflow;detailtoggle иpaneproportions работают. Screenshot private:C:/Temp/t2-f2-ui-preview/f2-panels-final.png.
REAL corpus51/51крана10т при104ранее подтверждённых родительских работах (без подстановки resource decisions),receipt private:C:/Temp/t2-f2-ui-preview/real-audit.receipt.json. Без parent decisions38/51; неоднозначные work scopes остаются для подтверждения. НЕ заявлено100%на любых документах. Финансовый акт/approval,DB/R2writes не выполнялись. Fresh authenticated import→actsave иtenant/logout full vertical smoke UNKNOWN; были отдельно проверены component/draft contracts,real readonly matcher,live authenticated route иexact production deploy.

## 2026-10-12 — FINAL: F2 release b8d3e6ff
CODE/TESTED/PUSHED/DEPLOYED main b8d3e6ff4cf4bdf8462b1770da0db1f772811344. Exact production197bad3a-bb8d-4ab2-a946-6a708caf6e0e success2026-10-12T10:23:43.688529Z (15:23 Asia/Tashkent). GitHub frontend/CloudflarePages conclusions success; job114766032198completed10:26:28Z.1868testsPASS17skip,249suitesPASS8skip;build app/functionsTS,tekshir,oxlint,governancePASS. New regression proves separate expansion button never writes links;browser DOM0nestedbuttons.
Live authenticated /admin/f2?obyekt=127 reload after finaldeploy:NEW TIMES BUILDINGS/Amfiteatr and existing Амфитеатр kiritilgan.xlsx2025-10resume card visible,noerror. Resume/source selection NOT activated; existing localdraft,ownerF2tab,approvedacts,DB/R2 unchanged. Fresh authenticated source→draftactsave/fulltenantlogoutsmoke UNKNOWN. Real readonly1158rowcorpus:51/51ten-tonne crane rows resolved with104confirmedparents,resource decisions excluded;withoutparents38/51,so scope ambiguity still requires review. Source SHA unchanged6a4885ad13e9a55f08aadc7ce41602c7af299642f5b32d94dc2a4e417cfe01e5. Prices/quantities/norms never invented.
Screenshot of actual components with explicitly synthetic data:C:/Temp/t2-f2-ui-preview/f2-panels-final.png; real private matching receipt:C:/Temp/t2-f2-ui-preview/real-audit.receipt.json. Isolated preview server stopped; no private corpus committed. Broad Smetachi task remains ready_for_review because other programme items remain open.
