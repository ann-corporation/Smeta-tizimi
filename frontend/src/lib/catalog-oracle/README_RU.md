# L3 — regression oracle для принятия каталогов

План: Obsidian `BOSH_REJA_2026-10-21`, §5, L3. Ветка `codex/catalog-adoption-20261021`; base `706967d308a641da8af74c0782bc6de7fb927a01`. Владелец Codex@Anvar. Только этот каталог; UI, production calculation engine, миграции и активные R2 pointers не изменены. Интеграция и release — L0 Claude.

## Что проверяется

`fixtures/construct-scope.json` — 13 выбранных настоящих ответов установленного Construct 2.7.3 `NormRepository.Corrections`, 26 исходных правил и 609 областей действия. Это нормативные reference-данные, не сметы заказчика; имена людей, объектов и цены клиента отсутствуют. `calculation_approved=0` сохранён. SHA-256 базы и полного core-oracle записаны в fixture. Правила/targets взяты из проверенного локального пакета без изменения значений; ожидаемые `core_records` независимо записаны через установленный DLL.

Происхождение: `D:\CatalogMigration\coefficient-foundation-20261021-v1\coefficient-reference.sqlite`, `core_corrections.jsonl`, `matching_validation.json`. Полный пакет ранее сверял 42 608 работ с нулём расхождений; эти тесты повторяют только 13 выбранных случаев и границы. Не выдавать их за повторный полный аудит или проверку настоящего GUI.

`coefficient-scope.ts` — независимый acceptance matcher для reference-пакета. Не используется production-кодом. Семантика из исходного SQL: kind/cc совпадают; затем otdel='*' либо otdel/tbl совпадают и n_from=0 либо номер включительно BETWEEN n_from и n_to; несколько подходящих targets дают одно правило. Scope-match не подтверждает условия на объекте или возможность совместного применения нескольких коэффициентов.

`fixtures/catalog-cases.json` — полностью синтетические числа, явно помеченные TEST_ONLY. Это примеры арифметики, а не выдуманные рыночные цены или нормативные факты. Производственный Studio calculator/command/export проверяется напрямую: база 1000 м³, NULL/0, EXACT/MISSING/AMBIGUOUS, неизвестная база, отсутствие recipe, accepted/unaccepted, preview/undo/redo, immutable edition snapshots, неизвестная цена при экспорте. Cross-company negative test вызывает настоящий HTTP handler с синтетической подписанной сессией и запретом сетевого fetch: доказывает отказ до RPC, но не проверяет live DB RLS.

## Два открытых дефекта текущего adapter (для L0)

- **GAP-COEF-001:** `jadvalKalitlari('Е01-01-001-1junk')` ошибочно возвращает валидный ключ. Regex не закреплён в конце. Desired: пустой список; отдельно запретить завершающий перевод строки.
- **GAP-COEF-002:** правило, ограниченное строками 2–3, проходит для `Е1-1-1` без номера строки: `r == null` разрешает применение. Desired: для row-limited правила неполный код не подходит.

Последние два теста явно фиксируют **наблюдаемые дефекты**, а не желаемое исправленное поведение. Зелёный результат означает, что дефекты воспроизведены. L0 должен исправить adapter в своей lane и инвертировать эти assertions в том же PR. Нельзя сообщать, что эти дефекты закрыты. Исторические 116 coefficient gate findings — отдельный baseline, здесь не переаттестован.

## Запуск и передача

Из `frontend`: `npx vitest run src/lib/catalog-oracle` — 46 tests. Дополнительно `npx tsc -b` и `npx oxlint src/lib/catalog-oracle`. Commit содержит только `frontend/src/lib/catalog-oracle/**`. До merge L0 выполняет актуальный общий CI и review; нормативное утверждение, production подключение 517 правил и GUI before/after остаются за рамками L3.

На исходном base governance-check уже содержит ошибки: у `T2-NARX-ISHONCH-001` отсутствуют depends_on/must_read и production_write_allowed не false; owns AdminShell пересекаются у старых T2-RAHBAR-DECISION-20261015/T2-ROLES-CONTROL-20261017. L3 не редактирует чужие задачи. Это не PASS и требует сверки L0 с актуальным реестром.

Ранее начатый UI/reference WIP сохранён в `D:\CatalogMigration\coefficient-foundation-20261021-v1\integration-wip-before-L3`, исключён из ветки; это непроверенный материал для review, не внедрённая функция. Локальный `runtime-reference` также не опубликован. Общий индекс аудитов и основное задание: Obsidian `CATALOG_ADOPTION_CLAUDE_2026-10-21` и `CATALOG_AUDIT_EXPANSION_2026-10-20`.

Дополнения L0: у каждого fixture/case теперь SHA и edition; synthetic arithmetic SHA относится к явному TEST_ONLY source_text. UNKNOWN_WORK и NO_SOURCE_CANDIDATES различаются. Gate отдельно блокирует неподтверждённое условие, NULL/zero factor и ADDITIVE/UNKNOWN operation; он не изменяет production calculator.

