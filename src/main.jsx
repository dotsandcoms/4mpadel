import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { SEOProvider } from '@burkcorp/reactmath'
import ErrorBoundary from './components/ErrorBoundary'
import { supabase } from './supabaseClient'
import './index.css'
import App from './App.jsx'

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
