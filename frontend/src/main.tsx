import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './dizayn/firuza.css'
import { TilChegarasi } from './i18n/TilTanlagich'
import { t, tilTayyorla } from './i18n/til'

import { kuzatuvniBoshlash } from './_shared/kuzatuv';
import { reloadQoriqchisiniTozala, versiyaKuzatuvi } from './_shared/versiya';
import { ustamaKeshiniUla } from './umumiy/ui/ustama-kesh';

kuzatuvniBoshlash();
versiyaKuzatuvi();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch on tab switch for this kind of app
      retry: 1, // Only retry once on failure
    },
  },
})

ustamaKeshiniUla(queryClient);

import { Component, type ReactNode } from 'react';

class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: unknown) {
    /* Xom texnik tafsilot FAQAT konsolga (diagnostika) — ekranga chiqmaydi. */
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      const kod = 'ERR-' + Date.now().toString(36).toUpperCase();
      return (
        <div style={{padding:32, color:'#e5e7eb', fontFamily:'system-ui, sans-serif', background:'#0B0E14', minHeight:'100vh'}}>
          <h2 style={{margin:'0 0 8px'}}>Sahifani ko‘rsatib bo‘lmadi</h2>
          <p style={{color:'#9ca3af', maxWidth:440, lineHeight:1.5}}>Kutilmagan nosozlik yuz berdi. Sahifani qayta yuklab ko‘ring; muammo takrorlansa quyidagi kodni administratorga ayting.</p>
          <p style={{color:'#6b7280', fontFamily:'monospace', fontSize:12}}>Diagnostika kodi: {kod}</p>
          <button onClick={() => location.reload()} style={{marginTop:16, padding:'8px 16px', background:'#232A3B', color:'white', border:'none', borderRadius:4, cursor:'pointer'}}>Qayta yuklash</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Tez yuklash (2026-10-30): avval tanlangan til lug'ati (ru/en bo'lsa), keyin App moduli — modul darajasidagi
 * `t()` chaqiruvlari ham to'g'ri tilda hisoblanadi; o'zbek tilida lug'at umuman yuklanmaydi. */
void tilTayyorla().then(() => import('./App.tsx')).then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TilChegarasi><App /></TilChegarasi>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
  // Ilova chizildi — 10 s barqaror ishlagach reload qo'riqchisi tozalanadi (doimiy yiqilishda cheksiz reload bo'lmaydi).
  window.setTimeout(reloadQoriqchisiniTozala, 10_000)
}).catch((e) => {
  // App chunk yuklanmasa (tarmoq uzildi / yangi deploy) — oq ekran o'rniga qisqa xabar.
  console.error('[main] ilova yuklanmadi', e);
  const ildiz = document.getElementById('root');
  if (!ildiz) return;
  const quti = document.createElement('div');
  quti.style.cssText = 'padding:32px;font-family:system-ui,sans-serif;color:#e5e7eb;background:#0B0E14;min-height:100vh';
  const sarlavha = document.createElement('h2'); sarlavha.textContent = t('Ilova yuklanmadi');
  const izoh = document.createElement('p'); izoh.style.color = '#9ca3af'; izoh.textContent = t('Internet aloqasini tekshirib, sahifani qayta yuklang.');
  const tugma = document.createElement('button'); tugma.textContent = t('Qayta yuklash'); tugma.style.cssText = 'margin-top:16px;padding:8px 16px';
  tugma.onclick = () => location.reload();
  quti.append(sarlavha, izoh, tugma);
  ildiz.replaceChildren(quti);
})
