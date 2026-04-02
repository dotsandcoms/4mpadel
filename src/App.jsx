import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
import Players from './pages/Players';
import Calendar from './pages/Calendar';
import EventDetails from './pages/EventDetails';
import Rankings from './pages/Rankings';
import Broll from './pages/Broll';
import Ladies from './pages/Ladies';
import Juniors from './pages/Juniors';
import Mens40 from './pages/Mens40';
import AllTournaments from './pages/AllTournaments';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';

import TournamentDraw from './pages/TournamentDraw';
import PlayerProfile from './pages/PlayerProfile'; // Added import
import ApprovedCoaches from './pages/ApprovedCoaches';
import CoachingVideos from './pages/CoachingVideos';
import CoachRegistration from './pages/CoachRegistration';
import Gallery from './pages/Gallery';
import AlbumDetails from './pages/AlbumDetails';
import Contact from './pages/Contact';
import ResetPassword from './pages/ResetPassword';
import SiteFooter from './components/SiteFooter';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { SEOAdminPanel, GoogleAnalytics } from '@burkcorp/reactmath';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { SearchProvider } from './context/SearchContext';
import SearchPalette from './components/SearchPalette';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state changes to handle magic links, recovery links, etc.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('App: Auth Event:', event);

      // SIGNED_IN can happen via magic link OR normal login
      // INITIAL_SESSION occurs on page load if a session already exists
      if (event === 'SIGNED_IN') {
        const hash = window.location.hash;
        const isMagicLink = hash.includes('access_token=') && (hash.includes('type=magiclink') || hash.includes('type=recovery') || hash.includes('type=invite'));

        if (isMagicLink) {
          const isRecovery = hash.includes('type=recovery');
          const targetPath = isRecovery ? '/reset-password' : '/profile';

          console.log(`App: Detected link sign-in (${targetPath}). Redirecting...`);
          // Small delay to ensure session is fully processed
          setTimeout(() => navigate(targetPath), 500);
        }
      }

      if (event === 'PASSWORD_RECOVERY') {
        console.log('App: Detected password recovery event. Redirecting to reset-password...');
        navigate('/reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/reports');

  return (
    <div className="bg-gray-900 min-h-screen text-white font-sans overflow-x-hidden">
      <GoogleAnalytics />
      <Analytics />
      <SpeedInsights />
      {!isAdminRoute && <Navbar isDark={location.pathname === '/tournaments/broll'} />}
      <div id="site-content" className={location.pathname === '/' ? '' : 'max-md:pt-20'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/players" element={<Players />} /> {/* Added route for Players */}
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/calendar/:slug" element={<EventDetails />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/tournaments/broll" element={<Broll />} />
          <Route path="/tournaments/ladies" element={<Ladies />} />
          <Route path="/tournaments/juniors" element={<Juniors />} />
          <Route path="/tournaments/mens40" element={<Mens40 />} />
          <Route path="/tournaments/all" element={<AllTournaments />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/gallery/:id" element={<AlbumDetails />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/results/:id" element={<TournamentDraw />} />
          <Route path="/draws/:id" element={<TournamentDraw />} />
          <Route path="/profile" element={<PlayerProfile />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/academy/coaches" element={<ApprovedCoaches />} />
          <Route path="/academy/videos" element={<CoachingVideos />} />
          <Route path="/academy/register" element={<CoachRegistration />} />
        </Routes>
      </div>
      {!isAdminRoute && <SiteFooter />}
      <SEOAdminPanel />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#CCFF00', color: 'black', border: 'none', fontWeight: 'bold' }
        }}
      />
    </div>
  );
}

function App() {
  return (
    <SearchProvider>
      <AppContent />
      <SearchPalette />
    </SearchProvider>
  );
}

export default App;
