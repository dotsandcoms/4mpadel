import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { SEOProvider } from '@burkcorp/reactmath'
import ErrorBoundary from './components/ErrorBoundary'
import { supabase } from './supabaseClient'
import './index.css'
import App from './App.jsx'

// Supabase connection check (dev only)
if (import.meta.env.DEV) {
  supabase.from('calendar').select('id').limit(1).then(({ error }) => {
    if (error) console.warn('[Supabase] Connection check:', error.message)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <SEOProvider supabase={supabase}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SEOProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
)
