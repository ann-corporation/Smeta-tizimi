-- Открытие большой сметы: equality по объекту + ORDER BY/id keyset.
-- Старый PK(id) сканировал строки чужих объектов до первой нужной строки.
-- Аддитивно: ни строки, ни финансовые формулы, ни RLS/grants не меняются.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create index if not exists t2_qator_obyekt_id_kursor_idx
  on public.t2_qator (obyekt_id, id);
