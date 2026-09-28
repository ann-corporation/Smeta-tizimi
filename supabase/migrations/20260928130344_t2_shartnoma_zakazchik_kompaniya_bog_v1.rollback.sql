-- Rollback: 20260928130344_t2_shartnoma_zakazchik_kompaniya_bog_v1
begin;

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
  p_kim text default null,
  p_zakazchik_toliq_nom text default null,
  p_zakazchik_manzil text default null,
  p_zakazchik_telefon text default null,
  p_zakazchik_hisob_raqam text default null,
  p_zakazchik_bank text default null,
  p_zakazchik_mfo text default null,
  p_zakazchik_inn text default null,
  p_zakazchik_oked text default null
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
                            jami_nds_bilan, chel_stavka, izoh, kim,
                            zakazchik_toliq_nom, zakazchik_manzil, zakazchik_telefon,
                            zakazchik_hisob_raqam, zakazchik_bank, zakazchik_mfo,
                            zakazchik_inn, zakazchik_oked)
  values (v_komp, btrim(p_raqam), p_nom, p_taraf, p_summa_bez_nds, p_nds,
          p_jami_nds_bilan, p_chel_stavka, p_izoh, p_kim,
          p_zakazchik_toliq_nom, p_zakazchik_manzil, p_zakazchik_telefon,
          p_zakazchik_hisob_raqam, p_zakazchik_bank, p_zakazchik_mfo,
          p_zakazchik_inn, p_zakazchik_oked)
  on conflict (kompaniya_id, raqam)
  do update set nom = excluded.nom, taraf = excluded.taraf,
                summa_bez_nds = excluded.summa_bez_nds, nds = excluded.nds,
                jami_nds_bilan = excluded.jami_nds_bilan,
                chel_stavka = excluded.chel_stavka, izoh = excluded.izoh,
                kim = excluded.kim, versiya = t2_shartnoma.versiya + 1,
                yangilandi = now(),
                zakazchik_toliq_nom = coalesce(excluded.zakazchik_toliq_nom, t2_shartnoma.zakazchik_toliq_nom),
                zakazchik_manzil = coalesce(excluded.zakazchik_manzil, t2_shartnoma.zakazchik_manzil),
                zakazchik_telefon = coalesce(excluded.zakazchik_telefon, t2_shartnoma.zakazchik_telefon),
                zakazchik_hisob_raqam = coalesce(excluded.zakazchik_hisob_raqam, t2_shartnoma.zakazchik_hisob_raqam),
                zakazchik_bank = coalesce(excluded.zakazchik_bank, t2_shartnoma.zakazchik_bank),
                zakazchik_mfo = coalesce(excluded.zakazchik_mfo, t2_shartnoma.zakazchik_mfo),
                zakazchik_inn = coalesce(excluded.zakazchik_inn, t2_shartnoma.zakazchik_inn),
                zakazchik_oked = coalesce(excluded.zakazchik_oked, t2_shartnoma.zakazchik_oked)
  returning id, versiya into v_id, v_ver;

  return jsonb_build_object('ok', true, 'shartnoma_id', v_id, 'versiya', v_ver);
end $function$;

alter table public.t2_shartnoma drop column if exists zakazchik_kompaniya_id;

commit;
