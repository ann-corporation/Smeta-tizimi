# C11 — ежедневные KELDI / BERDIM / журнал

Ввод работает через существующий object warehouse command, без Excel: явные дата/объект, материал/единица/количество, поставщик/получатель, назначение и документ. Полное подтверждение, stable operation_id, сохранение и восстановление неизвестного исхода, synchronous double-click guard. Подсказки из текущего tenant/object, первый объект не выбирается автоматически, запоздалые ответы другой компании отбрасываются.

Журнал больше не заглушка: читает t2_sklad_harakat, actual `yaratildi`, автора/статус/получателя/основание. Текстовые NULL — неизвестны. При неполной выборке есть предупреждение. Исторический Excel review остается вторичным инструментом. Центральный склад не привязан к фиктивному объекту и не переключен этим PR.

Проверка:13 focusedPASS (form7+journal2+i18n4), scoped lint0warning, app/functionsTS+buildPASS. Parent browser synthetic receipt: sheb → actual candidate → м3/provider → full review → synthetic journal. Прототип явным баннером сообщает synthetic/noDB; данные source не в Git. Не считать это production smoke или подтверждением всей цепи MOL.

Текущий legacy RPC проверен по закрытому schema snapshot: возвращает definite no-stock rejection до изменения строк; UI разрешает исправление только этих точных отказов. Остальные неясные ответы заморожены для retry. Legacy name-only stock key и replay-before-scope остаются предметом серверного hardening/перехода C11.1; UI не доказывает их исправление. Приемка получателем, transfer, M29 linkage, supplierAP/voice issue parsing — следующие вертикали; не закрывать C11 целиком.

Root governance:3 foreignbaseline failures (AKKAUNT productionflag,2 AKKAUNT/DIZAYN overlaps); guard не отключался. Main merge/deploy L0, production writes не выполнялись. Новый module-local сервис позволяет isolated synthetic UI tests; production default всегда существующий API.
