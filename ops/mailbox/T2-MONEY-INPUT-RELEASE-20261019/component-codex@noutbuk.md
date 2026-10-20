---
agent: codex
machine: noutbuk
date: 2026-10-19
task: MONEY-INPUT-20261019
base_sha: 4412fe75146b6845433ec73297f6d95cfbd9e258
status: SOURCE READY / TESTED / VERIFIED LOCAL
transport: local-only; parent owns registration, commit, push and release
---

# MoneyInput — компонент, Codex / noutbuk

Прямое делегирование владельца. Работа только в выделенных новых файлах;
существующие callers, package, словари, регистрация и выпуск — родительский агент.
Git-мутации, push и production-действия не выполнялись. Это локальный результат,
не BRANCH PUSHED и не межмашинный handoff до публикации родителем.

## Выполнено

- `frontend/src/umumiy/ui/MoneyInput.tsx`
- `frontend/src/umumiy/ui/MoneyInput.test.tsx`
- `frontend/src/lib/money-input/index.ts`
- `frontend/src/lib/money-input/money-input.test.ts`
- Эта запись и отдельная разрешённая заметка Obsidian.

Прочитаны governance boot, ACTIVE_TASKS и INBOX; отдельного принятого контракта
MoneyInput в architecture/reviews не найдено. Регистрацию оставили родителю.
Во время работы в checkout появились многочисленные параллельные изменения
родителя; они не откатывались и не исправлялись этим агентом.

## Контракт для интеграции

`value?: string | number | null`, `defaultValue?`, обязательный
`onValueChange(raw: string)`, `grouping=true`, `ungroupedType?`.
Нативные `onChange/type` исключены из TypeScript props. Forwarded ref указывает
на настоящий input; blur/key/select/composition/paste обработчики получают
настоящие React/native events. Нет fake ChangeEvent, monkey patch или global listeners.

Money-режим всегда `type=text`, по умолчанию `inputMode=decimal`.
ASCII-пробелы разделяют только целые разряды по три. Callback получает строку
без группировки с точкой: `-1 234,0500` → `-1234.0500`.
Дробная точность, ведущие/замыкающие нули, завершающая точка сохраняются.
Значения не округляются; десятичные строки не переводятся в Number.
NBSP и narrow NBSP поддержаны. Некорректная вставка целиком отклоняется:
`12 34`, `1,234.56`, текст валюты, переносы строк и т. п.

String/uncontrolled режим передаёт промежуточные `''`, `'-'`, `'.'`, `'-.'`.
Не превращайте такие строки без проверки в Number. Для **фактически числового
controlled value** `'-'`, `'.'`, `'-.'` удерживаются внутренним черновиком,
не вызывая callback и не попадая как NaN в родительский Number(raw).
После цифры callback вызывается. Если числовой echo точно эквивалентен raw,
сохраняются его исходное написание и каретка: `1.`, `1.00`, `-.500`.
Изменение внешнего значения сбрасывает неактуальный черновик; повторная передача
того же числа не означает команду сброса черновика.

Пустой ввод всё равно вызывает callback `''`. Владелец состояния обязан явно
решить blank/null; `Number('')` в caller даст 0, компонент это решение не принимает.
`null` и `''` отображаются пустыми без callback на mount/update, явный 0 — `0`.
Защита numeric draft определяется текущим `typeof value === 'number'`;
для `value=null`/строкового состояния caller должен безопасно принимать черновики.
Для произвольной точности и сумм вне IEEE-754 используйте строковое состояние:
компонент не может восстановить точность, которую потерял Number(raw) у caller.
Некорректный внешний money value и nonfinite number вызывают TypeError.

`grouping=false` — полный passthrough текста, без нормализации/валидации суммы,
callback передаёт ровно DOM value. `ungroupedType` сохраняет нативный тип;
для number браузер сам определяет допустимое представление. inputMode по умолчанию
в этом режиме не навязывается. При grouping=true ungroupedType игнорируется.

## Валидация

Неуказанный money step означает **any**: цена `1234.123456` допустима.
Явные min/max/step проверяются точной BigInt-десятичной арифметикой, включая
step=`1e-2`; step base = min, иначе defaultValue, иначе 0. Неположительный или
некорректный явный step использует fallback 1. Пустое optional поле допустимо;
required остаётся нативным. Незавершённый непустой черновик невалиден.
Дробные ограничения не обрезают и не округляют ввод.
Результат доступен через `validity.customError`, `checkValidity()` и
`reportValidity()`/валидацию формы; отдельные rangeUnderflow/rangeOverflow/
stepMismatch флаги у text-input остаются нативно false. С группировкой false
работают нативные числовые флаги. Существующий ключ t():
`Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.` Новых ключей нет.

Именованный money input в FormData содержит **display**, а не raw.
Сохранение денег — через onValueChange. Hidden input не добавлен по согласованной
границе задачи и инвентаризации родителя (money FormData consumers отсутствуют).

## Проверки

- Vitest: **55 PASS / 2 файла**, 0 fail. Запуск из frontend:
  `npx vitest run src/lib/money-input src/umumiy/ui/MoneyInput.test.tsx`.
- Проверены точные суммы, отрицательные черновики, comma/NBSP, trailing cents,
  malformed paste, middle edit/range replacement, caret, Backspace/Delete у пробела,
  mobile inputType deletion, composition и внешний update, ref/blur/keydown,
  numeric parent Number(raw), passthrough type=number и exact constraints.
- Scoped TypeScript: PASS с `--ignoreConfig --noEmit --target es2023 --module esnext
  --moduleResolution bundler --jsx react-jsx --skipLibCheck --lib es2023,dom
  --types vite/client` для этих четырёх файлов.
- Scoped oxlint: PASS, без предупреждений. Собственные файлы без trailing whitespace.
- `node ops/governance-check.cjs`: PASS (81 tasks); WARN stale CURRENT_STATE main_sha.
- Общий app tsc во время параллельной миграции: FAIL, 4 ошибки type='money'
  в чужих Narxlar.tsx:359 и Shartnoma.tsx:436/437/500. Родитель исправляет callers;
  этот результат не доказывает состояние его позднейших изменений.
- Общий `git diff --check`: FAIL по whitespace в чужих TestBirja.tsx:303/304,
  TestErp.tsx:180 на момент проверки. Эти строки не тронуты.

Браузерный/реальный IME/мобильный smoke, полная caller-интеграция и production
не проверялись: jsdom-тесты не являются подтверждением этих слоёв.

## Ход работы

1. Governance/ownership boot; новая реализация и строковая грамматика.
2. По уточнению владельца добавлен verbatim grouping=false и ungroupedType.
3. По риску интегратора добавлен numeric transient buffer и точная constraint validation.
4. По уточнению владельца default step изменён на any, добавлен 6-decimal regression.
5. SOURCE READY / TESTED локально. Callers, словари, release — родитель.
