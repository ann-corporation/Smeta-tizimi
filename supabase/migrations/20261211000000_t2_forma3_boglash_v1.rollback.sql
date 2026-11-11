-- rollback 20261211000000_t2_forma3_boglash_v1: oldingi (prod 2026-11-11) ta'riflar
-- versiya: texnik
CREATE OR REPLACE FUNCTION public.t2_akt_lifecycle_projection_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_internal text := current_setting('t2.akt.lifecycle_transition', true);
  v_ruxsat_ustun constant text[] := array['holat','versiya','yangilandi','lifecycle_status','lifecycle_updated_at',
    'lifecycle_updated_by','lifecycle_reason','lifecycle_cancelled_at'];
  v_narxsiz int;
begin
  if tg_op = 'INSERT' then
    if new.lifecycle_status is null or (new.lifecycle_status = 'draft' and new.holat in ('tasdiqlangan','bekor')) then
      new.lifecycle_status := case new.holat
        when 'tasdiqlangan' then 'approved'
        when 'bekor' then 'cancelled'
        else 'draft'
      end;
    end if;
    if new.lifecycle_status = 'approved' then new.holat := 'tasdiqlangan';
    elsif new.lifecycle_status in ('cancelled','superseded') then new.holat := 'bekor';
    else new.holat := 'qoralama';
    end if;
    new.lifecycle_updated_at := coalesce(new.lifecycle_updated_at, now());
    return new;
  end if;

  -- Tasdiqlangan sarlavha joyida o'zgarmaydi. Yagona istisno (20261117100000): transition ichidan bekor qilish —
  -- faqat holat/lifecycle/versiya maydonlari; biznes maydonlari bayt-bayt bir xil qoladi.
  if old.lifecycle_status = 'approved'
     and (to_jsonb(new) - 'yangilandi') is distinct from (to_jsonb(old) - 'yangilandi') then
    if not (coalesce(v_internal, '') = '1' and new.lifecycle_status = 'cancelled'
            and (to_jsonb(new) - v_ruxsat_ustun) is not distinct from (to_jsonb(old) - v_ruxsat_ustun)) then
      raise exception 'approved akt immutable; correction uchun yangi revision yarating'
        using errcode = '55000';
    end if;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    if coalesce(v_internal, '') <> '1' then
      raise exception 'lifecycle_status faqat t2_akt_lifecycle_transition_v1 orqali o''zgaradi'
        using errcode = '42501';
    end if;
    if new.lifecycle_status = 'approved' then new.holat := 'tasdiqlangan';
    elsif new.lifecycle_status in ('cancelled','superseded') then new.holat := 'bekor';
    else new.holat := 'qoralama';
    end if;
  elsif new.holat is distinct from old.holat then
    if new.holat = 'tasdiqlangan' then new.lifecycle_status := 'approved';
    elsif new.holat = 'bekor' then new.lifecycle_status := 'cancelled';
    elsif new.holat = 'qoralama' then new.lifecycle_status := 'draft';
    else
      raise exception 'noma''lum legacy akt holati' using errcode = '22023';
    end if;
    new.lifecycle_updated_at := now();
  end if;

  -- 20261203001500 (egasi 2026-11-06): avto qoralama narxsiz qatori bor F2 yuborilmaydi/tasdiqlanmaydi — har yo'lda
  -- (transition, eski t2_akt_tasdiqlash holat yangilashi). Transition o'zi avval NARXSIZ_QATOR_BOR kodini qaytaradi.
  if new.tur = 'f2' and new.lifecycle_status in ('submitted','approved')
     and new.lifecycle_status is distinct from old.lifecycle_status then
    v_narxsiz := public._t2_f2_narxsiz_avto_soni(new.id);
    if v_narxsiz > 0 then
      raise exception 'NARXSIZ_QATOR_BOR: F2 #% da % ta avto qoralama narxsiz qator bor', new.id, v_narxsiz
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.t2_forma3_yarat_v1(p_actor_id bigint, p_loyiha_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint, p_davr_boshi date, p_davr_oxiri date, p_akt_ids bigint[], p_raqam text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_rol text; v_id bigint; v_summa numeric := 0; v_n integer := 0; v_nom integer := 0;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select id into v_id from public.t2_forma3 where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok',true,'takror',true,'forma3_id',v_id); end if;

  if p_loyiha_id is not null then
    select kompaniya_id into v_komp from public.t2_loyiha where id = p_loyiha_id;
  elsif p_obyekt_id is not null then
    select kompaniya_id, loyiha_id into v_komp, p_loyiha_id from public.t2_obyekt where id = p_obyekt_id;
  end if;
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('boss','superadmin','rahbar','bugalter') then
    return jsonb_build_object('ok',false,'code','FORMA3_DENIED');
  end if;
  if p_akt_ids is null or array_length(p_akt_ids,1) is null then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_REQUIRED');
  end if;
  if exists (
    select 1 from unnest(p_akt_ids) aid
    left join public.t2_akt a on a.id = aid
    where a.id is null or a.tur <> 'f2' or a.holat <> 'tasdiqlangan'
       or a.kompaniya_id <> v_komp
       or (p_obyekt_id is not null and a.obyekt_id <> p_obyekt_id)
       or a.oy < date_trunc('month', p_davr_boshi) or a.oy > date_trunc('month', p_davr_oxiri)
  ) then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_INVALID',
      'xato','Har akt: tasdiqlangan Ф2, shu scope va davr ichida bo''lishi kerak');
  end if;

  select coalesce(sum(coalesce(aq.certified_amount, aq.summa)),0), count(distinct a.id),
         count(*) filter (where q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0)
    into v_summa, v_n, v_nom
  from public.t2_akt a join public.t2_akt_qator aq on aq.akt_id = a.id
  join public.t2_qator q on q.id = aq.qator_id
  where a.id = any(p_akt_ids);

  insert into public.t2_forma3
    (kompaniya_id, loyiha_id, obyekt_id, shartnoma_id, raqam, davr_boshi, davr_oxiri,
     holat, bajarilgan_f2_summa, qoida_holat, qoida_manba, operation_id, actor_id)
  values (v_komp, p_loyiha_id, p_obyekt_id, p_shartnoma_id, p_raqam, p_davr_boshi, p_davr_oxiri,
     'qoralama', v_summa, 'FORMA3_RULE_MAPPED',
     'EGA_QAROR_B_NAKRUTKA_KASKAD_V1: ВСЕГО К ОПЛАТЕ = nakrutka kaskadi (t2_nakrutka_hisob_v1 bilan aynan: ИТОГО-4 × (1+НДС)); davr ustunlari faqat holat=tasdiqlangan F2 dan; qamrov — loyiha (shartnoma) darajasida; avans kirmaydi; hisob — frontend lib/forma3-export.ts jonli formulalar bilan (tiyingacha nazorat).',
     p_operation_id, p_actor_id)
  returning id into v_id;

  insert into public.t2_forma3_akt (forma3_id, akt_id) select v_id, unnest(p_akt_ids);
  update public.t2_akt set forma3_id = v_id where id = any(p_akt_ids);

  perform public.t2_audit_yoz(v_komp, 'forma3_yarat', 'smeta', p_obyekt_id,
    format('forma3_id=%s davr=%s..%s aktlar=%s f2_summa=%s nomalum_qator=%s qoida=EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
           v_id, p_davr_boshi, p_davr_oxiri, v_n, round(v_summa,2), v_nom),
    'actor:'||p_actor_id, null);

  return jsonb_build_object('ok',true,'takror',false,'forma3_id',v_id,
    'bajarilgan_f2_summa',v_summa,'f2_summa_nomalum',v_nom,'aktlar',v_n,
    'qoida_holat','FORMA3_RULE_MAPPED',
    'qoida_manba','EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
    'izoh','F3 jami qoidasi eganing B qarori bilan MAPPED: nakrutka kaskadi, ВСЕГО К ОПЛАТЕ = F2 к оплате jamisi (tiyingacha). Hisob hujjat-yozuvchida (lib/forma3-export.ts) jonli formulalar bilan.');
end $function$
;
