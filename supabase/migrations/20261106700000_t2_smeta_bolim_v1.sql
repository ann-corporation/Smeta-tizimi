-- T2-SMETA-BOLIM (egasi 2026-10-21): «razdelni yasash va o'chirish funksiyasi ham kerak»; «Fast Food 2-etaj №1» xato
-- F2 bekor qilindi, lekin undan qolgan qo'shimcha qatorlarni o'chirib bo'lmaydi (bekor akt qatorlari FK RESTRICT bilan
-- ushlab turadi).
--
-- 1) t2_smeta_bolim_yarat_v1 — smetaga YANGI bo'lim (rz, qoshimcha=true). Ildizda yoki boshqa bo'lim ichida; berilgan
--    bo'limdan (va uning ichidagilaridan) keyin. Bir xil nomli bo'lim shu joyda bo'lsa — yangisi yaratilmaydi, o'sha
--    qaytariladi (mavjud=true): F2 bo'limlarini smetaga o'tkazishda takror bo'lim paydo bo'lmaydi. Idempotent (operation_id).
--    Bo'limni O'CHIRISH — mavjud t2_ish_abc_ochir_v2 orqali (qo'shilgan qator; ichida asl smeta qatori bo'lsa rad).
-- 2) BEKOR qilingan F2 akt endi «tarixda ishlatilgan» hisoblanmaydi: t2_qator_f2da va t2_qoshilgan_tarixda bekor aktni
--    e'tiborga olmaydi. Qo'shilgan qator o'chirilganda bekor aktdagi unga tegishli qatorlar t2_qator_ochirilgan
--    .bekor_f2_qatorlari ga TO'LIQ arxivlanadi va shundan keyin o'chiriladi (akt sarlavhasi, summasi, sababi — o'z joyida).
--    Tasdiqlangan/yuborilgan/qoralama F2 qatorlari himoyasi o'zgarmaydi.
begin;

alter table public.t2_qator_ochirilgan add column if not exists bekor_f2_qatorlari jsonb not null default '[]'::jsonb;

create or replace function public.t2_qator_f2da(p_qator_id bigint)
 returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
                  where aq.qator_id = p_qator_id and a.tur = 'f2' and a.holat is distinct from 'bekor')
$function$;

create or replace function public.t2_qoshilgan_tarixda(p_qator_id bigint)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with recursive t(id) as (select p_qator_id union select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select exists (select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
                  where aq.qator_id in (select id from t) and a.holat is distinct from 'bekor')
$function$;

create or replace function public.t2_ish_abc_ochir_ichki(p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint, p_actor_id bigint, p_sabab text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_r public.t2_qator%rowtype; v_ids bigint[]; v_n int; v_smeta int; v_f2 int; v_bog int; v_ota bigint; v_qj jsonb; v_fj jsonb; v_bj jsonb;
begin
  select * into v_r from public.t2_qator where id = p_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;
  if not coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', 'Smetaning asl qatori o''chirilmaydi va o''zgartirilmaydi.');
  end if;
  with recursive t(id) as (select p_qator_id union select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select array_agg(id) into v_ids from t;
  perform 1 from public.t2_qator where id = any(v_ids) order by id for update;
  if exists(select 1 from public.t2_qator where id=any(v_ids) and
    (kompaniya_id is distinct from p_kompaniya_id or obyekt_id is distinct from p_obyekt_id)) then
    return jsonb_build_object('ok',false,'code','SCOPE_INVALID');
  end if;
  -- Fakt tarixi himoyasi F2-import kirish nuqtalarida (t2_qoshilgan_tarixda — ochir_v2 / tahrir_v2 / resurs_ish_zamena
  -- tahriri). Bu umumiy ichki funksiya Fakt jurnalining v1 xatti-harakatini saqlaydi: qo'shilgan ishning fakti arxivlanib
  -- o'chiriladi (aks holda Fakt jurnalida kiritilgan har qo'shimcha ish tahrirlanmay/o'chirilmay qolardi). F2 — har doim rad.
  if exists(select 1 from public.t2_qator where replaces_line_id=any(v_ids) and not(id=any(v_ids))) then
    return jsonb_build_object('ok',false,'code','BOGLANGAN');
  end if;
  if exists(select 1 from public.t2_qator q join public.t2_smeta_ozgarish z on z.id=q.change_id
    where q.id=any(v_ids) and z.holat is distinct from 'qoralama') then
    return jsonb_build_object('ok',false,'code','TASDIQLANGAN_OZGARISH');
  end if;
  v_n := cardinality(v_ids);
  select count(*) into v_smeta from public.t2_qator where id = any(v_ids) and not coalesce(qoshimcha, false);
  if v_smeta > 0 then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', format('Ichida %s ta asl smeta qatori bor — o''chirilmaydi.', v_smeta));
  end if;
  -- t2_qator_f2da bekor F2 ni hisobga olmaydi (2026-10-21).
  select count(*) into v_f2 from unnest(v_ids) x where public.t2_qator_f2da(x);
  if v_f2 > 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_DA', 'xabar', format('%s ta qator F2 aktida — avval F2 ni bekor qiling.', v_f2));
  end if;
  select (select count(*) from public.t2_aosr_bog where qator_id = any(v_ids)) + (select count(*) from public.t2_lab_protokol_bog where qator_id = any(v_ids))
       + (select count(*) from public.t2_narx_dalil where qator_id = any(v_ids)) + (select count(*) from public.t2_price_basis_line where qator_id = any(v_ids))
    into v_bog;
  if v_bog > 0 then
    return jsonb_build_object('ok', false, 'code', 'BOGLANGAN', 'xabar', format('%s ta bog''lanish (АОСР / laboratoriya / narx dalili) — avval ularni yeching.', v_bog));
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.daraja, q.id), '[]'::jsonb) into v_qj from public.t2_qator q where q.id = any(v_ids);
  select coalesce(jsonb_agg(to_jsonb(aq)), '[]'::jsonb) into v_fj
    from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id where aq.qator_id = any(v_ids) and a.tur = 'fakt';
  -- Bekor qilingan F2 aktlarning shu qatorlarga tegishli qatorlari — to'liq arxiv (akt_id, hajm, narx, certified_* ...).
  select coalesce(jsonb_agg(to_jsonb(aq) || jsonb_build_object('_akt_holat', a.holat, '_akt_oy', a.oy) order by aq.akt_id, aq.id), '[]'::jsonb) into v_bj
    from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id where aq.qator_id = any(v_ids) and a.tur = 'f2' and a.holat = 'bekor';
  insert into public.t2_qator_ochirilgan(kompaniya_id, obyekt_id, ildiz_qator_id, qatorlar, fakt_qatorlari, bekor_f2_qatorlari, sabab, kim, operation_id)
    values (p_kompaniya_id, p_obyekt_id, p_qator_id, v_qj, v_fj, v_bj, p_sabab, 'actor:' || p_actor_id, p_operation_id);
  delete from public.t2_akt_qator aq using public.t2_akt a where a.id = aq.akt_id and a.tur = 'fakt' and aq.qator_id = any(v_ids);
  delete from public.t2_akt_qator aq using public.t2_akt a where a.id = aq.akt_id and a.tur = 'f2' and a.holat = 'bekor' and aq.qator_id = any(v_ids);
  update public.t2_smeta_ozgarish z set holat = 'bekor'
   where z.id in (select change_id from public.t2_qator where id = any(v_ids) and change_id is not null)
     and not exists (select 1 from public.t2_qator q where q.change_id = z.id and not (q.id = any(v_ids)));
  v_ota := v_r.ota_id;
  delete from public.t2_qator where id = p_qator_id;            -- ota_id ON DELETE CASCADE — bolalar ham
  -- Ota ish (bl) bo'lsa — uning summasi resurslardan qayta hisoblanadi.
  if v_ota is not null and exists (select 1 from public.t2_qator where id = v_ota and tur = 'bl') then
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_ota and tur in ('rs', 'mat', 'ob'))
     where id = v_ota and coalesce(qoshimcha, false);
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_ochir', 'smeta', p_obyekt_id,
    format('ildiz=%s qatorlar=%s fakt=%s bekor_f2=%s sabab=%s', p_qator_id, v_n, jsonb_array_length(v_fj), jsonb_array_length(v_bj), coalesce(p_sabab, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'ochirildi', v_n, 'fakt_ochirildi', jsonb_array_length(v_fj), 'bekor_f2_arxivlandi', jsonb_array_length(v_bj), 'ota_id', v_ota,
    'tur', v_r.tur, 'zamena', coalesce(v_r.zamena, false), 'replaces_line_id', v_r.replaces_line_id);
end $function$;

create or replace function public.t2_smeta_bolim_yarat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_nom text,
  p_ota_qator_id bigint, p_keyin_qator_id bigint, p_sabab text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_req jsonb; v_prev public.t2_addrepl_command%rowtype; v_ota public.t2_qator%rowtype; v_keyin public.t2_qator%rowtype;
  v_daraja int := 0; v_tartib int; v_id bigint; v_versiya int; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if v_nom = '' or length(v_nom) > 300 then return jsonb_build_object('ok', false, 'code', 'NOM_REQUIRED', 'xabar', 'Bo''lim nomi 1–300 belgi bo''lsin.'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  v_req := jsonb_build_object('command', 'bolim', 'obyekt_id', p_obyekt_id, 'nom', v_nom, 'ota_qator_id', p_ota_qator_id, 'keyin_qator_id', p_keyin_qator_id);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into v_prev from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.kompaniya_id <> p_kompaniya_id or v_prev.request <> v_req then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT');
    end if;
    return v_prev.response || '{"takror":true}'::jsonb;
  end if;
  perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
  if p_ota_qator_id is not null then
    select * into v_ota from public.t2_qator where id = p_ota_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found or v_ota.tur <> 'rz' then return jsonb_build_object('ok', false, 'code', 'OTA_BOLIM_EMAS', 'xabar', 'Bo''lim faqat ildizda yoki boshqa bo''lim ichida bo''ladi.'); end if;
    v_daraja := coalesce(v_ota.daraja, 0) + 1;
  end if;
  -- Shu joyda shu nomli bo'lim bor — o'shani qaytaramiz (takror bo'lim yaratilmaydi).
  select id, versiya into v_id, v_versiya from public.t2_qator
   where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is not distinct from p_ota_qator_id
     and upper(btrim(regexp_replace(coalesce(nom, ''), '\s+', ' ', 'g'))) = upper(v_nom)
   order by id limit 1;
  if v_id is not null then
    v_res := jsonb_build_object('ok', true, 'qator_id', v_id, 'versiya', v_versiya, 'mavjud', true);
    insert into public.t2_addrepl_command values (p_operation_id, p_actor_id, p_kompaniya_id, v_req, v_res, now());
    return v_res;
  end if;
  if p_keyin_qator_id is not null then
    select * into v_keyin from public.t2_qator where id = p_keyin_qator_id and obyekt_id = p_obyekt_id;
    if not found or v_keyin.tur <> 'rz' or v_keyin.ota_id is distinct from p_ota_qator_id then
      return jsonb_build_object('ok', false, 'code', 'ORDERING_SCOPE_INVALID', 'xabar', 'Yangi bo''lim faqat shu darajadagi bo''limdan keyin qo''yiladi.');
    end if;
    with recursive t(id, tartib) as (
      select q0.id, q0.tartib from public.t2_qator q0 where q0.id = p_keyin_qator_id
      union all
      select q1.id, q1.tartib from public.t2_qator q1 join t on q1.ota_id = t.id where q1.obyekt_id = p_obyekt_id
    ) select max(t.tartib) into v_tartib from t;
  elsif p_ota_qator_id is not null then
    with recursive t(id, tartib) as (
      select q0.id, q0.tartib from public.t2_qator q0 where q0.id = p_ota_qator_id
      union all
      select q1.id, q1.tartib from public.t2_qator q1 join t on q1.ota_id = t.id where q1.obyekt_id = p_obyekt_id
    ) select max(t.tartib) into v_tartib from t;
  else
    select coalesce(max(tartib), 0) + 1 into v_tartib from public.t2_qator where obyekt_id = p_obyekt_id;
  end if;
  insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
    values (p_obyekt_id, p_kompaniya_id, p_ota_qator_id, v_daraja, v_tartib, 'rz', v_nom, true, 'ADDITIONAL')
    returning id, versiya into v_id, v_versiya;
  if p_ota_qator_id is not null then update public.t2_qator set yangilandi = clock_timestamp() where id = p_ota_qator_id; end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_bolim_yarat', 'smeta', p_obyekt_id,
    format('bolim=%s nom=%s sabab=%s', v_id, v_nom, coalesce(nullif(btrim(p_sabab), ''), '-')), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'qator_id', v_id, 'versiya', v_versiya, 'mavjud', false);
  insert into public.t2_addrepl_command values (p_operation_id, p_actor_id, p_kompaniya_id, v_req, v_res, now());
  return v_res;
end $function$;

revoke all on function public.t2_smeta_bolim_yarat_v1(bigint, bigint, bigint, text, bigint, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_smeta_bolim_yarat_v1(bigint, bigint, bigint, text, bigint, bigint, text, uuid) to service_role;

commit;
