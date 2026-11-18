-- Rollback: belgi (raw_snapshot.qolTahrir) olib tashlanadi — qoralama qatorlarining hajm/narxi O'ZGARMAYDI (faqat himoya belgisi ketadi).
update public.t2_akt_qator aq
   set raw_snapshot = aq.raw_snapshot - 'qolTahrir'
  from public.t2_akt a
 where a.id = aq.akt_id and a.tur = 'f2' and a.holat = 'qoralama' and aq.raw_snapshot ? 'qolTahrir';
drop function if exists public._t2_f2_qol_belgila_v1(bigint, jsonb);
