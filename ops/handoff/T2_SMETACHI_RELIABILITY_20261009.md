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
