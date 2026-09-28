-- T2_SHARTNOMA_ZAKAZCHIK_KOMPANIYA_BOG_V1 — egasi (2026-09-28): "bu rekvizit
-- masalasi eng baland iyerarxiyada — tomonlar (ЗАКАЗЧИК/ПОДРЯДЧИК) kiritilib
-- BOG'LANGANIDA hal qilinadigan narsa". Har shartnomada Zakazchik rekvizitini
-- qayta yozish o'rniga: `t2_kompaniya` allaqachon "tomon" registri (mavqe
-- ustuni — zakazchik|pudratchi|loyihachi, to'liq rekvizitlar bilan). Endi
-- shartnoma to'g'ridan-to'g'ri shu registrga BOG'LANADI — bitta zakazchik
-- kompaniyasi rekviziti BIR MARTA kiritiladi, uni ishlatuvchi barcha
-- shartnoma/obyekt/F3 hujjatlari o'sha bog'lanishdan o'qiydi.
--
-- 20260928124141 dagi `zakazchik_*` matn ustunlari OLIB TASHLANMAYDI — ular
-- ZAXIRA: kompaniya hali ro'yxatga olinmagan bo'lsa tezkor kiritish uchun.
-- Frontend avval `zakazchik_kompaniya_id` bog'lanishini o'qiydi, faqat u
-- bo'sh bo'lsa matn ustunlariga qaraydi (bu fayl DB kontraktini o'zgartirmaydi
-- — tanlov tartibi API/frontend qatlamida).
begin;

alter table public.t2_shartnoma
  add column if not exists zakazchik_kompaniya_id bigint references public.t2_kompaniya(id);

comment on column public.t2_shartnoma.zakazchik_kompaniya_id is
  'ЗАКАЗЧИК — t2_kompaniya registriga bog''lanish (mavqe=''zakazchik''). Rekvizit bir marta kompaniya profilida kiritiladi, bu yerda faqat bog''lanadi. zakazchik_* matn ustunlari faqat kompaniya hali ro''yxatga olinmaganda zaxira.';

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
  p_zakazchik_oked text default null,
  p_zakazchik_kompaniya_id bigint default null
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

  if p_zakazchik_kompaniya_id is not null and not exists (select 1 from t2_kompaniya where id = p_zakazchik_kompaniya_id) then
    return jsonb_build_object('ok', false, 'sabab', 'zakazchik_kompaniya', 'xabar', 'Zakazchik kompaniyasi topilmadi');
  end if;

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
                            zakazchik_inn, zakazchik_oked, zakazchik_kompaniya_id)
  values (v_komp, btrim(p_raqam), p_nom, p_taraf, p_summa_bez_nds, p_nds,
          p_jami_nds_bilan, p_chel_stavka, p_izoh, p_kim,
          p_zakazchik_toliq_nom, p_zakazchik_manzil, p_zakazchik_telefon,
          p_zakazchik_hisob_raqam, p_zakazchik_bank, p_zakazchik_mfo,
          p_zakazchik_inn, p_zakazchik_oked, p_zakazchik_kompaniya_id)
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
                zakazchik_oked = coalesce(excluded.zakazchik_oked, t2_shartnoma.zakazchik_oked),
                zakazchik_kompaniya_id = coalesce(excluded.zakazchik_kompaniya_id, t2_shartnoma.zakazchik_kompaniya_id)
  returning id, versiya into v_id, v_ver;

  return jsonb_build_object('ok', true, 'shartnoma_id', v_id, 'versiya', v_ver);
end $function$;

commit;
