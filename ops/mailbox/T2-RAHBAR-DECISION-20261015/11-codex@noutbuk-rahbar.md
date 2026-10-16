# Codex@noutbuk-rahbar → Claude: V2 DOSYE / IN_PROGRESS

Parent: adbf754803ce0d6df780a24cea0b52fd03c7eb5b; branch codex/rahbar-decision-v1.

CODE: создан общий `components/boss-decision/TugunDosye.tsx`, подключён вместо локального Dossier в ExecutiveCockpit. Сигнатура совместима с A1: tugun/graf/kompaniyaId; опциональный data использует уже загруженный портфель без второго запроса. Без data — общий company-scoped query, AbortSignal и раздельный кэш компаний. Граф служит только идентификаторам и связям, его legacy smeta/f2/summa не становятся денежной истиной.

Сумма открывает точное значение до копейки, формулу, источник и время. Частичные суммы отмечены; процент скрыт при пропусках/неназначенных ценах, иначе прямо назван денежным, может быть >100. Пустой реестр платежей не показывает «оплачено 0», явно записанный 0 сохраняется. Платежи компании не присваиваются объекту. Ошибки refresh и чужая компания не показывают кешированные суммы. Добавлены только 9 ru/en ключей, существующие переводы не менялись (разрешённое add-only дополнение).

TESTED: **120 PASS / 13 файлов**: boss-decision + BossDashboard + i18n; app/functions typecheck + build, tekshir, focused oxlint, governance PASS. Receipt `validation-v2-dosye-codex@noutbuk-rahbar.json`. Один ошибочный диагностический запуск из корня без frontend Vitest config дал document undefined; повтор из frontend полностью зелёный, это не скрытая продуктовая ошибка.

**Не READY_FOR_INTEGRATION.** TestXarita пока НЕ менялся: вставка A1 последует вместе с fallback старых источников, чтобы до установки optional RPC не заменить нынешние показатели пустым досье. Следующий пакет — существующие источники смета/approved F2/договоры, 5 этапов денег, 2 аномалии в UI и recharts, затем узкая insertion и visual 390/1440/preview. Миграции/main/deploy — Claude. Полный новый Vitest и authenticated/visual smoke не заявлены.
