-- 20270119000300 - TEXNADZOR TEKSHIRUVI: ikki tomonlama xabarnoma (sayt qo'ng'iroqchasi + Telegram) va Excel'dan import ko'prigi (PR-c).
-- Xabarnoma = mavjud outbox yo'li (t2_outbox_yoz -> t2_outbox_ishlov_v1 -> t2_bildirishnoma -> Telegram navbati); yangi kanal YO'Q. Triggerlar xato bo'lsa
-- asosiy amalni BUZMAYDI (warning). Mavzular:
--   tekshiruv.yuborildi  - tekshiruvchi umumiy holatni qo'ydi (Ko'rib chiqildi/Qaytarildi/Qabul): PTO kompaniyasi boshqaruvchilariga
--   tekshiruv.qaror      - PTO taklif bo'yicha qaror qo'ydi: shu tekshiruvchiga (sabab payload da emas - panelda)
--   tekshiruv.f2_yangilandi - F-2 qayta saqlandi (versiya oshdi): ko'rib chiqqan/qaytargan tekshiruvchilarga ("nima o'zgardi" - panelda eskirgan belgisi + qarorlar)
-- Excel ko'prigi: qaytgan texnadzor Excel'i (eski solishtirish) shu bir xil takliflar jadvaliga aylanadi - ikki yo'l bitta joyda tugaydi.
-- Talab: 20270119000100, 20270119000200.

create or replace function public._t2_tekshiruv_holat_outbox() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.t2_tekshiruv_bog%rowtype;
begin
  if new.holat is not distinct from old.holat or new.holat = 'qoralama' then return new; end if;
  begin
    select * into b from public.t2_tekshiruv_bog where id = new.bog_id;
    perform public.t2_outbox_yoz(b.kompaniya_id, 'tekshiruv.yuborildi', 't2_tekshiruv', new.id,
      jsonb_build_object('obyekt_id', b.obyekt_id, 'akt_id', b.akt_id, 'holat', new.holat), new.tekshiruvchi_id, null, b.obyekt_id, null, array[b.kompaniya_id], '{}'::bigint[]);
  exception when others then
    raise warning 'T2_TEKSHIRUV: holat xabari yozilmadi: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists t2_tekshiruv_holat_outbox_trg on public.t2_tekshiruv;
create trigger t2_tekshiruv_holat_outbox_trg after update of holat on public.t2_tekshiruv for each row execute function public._t2_tekshiruv_holat_outbox();

create or replace function public._t2_tekshiruv_qaror_outbox() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_tekshiruv%rowtype; b public.t2_tekshiruv_bog%rowtype;
begin
  if new.qaror is not distinct from old.qaror or new.qaror = 'kutilmoqda' then return new; end if;
  begin
    select * into t from public.t2_tekshiruv where id = new.tekshiruv_id;
    select * into b from public.t2_tekshiruv_bog where id = t.bog_id;
    perform public.t2_outbox_yoz(b.kompaniya_id, 'tekshiruv.qaror', 't2_tekshiruv_taklif', new.id,
      jsonb_build_object('obyekt_id', b.obyekt_id, 'akt_id', b.akt_id, 'qaror', new.qaror, 'token', (select n.token from public.t2_nashr n where n.id = b.nashr_id)), new.qaror_id, null, b.obyekt_id, null, '{}'::bigint[], array[t.tekshiruvchi_id]);
  exception when others then
    raise warning 'T2_TEKSHIRUV: qaror xabari yozilmadi: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists t2_tekshiruv_qaror_outbox_trg on public.t2_tekshiruv_taklif;
create trigger t2_tekshiruv_qaror_outbox_trg after update of qaror on public.t2_tekshiruv_taklif for each row execute function public._t2_tekshiruv_qaror_outbox();

-- F-2 qayta saqlanganda (versiya oshdi): ko'rib chiqqan/qaytargan tekshiruvchilarga xabar (har tekshiruvchiga bitta, shu versiya uchun).
create or replace function public._t2_tekshiruv_akt_outbox() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ids bigint[];
begin
  if new.versiya is not distinct from old.versiya or new.tur <> 'f2' then return new; end if;
  begin
    select array_agg(distinct t.tekshiruvchi_id) into v_ids from public.t2_tekshiruv t join public.t2_tekshiruv_bog b on b.id = t.bog_id
     where b.akt_id = new.id and t.holat in ('korib_chiqildi', 'qaytarildi');
    if v_ids is not null then
      perform public.t2_outbox_yoz(new.kompaniya_id, 'tekshiruv.f2_yangilandi', 't2_akt', new.id,
        jsonb_build_object('obyekt_id', new.obyekt_id, 'akt_id', new.id, 'versiya', new.versiya), null, gen_random_uuid(), new.obyekt_id, null, '{}'::bigint[], v_ids);
    end if;
  exception when others then
    raise warning 'T2_TEKSHIRUV: F-2 yangilandi xabari yozilmadi: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists t2_tekshiruv_akt_outbox_trg on public.t2_akt;
create trigger t2_tekshiruv_akt_outbox_trg after update of versiya on public.t2_akt for each row execute function public._t2_tekshiruv_akt_outbox();

-- ===== Excel'dan import: qaytgan texnadzor Excel'idan olingan takliflar -> bir xil takliflar jadvali =====
-- Faqat PTO (kompaniya a'zosi). Bog' akt+joriy versiya bo'yicha bitta (nashrsiz); tekshiruv muallifi = import qilgan odam (izoh: "Excel: <fayl>").
-- Qaror qo'yilgan taklif qayta yozilmaydi; F-2 da yo'q qator o'tkazib yuboriladi (sanaladi). Jadvallar uchun yagona yozuv yo'li: F-2 ga TEGILMAYDI.
create or replace function public.t2_tekshiruv_excel_import_v1(p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint, p_takliflar jsonb, p_fayl_nomi text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_akt%rowtype; b public.t2_tekshiruv_bog%rowtype; t public.t2_tekshiruv%rowtype; e jsonb; v_q bigint; v_baf text; v_rang text; v_izoh text; v_ht text; v_h numeric;
        v_ok int := 0; v_otkazildi int := 0;
begin
  if p_actor_id is null or p_kompaniya_id is null or p_akt_id is null
     or not exists (select 1 from public.t2_azolik z where z.kompaniya_id = p_kompaniya_id and z.foydalanuvchi_id = p_actor_id and z.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  if p_takliflar is null or jsonb_typeof(p_takliflar) <> 'array' or jsonb_array_length(p_takliflar) not between 1 and 3000 or length(coalesce(p_fayl_nomi, '')) > 160 then
    return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI');
  end if;
  select * into a from public.t2_akt where id = p_akt_id and kompaniya_id = p_kompaniya_id and tur = 'f2' and holat <> 'bekor';
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_TOPILMADI'); end if;
  select * into b from public.t2_tekshiruv_bog where akt_id = a.id and akt_versiya = a.versiya and nashr_id is null;
  if not found then
    insert into public.t2_tekshiruv_bog (nashr_id, kompaniya_id, obyekt_id, akt_id, akt_versiya, yaratgan_id) values (null, a.kompaniya_id, a.obyekt_id, a.id, a.versiya, p_actor_id) returning * into b;
  end if;
  insert into public.t2_tekshiruv (bog_id, tekshiruvchi_id) values (b.id, p_actor_id) on conflict (bog_id, tekshiruvchi_id) do nothing;
  select * into t from public.t2_tekshiruv where bog_id = b.id and tekshiruvchi_id = p_actor_id for update;
  for e in select x from jsonb_array_elements(p_takliflar) x loop
    v_q := nullif(e->>'qator_id', '')::bigint; v_baf := nullif(e->>'bayroq', ''); v_rang := nullif(e->>'rang', '');
    v_izoh := left(nullif(btrim(coalesce(e->>'izoh', '')), ''), 1000); v_ht := left(nullif(btrim(coalesce(e->>'hujjat_turi', '')), ''), 80); v_h := nullif(e->>'taklif_hajm', '')::numeric;
    if v_q is null or not exists (select 1 from public.t2_akt_qator aq where aq.akt_id = a.id and aq.qator_id = v_q and aq.manba_akt_qator_id is null)
       or (v_baf is not null and v_baf not in ('olib_tashlansin', 'hajm_notogri', 'hujjat_kerak', 'qabul')) or (v_rang is not null and v_rang not in ('qizil', 'sariq', 'yashil', 'kok'))
       or (v_h is not null and v_h < 0) or (v_baf = 'hujjat_kerak' and v_ht is null) or (v_baf is null and v_izoh is null and v_h is null) then
      v_otkazildi := v_otkazildi + 1; continue;
    end if;
    insert into public.t2_tekshiruv_taklif (tekshiruv_id, qator_id, bayroq, izoh, taklif_hajm, rang, hujjat_turi, qosh)
    values (t.id, v_q, v_baf, v_izoh, v_h, v_rang, v_ht, false)
    on conflict (tekshiruv_id, qator_id) do update set bayroq = excluded.bayroq, izoh = excluded.izoh, taklif_hajm = excluded.taklif_hajm, rang = excluded.rang, hujjat_turi = excluded.hujjat_turi, yangilandi = now()
      where public.t2_tekshiruv_taklif.qaror = 'kutilmoqda';
    if found then v_ok := v_ok + 1; else v_otkazildi := v_otkazildi + 1; end if;
  end loop;
  update public.t2_tekshiruv set izoh = left('Excel: ' || coalesce(nullif(btrim(p_fayl_nomi), ''), 'fayl'), 2000), yangilandi = now() where id = t.id;
  perform public.t2_audit_yoz(a.kompaniya_id, 'tekshiruv_excel_import', 'tekshiruv', t.id, format('akt=%s qoshildi=%s otkazildi=%s', a.id, v_ok, v_otkazildi), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qoshildi', v_ok, 'otkazildi', v_otkazildi);
end $$;

do $g$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname = 't2_tekshiruv_excel_import_v1' or p.proname like '\_t2\_tekshiruv\_%outbox') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $g$;
