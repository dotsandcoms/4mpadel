import React from 'react';
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
import TournamentResults from './pages/TournamentResults';
import PlayerProfile from './pages/PlayerProfile'; // Added import
import ApprovedCoaches from './pages/ApprovedCoaches';
import CoachingVideos from './pages/CoachingVideos';
import SiteFooter from './components/SiteFooter';
import { SEOAdminPanel, GoogleAnalytics } from '@burkcorp/reactmath';
import { useLocation } from 'react-router-dom';

function AppContent() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/reports');

  return (
    <div className="bg-gray-900 min-h-screen text-white font-sans overflow-x-hidden">
      <GoogleAnalytics />
      {!isAdminRoute && <Navbar />}
      <div id="site-content">
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
          <Route path="/results/:id" element={<TournamentResults />} />
          <Route path="/profile" element={<PlayerProfile />} />
          <Route path="/academy/coaches" element={<ApprovedCoaches />} />
          <Route path="/academy/videos" element={<CoachingVideos />} />
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
  return <AppContent />;
}

export default App;
