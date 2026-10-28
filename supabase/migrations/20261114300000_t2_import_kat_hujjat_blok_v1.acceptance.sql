-- Acceptance: 20261114300000 — import qatoridagi hujjat blok kategoriyasi (kat_manba='hujjat_blok').
-- SINTETIK obyekt / sessiya / qatorlar (real mijoz ma'lumoti yo'q). BEGIN … ROLLBACK: hech narsa saqlanmaydi.
--   A1 ikkala import yakunlovchida marker bor.
--   A2 zagotli blokdagi beton м³ (kat МАТ, hujjat_blok) — trigger'ga qaramay МАТ qoladi.
--   A3 zagotsiz blok resursi (kat БЕЗСКЛАД, hujjat_blok) — БЕЗСКЛАД.
--   A4 kat_manba yo'q beton м³ — avvalgidek trigger: БЕЗСКЛАД (eski xatti-harakat o'zgarmagan).
--   A5 ruxsat etilmagan qiymat (ЧЕЛ) e'tiborsiz — birlik/registr bo'yicha kategoriya qoladi.
begin;
do $acc$
declare
  v_k bigint; v_a bigint; v_o bigint; v_s bigint; r jsonb; fn text; d text;
  kat_ text;
begin
  foreach fn in array array['t2_smeta_import_yakunla_unlocked_v1','t2_smeta_paket_import_yakunla_unlocked_v1'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fn;
    if position('kat_hujjat_blok_v1' in d) = 0 then raise exception 'A1: % da marker yo''q', fn; end if;
  end loop;

  select f.id into v_a from public.t2_foydalanuvchi f where f.holat = 'faol' and public.t2_platforma_superadmin(f.id) order by f.id limit 1;
  select k.id into v_k from public.t2_kompaniya k where k.faol order by k.id desc limit 1;
  if v_a is null or v_k is null then raise notice 'superadmin aktor yoki faol kompaniya yo''q — funksional tekshiruv o''tkazib yuborildi'; return; end if;

  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV kat_hujjat_blok', v_k) returning id into v_o;
  insert into public.t2_smeta_import_sessiya (kompaniya_id, obyekt_id, actor_id, operation_id)
    values (v_k, v_o, v_a, gen_random_uuid()) returning id into v_s;
  insert into public.t2_smeta_import_bolak (sessiya_id, bolak, qatorlar, qator_soni) values (v_s, 0, jsonb_build_array(
    jsonb_build_object('local_id','rz','tur','rz','nom','РАЗДЕЛ СИНОВ'),
    jsonb_build_object('local_id','bl','parent_local_id','rz','tur','bl','kod','E6-1-1','nom','БЕТОНИРОВАНИЕ СИНОВ','birlik','М3','hajm','1'),
    jsonb_build_object('local_id','r1','parent_local_id','bl','tur','rs','kod','X-1','nom','БЕТОН ТЯЖЕЛЫЙ СИНОВ В15','birlik','М3','hajm','2','narx','500','summa','1000','kat','МАТ','kat_manba','hujjat_blok'),
    jsonb_build_object('local_id','r2','parent_local_id','bl','tur','rs','kod','X-2','nom','ЩЕБЕНЬ СИНОВ','birlik','М3','hajm','4','narx','100','summa','400','kat','БЕЗСКЛАД','kat_manba','hujjat_blok'),
    jsonb_build_object('local_id','r3','parent_local_id','bl','tur','rs','kod','X-3','nom','БЕТОН ТЯЖЕЛЫЙ СИНОВ В20','birlik','М3','hajm','1','narx','600','summa','600'),
    jsonb_build_object('local_id','r4','parent_local_id','bl','tur','rs','kod','X-4','nom','ЦЕМЕНТ СИНОВ','birlik','Т','hajm','1','narx','900','summa','900','kat','ЧЕЛ','kat_manba','hujjat_blok')
  ), 6);

  r := public.t2_smeta_import_yakunla_unlocked_v1(v_k, v_a, v_s);
  if coalesce(r->>'ok','') <> 'true' then raise exception 'import yakunlanmadi: %', r; end if;

  select kat into kat_ from public.t2_qator where obyekt_id = v_o and kod = 'X-1';
  if kat_ is distinct from 'МАТ' then raise exception 'A2: hujjat МАТ beton % bo''lib qoldi', kat_; end if;
  select kat into kat_ from public.t2_qator where obyekt_id = v_o and kod = 'X-2';
  if kat_ is distinct from 'БЕЗСКЛАД' then raise exception 'A3: zagotsiz blok resursi %', kat_; end if;
  select kat into kat_ from public.t2_qator where obyekt_id = v_o and kod = 'X-3';
  if kat_ is distinct from 'БЕЗСКЛАД' and not public.t2_bez_sklad_operator_rad(v_k, 'БЕТОН ТЯЖЕЛЫЙ СИНОВ В20', 'М3') then
    raise exception 'A4: kat_manba yo''q beton trigger bo''yicha БЕЗСКЛАД emas: %', kat_;
  end if;
  select kat into kat_ from public.t2_qator where obyekt_id = v_o and kod = 'X-4';
  if kat_ = 'ЧЕЛ' then raise exception 'A5: ruxsat etilmagan hujjat kategoriyasi qo''llandi'; end if;
  raise notice 'kat_hujjat_blok_v1 acceptance: OK';
end $acc$;
rollback;
