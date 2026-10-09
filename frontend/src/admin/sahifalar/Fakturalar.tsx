import React, { useMemo, useState, useRef } from 'react';
import { useFakturalarOl, useFakturaYoz, useFakturaFaylYoz, useFakturaAiParse, useFakturaDriveHolat, useFakturaAvtoSinx, useFakturaSinxFonda, type FakturaItem,
  useFakturaSinxToxtat, useFakturaSinxDavom, useFakturaOxirgiIjro,
  useFakturaXatoLoglar, useFakturaXatodanTikla,
  /* ⚡ 2026-08-17 (audit): ulanmagan edi — «nega o'qilmayapti» ni bir
     faylda tekshirish uchun */
  useFakturaBittaSinov } from '../../api/hooks';
import { Sahifa, Holatlar, Tugma } from '../../umumiy/ui/Sahifa';
import { ModelChip } from '../../umumiy/ui/ModelChip';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { IlgorJadval, type IlgorUstun } from '../../umumiy/ui/IlgorJadval';
import { toast } from '../../umumiy/ui/Toast';
import { FileUp, Save, X, RefreshCw, FolderOpen, FolderArchive, FolderX, ExternalLink, FileText, Wrench } from 'lucide-react';
import { FmtN } from '../../lib/format';

export function Fakturalar() {
  const soragan = useFakturalarOl();
  /* ⚡ 2026-08-16: sinxron boshqaruvi va tiklash asboblari */
  const fToxtat = useFakturaSinxToxtat();
  const fDavom  = useFakturaSinxDavom();
  const fOxirgi = useFakturaOxirgiIjro();
  const fXato   = useFakturaXatoLoglar(30);
  const fTikla  = useFakturaXatodanTikla();
  const fSinov  = useFakturaBittaSinov();
  const [sinovFayl, setSinovFayl] = useState('');

  const bittaSinov = () => {
    const nom = sinovFayl.trim();
    if (!nom) { toast('Fayl nomini kiriting', 'warn'); return; }
    fSinov.mutate({ faylNomi: nom }, {
      onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
    });
  };
  const yoz = useFakturaYoz();
  const faylYoz = useFakturaFaylYoz();
  const aiParse = useFakturaAiParse();
  const { joriyId: aiKompaniyaId } = useKompaniya();
  const drvHolat = useFakturaDriveHolat();
  const drvSinx = useFakturaAvtoSinx();
  const drvSinxFonda = useFakturaSinxFonda();
  
  const [modalOchiq, setModalOchiq] = useState(false);
  const [sverkaOchiq, setSverkaOchiq] = useState(false);
  
  const [yangiKiritmalar, setYangiKiritmalar] = useState<FakturaItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStatus, setParsingStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSyncingLoop, setIsSyncingLoop] = useState(false);
  const syncToxtatRef = useRef(false);
  const [qolganFayllar, setQolganFayllar] = useState<number | null>(null);

  const hammasi = soragan.data?.fakturalar ?? [];

  // Analitika hisoblash (endi filtrlanmagan hamma ma'lumotdan yoki shunchaki hammasidan)
  const satrlar = useMemo(() => {
    return [...hammasi].sort((a, b) => {
      const p = (d: string) => {
        if (!d) return 0;
        const pts = d.split('.');
        if (pts.length === 3) return new Date(`${pts[2]}-${pts[1]}-${pts[0]}`).getTime();
        return 0;
      };
      return p(b.kelganSana) - p(a.kelganSana);
    });
  }, [hammasi]);

  // Analitika hisoblash
  const analitika = useMemo(() => {
    let jami = 0;
    let jamiNds = 0;
    const kat: Record<string, number> = {};
    const post: Record<string, number> = {};

    satrlar.forEach(m => {
      jami += m.jamiNdsBilan || 0;
      jamiNds += m.ndsSummasi || 0;
      
      const k = m.kategoriya || 'Boshqa';
      kat[k] = (kat[k] || 0) + (m.jamiNdsBilan || 0);

      const p = m.postavshik || 'Noma\'lum';
      post[p] = (post[p] || 0) + (m.jamiNdsBilan || 0);
    });

    const katArr = Object.entries(kat).sort((a,b)=>b[1]-a[1]);
    const postArr = Object.entries(post).sort((a,b)=>b[1]-a[1]).slice(0, 5); // Top 5

    return { jami, jamiNds, soni: satrlar.length, katArr, postArr };
  }, [satrlar]);

  /* ⚡⚡⚡ 2026-08-16 (audit C1 + H1 — IKKALASI TASDIQLANDI).
   *
   * C1: miqdor yoki narx tahrirlanganda `jamiNdsSiz` va `jamiNdsBilan`
   *     QAYTA HISOBLANMASDI — tuzatilgan qator ESKI (AI o'qigan) summa
   *     bilan bazaga tushardi. Ya'ni foydalanuvchi xatoni tuzatadi,
   *     lekin PUL eskiligicha qoladi.
   * H1: `const nw = [...arr]; nw[i].x = v` — spread SAYOZ nusxa,
   *     `nw[i]` AYNAN o'sha obyekt. State to'g'ridan-to'g'ri
   *     mutatsiya qilinardi (React qoidasi buzilishi).
   *
   * Bu yordamchi ikkalasini ham hal qiladi: qator NUSXALANADI va
   * summalar qayta hisoblanadi. */
  const qatorYangila = (i: number, maydon: keyof FakturaItem, qiymat: number | string) => {
    setYangiKiritmalar((oldin) => oldin.map((q, j) => {
      if (j !== i) return q;
      const y: FakturaItem = { ...q, [maydon]: qiymat } as FakturaItem;
      /* miqdor/narx/aksiz/NDS o'zgarsa summalar qayta hisoblanadi */
      if (maydon === 'miqdori' || maydon === 'narxi' || maydon === 'aksizSummasi' || maydon === 'ndsStavkasi') {
        const miq = Number(y.miqdori) || 0;
        const nar = Number(y.narxi) || 0;
        const aks = Number(y.aksizSummasi) || 0;
        const stv = Number(y.ndsStavkasi) || 0;
        y.jamiNdsSiz = Math.round((miq * nar + aks) * 100) / 100;
        y.ndsSummasi = Math.round(y.jamiNdsSiz * stv / 100 * 100) / 100;
        y.jamiNdsBilan = Math.round((y.jamiNdsSiz + y.ndsSummasi) * 100) / 100;
      }
      return y;
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsParsing(true);
    setYangiKiritmalar([]);
    let barchaTovarlar: FakturaItem[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setParsingStatus(`AI o'qimoqda: ${i + 1} / ${files.length} (${file.name})`);
        
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const parseRes = await aiParse.mutateAsync({ 
          base64, 
          mimeType: file.type || 'application/pdf', 
          nomi: file.name 
        });

        if (!parseRes?.ok || !parseRes.items) {
           toast(`${file.name} ni o'qishda xato: ${parseRes?.xabar}`, 'danger');
           continue;
        }

        const items = parseRes.items;
        const supplier = parseRes.supplier || "Noma'lum";

        // Orqa fonga PDF ni saqlash uchun yuborish
        try {
          const fRes = await faylYoz.mutateAsync({ base64, nomi: file.name, postavshik: supplier });
          if (fRes && fRes.ok === false) {
             toast(`${file.name} xato: ${fRes.xabar}`, 'danger');
          } else if (fRes?.ok) {
             toast(`${file.name} Drive ga yuklandi`, 'ok');
             if (fRes.url) {
                items.forEach((it: FakturaItem) => it.faylUrl = fRes.url);
             }
          }
        } catch(err: any) {
            console.error("Faylni saqlashda xato:", err);
            toast(`${file.name} ni Drive ga saqlab bo'lmadi: ${err.message}`, 'danger');
        }
        
        barchaTovarlar = [...barchaTovarlar, ...items];
      }
      
      if (barchaTovarlar.length > 0) {
        setYangiKiritmalar(barchaTovarlar);
        toast(`Jami ${barchaTovarlar.length} ta tovar topildi`, 'ok');
      } else {
        toast("Fakturalar ichidan tovarlarni ajratib bo'lmadi.", 'warn');
      }
      
    } catch (err: any) {
      console.error(err);
      toast("Fakturani o'qishda xato: " + (err.message || err));
    } finally {
      setIsParsing(false);
      setParsingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const parseFakturaText = (text: string): { items: FakturaItem[], supplier: string } => {
    let docNo = '';
    let docDate = '';
    let contractNo = '';
    let contractDate = '';
    let supplier = '';
    
    let supplierInn = '';
    let supplierManzil = '';
    let buyerInn = '';
    let buyerManzil = '';
    
    // Shartnoma sanasi va raqami
    const shartMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s*даги\s*([^\s]+)-сонли\s*шартномага/i);
    if (shartMatch) {
      contractDate = shartMatch[1];
      contractNo = shartMatch[2];
    }
    
    // Faktura sanasi va raqami
    const fakMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s*даги\s*([^\s]+)-сонли(?:\s*Ҳисобварақ-фактура)?/i);
    if (fakMatch) {
      docDate = fakMatch[1];
      docNo = fakMatch[2];
    }
    
    const supplierMatch = text.match(/(?:Етказиб\s*берувчи|Воситачи|Ижрочи|Буюртмачи|Sotuvchi):(.*?)(?:Манзил:|Етказиб\s*берувчининг|Воситачининг|Ижрочининг|Буюртмачининг|СТИР)/i);
    if (supplierMatch) {
      supplier = supplierMatch[1].trim();
    }
    
    const manzilSupMatch = text.match(/(?:Етказиб\s*берувчи|Воситачи|Ижрочи|Буюртмачи|Sotuvchi)[\s\S]*?Манзил:\s*(.*?)(?:Сотиб\s*олувчи|Етказиб\s*берувчининг|СТИР|МХИК)/i);
    if (manzilSupMatch) {
        supplierManzil = manzilSupMatch[1].trim();
    }

    const buyerManzilMatch = text.match(/(?:Сотиб\s*олувчи|Харидор)[\s\S]*?Манзил:\s*(.*?)(?:Етказиб\s*берувчининг|Сотиб\s*олувчининг|СТИР|МХИК)/i);
    if (buyerManzilMatch) {
        buyerManzil = buyerManzilMatch[1].trim();
    }

    const stirSupMatch = text.match(/(?:Етказиб\s*берувчининг\s*СТИР\s*рақами|СТИР).*?(\d{9})/i);
    if (stirSupMatch) {
        supplierInn = stirSupMatch[1];
    }
    const stirBuyMatch = text.match(/(?:Сотиб\s*олувчининг\s*СТИР\s*рақами).*?(\d{9})/i);
    if (stirBuyMatch) {
        buyerInn = stirBuyMatch[1];
    } else {
        const allStirs = text.match(/\b\d{9}\b/g);
        if (allStirs && allStirs.length >= 2) {
            supplierInn = supplierInn || allStirs[0];
            buyerInn = allStirs[1];
        }
    }

    const tovarlar: FakturaItem[] = [];
    
    const n = '(-?\\d+(?:\\s\\d{3})*(?:\\.\\d+)?)';
    const amtRegex = new RegExp(
        n + '\\s+' + // Miqdor
        n + '\\s+' + // Narx
        n + '\\s+' + // Jami NDS siz
        '(?:(?:Без\\s*акциз(?:а|сиз)|Акцизсиз|\\d+\\s*%)\\s+' + n + '\\s+)?' + // Optional Aksiz
        '(\\d+\\s*%|Без\\s*НДС|ҚҚСсиз|Без\\s*НДС\\s*\\(0\\)|ҚҚСсиз\\s*\\(0\\))\\s+' + // NDS stavka
        n + '\\s+' + // NDS summa
        n + // Jami summa
        '(?:\\s+(?:Олди-сотди|Ўз\\.иш\\.чиқ\\.|Импорт|Четдан келтирилган|Ўз эҳтиёжлари учун ишлаб чиқарилган))?',
        'gi'
    );
    
    let match;
    let lastEnd = 0;
    
    while ((match = amtRegex.exec(text)) !== null) {
        let precedingText = text.substring(lastEnd, match.index).trim();
        lastEnd = amtRegex.lastIndex;
        
        const colNumbersMatch = precedingText.match(/1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s+10\s+(.*)/);
        if (colNumbersMatch) {
            precedingText = colNumbersMatch[1];
        } else {
            const headerKeywords = /(?:қиймати|Summa|Сумма|Нархи|Narxi|Миқдор|Miqdor|номи|nomi|Tovar)\s+(.*)/is;
            const hkMatch = precedingText.match(headerKeywords);
            if (hkMatch && hkMatch[1] && hkMatch[1].length < 200) {
                const segments = precedingText.split(/(?:қиймати|Summa|Сумма|Нархи|Narxi|Миқдор|Miqdor|номи|nomi|Tovar)\s+/i);
                precedingText = segments[segments.length - 1];
            }
        }
        
        precedingText = precedingText.replace(/\b\d{17}\b/g, '').trim();

        const tokens = precedingText.split(/\s+/);
        let nomi = '';
        let birligi = '';
        if (tokens.length >= 2) {
            birligi = tokens.pop() || '';
            const qoldi = tokens.join(' ');
            const nmMatch = qoldi.match(/\d+[\s.]*(.*)/);
            if (nmMatch && nmMatch[1]) {
                nomi = nmMatch[1].trim();
            } else {
                nomi = qoldi;
            }
        } else {
            nomi = precedingText;
            birligi = 'dona';
        }
        
        let nameStr = nomi.replace(/^[\d\s.]+/, '').trim();
        if (nameStr.startsWith('-')) nameStr = nameStr.substring(1).trim();
        
        // Boshidagi qator raqamini olib tashlash (1, 2, 3...)
        nameStr = nameStr.replace(/^\d+\s+/, '').trim();
        
        // Komitent (vositachi) nomini qirqib tashlash
        const guvoxMatch = nameStr.match(/\(гуво[хҳ]нома[^)]+\)\s*/i);
        if (guvoxMatch) {
            nameStr = nameStr.substring(guvoxMatch.index! + guvoxMatch[0].length).trim();
        }
        
        // 15+ xonali MXIK kodini olib tashlash
        const kodMatch = nameStr.match(/\d{15,}/);
        if (kodMatch) {
            nameStr = nameStr.replace(kodMatch[0], '').replace(/-\s*-/g, '-').trim();
            if (nameStr.startsWith('-')) nameStr = nameStr.substring(1).trim();
        }
        
        const parseNum = (s: string) => {
            if (!s) return 0;
            return parseFloat(s.replace(/\s+/g, '').replace(/,/g, '.'));
        };
        
        tovarlar.push({
            fakturaRaqami: docNo, 
            postavshik: supplier, 
            kelganSana: docDate, 
            shartnomaRaqami: contractNo, 
            shartnomaSanasi: contractDate,
            postavshikInn: supplierInn,
            postavshikManzil: supplierManzil,
            sotibOluvchiInn: buyerInn,
            sotibOluvchiManzil: buyerManzil,
            nomi: nameStr,
            birligi: birligi,
            miqdori: parseNum(match[1]),
            narxi: parseNum(match[2]),
            jamiNdsSiz: parseNum(match[3]),
            ndsSummasi: parseNum(match[6]),
            jamiNdsBilan: parseNum(match[7])
        });
    }
    
    return { items: tovarlar, supplier: supplier || "Noma'lum" };
  };
  
  void parseFakturaText;

  const handleSave = async () => {
    // FAQAT dublikat bo'lmaganlarini saqlash
    const yaroqli = yangiKiritmalar.filter(item => {
      const isDup = item.fakturaRaqami && item.postavshik && hammasi.some(x => x.fakturaRaqami === item.fakturaRaqami && x.postavshik === item.postavshik);
      return !isDup;
    });

    if (yaroqli.length === 0) {
      toast("Saqlash uchun yangi tovar yo'q (hammasi dublikat)", "warn");
      return;
    }
    
    const res = await yoz.mutateAsync(yaroqli);
    if (res?.ok) {
      toast(`${res.soni} ta qator muvaffaqiyatli saqlandi!`, 'ok');
      setModalOchiq(false);
      setYangiKiritmalar([]);
      soragan.refetch();
    } else {
      toast("Xatolik: " + res?.xabar, 'danger');
    }
  };

  const startSyncLoop = async () => {
    setIsSyncingLoop(true);
    syncToxtatRef.current = false;
    let xatoCount = 0;
    
    while (!syncToxtatRef.current) {
      try {
        const res = await drvSinx.mutateAsync();
        if (res?.ok) {
          if (res.qolganFayllar !== undefined) {
            setQolganFayllar(res.qolganFayllar);
          }
          if (res.qolganFayllar === 0 || (res.ishlanganFayllar === 0 && res.qolganFayllar === 0)) {
            toast("Sinxronizatsiya to'liq yakunlandi!", 'ok');
            break;
          }
          xatoCount = 0; // reset error count on success
        } else {
          toast("Sinx xatosi: " + res?.xabar, 'danger');
          xatoCount++;
          if (xatoCount > 3) {
            toast("Xatolar ko'payib ketdi, sinxronizatsiya to'xtatildi.", 'danger');
            break;
          }
          // Kichik tanaffus
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e: any) {
        toast("Tarmoq xatosi: " + String(e.message || e), 'danger');
        xatoCount++;
        if (xatoCount > 3) {
            toast("Tarmoq xatosi sababli to'xtatildi.", 'danger');
            break;
        }
        await new Promise(r => setTimeout(r, 3000)); // kuting
      }
    }
    
    if (syncToxtatRef.current) toast("Sinxronizatsiya to'xtatildi (Pause)", "warn");
    
    setIsSyncingLoop(false);
    setQolganFayllar(null);
    drvHolat.refetch();
  };

  const startBackgroundSync = async () => {
    if (confirm("Jarayon serverda (orqa fonda) ishga tushadi. Sahifani yopsangiz ham ishlayveradi. Ishga tushirilsinmi?")) {
      try {
        const res = await drvSinxFonda.mutateAsync();
        if (res?.ok) {
          toast(res.xabar || "Orqa fonda sinxronizatsiya ishga tushdi!", 'ok');
        } else {
          toast("Xatolik: " + res?.xabar, 'danger');
        }
      } catch (e: any) {
        toast("Tarmoq xatosi: " + String(e.message || e), 'danger');
      }
    }
  };

  const ustunlar: IlgorUstun<FakturaItem>[] = [
    { kalit: 'kelganSana', nom: 'Sana', en: '100px', chiz: (m) => <span className="text-text-dim text-[13px]">{m.kelganSana}</span> },
    { kalit: 'fakturaRaqami', nom: 'Faktura №', en: '110px', chiz: (m) => <span className="text-accent text-[13px] font-medium">{m.fakturaRaqami}</span> },
    { kalit: 'postavshik', nom: 'Postavshik', en: '200px', chiz: (m) => <span className="text-text truncate text-[13px] max-w-[200px] block" title={m.postavshik}>{m.postavshik}</span> },
    { kalit: 'postavshikInn', nom: 'Y. STIR', en: '100px', chiz: (m) => <span className="text-text-dim text-[12px]">{m.postavshikInn}</span> },
    { kalit: 'nomi', nom: 'Maxsulot nomi', en: '250px', chiz: (m) => (
      <div className="flex items-center justify-between gap-2">
        <span className="text-text font-medium text-[13px] truncate max-w-[210px] block" title={m.nomi}>{m.nomi}</span>
        {m.faylUrl && (
           <div title="Asl hujjatni ko'rish" className="cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(m.faylUrl, '_blank'); }}>
              <FileText size={14} className="text-accent shrink-0 opacity-50 hover:opacity-100" />
           </div>
        )}
      </div>
    ) },
    { kalit: 'katalogNomi', nom: 'Katalog nomi', en: '200px', chiz: (m) => <span className="text-text-dim text-[11px] truncate max-w-[190px] block" title={m.katalogNomi}>{m.katalogNomi}</span> },
    { kalit: 'kategoriya', nom: 'Kategoriya', en: '120px', chiz: (m) => <span className="inline-block px-2 py-1 bg-white/5 border border-border text-text-dim rounded-md text-[11px]">{m.kategoriya || 'Boshqa'}</span> },
    { kalit: 'birligi', nom: 'Birlik', en: '80px', chiz: (m) => <span className="text-text-dim text-[13px]">{m.birligi}</span> },
    { kalit: 'miqdori', nom: 'Miqdor', raqam: true, en: '100px', chiz: (m) => <FmtN val={m.miqdori} /> },
    { kalit: 'narxi', nom: 'Narx', raqam: true, en: '110px', chiz: (m) => <FmtN val={m.narxi} /> },
    { kalit: 'jamiNdsBilan', nom: 'Jami Summa', raqam: true, en: '130px', chiz: (m) => <span className="text-ok font-medium"><FmtN val={m.jamiNdsBilan} /></span> },
  ];

  return (
    <Sahifa
      sarlavha="Fakturalar"
      tavsif="PDF fakturalarni o'qib, barcha materiallarni yig'uvchi jurnal"
      yangilangan={soragan.dataUpdatedAt}
      onYangila={() => soragan.refetch()}
      yangilanmoqda={soragan.isFetching}
      amallar={
        <div className="flex gap-3 items-center">
          <span className="text-text-dim text-sm mr-2 hidden sm:inline-block">Qo'shimcha harakatlar:</span>
          <Tugma tur="secondary" ikonka={<FolderArchive size={16} />} onBos={() => setSverkaOchiq(true)}>
            Sverka
          </Tugma>
          <Tugma tur="primary" ikonka={<FileUp size={16} />} onBos={() => setModalOchiq(true)}>
            Faktura yuklash
          </Tugma>
        </div>
      }
    >
      {/* ⚡⚡⚡ 2026-08-16 FAKTURA BOSHQARUVI VA TIKLASH.
          `89d_FakturaTashxis.js` da bu asboblar yozilgan edi — o'shanda
          328 ta fayl xato papkasidan qutqarilgandi — lekin ular saytga
          ULANMAGAN edi: faqat GAS muharriridan chaqirish mumkin edi.
          Endi to'g'ridan-to'g'ri shu yerda. */}
      <details className="karta p-4 mb-4 group">
        <summary className="cursor-pointer list-none flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-text flex items-center gap-2">
              <Wrench size={16} className="text-accent" /> Sinxron boshqaruvi va tiklash
            </h3>
            <p className="text-[11px] text-text-mute mt-0.5">
              To'xtatish · davom ettirish · xato loglar · xato papkasidan qaytarish
            </p>
          </div>
          <span className="text-[11px] text-text-mute group-open:hidden">ochish ▾</span>
          <span className="text-[11px] text-text-mute hidden group-open:inline">yopish ▴</span>
        </summary>

        <div className="mt-3 space-y-3">
          {/* ⚡⚡⚡ 2026-08-17 (audit): BITTA FAYL SINOVI (`apiFakturaBittaSinov`).
              Hook YOZILGAN, GAS funksiyasi ham BOR edi — lekin ulanmagan.
              Nima uchun kerak: sinx 340 ta faylni o'qiy olmasa, sabab AI
              kalitida yoki fayl formatida bo'lishi mumkin. Hammasini qayta
              yurgizib ko'rish o'rniga BITTA faylni sinab, xatoni darhol
              ko'rish mumkin — «nega o'qilmayapti» savolini bir bosishda
              tekshiradi. */}
          <div className="rounded-lg border border-border bg-[var(--surface-2)]/30 p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-text-dim mb-2">
              Bitta faylni sinash (AI sozlamasi ishlayaptimi?)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={sinovFayl}
                onChange={(e) => setSinovFayl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && sinovFayl.trim()) bittaSinov(); }}
                placeholder="fayl nomi (Drive dagi «Yangi» papkasidan)"
                className="flex-1 min-w-[220px] bg-[var(--surface-2)] border border-border rounded-lg
                           px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50" />
              <button
                onClick={bittaSinov}
                disabled={fSinov.isPending || !sinovFayl.trim()}
                className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25
                           text-[12px] font-medium transition-colors disabled:opacity-50">
                {fSinov.isPending ? 'Sinalmoqda…' : 'Sinab ko‘rish'}
              </button>
            </div>
            {fSinov.data != null && (
              <pre className="text-[11px] text-text-dim bg-[var(--surface-3)]/50 rounded p-2.5
                              overflow-auto max-h-56 leading-relaxed mt-2">
{JSON.stringify(fSinov.data, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => fToxtat.mutate(undefined, {
                onSuccess: (r) => toast(r.xabar || 'To’xtatildi', 'ok', undefined, 7000),
                onError: (e: Error) => toast(e.message, 'danger'),
              })}
              disabled={fToxtat.isPending}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-warn/20 border border-border
                         hover:border-warn/40 text-[12px] text-text-mute hover:text-warn
                         transition-colors disabled:opacity-50">
              ⏸ Sinxronni to‘xtatish
            </button>
            <button onClick={() => fDavom.mutate(undefined, {
                onSuccess: (r) => toast(r.xabar || 'Davom ettirildi', 'ok', undefined, 7000),
                onError: (e: Error) => toast(e.message, 'danger'),
              })}
              disabled={fDavom.isPending}
              className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25
                         text-[12px] font-medium transition-colors disabled:opacity-50">
              ▶ Davom ettirish
            </button>
            <button onClick={() => {
                if (!window.confirm(
                  'Xato papkasidagi fayllar QAYTA ISHLASHGA qaytariladi.\n\n' +
                  'Ular yana o‘qishga urinib ko‘riladi. Ma’lumot o‘chmaydi.\n\nDavom etamizmi?')) return;
                fTikla.mutate({ limit: 200, loglarniOchir: false }, {
                  onSuccess: (r) => toast(
                    r.xabar || `${r.tiklandi ?? 0} ta fayl qaytarildi`, 'ok', undefined, 9000),
                  onError: (e: Error) => toast(e.message, 'danger', undefined, 9000),
                });
              }}
              disabled={fTikla.isPending}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300
                         hover:bg-emerald-500/25 text-[12px] font-medium transition-colors
                         disabled:opacity-50">
              {fTikla.isPending ? 'Qaytarilmoqda…' : '↺ Xato papkasidan qaytarish'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-[var(--surface-2)]/30 p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-text-dim mb-1.5">
                Oxirgi ijro
              </p>
              {fOxirgi.isLoading && <div className="skel h-10 rounded" />}
              {fOxirgi.data != null && (
                <pre className="text-[10px] text-text-dim overflow-auto max-h-32 leading-relaxed">
{JSON.stringify(fOxirgi.data, null, 1)}
                </pre>
              )}
            </div>

            <div className="rounded-lg border border-border bg-[var(--surface-2)]/30 p-2.5">
              <p className="text-[11px] uppercase tracking-wide text-text-dim mb-1.5">
                Xato loglar
              </p>
              {fXato.isLoading && <div className="skel h-10 rounded" />}
              {fXato.data != null && (
                <pre className="text-[10px] text-danger/80 overflow-auto max-h-32 leading-relaxed">
{JSON.stringify(fXato.data, null, 1)}
                </pre>
              )}
            </div>
          </div>
        </div>
      </details>

      <Holatlar soragan={soragan} bosh={{ matn: 'Fakturalar jurnali bo\'sh', izoh: 'Hali hech qanday faktura kiritilmagan.' }}>
        {() => (
          <div className="flex flex-col gap-6">

            {/* Analitika Kengash - Premium UI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="karta p-6 shadow-2xl border border-white/10 bg-gradient-to-br from-[#1a1a24]/90 to-[#0f0f15]/80 backdrop-blur-md rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileText size={80} />
                </div>
                <h3 className="text-sm font-medium text-text-dim mb-2 uppercase tracking-widest">Jami Qabul Qilingan Summa</h3>
                <div className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-white mb-4"><FmtN val={analitika.jami} /> <span className="text-sm font-medium text-text-dim">so'm</span></div>
                <div className="flex justify-between items-center text-[14px] bg-black/20 p-2 rounded-lg border border-white/5">
                  <span className="text-text-dim flex items-center gap-2"><FolderOpen size={16}/> Hujjatlar:</span>
                  <span className="text-accent font-bold text-lg">{analitika.soni} <span className="text-xs font-normal">ta</span></span>
                </div>
                <div className="flex justify-between items-center text-[14px] bg-black/20 p-2 rounded-lg border border-white/5 mt-2">
                  <span className="text-text-dim flex items-center gap-2"><FileText size={16}/> Jami QQS:</span>
                  <span className="text-warning font-bold"><FmtN val={analitika.jamiNds} /></span>
                </div>
              </div>

              <div className="karta p-5 shadow-2xl border border-white/10 bg-gradient-to-br from-[#1a1a24]/90 to-[#0f0f15]/80 backdrop-blur-md rounded-2xl overflow-hidden flex flex-col">
                <h3 className="text-[13px] font-medium text-text-dim mb-3 uppercase tracking-wider">Kategoriyalar bo'yicha</h3>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {analitika.katArr.length === 0 ? <span className="text-text-dim text-sm">Ma'lumot yo'q</span> : 
                   analitika.katArr.map(([k, s]) => (
                    <div key={k} className="flex justify-between items-center text-sm">
                      <span className="text-text truncate pr-2 flex-1" title={k}>{k}</span>
                      <span className="font-semibold text-ok shrink-0"><FmtN val={s} /></span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="karta p-5 shadow-2xl border border-white/10 bg-gradient-to-br from-[#1a1a24]/90 to-[#0f0f15]/80 backdrop-blur-md rounded-2xl overflow-hidden flex flex-col">
                <h3 className="text-[13px] font-medium text-text-dim mb-4 uppercase tracking-widest flex items-center gap-2"><FolderOpen size={16} className="text-accent"/> Top-5 Yetkazib Beruvchi</h3>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {analitika.postArr.length === 0 ? <span className="text-text-dim text-sm italic">Ma'lumot yo'q</span> : 
                   analitika.postArr.map(([p, s]) => (
                    <div key={p} className="flex justify-between items-center text-sm p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/5">
                      <span className="text-white truncate pr-2 flex-1 font-medium" title={p}>{p}</span>
                      <span className="font-bold text-accent shrink-0"><FmtN val={s} /></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Drive Sync Boshqaruvi */}
            <div className="karta p-4 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <RefreshCw size={18} className={`text-accent ${isSyncingLoop ? 'animate-spin' : ''}`} /> Avto-Sinxronizatsiya (Google Drive)
                  </h3>
                  <p className="text-sm text-text-dim">Papka ichidagi hamma hujjatlar yig'iladi va AI tahlilidan o'tkaziladi.</p>
                  <div className="mt-2 max-w-sm"><ModelChip profil="document_control" kompaniyaId={aiKompaniyaId} /></div>
                </div>
                <div className="flex gap-2 items-center">
                  <Tugma 
                    ikonka={<RefreshCw size={14} className={drvHolat.isFetching ? 'animate-spin' : ''} />} 
                    onBos={() => drvHolat.refetch()}
                    band={drvHolat.isFetching || isSyncingLoop}
                  >
                    Yangilash
                  </Tugma>

                  <Tugma 
                    ikonka={<RefreshCw size={14} className={drvSinxFonda.isPending ? 'animate-spin' : ''} />} 
                    onBos={startBackgroundSync}
                    band={drvSinxFonda.isPending || isSyncingLoop}
                  >
                    Fonda to'liq sinx qilish
                  </Tugma>

                  {isSyncingLoop ? (
                    <Tugma 
                      tur="danger" 
                      ikonka={<X size={16} />} 
                      onBos={() => { syncToxtatRef.current = true; }}
                    >
                      To'xtatish (Pause)
                    </Tugma>
                  ) : (
                    <Tugma 
                      tur="primary" 
                      ikonka={<FileUp size={16} />} 
                      band={drvHolat.isFetching} 
                      onBos={startSyncLoop}
                    >
                      Hozir Sinxronizatsiya Qilish
                    </Tugma>
                  )}
                </div>
              </div>

              {isSyncingLoop && (
                <div className="bg-black/30 border border-border p-3 rounded-md mb-4 flex items-center justify-between">
                  <span className="text-warning text-sm font-medium animate-pulse">
                    Jarayon ketmoqda, iltimos sahifani yopmang...
                  </span>
                  <span className="text-white text-sm">
                    Qolgan hujjatlar: <b className="text-accent">{qolganFayllar ?? 'hisoblanmoqda...'}</b> ta
                  </span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                <a href={drvHolat.data?.yangi?.url || '#'} target="_blank" rel="noreferrer" className="bg-black/20 p-4 rounded-xl border border-border hover:border-accent/50 transition-colors group cursor-pointer block relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent"><FolderOpen size={20} /></div>
                    <ExternalLink size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h4 className="text-text-dim text-sm font-medium">Kutayotganlar (Yangi)</h4>
                  <p className="text-2xl font-bold text-white mt-1">{drvHolat.data?.yangi?.count || 0} <span className="text-sm font-normal text-text-dim">ta fayl</span></p>
                </a>
                
                <a href={drvHolat.data?.arxiv?.url || '#'} target="_blank" rel="noreferrer" className="bg-black/20 p-4 rounded-xl border border-border hover:border-ok/50 transition-colors group cursor-pointer block relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-full bg-ok/20 flex items-center justify-center text-ok"><FolderArchive size={20} /></div>
                    <ExternalLink size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h4 className="text-text-dim text-sm font-medium">Tugallanganlar (Arxiv)</h4>
                  <p className="text-2xl font-bold text-white mt-1">{drvHolat.data?.arxiv?.count || 0} <span className="text-sm font-normal text-text-dim">ta fayl</span></p>
                </a>

                <a href={drvHolat.data?.dublikat?.url || '#'} target="_blank" rel="noreferrer" className="bg-black/20 p-4 rounded-xl border border-border hover:border-warning/50 transition-colors group cursor-pointer block relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center text-warning"><FileUp size={20} /></div>
                    <ExternalLink size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h4 className="text-text-dim text-sm font-medium">Qaytarilgan (Dublikatlar)</h4>
                  <p className="text-2xl font-bold text-white mt-1">{drvHolat.data?.dublikat?.count || 0} <span className="text-sm font-normal text-text-dim">ta fayl</span></p>
                </a>

                <a href={drvHolat.data?.xato?.url || '#'} target="_blank" rel="noreferrer" className="bg-black/20 p-4 rounded-xl border border-border hover:border-danger/50 transition-colors group cursor-pointer block relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center text-danger"><FolderX size={20} /></div>
                    <ExternalLink size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h4 className="text-text-dim text-sm font-medium">Xato / O'qilmaganlar</h4>
                  <p className="text-2xl font-bold text-white mt-1">{drvHolat.data?.xato?.count || 0} <span className="text-sm font-normal text-text-dim">ta fayl</span></p>
                </a>
              </div>
            </div>

            {/* Asosiy Ilg'or Jadval */}
            <IlgorJadval 
              ustunlar={ustunlar} 
              satrlar={satrlar} 
              kalit={(m, i) => m.id || i.toString()} 
              eksportNom="Fakturalar_Buxgalteriya"
              onSatrBos={(m) => {
                 if(m.faylUrl) {
                    window.open(m.faylUrl, '_blank');
                 } else {
                    toast("Bu tovarning asl hujjat havolasi (PDF) bazada mavjud emas.", "warn");
                 }
              }}
            />
          </div>
        )}
      </Holatlar>

      {modalOchiq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="karta flex max-h-full w-full max-w-5xl flex-col shadow-2xl border border-white/10 relative overflow-hidden bg-[var(--surface-1)]">
            <div className="flex items-center justify-between border-b border-border bg-black/20 p-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileUp className="text-accent" size={20} />
                Fakturani o'qish
              </h2>
              <button onClick={() => setModalOchiq(false)} className="text-text-dim hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-4 overflow-y-auto">
              {!yangiKiritmalar.length ? (
                <div className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center gap-4 bg-black/10 hover:bg-black/20 transition-colors">
                  <input 
                    type="file" 
                    accept=".pdf, image/png, image/jpeg, image/jpg"
                    multiple
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                  />
                  <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <FileUp size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-1">Faktura (PDF yoki Rasm) tanlang</h3>
                    <p className="text-sm text-text-dim">Bir nechta PDF, JPG, PNG fayllarni birdaniga tanlashingiz mumkin</p>
                  </div>
                  <Tugma tur="primary" band={isParsing} onBos={() => fileInputRef.current?.click()}>
                    {isParsing ? 'O\'qilmoqda...' : 'Fayllarni tanlash'}
                  </Tugma>
                  {parsingStatus && <div className="text-accent text-sm mt-2">{parsingStatus}</div>}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center mt-2">
                    <h3 className="font-bold text-white">O'qilgan tovarlar ro'yxati:</h3>
                    <span className="text-sm text-text-dim px-3 py-1 bg-[var(--surface-2)] rounded-full">
                      Jami {yangiKiritmalar.length} ta tovar
                    </span>
                  </div>
                  
                  <div className="border border-border rounded-xl overflow-hidden bg-black/20 overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[var(--surface-2)] border-b border-border text-text-dim">
                        <tr>
                          <th className="px-3 py-2 font-medium">Faktura "-</th>
                          <th className="px-3 py-2 font-medium">Sana</th>
                          <th className="px-3 py-2 font-medium">Postavshik</th>
                          <th className="px-3 py-2 font-medium">Y. STIR</th>
                          <th className="px-3 py-2 font-medium">Nomi</th>
                          <th className="px-3 py-2 font-medium">Birlik</th>
                          <th className="px-3 py-2 font-medium text-right">Miqdor</th>
                          <th className="px-3 py-2 font-medium text-right">Narxi</th>
                          <th className="px-3 py-2 font-medium text-right">Aksiz</th>
                          <th className="px-3 py-2 font-medium text-right">QQS %</th>
                          <th className="px-3 py-2 font-medium text-right">Jami NDS siz</th>
                          <th className="px-3 py-2 font-medium text-right">Jami Summa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {yangiKiritmalar.map((t, i) => {
                          const isDup = t.fakturaRaqami && t.postavshik && hammasi.some(x => x.fakturaRaqami === t.fakturaRaqami && x.postavshik === t.postavshik);
                          // Matematik xatoni tekshirish (faqat agar narx/miqdor noldan katta bo'lsa)
                          const hisoblanganNdsSiz = (t.miqdori || 0) * (t.narxi || 0);
                          const xatoMath = (t.miqdori > 0 && t.narxi > 0) ? Math.abs(hisoblanganNdsSiz - (t.jamiNdsSiz || 0)) > 2 : false; // 2 so'm farqqa ruxsat
                          return (
                          <tr key={i} className={`hover:bg-white/5 ${isDup ? 'opacity-50 bg-danger/10' : ''} ${xatoMath ? 'bg-danger/20 border-l-2 border-danger' : ''}`} title={isDup ? "Dublikat!" : (xatoMath ? "Diqqat! Miqdor * Narx jami summaga to'g'ri kelmayapti." : "")}>
                            <td className="px-3 py-2 w-24">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-accent text-sm" placeholder="Faktura №" value={t.fakturaRaqami} onChange={(e) => {
                                const nw = [...yangiKiritmalar]; nw[i].fakturaRaqami = e.target.value; setYangiKiritmalar(nw);
                              }}/>
                            </td>
                            <td className="px-3 py-2 w-24">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-text-dim text-sm" placeholder="Sana" value={t.kelganSana || ''} onChange={(e) => {
                                const nw = [...yangiKiritmalar]; nw[i].kelganSana = e.target.value; setYangiKiritmalar(nw);
                              }}/>
                            </td>
                            <td className="px-3 py-2 max-w-[150px]">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-white text-sm truncate" placeholder="Postavshik" value={t.postavshik} onChange={(e) => {
                                const nw = [...yangiKiritmalar]; nw[i].postavshik = e.target.value; setYangiKiritmalar(nw);
                              }}/>
                            </td>
                            <td className="px-3 py-2 w-24">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-text-dim text-sm" placeholder="Y. STIR" value={t.postavshikInn || ''} onChange={(e) => {
                                const nw = [...yangiKiritmalar]; nw[i].postavshikInn = e.target.value; setYangiKiritmalar(nw);
                              }}/>
                            </td>
                            <td className="px-3 py-2 max-w-[200px] truncate text-white">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none" value={t.nomi} onChange={(e) => {
                                const nw = [...yangiKiritmalar]; nw[i].nomi = e.target.value; setYangiKiritmalar(nw);
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-text-dim w-20">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-center" value={t.birligi} onChange={(e) => {
                                const nw = [...yangiKiritmalar]; nw[i].birligi = e.target.value; setYangiKiritmalar(nw);
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-right w-24">
                              <input className={`w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-right font-medium ${xatoMath ? 'text-warning' : ''}`} type="number" value={t.miqdori || ''} onChange={(e) => {
                                qatorYangila(i, 'miqdori', Number(e.target.value));
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-right w-28">
                              <input className={`w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-right ${xatoMath ? 'text-warning' : ''}`} type="number" value={t.narxi || ''} onChange={(e) => {
                                qatorYangila(i, 'narxi', Number(e.target.value));
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-right w-20">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-right text-text-dim" type="number" value={t.aksizSummasi || ''} onChange={(e) => {
                                qatorYangila(i, 'aksizSummasi', Number(e.target.value));
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-right w-16">
                              <input className="w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-right text-text-dim" type="number" value={t.ndsStavkasi || ''} onChange={(e) => {
                                qatorYangila(i, 'ndsStavkasi', Number(e.target.value));
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-right w-28">
                              <input className={`w-full bg-transparent border-b border-transparent focus:border-accent outline-none text-right ${xatoMath ? 'text-danger font-bold' : ''}`} type="number" value={t.jamiNdsSiz || ''} onChange={(e) => {
                                qatorYangila(i, 'jamiNdsSiz', Number(e.target.value));
                              }}/>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-ok w-32"><FmtN val={t.jamiNdsBilan} /></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="border-t border-border bg-black/20 p-4 flex justify-end gap-3 items-center">
              {yangiKiritmalar.some(t => t.fakturaRaqami && t.postavshik && hammasi.some(x => x.fakturaRaqami === t.fakturaRaqami && x.postavshik === t.postavshik)) && (
                <span className="text-danger text-sm mr-auto font-medium">* Dublikat qatorlar saqlanmaydi!</span>
              )}
              <Tugma onBos={() => setModalOchiq(false)}>Bekor qilish</Tugma>
              {yangiKiritmalar.length > 0 && (
                <Tugma tur="primary" onBos={handleSave} band={yoz.isPending} ikonka={<Save size={16} />}>
                  {yoz.isPending ? "Saqlanmoqda..." : "Tasdiqlash va Saqlash"}
                </Tugma>
              )}
            </div>
          </div>
        </div>
      )}

      {sverkaOchiq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="karta flex max-h-full w-full max-w-4xl flex-col shadow-2xl border border-white/10 relative overflow-hidden bg-[var(--surface-1)]">
            <div className="flex items-center justify-between border-b border-border bg-black/20 p-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FolderArchive className="text-ok" size={20} />
                Sverka (Reconciliation)
              </h2>
              <button onClick={() => setSverkaOchiq(false)} className="text-text-dim hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <p className="text-text-dim text-sm mb-4">Ushbu ro'yxatda joriy filtrlangan fakturalar bo'yicha Yetkazib beruvchilar kesimida umumlashtirilgan hisobot ko'rsatiladi.</p>
              <div className="border border-border rounded-xl overflow-hidden bg-black/20 overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[var(--surface-2)] border-b border-border text-text-dim">
                    <tr>
                      <th className="px-4 py-3 font-medium">Yetkazib Beruvchi (Postavshik)</th>
                      <th className="px-4 py-3 font-medium text-right">Fakturalar Soni</th>
                      <th className="px-4 py-3 font-medium text-right">Qatorlar Soni</th>
                      <th className="px-4 py-3 font-medium text-right">Jami NDS siz</th>
                      <th className="px-4 py-3 font-medium text-right">Jami NDS</th>
                      <th className="px-4 py-3 font-medium text-right">Jami Summa (QQS bilan)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(
                      satrlar.reduce((acc, curr) => {
                        const p = curr.postavshik || "Noma'lum";
                        if (!acc[p]) acc[p] = { faks: new Set(), qator: 0, ndssiz: 0, nds: 0, jami: 0 };
                        acc[p].faks.add(curr.fakturaRaqami);
                        acc[p].qator++;
                        acc[p].ndssiz += curr.jamiNdsSiz || 0;
                        acc[p].nds += curr.ndsSummasi || 0;
                        acc[p].jami += curr.jamiNdsBilan || 0;
                        return acc;
                      }, {} as Record<string, any>)
                    ).sort((a,b) => b[1].jami - a[1].jami).map(([p, data]) => (
                      <tr key={p} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-medium text-white">{p}</td>
                        <td className="px-4 py-3 text-right text-accent">{data.faks.size} ta</td>
                        <td className="px-4 py-3 text-right text-text-dim">{data.qator} ta</td>
                        <td className="px-4 py-3 text-right text-text-dim"><FmtN val={data.ndssiz} /></td>
                        <td className="px-4 py-3 text-right text-warning"><FmtN val={data.nds} /></td>
                        <td className="px-4 py-3 text-right font-bold text-ok"><FmtN val={data.jami} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </Sahifa>
  );
}

export default Fakturalar;
