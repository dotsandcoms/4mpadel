import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import HostedAdminReview from './HostedAdminReview.jsx';
import './index.css';

// Dedicated entry: no legacy public App, SEO writer, analytics or service worker.
createRoot(document.getElementById('root')).render(
  <StrictMode><ErrorBoundary><HelmetProvider><BrowserRouter><HostedAdminReview /></BrowserRouter></HelmetProvider></ErrorBoundary></StrictMode>,
);
