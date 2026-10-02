import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { TilChegarasi } from './i18n/TilTanlagich'

import { kuzatuvniBoshlash } from './_shared/kuzatuv';

kuzatuvniBoshlash();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch on tab switch for this kind of app
      retry: 1, // Only retry once on failure
    },
  },
})

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TilChegarasi><App /></TilChegarasi>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
