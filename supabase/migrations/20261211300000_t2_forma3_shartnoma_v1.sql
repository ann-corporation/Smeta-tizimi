-- 20261211300000_t2_forma3_shartnoma_v1
-- Egasi: «F3 hozir har bir obyekt bo'yicha ishlaydi, lekin F3 shartnoma doirasida ishlashi kerak».
-- Shartnoma rejimi: p_obyekt_id IS NULL va p_shartnoma_id IS NOT NULL → BITTA t2_forma3 yozuvi (shartnoma_id, obyekt_id NULL),
-- shartnomaning BARCHA faol obyektlari (t2_shartnoma_bog) tasdiqlangan F2 aktlariga bog'lanadi.
-- Oldingi t2_forma3_yarat_v1 (20261211000000): kompaniya faqat loyiha/obyektdan olinardi (shartnoma-only → SCOPE_NOT_FOUND),
-- aktlar faqat p_obyekt_id bo'yicha tekshirilardi (obyekt NULL bo'lsa — kompaniyaning ISTALGAN aktlari o'tib ketardi).
-- O'zgarish ADDITIV: imzo bir xil (CREATE OR REPLACE), obyekt rejimi bayt-bayt oldingidek; yangi: shartnoma rejimi + o'qish RPC.
-- Tasdiqlangan F2 summalari o'zgarmaydi (guard istisnosi o'sha forma3_id NULL → qiymat).
-- versiya: tarix (t2_qator o'qilmaydi — faqat akt/forma3/bog' jadvallari)

create or replace function public.t2_forma3_yarat_v1(p_actor_id bigint, p_loyiha_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint, p_davr_boshi date, p_davr_oxiri date, p_akt_ids bigint[], p_raqam text, p_operation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_komp bigint; v_rol text; v_id bigint; v_summa numeric := 0; v_n integer := 0; v_nom integer := 0; v_band bigint[];
        v_shartnoma_rejim boolean := (p_obyekt_id is null and p_shartnoma_id is not null);
        v_sh_loyiha bigint; v_sh_komp bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select id into v_id from public.t2_forma3 where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok',true,'takror',true,'forma3_id',v_id); end if;

  if v_shartnoma_rejim then
    -- Shartnoma rejimi: kompaniya shartnomadan; loyiha — shartnomadagi (bo'lsa).
    select kompaniya_id, loyiha_id into v_sh_komp, v_sh_loyiha
      from public.t2_shartnoma where id = p_shartnoma_id and holat <> 'bekor';
    if v_sh_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
    v_komp := v_sh_komp;
    p_loyiha_id := coalesce(p_loyiha_id, v_sh_loyiha);
  elsif p_loyiha_id is not null then
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
       -- 20261211300000: shartnoma rejimida har akt shu shartnomaning FAOL obyektiga tegishli bo'lishi shart.
       or (v_shartnoma_rejim and not exists (
             select 1 from public.t2_shartnoma_bog b
              where b.shartnoma_id = p_shartnoma_id and b.obyekt_id = a.obyekt_id and b.holat = 'faol'))
       or a.oy < date_trunc('month', p_davr_boshi) or a.oy > date_trunc('month', p_davr_oxiri)
  ) then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_INVALID',
      'xato','Har akt: tasdiqlangan Ф2, shu scope (obyekt yoki shartnoma obyektlari) va davr ichida bo''lishi kerak');
  end if;
  -- 20261211000000: bitta F2 ikki marta Forma 3 ga kirmaydi.
  select array_agg(distinct a.id) into v_band
    from public.t2_akt a
   where a.id = any(p_akt_ids)
     and (a.forma3_id is not null
          or exists (select 1 from public.t2_forma3_akt x join public.t2_forma3 f on f.id = x.forma3_id
                      where x.akt_id = a.id and coalesce(f.holat,'') <> 'bekor'));
  if v_band is not null then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_BAND',
      'xato','Bu F2 aktlar allaqachon boshqa Forma 3 ga kiritilgan', 'akt_ids', to_jsonb(v_band));
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
  -- Tor istisno: guard faqat forma3_id NULL → qiymatga shu tranzaksiya ichida ruxsat beradi.
  perform set_config('t2.forma3.boglash', '1', true);
  update public.t2_akt set forma3_id = v_id where id = any(p_akt_ids) and forma3_id is null;
  perform set_config('t2.forma3.boglash', '', true);

  perform public.t2_audit_yoz(v_komp, 'forma3_yarat', 'smeta', p_obyekt_id,
    format('forma3_id=%s rejim=%s shartnoma=%s davr=%s..%s aktlar=%s f2_summa=%s nomalum_qator=%s qoida=EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
           v_id, case when v_shartnoma_rejim then 'shartnoma' else 'obyekt' end, p_shartnoma_id,
           p_davr_boshi, p_davr_oxiri, v_n, round(v_summa,2), v_nom),
    'actor:'||p_actor_id, null);

  return jsonb_build_object('ok',true,'takror',false,'forma3_id',v_id,
    'rejim', case when v_shartnoma_rejim then 'shartnoma' else 'obyekt' end,
    'bajarilgan_f2_summa',v_summa,'f2_summa_nomalum',v_nom,'aktlar',v_n,
    'qoida_holat','FORMA3_RULE_MAPPED',
    'qoida_manba','EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
    'izoh','F3 jami qoidasi eganing B qarori bilan MAPPED: nakrutka kaskadi, ВСЕГО К ОПЛАТЕ = F2 к оплате jamisi (tiyingacha). Hisob hujjat-yozuvchida (lib/forma3-export.ts) jonli formulalar bilan.');
end $function$;

-- O'qish: shartnomaning faol obyektlaridagi tasdiqlangan F2 aktlar (davr ichida) + band belgisi.
-- UI «Shartnoma» rejimi ro'yxati: band=false — oldindan belgilangan; band=true — boshqa bekor qilinmagan F3 da.
create or replace function public.t2_forma3_shartnoma_aktlar_v1(p_shartnoma_id bigint, p_actor_id bigint, p_davr_boshi date, p_davr_oxiri date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_komp bigint; v_rol text; v_rows jsonb; v_obyektlar jsonb;
begin
  select kompaniya_id into v_komp from public.t2_shartnoma where id = p_shartnoma_id and holat <> 'bekor';
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if p_davr_boshi is null or p_davr_oxiri is null or p_davr_oxiri < p_davr_boshi then
    return jsonb_build_object('ok',false,'code','DAVR_INVALID');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', o.id, 'nom', o.nom) order by o.nom), '[]'::jsonb)
    into v_obyektlar
    from public.t2_obyekt o
   where o.id in (select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = p_shartnoma_id and b.holat = 'faol');

  select coalesce(jsonb_agg(jsonb_build_object(
           'akt_id', a.id, 'raqam', a.raqam, 'oy', a.oy, 'obyekt_id', a.obyekt_id, 'obyekt_nom', o.nom,
           'hujjat_jami', a.hujjat_jami, 'forma3_id', bf.forma3_id,
           'band', (a.forma3_id is not null or bf.forma3_id is not null)
         ) order by o.nom, a.oy, a.id), '[]'::jsonb)
    into v_rows
    from public.t2_akt a
    join public.t2_obyekt o on o.id = a.obyekt_id
    left join lateral (
      select x.forma3_id from public.t2_forma3_akt x join public.t2_forma3 f on f.id = x.forma3_id
       where x.akt_id = a.id and coalesce(f.holat,'') <> 'bekor' order by x.forma3_id limit 1
    ) bf on true
   where a.kompaniya_id = v_komp and a.tur = 'f2' and a.holat = 'tasdiqlangan'
     and a.oy >= date_trunc('month', p_davr_boshi) and a.oy <= date_trunc('month', p_davr_oxiri)
     and exists (select 1 from public.t2_shartnoma_bog b
                  where b.shartnoma_id = p_shartnoma_id and b.obyekt_id = a.obyekt_id and b.holat = 'faol');

  return jsonb_build_object('ok',true,'shartnoma_id',p_shartnoma_id,'obyektlar',v_obyektlar,'aktlar',v_rows);
end $function$;

revoke all on function public.t2_forma3_shartnoma_aktlar_v1(bigint, bigint, date, date) from public, anon, authenticated;
grant execute on function public.t2_forma3_shartnoma_aktlar_v1(bigint, bigint, date, date) to service_role;

comment on function public.t2_forma3_yarat_v1(bigint, bigint, bigint, bigint, date, date, bigint[], text, uuid) is
  'Forma 3 yaratish (20261211300000: shartnoma rejimi — obyekt NULL + shartnoma_id → shartnomaning barcha faol obyektlari aktlari bitta F3 ga). versiya: tarix (t2_qator faqat tanlangan tasdiqlangan F2 akt qatorlari orqali o''qiladi).';
comment on function public.t2_forma3_shartnoma_aktlar_v1(bigint, bigint, date, date) is
  'Shartnoma F3 uchun tasdiqlangan F2 aktlar ro''yxati (band belgisi bilan). versiya: tarix (t2_qator o''qilmaydi).';
