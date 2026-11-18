-- Rollback: tombstone (raw_snapshot.qolTahrir.olib) olib tashlanadi — qatorlar o'zgarmaydi (faqat himoya belgisi ketadi).
update public.t2_akt_qator aq
   set raw_snapshot = jsonb_set(aq.raw_snapshot, '{qolTahrir}', (aq.raw_snapshot->'qolTahrir') - 'olib')
  from public.t2_akt a
 where a.id = aq.akt_id and a.tur = 'f2' and a.holat = 'qoralama' and aq.raw_snapshot->'qolTahrir' ? 'olib';
drop function if exists public._t2_f2_qol_olib_belgila_v1(bigint, jsonb);
