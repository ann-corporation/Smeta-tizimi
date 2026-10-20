# Интеграция разрешений

Policy в базе этой ветки совпадает с origin/main. Для нового API требуется ровно регистрация contract-scope и соответствие GET=smeta.read, POST=smeta.write. Узкая субаренда из собственной ready_for_review задачи T2-ROLES-CONTROL-20261017 зафиксирована в owns. Остальные роли/permissions/middleware не меняются. База дополнительно проверяет текущее членство и permission в каждом RPC, включая replay.
