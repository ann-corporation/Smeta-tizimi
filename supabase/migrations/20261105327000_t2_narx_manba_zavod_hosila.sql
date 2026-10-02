-- Katalog importi (egasi 2026-10-02: "katalog 2026 2-kv Toshkent sh. narxlaridan TTZ zavodidan NDS siz narxi olindi").
-- Yozuvchi qator JSON idagi `guruh` (zavod sarlavhasi) dan zavod nomi, NDS izohi va hududni O'ZI chiqaradi — bitta
-- tahlilchi (_t2_katalog_zavod, migratsiya 321), frontend bilan nomuvofiqlik yo'q. Aniq berilgan qiymat ustun.
begin;

do $$
declare v_def text; v_yangi text; r record;
begin
  v_def := pg_get_functiondef('public._t2_narx_manba_yoz(bigint, jsonb, jsonb, text, bigint, integer, uuid, text)'::regprocedure);
  for r in select * from (values
    ($a$nullif(trim(x.e->>'hudud'), ''), nullif(trim(x.e->>'ishlab_chiqaruvchi'), ''),$a$,
     $b$coalesce(nullif(trim(x.e->>'hudud'), ''), public._t2_katalog_zavod(x.e->>'guruh')->>'hudud'), coalesce(nullif(trim(x.e->>'ishlab_chiqaruvchi'), ''), public._t2_katalog_zavod(x.e->>'guruh')->>'nom'),$b$),
    ($a$nullif(trim(x.e->>'nds_izoh'), ''),$a$,
     $b$coalesce(nullif(trim(x.e->>'nds_izoh'), ''), public._t2_katalog_zavod(x.e->>'guruh')->>'nds'),$b$)
  ) as t(eski, yangi) loop
    if (length(v_def) - length(replace(v_def, r.eski, ''))) / length(r.eski) <> 1 then
      raise exception 'NARX_MANBA_ZAVOD: kutilgan matn aniq 1 marta topilmadi: %', r.eski;
    end if;
    v_def := replace(v_def, r.eski, r.yangi);
  end loop;
  execute v_def;
end $$;

commit;
