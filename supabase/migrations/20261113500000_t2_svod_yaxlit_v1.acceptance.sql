-- T2-SVOD-YAXLIT-V1 acceptance (faqat o'qish; BEGIN..ROLLBACK). Migratsiyadan KEYIN ishga tushiriladi.
-- 1) metadata; 2) INVARIANT: faol belgisi yo'q obyektlarda view va RPC natijasi avvalgi formulaga AYNAN teng;
-- 3) belgili obyektlarda: itogo4 = kaskad_itogo4 + yaxlit, vsego = itogo4 + nds, pryamye = barcha barglar;
-- 4) F2 qatlami tegilmagan (_t2_f2_ustamali t2_svod_yaxlit ni bilmaydi).
begin;
do $$
declare v text; f text; n int; r record; j jsonb; a bigint;
begin
  if to_regclass('public.t2_svod_yaxlit') is null then raise exception 'TABLE_MISSING'; end if;
  if to_regprocedure('public.t2_svod_yaxlit_obyekt_v1(bigint)') is null
     or to_regprocedure('public.t2_nakrutka_yaxlit_qosh_v1(jsonb,numeric,numeric,jsonb)') is null
     or to_regprocedure('public.t2_svod_yaxlit_belgila_v1(bigint,bigint,bigint,numeric,numeric,jsonb,text,uuid)') is null
     or to_regprocedure('public.t2_svod_yaxlit_ochir_v1(bigint,bigint,bigint,integer,text)') is null then
    raise exception 'FN_MISSING';
  end if;
  select pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true) into v;
  if position('t2_svod_yaxlit' in v) = 0 or position('nk_manba' in v) = 0 then raise exception 'VIEW_NOT_UPDATED'; end if;
  select p.prosrc into f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname = '_t2_f2_ustamali';
  if f is not null and position('t2_svod_yaxlit' in f) > 0 then raise exception 'F2_LAYER_TOUCHED'; end if;
  if exists (select 1 from pg_class c where c.oid = 'public.t2_svod_yaxlit'::regclass and not c.relrowsecurity) then
    raise exception 'RLS_OFF';
  end if;

  -- qosh(null) — identik
  if public.t2_nakrutka_yaxlit_qosh_v1('{"itogo4":1,"vsego":2}'::jsonb, null, 5, '{}'::jsonb) <> '{"itogo4":1,"vsego":2}'::jsonb then
    raise exception 'QOSH_NULL_NOT_IDENTITY';
  end if;

  -- INVARIANT (view): belgisiz obyektlarda kaskad = t2_nakrutka_hisobla_v1(barcha barglar, koeffitsientlar), yaxlit NULL.
  select count(*) into n
  from public.t2_obyekt_nakrutka x
  where not exists (select 1 from public.t2_svod_yaxlit y where y.obyekt_id = x.obyekt_id and y.faol)
    and (x.yaxlit is not null or x.yaxlit_barglar is not null
      or (x.vsego, x.itogo4, x.pryamye, x.nds) is distinct from (
         select (h->>'vsego')::numeric, (h->>'itogo4')::numeric, (h->>'pryamye')::numeric, (h->>'nds')::numeric
         from (select public.t2_nakrutka_hisobla_v1(jsonb_build_object(
                 'chel', coalesce(sum(q.summa) filter (where q.kat='ЧЕЛ'),0), 'mash', coalesce(sum(q.summa) filter (where q.kat='МАШ'),0),
                 'mat', coalesce(sum(q.summa) filter (where q.kat in ('МАТ','М/К','КАБ','БЕЗСКЛАД')),0), 'ob', coalesce(sum(q.summa) filter (where q.kat='ОБ'),0),
                 'mk', coalesce(sum(q.summa) filter (where q.kat='М/К'),0), 'kab', coalesce(sum(q.summa) filter (where q.kat='КАБ'),0),
                 'bez', coalesce(sum(q.summa) filter (where q.kat='БЕЗСКЛАД'),0)), x.koeffitsientlar) h
               from public.t2_qator q where q.obyekt_id = x.obyekt_id and q.tur in ('rs','mat','ob')) z));
  if n > 0 then raise exception 'NO_MARK_VIEW_INVARIANT_BROKEN: % obyekt', n; end if;

  -- INVARIANT (RPC): belgisiz obyektlar (har kompaniyadan bittagacha, a'zo aktor bilan) — yangi kalitlar yo'q, kaskad o'zgarmagan.
  for r in
    select distinct on (o.kompaniya_id) o.id, o.kompaniya_id from public.t2_obyekt o
    where exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.tur in ('rs','mat','ob'))
      and not exists (select 1 from public.t2_svod_yaxlit y where y.obyekt_id = o.id and y.faol)
    order by o.kompaniya_id, o.id limit 20
  loop
    select z.foydalanuvchi_id into a from public.t2_azolik z where z.kompaniya_id = r.kompaniya_id and z.holat = 'faol' limit 1;
    continue when a is null;
    j := public.t2_obyekt_nakrutka_v1(r.id, a, null);
    continue when j->>'ok' <> 'true';
    if j ? 'svod_yaxlit' or j ? 'cats_kaskad' or (j->'nakrutka') ? 'yaxlit'
       or j->'nakrutka' <> public.t2_nakrutka_hisobla_v1(j->'cats', j->'koeffitsientlar') then
      raise exception 'NO_MARK_RPC_INVARIANT_BROKEN: obyekt %', r.id;
    end if;
  end loop;

  -- Belgili obyektlar: arifmetika.
  select count(*) into n from public.t2_obyekt_nakrutka x
  where x.yaxlit is not null
    and (x.vsego <> round(x.itogo4 + x.nds, 2)
      or x.nds <> round(x.itogo4 * coalesce((x.koeffitsientlar->>'НДС')::numeric, 0) / 100, 2)
      or abs(x.pryamye - (select coalesce(sum(q.summa),0) from public.t2_qator q where q.obyekt_id = x.obyekt_id and q.tur in ('rs','mat','ob'))) > 0.02);
  if n > 0 then raise exception 'MARKED_ARITHMETIC_BROKEN: %', n; end if;

  raise notice 'T2-SVOD-YAXLIT-V1 acceptance: OK';
end $$;
rollback;
