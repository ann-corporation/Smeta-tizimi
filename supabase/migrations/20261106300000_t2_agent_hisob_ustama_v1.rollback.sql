-- Orqaga qaytarish: AI hisob-kitob/ustama. Eski sarf_tekshir/sarf_yoz/hisobot/markaz funksiyalarini 20261106290000 qayta yaratadi (uni qayta qo'llang).
drop function if exists public.t2_agent_ustama_belgila_v1(bigint, bigint, numeric);
drop function if exists public._t2_agent_ustama_v1(bigint);
drop table if exists public.t2_agent_ustama;
alter table public.t2_agent_sarf drop column if exists ustama_foiz;
alter table public.t2_agent_sarf drop column if exists mijoz_token;
alter table public.t2_agent_sarf drop column if exists mijoz_usd;
alter table public.t2_token_sozlama drop column if exists ai_ustama_foiz;
-- Yozilgan t2_token_harakat (amal='ai_sarf') qatorlari hisob tarixi sifatida SAQLANADI (o'chirilmaydi).
