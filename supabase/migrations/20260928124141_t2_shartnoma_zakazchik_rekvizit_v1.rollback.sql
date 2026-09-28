-- Rollback: 20260928124141_t2_shartnoma_zakazchik_rekvizit_v1
-- Faqat oldingi ledger funksiyalarni tiklaydi va qo'shilgan ustunlarni
-- o'chiradi. Ustunlar o'chirilishi mumkin — hech qanday eski qator ularga
-- tayanmaydi (migratsiya faqat additive edi).
begin;

create or replace function public.t2_kompaniya_yangila(
  p_id bigint, p_kutilgan_versiya integer,
  p_toliq_nom text default null, p_inn text default null, p_manzil text default null,
  p_rahbar text default null, p_telefon text default null, p_bank text default null,
  p_hisob_raqam text default null, p_mfo text default null, p_mavqe text default null
)
returns jsonb
language plpgsql
security definer
as $function$
declare v_bor integer;
begin
  select versiya into v_bor from t2_kompaniya where id = p_id;
  if v_bor is null then return jsonb_build_object('ok', false, 'error', 'kompaniya topilmadi'); end if;
  if v_bor <> p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_bor, 'siz_yuborgan', p_kutilgan_versiya);
  end if;
  if p_mavqe is not null and p_mavqe not in ('zakazchik','pudratchi','loyihachi') then
    return jsonb_build_object('ok', false, 'error', 'mavqe faqat zakazchik|pudratchi|loyihachi bo''ladi');
  end if;
  update t2_kompaniya set
    toliq_nom = coalesce(p_toliq_nom, toliq_nom), inn = coalesce(p_inn, inn),
    manzil = coalesce(p_manzil, manzil), rahbar = coalesce(p_rahbar, rahbar),
    telefon = coalesce(p_telefon, telefon), bank = coalesce(p_bank, bank),
    hisob_raqam = coalesce(p_hisob_raqam, hisob_raqam), mfo = coalesce(p_mfo, mfo),
    mavqe = coalesce(p_mavqe, mavqe), versiya = versiya + 1
  where id = p_id;
  return jsonb_build_object('ok', true, 'yangi_versiya', v_bor + 1);
end; $function$;

create or replace function public.t2_shartnoma_saqla(
  p_raqam text,
  p_nom text default null,
  p_taraf text default null,
  p_summa_bez_nds numeric default null,
  p_nds numeric default null,
  p_jami_nds_bilan numeric default null,
  p_chel_stavka numeric default null,
  p_izoh text default null,
  p_kutilgan_versiya integer default null,
  p_kompaniya_id bigint default null,
  p_manba text default 'frontend',
  p_kim text default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare v_komp bigint; v_id bigint; v_ver int;
begin
  if coalesce(btrim(p_raqam), '') = '' then
    return jsonb_build_object('ok', false, 'sabab', 'raqam', 'xabar', 'Shartnoma raqami bo''sh');
  end if;

  v_komp := p_kompaniya_id;
  if v_komp is null then select id into v_komp from t2_kompaniya order by id limit 1; end if;

  select id, versiya into v_id, v_ver from t2_shartnoma
   where kompaniya_id = v_komp and raqam = btrim(p_raqam);

  if v_id is not null and p_kutilgan_versiya is not null and v_ver <> p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'sabab', 'versiya',
      'xabar', 'Shartnoma orada boshqa joyda o''zgargan — qayta yuklang',
      'bordagi_versiya', v_ver, 'siz_yuborgan', p_kutilgan_versiya);
  end if;

  perform t2_manba_belgila(case when p_manba in
    ('frontend','sheets','baza','import','markirovka','narxlash','rollup','ai','kopruk')
    then p_manba else 'frontend' end);

  insert into t2_shartnoma (kompaniya_id, raqam, nom, taraf, summa_bez_nds, nds,
                            jami_nds_bilan, chel_stavka, izoh, kim)
  values (v_komp, btrim(p_raqam), p_nom, p_taraf, p_summa_bez_nds, p_nds,
          p_jami_nds_bilan, p_chel_stavka, p_izoh, p_kim)
  on conflict (kompaniya_id, raqam)
  do update set nom = excluded.nom, taraf = excluded.taraf,
                summa_bez_nds = excluded.summa_bez_nds, nds = excluded.nds,
                jami_nds_bilan = excluded.jami_nds_bilan,
                chel_stavka = excluded.chel_stavka, izoh = excluded.izoh,
                kim = excluded.kim, versiya = t2_shartnoma.versiya + 1,
                yangilandi = now()
  returning id, versiya into v_id, v_ver;

  return jsonb_build_object('ok', true, 'shartnoma_id', v_id, 'versiya', v_ver);
end $function$;

alter table public.t2_shartnoma
  drop column if exists zakazchik_toliq_nom,
  drop column if exists zakazchik_manzil,
  drop column if exists zakazchik_telefon,
  drop column if exists zakazchik_hisob_raqam,
  drop column if exists zakazchik_bank,
  drop column if exists zakazchik_mfo,
  drop column if exists zakazchik_inn,
  drop column if exists zakazchik_oked;

alter table public.t2_kompaniya drop column if exists oked;

commit;
