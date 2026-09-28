-- T2_SHARTNOMA_ZAKAZCHIK_REKVIZIT_V1 — egasi (2026-09-28): F3 (СПРАВКА-СЧЕТ-ФАКТУРА)
-- haqiqiy hujjatda ikkala tomonning TO'LIQ rekvizitlari bor (адрес, телефон,
-- р/с, банк, МФО, ИНН, ОКЭД). Bazada Подрядчик (t2_kompaniya) rekvizitlari
-- allaqachon bor edi, lekin OKED yo'q edi; Заказчик rekvizitlari esa
-- umuman saqlanadigan joy yo'q edi (faqat nom — `t2_shartnoma.taraf`, matn).
-- Qo'shiladi: additive, nullable, mavjud qatorlarga ta'sir qilmaydi.
begin;

alter table public.t2_kompaniya
  add column if not exists oked text;

alter table public.t2_shartnoma
  add column if not exists zakazchik_toliq_nom text,
  add column if not exists zakazchik_manzil text,
  add column if not exists zakazchik_telefon text,
  add column if not exists zakazchik_hisob_raqam text,
  add column if not exists zakazchik_bank text,
  add column if not exists zakazchik_mfo text,
  add column if not exists zakazchik_inn text,
  add column if not exists zakazchik_oked text;

comment on column public.t2_kompaniya.oked is 'ОКЭД kodi — F3 (счет-фактура) titulida Подрядчик rekviziti.';
comment on column public.t2_shartnoma.zakazchik_toliq_nom is 'Заказчик to''liq nomi (F3 titulida) — `taraf` bilan bir xil bo''lishi shart emas (taraf qisqa/erkin matn bo''lishi mumkin).';
comment on column public.t2_shartnoma.zakazchik_oked is 'Заказчик ОКЭД kodi.';

-- t2_shartnoma_saqla: Заказчик rekvizitlarini ham qabul qiladi va saqlaydi.
-- Eski chaqiruvchilar (parametrlarni bermaydi) — barchasi DEFAULT NULL,
-- upsert `coalesce(excluded.x, t2_shartnoma.x)` bilan mavjud qiymatni
-- yo'qotmaydi (frontend faqat o'zgargan maydonni yuboradi).
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

-- t2_kompaniya_yangila: OKED ham qabul qilinadi. Yangi parametr OXIRIGA
-- qo'shildi (DEFAULT bilan) — eski pozitsion chaqiruvchilar buzilmaydi.
create or replace function public.t2_kompaniya_yangila(
  p_id bigint, p_kutilgan_versiya integer,
  p_toliq_nom text default null, p_inn text default null, p_manzil text default null,
  p_rahbar text default null, p_telefon text default null, p_bank text default null,
  p_hisob_raqam text default null, p_mfo text default null, p_mavqe text default null,
  p_oked text default null
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
    mavqe = coalesce(p_mavqe, mavqe), oked = coalesce(p_oked, oked), versiya = versiya + 1
  where id = p_id;
  return jsonb_build_object('ok', true, 'yangi_versiya', v_bor + 1);
end; $function$;

commit;
