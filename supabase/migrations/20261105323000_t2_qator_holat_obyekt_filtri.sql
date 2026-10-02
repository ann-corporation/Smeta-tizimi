-- Tezlik (egasi 2026-10-02: "20 ta fakt saqlashda 10 minut 'saqlanmoqda' — nima uchun bunaqa sekin").
-- t2_qator_holat — butun t2_qator ustidan GROUP BY qiladigan ko'rinish. Uni faqat `h.id = ...` bilan qo'shish
-- obyekt filtrini ichkariga tushirmaydi: Postgres BARCHA obyektlarning ~140 ming qatorini guruhlaydi (2,5 s, diskka sort).
-- `h.obyekt_id = <obyekt>` qo'shilsa — faqat shu obyekt (Game Club: 2496 ms → 20 ms). Mantiq o'zgarmaydi: qator
-- baribir shu obyektga tegishli (har funksiya buni oldindan tekshiradi).
begin;

do $$
declare
  v_def text; v_yangi text;
  r record;
begin
  for r in
    select * from (values
      ('public.t2_akt_yarat'::regproc::oid, 'join t2_qator_holat h on h.id=k.qator_id)', 'join t2_qator_holat h on h.id=k.qator_id and h.obyekt_id=p_obyekt_id)'),
      ((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 't2_akt_tasdiqlash'),
        'from t2_akt_qator aq join t2_qator_holat h on h.id = aq.qator_id', 'from t2_akt_qator aq join t2_qator_holat h on h.id = aq.qator_id and h.obyekt_id = v_akt.obyekt_id'),
      ((select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 't2_fakt_belgila_v2'),
        'from public.t2_qator_holat h where h.qator_id=p_qator_id;', 'from public.t2_qator_holat h where h.qator_id=p_qator_id and h.obyekt_id=p_obyekt_id;')
    ) as t(foid, eski, yangi)
  loop
    v_def := pg_get_functiondef(r.foid);
    if (length(v_def) - length(replace(v_def, r.eski, ''))) / length(r.eski) <> 1 then
      raise exception 'HOLAT_FILTR: % da kutilgan matn aniq 1 marta topilmadi', r.foid::regproc;
    end if;
    v_yangi := replace(v_def, r.eski, r.yangi);
    execute v_yangi;
  end loop;
end $$;

commit;
