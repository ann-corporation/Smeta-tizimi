-- AI ISHCHILARNI YOQISH (egasi qarori 2026-11-17): bitta kompaniya (NEW TIMES PTO, id 17) + tizim ishchisi; fon ulushi 40 % (platforma byudjeti 5 USD/oy => ~2 USD/oy fon ishchilarga).
-- Yoqish mexanizmi: t2_ai_sozlama.yoqilgan (har kompaniya x ishchi) - sukut false; qo'shimcha: platforma byudjeti t2_agent_byudjet (kompaniya_id NULL) bo'lmasa AI umuman ishlamaydi (BYUDJET_YOQ).
-- Qamrov: kunlik_nazoratchi (kunlik, 03:00 UTC = 08:00 Toshkent), hujjat_tekshiruvchi (qo'lda tugma), tizim_sogligi (haftalik). narx_kuzatuvchi va internet_kuzatuvchi YOQILMAYDI.
-- Mavjud qiymatlarni BOSMAYDI (on conflict do nothing): egasi UI dan o'zgartirgan bo'lsa saqlanadi. Aktor = kompaniya 17 a'zosi bo'lgan birinchi superadmin; topilmasa hech narsa yoqilmaydi (notice).
-- Cron (GitHub ai-ishchilar.yml) uchun alohida shart: KUZATUV_KALIT sirri (GitHub + Cloudflare) - SQL bilan o'rnatilmaydi.
set local statement_timeout = '60s';

do $$
declare v_actor bigint; r record; v_kid constant bigint := 17;
begin
  if not exists (select 1 from public.t2_kompaniya where id = v_kid) then raise notice 'kompaniya % yo''q - AI ishchilar yoqilmadi', v_kid; return; end if;
  for r in select f.id from public.t2_foydalanuvchi f where public.t2_platforma_superadmin(f.id) order by f.id loop
    begin
      perform public.t2_actor_kompaniya_azo_tekshir(v_kid, r.id);
      v_actor := r.id; exit;
    exception when others then continue;
    end;
  end loop;
  if v_actor is null then raise notice 'kompaniya % a''zosi bo''lgan superadmin topilmadi - AI ishchilar yoqilmadi', v_kid; return; end if;

  -- Platforma oylik byudjeti 5 USD (faqat YO'Q bo'lsa), fon ulushi 40 %.
  insert into public.t2_agent_byudjet (kompaniya_id, oylik_limit_usd, ogohlantirish_foiz, faol, actor_id) values (null, 5, 80, true, v_actor)
  on conflict (coalesce(kompaniya_id, 0)) do nothing;
  update public.t2_ai_limit set fon_foiz = 40, actor_id = v_actor, yangilandi = now() where id = 1 and fon_foiz is distinct from 40;

  insert into public.t2_ai_sozlama (kompaniya_id, ishchi_kod, yoqilgan, jadval, soat, ai_xulosa, max_token_ish, kirish, actor_id) values
    (v_kid, 'kunlik_nazoratchi',   true, 'kunlik',  3, true, 3000, '{}'::jsonb, v_actor),
    (v_kid, 'hujjat_tekshiruvchi', true, 'qolda',   1, true, 3000, '{}'::jsonb, v_actor),
    (null,  'tizim_sogligi',       true, 'haftalik', 4, true, 3000, '{}'::jsonb, v_actor)
  on conflict (coalesce(kompaniya_id, 0), ishchi_kod) do nothing;
end $$;