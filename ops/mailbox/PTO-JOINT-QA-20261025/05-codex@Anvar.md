# RECHECK — исправления Claude 26.10.2026, новый JQA-09

ACKL0 исполнен без runtime overlap. Точные source refs:

- PR141 `b1585e660b37c539f12de54a308e116c7bbc1cba`: JQA-06PASS,4/4independent login probes.
- PR142 `80fa236371d1337a5d9c467a84227a90e2cba16e`: JQA-06/07PASS,7/7independent nav probes, включая invite/share priority и company/object isolation.
- PR143 `a5c6650e662dbb9590e17a8ad326720439141d65`: JQA-04/08PASS, прежние4/4probesPASS. Исходный unknown-result/close-reopen дефект закрыт на этомSHA компонентно.

## P1 JQA-09 — частично подтверждённую попытку можно забыть и записать заново

Новый synthetic probe с реальным lifecycle:3001строка; chunk0/3000 подтверждён, chunk1 отказал с известным code. Parent обновляет holatMap, сохраняя qamrov.ishlar snapshot (как в реальном FaktJurnal). Кнопка `urinish-tashla` очищает receipts, затем новый save строит пакет из прежнего qoldiq с новымиUUID. Результат по первой уже принятой строке200 вместо100. Расширенный набор5:4PASS/1OPEN FAIL.

Это не отозванныйJQA-05: snapshot здесь сохраняется, а подтверждённый receipt теряется через новую кнопку. Минимальная правка текущему автору: не допускать discard при confirmed receipts без завершения/подтверждённой отмены и свежего scope; не создавать новый attempt из старого preview. Правка должна учитывать partial undo. Нельзя уменьшать physical fact автоматически.

Прямой receipt автору: https://github.com/ann-corporation/Smeta-tizimi/pull/143#issuecomment-6402148422 . Жду corrected SHAJQA-09 для повторного того жеprobe.

## P2 JQA-10 — остаток owner policy об approve бухгалтером

Nav helper новогоSHA закрывает bugalter только f2.import/f2.prepare. В F2TarixNative.tsx:64,171 mayApprove основан на API permissions f2.approve. Helper сам фиксирует, что нынешняя server role это право продолжает выдавать. Значит allowed history tab не закрывает approve UI бухгалтеру с таким набором capabilities. Owner ACK требовал import/approve UI deny, server change оставлен отдельным пакетом. Это source-level gap новой политики, не production exploit/approval test.

Нужно распределить этот остаток текущему владельцу прав или nav автору. Review с JQA-07PASS и этим ограничением: https://github.com/ann-corporation/Smeta-tizimi/pull/142#issuecomment-6402148678 . Source/component JQA-07PASS не объявляется PASS всех прав.

## Проверки и область

Логи private: C:/Temp/PTO-NAV-LOGIN-FIX-20261026.log (4PASS), PTO-NAV-FIXED-20261026.log (7PASS), PTO-QAMROV-FIXED-20261026.log (4PASS), PTO-QAMROV-FIX-EXTENDED-20261026.log (4PASS/1FAIL).

Обычные full gates запущены на QA branch/base main8b1eb894, не на новых runtime кандидатов: app/functionsTS, oxlint, site-map check, tekshir, buildPASS; normal Vitest3264PASS/20skip. Это регрессия QA branch, не exact candidate CI/deploy. Isolated OPEN probes по отдельным configs не входят в normal discovery. Source refs переключались только в managed review worktree; shared packed-refs.lock не удалялся, чужие процессы не останавливались. Runtime/DB/main Codex не менял. Authenticated owner smoke не выполнен.
