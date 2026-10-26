# Сквозная приёмка: одинаковый путь для оператора и AI

generated_at: 2026-10-26T05:48:29Z  
git_commit: 69db8d45050cc82dfd67baae6dec7153b727a219  
db_migration_head: 20261106510000 / t2_agent_qidiruv_v1

Сценарии — условия приёмки, не отчёт об их полном выполнении. Production writes Codex не выполнял. Synthetic fixtures и disposable DB отделены от текущей сметы владельца. В каждом flow фиксируются sourceSHA, actor/company/object, команда/operation_id, expected version, before/after, receipt и readback; без бизнес-данных/секретов в репозитории.

## 1. Вход и смена компании

Человек с разными ролями в двух компаниях входит password/Google → company-aware index → видит active context. DirectURL/refresh/возврат вкладки сохраняют только допустимый scope. При смене компании прежний job/akt/draft не возобновляется в чужом объекте. Invite/share priority сохраняется. Component nav7PASS; normal-role authenticated switch/logout/login smoke отдельно уL0.

## 2. Смета и каталог

Файл сохраняется с hash/provenance → parser preview → именованные import commands → дерево. Повтор того же файла не создаёт дубль без явного режима. Раздел/работа/ресурс сохраняют parent identity; одинаковый код в другой редакции/разделе не равен той же позиции. Коэффициент предлагается в scope выбранной работы; видно основание и влияние до применения. Ручной выбор и AI вызывают тот же domain preview/command. Unknown норма/цена/сумма показывается как unknown; источник не переписывается. Real source bytes не коммитятся.

## 3. Физический факт и сеть

Измерено120 при смете100 → факт120 остаётся120 после completion marker. Пакет3001строка:3000confirmed/1rejected → список receipts остаётся; discard не стирает успех; refresh перед новым остатком; повтор не превращает100в200. Если ответ unknown → закрыть/открыть modal/перезапустить клиент → тот же immutable command/UUID, пока исход не разрешён. Partial refresh не меняет body подтверждённой попытки. Probes5PASS на PR143/144; markerJQA03 отдельно OPEN.

## 4. Экспертиза и защита выполненного

Две версии сметы с изменёнными кодами/объёмами → scoped matching с ручным review неоднозначного → diff. Выполнено в старой версии, entitlement сокращён → решение владельца и evidence → claim/additional/замена по существующему change model. Нет автоматического отрицательного факта, отмены F2 или потери source revision. Необследованная работа остаётся unknown; наличие воды не является измерением всех скрытых работ. Flow принимает владелец на Sun'iy ko'l с документами, без догадок.

## 5. F2 import / prepare / approval

Импортированный F2 не обязан иметь те же локальные номера, что смета. Work match scoped по разделу/единице/источнику, ресурс — внутри выбранной работы. Дополнение/замена сначала durable draft с точным parent и placement, canonical write — только явное «Saqlash va joriy etish». Уход в history и обратно возвращает job/akt в том же scope. F2 prepare допускает owner-defined режим без обязательного факта, предупреждает об entitlement/ресурсах, не выдумывает их. Бухгалтер читает; F2 write denied по default/server/UI policy. Утверждённый акт заморожен, повтор stable operation_id не дублирует, stale version conflict виден.

## 6. Накопительная / F3 / correction / деньги

Один approved набор F2 → одинаковая строковая база и totals в F2/накопительной/F3; документ_jami и рассчитанное_jami различаются явно, не подгоняются. Net quantity0 при certified amount≠0 остаётся в review. NULL сумма не становится0/фиктивной разницей цены. Correction/supersede сохраняет прошлый акт и lineage; cancel отражается одинаково во всех проекциях. Каждая сумма: устамали основная + устamasiz рядом, НДС отдельно, общий ustamali-summa engine. Сумма F2, сумма договора, оплата и затраты независимы.

## 7. Snapshot / MCP — сначала disposable база

Создать fixture-объект → snapshot → именованная тестовая команда → diff → restore → проверить дерево/FKs/версии/history/approved freeze и tenant. Interrupted restore не оставляет половину объекта; caller видит ошибку. Cron retention не удаляет единственную восстанавливаемую копию. Для MCP проверить actor, before-snapshot→command→audit→commit order; dry_run возвращает тот же preview без persisted DML. Отдельно отрицательные cases SQL transaction-control/comments/quotes. Пока MCP-QA01 OPEN, production dry_run writer smoke не считается безопасной проверкой.

## 8. Выпуск

Exact candidate source → app/functionsTS, lint, i18n guard, site-map, tekshir, build и релевантные regressions. Открытые adversarial probes отдельно, не скрываются общим green. Затем exact-SHA GitHub checks/Pages deployment и authenticated owner vertical smoke (контекст/основные маршруты/switch/refresh/logout/login). Только после этих разных свидетельств L0 объявляет выпуск; наличие health200/401, test count или deployment URL по отдельности недостаточно.
