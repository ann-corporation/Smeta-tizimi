# Mailbox08 — post-merge QA и отдельные исправления, 26.10.2026

Этот receipt заменяет текущий статус mailbox07; прежние доказательства сохраняются как история. L0 попросил выпускать небольшие независимые PR, общий integration sandbox не переносится вmain.

## Исходники и результаты

- Main source subset a4fe8b65: MCP7/7, marker2/2, Qamrov5/5 PASS. Соответствующие runtime файлы в проверочном checkout совпадают с main; локальный pereraschet patch к ним не относится. GitHub comments на155/154 опубликованы.
- Sidebar153 exactdeb85b44cf189ca3cb3aafcccdb720b2f9d78e1f: independent7/7 +3files38/38 PASS. RoutePermission body сохранён, новый helper используется для меню. Добавленный akkaunt — личный scope. Это не authenticated owner acceptance.
- PR161 a65e7c2591c35794f465a944a40c0eecb2f9872c: JQA01/02, explicitNULL и monetary-only F2 review.28tests и appTS PASS. Исторические акты не переписываются.
- PR162 1195c15519e154c747fdb967833d39b10160ef60: windowed Fakt journal, полный поиск, draft/keyboard retention, компактные опциональные сводки.5files30tests, app/functionsTS,oxlint,tekshir,build PASS. Браузер:1000работ/4000строк,11–13смонтированных строк, сохранены два draft, Tab через край окна, Control+End до3999. Только synthetic read-only API; screenshot C:/Temp/PTO-window-1000-end-20261026.png.
- PR160 dee64acb7958fefe1a835dfd37ee566e8968d147:11 lifecycle overrides;185CANONICAL/4COMPAT/14BACKUP/0TEMP/4NULL, один ownerNULL. Всё ещё старый snapshot06:19UTC/d7bf, не свежий SELECT всех таблиц. Все delete_authorized=false.

## Открытые замечания #157

См.08-version-review-20261026.md и08-live-version-definition-readback.json. P1 — matching RPC сохраняет client old/current quantity и unit flag вместо серверной сверки с source/revision. Действующий pg_get_functiondef прочитан SELECT. P2 — известная подписанная сумма-20 при объёме-2 становитсяNULL; строгий version-review regression oracle FAIL (2остальных cases PASS). Backend writer не вызывался; exploit-пакет не сохранялся. Immutable helper SELECT подтвердил только арифметику, не запись.

25k точных синтетических пар в обратном порядке:159.6ms в локальном Node, bijection/statusPASS; unmatched100+100:51.9ms. Это не browser/production latency, не нагрузка реального объекта. Квадратичные fuzzy scan в большом LS остаются риском; нужны индексы кандидатов/worker и отдельный corpus до изменения matching semantics.

## Границы и порядок

Root governance на maina4fe и обоих узких runtime PR имеет одинаковые23исторических overlap errors. Compare-Object поFAILстрокам пустой после заполнения metadata новых задач. Guard не менялся, незавершённые задачи не закрывались. Нужна явная coordination редакторских слотов, включая Firuza/Studio/reliability/import/public-entry/akkaunt.

L0: review/merge160,161,162 отдельно, после exact CI и coordination;157 — новый correction lane у прежнего автора;153 — текущий scopedPASS, owner visual choice остаётся открытым. Production business writes/DDL/main promotion Codex не делал. Полный общий CI этих PR отслеживается отдельно; старый full3429PASS не приписывать новым heads.

## Воспроизведение

Запускать probes на соответствующем candidate/main с актуальным runtime, а не на старой базе самого QA branch. Изfrontend:

- npx vitest run --config testlar/pto-joint-acceptance-20261025/mcp.config.ts --maxWorkers=1
- npx vitest run --config testlar/pto-joint-acceptance-20261025/completion.config.ts --maxWorkers=1
- npx vitest run --config testlar/pto-joint-acceptance-20261025/candidate.config.ts --maxWorkers=1
- npx vitest run --config testlar/pto-joint-acceptance-20261025/navigation.config.ts --maxWorkers=1
- npx vitest run --config testlar/pto-joint-acceptance-20261025/version-review.config.ts --maxWorkers=1 --reporter=verbose --silent=false

Последний config ожидаемо возвращает1FAIL до исправления signed-money regression; это открытая ошибка, не зелёный gate.


## Финальный exact-head readback
Все5checks накаждомизPR160/dee64acb,161/a65e7c25,162/1195c155 завершилисьSUCCESS (включаяобаfrontendзапуска,mcpиCloudflarebranchpreview). Машинныйreceipt08-final-checks-20261026.json. Это неproductionpromotion. QAartifactbranchgovernancePASS89tasks; runtimecandidatesсохраняют23baselineoverlapsL0. ОбщийCI162:см.logrun40349993751, countнеприписываетсядругимветкам.
