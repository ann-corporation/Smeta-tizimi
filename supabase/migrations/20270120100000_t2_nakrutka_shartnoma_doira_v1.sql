-- T2-NAKRUTKA-SHARTNOMA-DOIRA-V1 (egasi 2026-11-20): ustama (nakrutka) foizlari SHARTNOMA darajasida qo'llanadi.
--
-- Muammo: obyekt smeta podvali shartnoma koeffitsientidan ustun (_t2_obyekt_nk_v1), shuning uchun bir shartnoma ichidagi
-- obyektlarda har xil «effektiv %» paydo bo'lgan (bir obyekt podvali boshqasiga mos kelmagan).
-- Qoida: bir shartnomadagi obyektlar bir xil foiz oladi. Obyekt podvali shartnoma foizidan FARQ qilsa — faqat dalilli ISTISNO
-- (podval qatori `istisno_dalil` matni) bilan saqlanadi; dalilsiz farq rad etiladi.
--
-- 1) t2_podval_shartnoma_farq_v1(p_obyekt_id, p_qatorlar default null) — obyekt podvali (yoki taklif qilingan qatorlar) bilan
--    shartnoma t2_nakrutka_koef foizlari farqi: (kod, koef_kod, obyekt_foiz, shartnoma_foiz, istisno_dalil).
--    Faqat hisobga kiradigan qatorlar (tur='foiz', manba='smeta', foiz son) va shartnomada AYNAN shu koef bor kodlar.
-- 2) t2_nakrutka_podval_saqla_v1 — imzo O'ZGARMAGAN. Obyekt shartnomaga bog'langan va foiz farqli bo'lsa, dalilsiz farq
--    SHARTNOMA_FOIZIDAN_FARQ bilan rad etiladi. Tahrirda o'zgarmagan (avvalgi versiyadagi) farqli qatorlar to'xtatmaydi
--    (meros farqlar farq funksiyasi bilan topiladi va ongli tuzatiladi).
-- 3) Obyekt podvali yoki shartnoma/kompaniya t2_nakrutka_koef o'zgarganda QORALAMA F-2 lar podvali (t2_akt_podval,
--    blok '', manba smeta/backfill) _t2_obyekt_nk_v1 dan qayta yoziladi. import/storno podvali va tasdiqlangan F-2 ga TEGILMAYDI.
-- Additiv; asl smeta qatorlari o'zgarmaydi. Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.

begin;

-- ---- 1. Farq funksiyasi ----
create or replace function public.t2_podval_shartnoma_farq_v1(p_obyekt_id bigint, p_qatorlar jsonb default null)
returns table (kod text, koef_kod text, obyekt_foiz numeric, shartnoma_foiz numeric, istisno_dalil text)
language plpgsql stable security definer set search_path = public, pg_temp as $f$
#variable_conflict use_column
declare v_komp bigint; v_sh bigint; v_q jsonb := p_qatorlar;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then return; end if;
  select b.shartnoma_id into v_sh
    from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
   where b.obyekt_id = p_obyekt_id and b.holat = 'faol' and s.holat <> 'bekor'
   order by b.shartnoma_id limit 1;
  if v_sh is null then return; end if;
  if v_q is null then
    select p.qatorlar into v_q from public.t2_nakrutka_podval p
     where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp and p.faol order by p.id desc limit 1;
  end if;
  if v_q is null or jsonb_typeof(v_q) <> 'array' then return; end if;
  return query
    select x.kod, x.koef_kod, x.foiz, n.qiymat, x.dalil
      from (select q->>'kod' as kod, q->>'koefKod' as koef_kod,
                   case when jsonb_typeof(q->'foiz') = 'number' then (q->>'foiz')::numeric end as foiz,
                   nullif(btrim(q->>'istisno_dalil'), '') as dalil
              from jsonb_array_elements(v_q) q
             where q->>'tur' = 'foiz' and q->>'manba' = 'smeta') x
      join public.t2_nakrutka_koef n on n.kompaniya_id = v_komp and n.shartnoma_id = v_sh and n.koef_kod = x.koef_kod
     where x.foiz is not null and x.foiz is distinct from n.qiymat
     order by x.kod;
end $f$;
revoke all on function public.t2_podval_shartnoma_farq_v1(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.t2_podval_shartnoma_farq_v1(bigint, jsonb) to service_role;

-- ---- 2. Saqlash: dalilsiz farq rad etiladi (imzo o'zgarmagan) ----
create or replace function public.t2_nakrutka_podval_saqla_v1(
  p_kompaniya_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint, p_nom text, p_qatorlar jsonb,
  p_id bigint default null, p_kutilgan_versiya integer default null, p_operation_id uuid default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint; v_bordagi integer; v_eski record; v_q jsonb; v_eski_q jsonb; v_farq jsonb; v_matn text;
begin
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Podval qatorlari bo''sh');
  end if;
  if jsonb_array_length(p_qatorlar) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Podval juda uzun (<= 80 qator)');
  end if;
  for v_q in select value from jsonb_array_elements(p_qatorlar) loop
    if coalesce(v_q->>'kod', '') !~ '^[A-Za-z0-9_]{1,40}$' or coalesce(v_q->>'tur', '') not in ('foiz', 'summa', 'jami') then
      return jsonb_build_object('ok', false, 'error', 'Qator tuzilmasi noto''g''ri: ' || coalesce(v_q->>'kod', '?'));
    end if;
  end loop;
  if p_obyekt_id is not null and not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if p_shartnoma_id is not null and not exists (select 1 from t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Shartnoma bu kompaniyaga tegishli emas');
  end if;

  -- Shartnoma doirasi (egasi 2026-11-20): farqli foiz faqat dalilli istisno bilan. Tahrirda o'zgarmagan (meros) qator o'tadi.
  if p_obyekt_id is not null then
    if p_id is not null then
      select p.qatorlar into v_eski_q from t2_nakrutka_podval p where p.id = p_id and p.kompaniya_id = p_kompaniya_id and p.faol;
    end if;
    select jsonb_agg(jsonb_build_object('kod', f.kod, 'koef_kod', f.koef_kod, 'obyekt_foiz', f.obyekt_foiz, 'shartnoma_foiz', f.shartnoma_foiz)
                     order by f.kod),
           string_agg(f.kod || ' ' || trim_scale(f.obyekt_foiz)::text || '% (shartnoma ' || trim_scale(f.shartnoma_foiz)::text || '%)', ', ' order by f.kod)
      into v_farq, v_matn
      from public.t2_podval_shartnoma_farq_v1(p_obyekt_id, p_qatorlar) f
     where f.istisno_dalil is null
       and not exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(v_eski_q) = 'array' then v_eski_q else '[]'::jsonb end) o
          where o->>'kod' = f.kod and o->>'manba' = 'smeta' and jsonb_typeof(o->'foiz') = 'number'
            and (o->>'foiz')::numeric = f.obyekt_foiz);
    if v_farq is not null then
      return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_FOIZIDAN_FARQ',
        'error', 'Ustama foizlari shartnoma darajasida qo''llanadi; farq: ' || v_matn
                 || '. Farq faqat dalilli istisno bilan saqlanadi (qator istisno_dalil matni).',
        'farq', v_farq);
    end if;
  end if;

  if p_id is not null then
    select * into v_eski from t2_nakrutka_podval where id = p_id and kompaniya_id = p_kompaniya_id and faol for update;
    if v_eski.id is null then
      return jsonb_build_object('ok', false, 'error', 'Podval topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_eski.versiya then
      return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_eski.versiya);
    end if;
    insert into t2_nakrutka_podval_tarix (podval_id, kompaniya_id, versiya, nom, qatorlar, faol, kim)
      values (v_eski.id, v_eski.kompaniya_id, v_eski.versiya, v_eski.nom, v_eski.qatorlar, v_eski.faol, v_eski.kim);
    update t2_nakrutka_podval set nom = coalesce(nullif(trim(p_nom), ''), nom), qatorlar = p_qatorlar,
      versiya = versiya + 1, kim = p_kim, yangilandi = now() where id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_eski.versiya + 1);
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'error', 'operation_id majburiy');
  end if;
  select id into v_id from t2_nakrutka_podval where operation_id = p_operation_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  end if;
  insert into t2_nakrutka_podval (kompaniya_id, obyekt_id, shartnoma_id, nom, qatorlar, operation_id, kim)
  values (p_kompaniya_id, p_obyekt_id, p_shartnoma_id, coalesce(nullif(trim(p_nom), ''), U&'\041F\043E\0434\0432\0430\043B'), p_qatorlar, p_operation_id, p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'Bu doira uchun podval allaqachon bor - uni tahrirlang');
end;
$$;
revoke all on function public.t2_nakrutka_podval_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.t2_nakrutka_podval_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, integer, uuid, text) to service_role;

-- ---- 3. Qoralama F-2 podvalini joriy kaskaddan qayta yozish ----
create or replace function public._t2_nakrutka_qoralama_sinxron_v1(p_obyekt_idlar bigint[])
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare r record; v_x jsonb; v_n integer := 0;
begin
  if p_obyekt_idlar is null or cardinality(p_obyekt_idlar) = 0 then return 0; end if;
  for r in
    select p.akt_id, p.nk, a.obyekt_id, a.kompaniya_id
      from public.t2_akt_podval p join public.t2_akt a on a.id = p.akt_id
     where p.blok = '' and p.manba in ('smeta', 'backfill')
       and a.tur = 'f2' and a.holat = 'qoralama' and a.obyekt_id = any(p_obyekt_idlar)
     order by p.akt_id
       for update of p
  loop
    v_x := public._t2_obyekt_nk_v1(r.obyekt_id);
    if v_x is null or v_x->'nk' is null or r.nk is not distinct from v_x->'nk' then continue; end if;
    update public.t2_akt_podval
       set nk = v_x->'nk', nds_foiz = (v_x->'nk'->>U&'\041D\0414\0421')::numeric,
           tekshiruv = coalesce(tekshiruv, '{}'::jsonb) || jsonb_build_object('avto', v_x->>'nk_manba', 'smeta_podval_id', v_x->'podval_id', 'sinxron', 'nakrutka_ozgardi'),
           versiya = versiya + 1, yangilandi = now()
     where akt_id = r.akt_id and blok = '';
    perform public.t2_audit_yoz(r.kompaniya_id, 'akt_podval_yoz', 'f2', r.obyekt_id,
      jsonb_build_object('akt_id', r.akt_id, 'blok', '', 'sinxron', true, 'nk_manba', v_x->>'nk_manba')::text, 'avto:podval', null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $f$;
revoke all on function public._t2_nakrutka_qoralama_sinxron_v1(bigint[]) from public, anon, authenticated;
grant execute on function public._t2_nakrutka_qoralama_sinxron_v1(bigint[]) to service_role;

create or replace function public._t2_nakrutka_podval_sinxron_trg_v1() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
begin
  begin
    perform public._t2_nakrutka_qoralama_sinxron_v1(array_remove(array[new.obyekt_id, case when tg_op = 'UPDATE' then old.obyekt_id end], null));
  exception when others then
    raise warning 'qoralama podval sinxroni yiqildi: %', left(sqlerrm, 200); -- podval saqlash to'xtamasin
  end;
  return null;
end $f$;
revoke all on function public._t2_nakrutka_podval_sinxron_trg_v1() from public, anon, authenticated;

drop trigger if exists t2_nakrutka_podval_sinxron on public.t2_nakrutka_podval;
create trigger t2_nakrutka_podval_sinxron after insert or update of qatorlar, faol, obyekt_id on public.t2_nakrutka_podval
  for each row execute function public._t2_nakrutka_podval_sinxron_trg_v1();

create or replace function public._t2_nakrutka_koef_sinxron_trg_v1() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_sh bigint; v_k bigint; v_arr bigint[];
begin
  begin
    if tg_op = 'UPDATE' and old.qiymat is not distinct from new.qiymat and old.shartnoma_id is not distinct from new.shartnoma_id then
      return null;
    end if;
    v_sh := case when tg_op = 'DELETE' then old.shartnoma_id else new.shartnoma_id end;
    v_k := case when tg_op = 'DELETE' then old.kompaniya_id else new.kompaniya_id end;
    if v_sh is not null then
      select array_agg(distinct b.obyekt_id) into v_arr from public.t2_shartnoma_bog b where b.shartnoma_id = v_sh and b.holat = 'faol';
    else
      select array_agg(o.id) into v_arr from public.t2_obyekt o where o.kompaniya_id = v_k;
    end if;
    perform public._t2_nakrutka_qoralama_sinxron_v1(v_arr);
  exception when others then
    raise warning 'qoralama podval sinxroni yiqildi: %', left(sqlerrm, 200); -- koeffitsient saqlash to'xtamasin
  end;
  return null;
end $f$;
revoke all on function public._t2_nakrutka_koef_sinxron_trg_v1() from public, anon, authenticated;

drop trigger if exists t2_nakrutka_koef_sinxron on public.t2_nakrutka_koef;
create trigger t2_nakrutka_koef_sinxron after insert or update or delete on public.t2_nakrutka_koef
  for each row execute function public._t2_nakrutka_koef_sinxron_trg_v1();

commit;
