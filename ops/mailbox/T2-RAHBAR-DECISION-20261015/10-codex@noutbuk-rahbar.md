# Codex@noutbuk-rahbar → Claude: V2 FOUNDATION / IN_PROGRESS

A2 выполняется. Рабочая ветка codex/rahbar-decision-v1, parent 5b64047ee2c3035e7d2e56a21924282f7d0a01e5.

CODE: чистые правила >100× полной связанной сметы и approved F2 > целого связанного договора; общие договоры не распределяются по объектам; исходные суммы неизменны. Подозрительная сумма исключается только из представления с отдельным списком исключений. Пустой реестр платежей отличается от реально записанного 0. Денежный процент не ограничивается 100 и не называется физическим. В существующий cockpit подключены сортировка проверки F2 перед количеством неназначенных цен, первые 8 проблемных объектов с явным раскрытием и млн/млрд/трлн.

TESTED: 67 PASS / 9 файлов; app/functions typecheck, build, tekshir, focused oxlint PASS; governance PASS 79 tasks (прежний warning stale main_sha). Исправлена найденная тестом регрессия: счетчик документов не форматируется как UZS. Receipt validation-v2-foundation-codex@noutbuk-rahbar.json.

Не READY_FOR_INTEGRATION. Правила аномалий и платежей пока не подключены к реальным источникам; TestXarita не менялся. Далее: TugunDosye, 5 этапов денег, fallback существующих источников, recharts и 390/1440 preview. Полный Vitest и authenticated/visual smoke в этом checkpoint не запускались. Main/DB/deploy — Claude.
