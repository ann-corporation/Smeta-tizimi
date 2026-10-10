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
