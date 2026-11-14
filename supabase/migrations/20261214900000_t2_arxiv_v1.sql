-- 20261214900000 t2_arxiv_v1
-- «Arxivlash / Korzinkaga»: loyiha, obyekt, shartnoma, kontragent, AOSR qoralama, F2 qoralama.
-- Yumshoq o'chirish (holat='bekor') + tiklash; tasdiqlangan hujjat bor bo'lsa bloklanadi (aniq sabab bilan).
-- Mavjud t2_korzinka mexanizmi (obyekt/smeta/sklad) o'zgarmaydi; yangi turlar t2_arxiv_yozuv orqali shu ko'rinishga qo'shiladi.
-- Nega alohida jadval: t2_akt/t2_aosr/t2_shartnoma da holat='bekor' avvaldan boshqa ma'noda (storno/bekor) ishlatiladi —
--   faqat arxivlanganlarini (va oldingi holatini) ajratib turish uchun. DB hajmi: bir qator ~100 B, oyiga <0.1 MB.
-- Qattiq o'chirish (butunlay) faqat admin/superadmin, faqat arxivdagi qatorga, bog'liq yozuv bo'lsa rad etiladi.

create table if not exists public.t2_arxiv_yozuv (
  id            bigint generated always as identity primary key,
  kompaniya_id  bigint not null,
  tur           text   not null check (tur in ('loyiha','shartnoma','kontragent','aosr','akt')),
  rid           bigint not null,
  oldingi_holat text   not null,
  kim_id        bigint,
  vaqt          timestamptz not null default now(),
  unique (tur, rid)
);
alter table public.t2_arxiv_yozuv enable row level security;
revoke all on public.t2_arxiv_yozuv from anon, authenticated;

-- Arxivlash.
create or replace function public.t2_arxivla_v1(p_actor_id bigint, p_tur text, p_id bigint, p_operation_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_komp bigint; v_holat text; v_rol text; v_n bigint; v_ruxsat boolean;
begin
  if p_tur not in ('loyiha','obyekt','shartnoma','kontragent','aosr','akt') then
    return jsonb_build_object('ok', false, 'code', 'TUR_NOMALUM', 'xabar', 'Noma''lum tur');
  end if;
  if p_tur = 'loyiha' then select kompaniya_id, holat into v_komp, v_holat from t2_loyiha where id = p_id for update;
  elsif p_tur = 'obyekt' then select kompaniya_id, holat into v_komp, v_holat from t2_obyekt where id = p_id for update;
  elsif p_tur = 'shartnoma' then select kompaniya_id, holat into v_komp, v_holat from t2_shartnoma where id = p_id for update;
  elsif p_tur = 'kontragent' then select kompaniya_id, holat into v_komp, v_holat from t2_kontragent where id = p_id for update;
  elsif p_tur = 'aosr' then select kompaniya_id, holat into v_komp, v_holat from t2_aosr where id = p_id for update;
  else select kompaniya_id, holat into v_komp, v_holat from t2_akt where id = p_id for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'xabar', 'Yozuv topilmadi'); end if;

  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  v_ruxsat := v_rol in ('admin','superadmin','boss','director','pto')
    or (p_tur = 'shartnoma' and v_rol = 'bugalter');
  if not v_ruxsat then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Arxivlash uchun rolingiz yetarli emas');
  end if;
  if v_holat = 'bekor' then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON', 'xabar', 'Allaqachon arxivda yoki bekor qilingan');
  end if;

  -- Bloklar: tasdiqlangan hujjat bor bo'lsa arxivlanmaydi.
  if p_tur = 'loyiha' then
    select (select count(*) from t2_akt a join t2_obyekt o on o.id = a.obyekt_id where o.loyiha_id = p_id and a.holat = 'tasdiqlangan')
         + (select count(*) from t2_aosr s join t2_obyekt o on o.id = s.obyekt_id where o.loyiha_id = p_id and s.holat = 'tasdiqlangan') into v_n;
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'code', 'TASDIQLANGAN_BOR', 'soni', v_n,
        'xabar', format('Loyihada %s ta tasdiqlangan hujjat (F2/AOSR) bor — arxivlab bo''lmaydi. Avval ularni bekor qiling (storno).', v_n));
    end if;
  elsif p_tur = 'obyekt' then
    select (select count(*) from t2_akt where obyekt_id = p_id and holat = 'tasdiqlangan')
         + (select count(*) from t2_aosr where obyekt_id = p_id and holat = 'tasdiqlangan') into v_n;
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'code', 'TASDIQLANGAN_BOR', 'soni', v_n,
        'xabar', format('Obyektda %s ta tasdiqlangan hujjat (F2/AOSR) bor — arxivlab bo''lmaydi. Avval ularni bekor qiling (storno).', v_n));
    end if;
  elsif p_tur = 'shartnoma' then
    select (select count(*) from t2_akt where shartnoma_id = p_id and holat = 'tasdiqlangan')
         + (select count(*) from t2_tolov where shartnoma_id = p_id and holat = 'faol') into v_n;
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'code', 'TASDIQLANGAN_BOR', 'soni', v_n,
        'xabar', format('Shartnomada %s ta tasdiqlangan F2 yoki to''lov yozuvi bor — arxivlab bo''lmaydi.', v_n));
    end if;
  elsif p_tur = 'aosr' then
    if v_holat <> 'yangi' then
      return jsonb_build_object('ok', false, 'code', 'TASDIQLANGAN_BOR', 'xabar', 'Faqat qoralama AOSR arxivlanadi; tasdiqlangan/qog''oz AOSR ni bekor qilish alohida amal.');
    end if;
  elsif p_tur = 'akt' then
    if v_holat <> 'qoralama' then
      return jsonb_build_object('ok', false, 'code', 'TASDIQLANGAN_BOR', 'xabar', 'Faqat qoralama F2 arxivlanadi; tasdiqlangan F2 faqat «Bekor qilish» (storno) bilan.');
    end if;
  end if;

  if p_tur = 'loyiha' then update t2_loyiha set holat = 'bekor', versiya = versiya + 1 where id = p_id;
  elsif p_tur = 'obyekt' then update t2_obyekt set holat = 'bekor', versiya = versiya + 1 where id = p_id;
  elsif p_tur = 'shartnoma' then update t2_shartnoma set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_id;
  elsif p_tur = 'kontragent' then update t2_kontragent set holat = 'bekor', versiya = versiya + 1 where id = p_id;
  elsif p_tur = 'aosr' then update t2_aosr set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_id;
  else update t2_akt set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_id;
  end if;
  if p_tur <> 'obyekt' then
    insert into t2_arxiv_yozuv (kompaniya_id, tur, rid, oldingi_holat, kim_id) values (v_komp, p_tur, p_id, v_holat, p_actor_id)
    on conflict (tur, rid) do update set oldingi_holat = excluded.oldingi_holat, kim_id = excluded.kim_id, vaqt = now();
  end if;
  perform public.t2_audit_yoz(v_komp, 'arxivlandi', p_tur, null, format('%s=%s', p_tur, p_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'tur', p_tur, 'id', p_id);
end $$;

-- Tiklash (Korzinkadan).
create or replace function public.t2_arxivdan_tiklash_v1(p_actor_id bigint, p_tur text, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_komp bigint; v_holat text; v_rol text; v_old text;
begin
  if p_tur not in ('loyiha','shartnoma','kontragent','aosr','akt') then
    return jsonb_build_object('ok', false, 'code', 'TUR_NOMALUM', 'xabar', 'Noma''lum tur');
  end if;
  select kompaniya_id, oldingi_holat into v_komp, v_old from t2_arxiv_yozuv where tur = p_tur and rid = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ARXIVDA_YOQ', 'xabar', 'Bu yozuv arxivlanmagan (boshqa yo''l bilan bekor qilingan)');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') and not (p_tur = 'shartnoma' and v_rol = 'bugalter') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Tiklash uchun rolingiz yetarli emas');
  end if;
  if p_tur = 'loyiha' then update t2_loyiha set holat = v_old, versiya = versiya + 1 where id = p_id and holat = 'bekor';
  elsif p_tur = 'shartnoma' then update t2_shartnoma set holat = v_old, versiya = versiya + 1, yangilandi = now() where id = p_id and holat = 'bekor';
  elsif p_tur = 'kontragent' then update t2_kontragent set holat = v_old, versiya = versiya + 1 where id = p_id and holat = 'bekor';
  elsif p_tur = 'aosr' then update t2_aosr set holat = v_old, versiya = versiya + 1, yangilandi = now() where id = p_id and holat = 'bekor';
  else update t2_akt set holat = v_old, versiya = versiya + 1, yangilandi = now() where id = p_id and holat = 'bekor';
  end if;
  delete from t2_arxiv_yozuv where tur = p_tur and rid = p_id;
  perform public.t2_audit_yoz(v_komp, 'arxivdan_tiklandi', p_tur, null, format('%s=%s', p_tur, p_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'tur', p_tur, 'id', p_id, 'holat', v_old);
end $$;

-- Butunlay o'chirish: faqat admin/superadmin, faqat arxivdagi qator; bog'liq yozuv bo'lsa rad.
create or replace function public.t2_arxiv_butunlay_v1(p_actor_id bigint, p_tur text, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_komp bigint; v_rol text;
begin
  if p_tur not in ('loyiha','shartnoma','kontragent','aosr','akt') then
    return jsonb_build_object('ok', false, 'code', 'TUR_NOMALUM', 'xabar', 'Noma''lum tur');
  end if;
  select kompaniya_id into v_komp from t2_arxiv_yozuv where tur = p_tur and rid = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ARXIVDA_YOQ', 'xabar', 'Faqat korzinkadagi (arxivlangan) yozuv butunlay o''chiriladi');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('admin','superadmin') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Butunlay o''chirish faqat administratorga ruxsat etilgan');
  end if;
  begin
    if p_tur = 'loyiha' then delete from t2_loyiha where id = p_id and holat = 'bekor';
    elsif p_tur = 'shartnoma' then delete from t2_shartnoma where id = p_id and holat = 'bekor';
    elsif p_tur = 'kontragent' then delete from t2_kontragent where id = p_id and holat = 'bekor';
    elsif p_tur = 'aosr' then delete from t2_aosr where id = p_id and holat = 'bekor';
    else delete from t2_akt where id = p_id and holat = 'bekor';
    end if;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'xabar', 'Topilmadi yoki arxivda emas');
    end if;
  exception when foreign_key_violation then
    return jsonb_build_object('ok', false, 'code', 'BOGLIQ_BOR', 'xabar', 'Bog''liq yozuvlar bor — butunlay o''chirib bo''lmaydi (arxivda qoldiring).');
  end;
  delete from t2_arxiv_yozuv where tur = p_tur and rid = p_id;
  perform public.t2_audit_yoz(v_komp, 'arxivdan_ochirildi', p_tur, null, format('%s=%s', p_tur, p_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.t2_arxivla_v1(bigint, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_arxivdan_tiklash_v1(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.t2_arxiv_butunlay_v1(bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.t2_arxivla_v1(bigint, text, bigint, uuid) to service_role;
grant execute on function public.t2_arxivdan_tiklash_v1(bigint, text, bigint) to service_role;
grant execute on function public.t2_arxiv_butunlay_v1(bigint, text, bigint) to service_role;

-- Korzinka ko'rinishi: mavjud 3 tur + arxivlangan yangi turlar (ustunlar o'zgarmaydi).
create or replace view public.t2_korzinka as
 select t2_obyekt.id, t2_obyekt.nom as nomi, 't2_obyekt'::text as jadval, t2_obyekt.kompaniya_id, t2_obyekt.yangilandi as ochirilgan_vaqt
   from t2_obyekt where t2_obyekt.holat = 'bekor'
 union all
 select t2_shaxsiy_smeta.id, t2_shaxsiy_smeta.nom, 't2_shaxsiy_smeta'::text, t2_shaxsiy_smeta.kompaniya_id, t2_shaxsiy_smeta.yangilandi
   from t2_shaxsiy_smeta where t2_shaxsiy_smeta.holat = 'bekor'
 union all
 select t2_sklad_harakat.id, t2_sklad_harakat.nomi, 't2_sklad_harakat'::text, t2_sklad_harakat.kompaniya_id, t2_sklad_harakat.yaratildi
   from t2_sklad_harakat where t2_sklad_harakat.holat = 'bekor'
 union all
 select l.id, l.nom, 't2_loyiha'::text, l.kompaniya_id, a.vaqt
   from t2_loyiha l join t2_arxiv_yozuv a on a.tur = 'loyiha' and a.rid = l.id where l.holat = 'bekor'
 union all
 select s.id, btrim(coalesce(s.raqam, '') || ' ' || coalesce(s.nom, '')), 't2_shartnoma'::text, s.kompaniya_id, a.vaqt
   from t2_shartnoma s join t2_arxiv_yozuv a on a.tur = 'shartnoma' and a.rid = s.id where s.holat = 'bekor'
 union all
 select k.id, k.nom, 't2_kontragent'::text, k.kompaniya_id, a.vaqt
   from t2_kontragent k join t2_arxiv_yozuv a on a.tur = 'kontragent' and a.rid = k.id where k.holat = 'bekor'
 union all
 select r.id, 'AOSR ' || coalesce(r.raqam, ''), 't2_aosr'::text, r.kompaniya_id, a.vaqt
   from t2_aosr r join t2_arxiv_yozuv a on a.tur = 'aosr' and a.rid = r.id where r.holat = 'bekor'
 union all
 select f.id, 'F2 ' || coalesce(f.raqam, ''), 't2_akt'::text, f.kompaniya_id, a.vaqt
   from t2_akt f join t2_arxiv_yozuv a on a.tur = 'akt' and a.rid = f.id where f.holat = 'bekor';
