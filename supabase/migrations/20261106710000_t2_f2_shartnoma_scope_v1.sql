-- T2-F2-SHARTNOMA-SCOPE (ADR-1; Smeta Network auditi P0 «F2 contract scope DB invariant»; 2026-10-21).
-- Holat: 27/27 F2 shartnomasiz (24 tasi tasdiqlangan) — shartnoma bo'yicha bajarilgan hajm/qoldiq ishonchsiz.
-- Qoida (bazada, har yozish yo'lida — RPC, tuzatish akti, import):
--   1) F2 aktda shartnoma_id berilsa — u AYNAN shu obyektga faol bog'langan (t2_shartnoma_bog) va shu kompaniyaniki
--      bo'lishi shart; aks holda F2_SHARTNOMA_SCOPE xatosi.
--   2) Yangi F2 da shartnoma berilmasa va obyektda AYNAN BITTA faol shartnoma bo'lsa — o'sha qo'yiladi (taxmin emas:
--      boshqa variant yo'q). Bir nechta bo'lsa — bo'sh qoladi (tanlash UI si Faza 3, Golden C). Shartnomasiz obyekt
--      (yakka PTO, Tools beta) — F2 shartnomasiz qoladi.
--   3) Eski (LEGACY) F2 lar O'ZGARTIRILMAYDI — taxmin bilan bog'lanmaydi (ADR-1). Trigger faqat INSERT va
--      shartnoma_id/obyekt_id o'zgarganda ishlaydi.
begin;

create or replace function public.t2_akt_shartnoma_scope_v1()
 returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
declare v_id bigint; v_n int;
begin
  if new.tur is distinct from 'f2' then return new; end if;
  if tg_op = 'UPDATE' and new.shartnoma_id is not distinct from old.shartnoma_id and new.obyekt_id is not distinct from old.obyekt_id then
    return new;
  end if;
  if new.shartnoma_id is null then
    if tg_op = 'INSERT' then
      select min(b.shartnoma_id), count(distinct b.shartnoma_id) into v_id, v_n
        from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
       where b.obyekt_id = new.obyekt_id and b.holat = 'faol' and s.holat = 'faol'
         and s.kompaniya_id is not distinct from new.kompaniya_id;
      if v_n = 1 then new.shartnoma_id := v_id; end if;
    end if;
    return new;
  end if;
  if not exists (select 1 from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
                  where b.obyekt_id = new.obyekt_id and b.shartnoma_id = new.shartnoma_id and b.holat = 'faol'
                    and s.kompaniya_id is not distinct from new.kompaniya_id) then
    raise exception 'F2_SHARTNOMA_SCOPE: shartnoma % obyekt % ga bog''lanmagan yoki boshqa kompaniyaniki', new.shartnoma_id, new.obyekt_id
      using errcode = '23514';
  end if;
  return new;
end $function$;

drop trigger if exists t2_akt_shartnoma_scope on public.t2_akt;
create trigger t2_akt_shartnoma_scope before insert or update of shartnoma_id, obyekt_id on public.t2_akt
  for each row execute function public.t2_akt_shartnoma_scope_v1();

commit;
