-- Rollback 20261106700000_t2_smeta_bolim_v1: asl funksiyalar (md5 oldin: ochir_ichki cdea44bb…, f2da 955b52c0…,
-- qoshilgan_tarixda 285fe97e…). Yaratilgan bo'limlar (qoshimcha rz) va arxiv ustuni ma'lumoti O'CHIRILMAYDI —
-- ustun faqat bo'sh bo'lsa olib tashlanadi.
begin;

drop function if exists public.t2_smeta_bolim_yarat_v1(bigint, bigint, bigint, text, bigint, bigint, text, uuid);

create or replace function public.t2_qator_f2da(p_qator_id bigint)
 returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
                  where aq.qator_id = p_qator_id and a.tur = 'f2')
$function$;

create or replace function public.t2_qoshilgan_tarixda(p_qator_id bigint)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with recursive t(id) as (select p_qator_id union select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select exists (select 1 from public.t2_akt_qator aq where aq.qator_id in (select id from t))
$function$;

create or replace function public.t2_ish_abc_ochir_ichki(p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint, p_actor_id bigint, p_sabab text, p_operation_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_r public.t2_qator%rowtype; v_ids bigint[]; v_n int; v_smeta int; v_f2 int; v_bog int; v_ota bigint; v_qj jsonb; v_fj jsonb;
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
  insert into public.t2_qator_ochirilgan(kompaniya_id, obyekt_id, ildiz_qator_id, qatorlar, fakt_qatorlari, sabab, kim, operation_id)
    values (p_kompaniya_id, p_obyekt_id, p_qator_id, v_qj, v_fj, p_sabab, 'actor:' || p_actor_id, p_operation_id);
  delete from public.t2_akt_qator aq using public.t2_akt a where a.id = aq.akt_id and a.tur = 'fakt' and aq.qator_id = any(v_ids);
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
    format('ildiz=%s qatorlar=%s fakt=%s sabab=%s', p_qator_id, v_n, jsonb_array_length(v_fj), coalesce(p_sabab, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'ochirildi', v_n, 'fakt_ochirildi', jsonb_array_length(v_fj), 'ota_id', v_ota,
    'tur', v_r.tur, 'zamena', coalesce(v_r.zamena, false), 'replaces_line_id', v_r.replaces_line_id);
end $function$;

do $$ begin
  if not exists (select 1 from public.t2_qator_ochirilgan where bekor_f2_qatorlari <> '[]'::jsonb) then
    alter table public.t2_qator_ochirilgan drop column if exists bekor_f2_qatorlari;
  end if;
end $$;

commit;
