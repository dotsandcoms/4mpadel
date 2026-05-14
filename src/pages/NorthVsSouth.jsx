import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import { MapPin, Calendar, Trophy, Users, ChevronRight, ExternalLink, Shield, ArrowRight, Quote, X, Instagram, User, Music, Camera, Star, Activity, CheckCircle2, Clock, LayoutGrid, List, Edit3, Save } from 'lucide-react';
import { useAdminPermissions } from '../hooks/useAdminPermissions';

// ── Assets ────────────────────────────────────────────────────────────────────
import nvsLogo from '../assets/nvs/official_logo.png';
import southLogo from '../assets/nvs/south_logo.jpeg';
import heroImg from '../assets/nvs/hero.png';
import actionImg from '../assets/nvs/action_male.png';
import venueImg from '../assets/nvs/venue.png';

// ── Sponsor Assets ─────────────────────────────────────────────────────────────
const sponsorFiles = [
  '4m.png', 'AGCAPITAL.png', 'BD-Logo-scaled.webp', 'Camps-Bay-Village-Logo.png',
  'Gaurdrisk-Logo.png', 'Nordee-Logo.png', 'SMG.png', 'The-Bay-Hotel-Logo-scaled.webp',
  'The_Rotunda_Logo.png', 'VNL-bucket-list-destinations.png', 'babolat-scaled.png',
  'court-sport.png', 'kfc.png', 'kitkat-cash-and-carry.png', 'nexus.png', 'repower_africa.jpg'
];

const sponsorImages = sponsorFiles.map((file, i) => ({
  id: i,
  src: new URL(`../assets/sponsors/${file}`, import.meta.url).href
}));

// ── Brand colours ─────────────────────────────────────────────────────────────
const MAGENTA = '#c200ab';
const GOLD = '#f5b800';
const WHITE = '#ffffff';

const PLACEHOLDER_SVG = "https://northvssouthpadel.co.za/wp-content/uploads/2026/02/player.svg";

// ── Player Bios ───────────────────────────────────────────────────────────────
const PLAYER_BIOS = {
  // TEAM NORTH
  'Paul Anderson': {
    isCaptain: true,
    bio: "Captain. A front-foot counter player who sets the tone with an aggressive approach and strong presence at the net. His backhand volley is a key weapon, often controlling exchanges and applying pressure. Brings experience and a commanding edge into every match.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Paul-Anderson-Captain.webp'
  },
  'Brad Vermeulen': {
    bio: "Controls the front of the court and looks to shorten points whenever the chance appears. His backhand volley does the damage, taking time away and forcing errors. With prior Guardrisk North vs South appearances, he brings a sharp, assertive style.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Brad-Vermeulen.webp'
  },
  'Dean Nortier': {
    bio: "Works the point from the back and sets his partner up to finish. His bajada is a key transition shot, turning defence into attack with control. With experience across Guardrisk North vs South, he brings structure, awareness and a clear tactical mindset.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Dean-Nortier.webp'
  },
  'Charl Vos': {
    bio: "Reads the game well and uses his bandeja to control tempo and keep opponents pinned back. Comfortable in defence, he absorbs pressure and resets with intent, with the smash there when the chance opens. A returning player at Guardrisk North vs South.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Charl-Vos.webp'
  },
  'Adam van Harte': {
    bio: "A composed counter player who balances patience with sharp timing. His speed allows him to cover the court effectively, while his smash gives him a clean finishing option when the moment opens. A regular at Guardrisk North vs South, he brings control and experience.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Adam-van-Harte.webp'
  },
  'Tiaan Erasmus': {
    bio: "A powerful player who looks to take control early and keep opponents under pressure. His smash is a clear weapon, backed by the strength to finish points decisively. With years in the game, he plays direct, aggressive padel with intent throughout.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Tiaan-Erasmus.webp'
  },
  'Chadley Brown': {
    bio: "A powerful, front-foot player who looks to dictate with intent. His smash is a standout weapon, used confidently to finish points and apply pressure. A regular at Guardrisk North vs South, he brings an aggressive mindset and looks to take control early in rallies.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/1.webp'
  },
  'Aidan Carrazedo': {
    bio: "A composed counter player who reads the game well and stays steady through long rallies. His vibora is a reliable weapon when shifting momentum and he tends to close points with control rather than force. Calm under pressure with a disciplined, patient approach.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Aiden-Carrazedo.webp'
  },
  'Brandon Weir Smith': {
    bio: "An assertive counter player who doesn’t hesitate to take control of the point. His smash is a genuine weapon, often used to close out rallies decisively. Brings an aggressive edge to his play, with a backhand that holds up under sustained pressure.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Brandon-Weir-Smith.webp'
  },
  'Chevaan Davids': {
    bio: "An athletic player who covers ground quickly and stays in points others would lose. His vibora is used with intent to manage pace and create openings. Prefers the left side, where he combines movement and control to build pressure and finish strongly.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Chevaan-Davids.webp'
  },
  'Gustav Hefer': {
    bio: "Plays with intent and looks to take control through the middle of the court. His backhand volley stands out as a reliable weapon, with the smash there to finish when openings come. On debut at Guardrisk North vs South, he brings an aggressive mindset.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Gustav-Hefer.webp'
  },
  'Josh Deutchmann': {
    bio: "Builds points with control and reads the game well off the glass. His vibora is used effectively to apply pressure and shift momentum, often setting up the finish. A returning player at Guardrisk North vs South with a measured, well-structured approach.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Josh-Deutchmann.webp'
  },
  'Josh Van Rensburg': {
    bio: "An experienced, strong player who manages tempo with control and clarity. He builds points patiently and steps in to finish when the opportunity presents. With multiple Guardrisk North vs South appearances, he competes with confidence and a clear understanding of the moment.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Josh-Van-Rensburg.webp'
  },
  'Juan Louis van Antwerpen': {
    bio: "A steady counter player with clean fundamentals across all areas of the game. Comfortable at the net, his volleys give him control in longer exchanges. He builds points with patience and closes them with intent, showing growing confidence.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Juan-Louis-van-Antwerpen.webp'
  },
  'Mark Morreira': {
    bio: "A defensive player who uses his reach to cover ground and extend rallies. His glass work is a key strength, allowing him to reset points and stay in control from difficult positions. Brings a measured, patient approach into each Guardrisk North vs South appearance.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Mark-Morreira.webp'
  },
  'Pierre Le Grange': {
    bio: "A counter player known for a measured, tactical approach and strong control at the net. He uses his bandeja effectively to manage pressure, builds points patiently and finishes with intent. His volleying remains a consistent standout.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Pierre-Le-Grange.webp'
  },
  'Steven Loock': {
    bio: "An experienced player known for his ability to turn defence into attack with sharp timing. His smash is a proven weapon, often used to close out rallies decisively. Comfortable shifting momentum, he brings a composed, well-balanced approach into every match.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Steven-Loock.webp'
  },
  'Tremayne Mitchell': {
    bio: "Plays on instinct and looks to take time away from opponents early in the rally. His smash is a statement shot, used to shift momentum and finish with authority. Prefers the left side, where he applies constant pressure.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Tremayne-Mitchell.webp'
  },
  'Warren Kuhn': {
    bio: "An aggressive counter player who thrives at the net and looks to take time away from opponents. His backhand volley stands out as a reliable weapon, often setting up the finish. Brings previous Guardrisk North vs South experience and a direct, front-foot approach.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Warren-Kuhn.webp'
  },
  'Zaidy Patel': {
    bio: "Brings a measured approach, favouring control over rushed decisions. His vibora helps manage pace and build pressure, allowing him to stay in rallies and work openings. A returning player at Guardrisk North vs South with a steady, disciplined style.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Zaidy-Patel.webp'
  },
  'Bradwin Williams': {
    bio: "Sharp at the net with quick hands that create constant pressure. He looks to take the ball early and close down space, using his volleys to control exchanges. Prefers the left side and brings an aggressive, front-foot mindset into every rally.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Bradwin-Williams.webp'
  },
  'Yasser Assamo': {
    bio: "An aggressive counter player who looks to disrupt rhythm and take control early in the point. His lob is used effectively to reset and create attacking opportunities, with a smash that backs it up. Makes his Guardrisk North vs South debut with intent.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Yasser-Assamo.webp'
  },
  'Keagan Rooy': {
    bio: "Controls the tempo and recognises when to lift it. His smash is decisive when the opening comes, while his bajada turns defence into immediate advantage. Prefers the left side and plays with authority, taking charge of key moments.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Keagan-Rooy.webp'
  },
  'Eggie van Heerden': {
    bio: "Solves pressure situations with control and precision, rarely giving away cheap points. His bajada is a standout, often turning defence into immediate advantage, while his winter lob resets rallies on his terms. An experienced player who reads the game exceptionally well.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Eggie-van-Heerden.webp'
  },
  'Mark Stillerman': {
    bio: "Holds a defensive line with discipline and reads the game well under pressure. His bandeja helps control tempo and keep opponents contained, while his commitment to the team stands out. On his third Guardrisk North vs South, he brings a focused, structured approach.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Mark-Stillerman.webp'
  },
  'Joel van Rensburg': {
    bio: "Balances his game well and adapts to the moment as rallies unfold. His vibora helps him manage pace, while his movement and net pressure allow him to take control when needed. He will make his Guardrisk North vs South debut in 2026.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Joel-van-Rensburg.webp'
  },
  'Richard Ashforth': {
    bio: "Uses sharp angles to open the court and force opponents out of position. He plays with intent and clarity, backing his shot selection in key moments. A returning player at Guardrisk North vs South, he brings a direct, assertive approach.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Richard-Ashforth.webp'
  },
  'Farhaan Sayanvala': {
    bio: "Power sits at the centre of his game, and he looks to impose it from the outset. His smash is a defining shot, used to finish points and shift momentum quickly. On debut at Guardrisk North vs South, he plays with intent and an aggressive edge.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Farhaan-Sayanvala.webp'
  },

  // TEAM SOUTH
  'Paul Waldburger': {
    isCaptain: true,
    bio: "Captain. Commands the net and keeps points on his terms. Moves well and reacts quickly, closing space with intent. Very experienced and thrives under pressure, bringing energy that lifts the tempo and drives momentum in matches.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Paul-Waldburger-South-Captain.webp'
  },
  'Brett Hilarides': {
    bio: "Commands the net and keeps play under control through his bandeja and vibora. He plays at a high tempo and reads the game clearly, making smart adjustments as rallies develop. An experienced presence who has played a key role across previous Guardrisk North vs South events.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Brett-Hilarides.webp'
  },
  'Bryce Wigston': {
    bio: "Brings high intensity into every rally and looks to keep opponents under pressure. His bandeja and vibora allow him to control pace and dictate play. Making his debut at Guardrisk North vs South 2026, he adds energy and thrives when the moment demands it.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Bryce-wigston.webp'
  },
  'Calvin Crouse': {
    bio: "Covers the court with speed and anticipation, turning defence into opportunity through movement alone. Flexible across both sides, he reacts quickly and stays in points others would lose. Known as a clutch finisher, he steps up when it matters and handles pressure well.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Done-Calvin-Crouse.webp'
  },
  'Cam Weir': {
    bio: "Looks to take the net early and apply pressure from the outset. His overhead game is a constant threat, with the smash used to finish decisively. Fast, reactive and unpredictable, he brings a big-match presence into every contest.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Cameron-Weir.webp'
  },
  'Paul Atkinson': {
    bio: "Handles the back court with authority, using the glass to stay in points and reset under pressure. He adapts quickly as matches shift and keeps the tempo under control. An experienced player who raises his level when it matters most.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Paul-Atkinson.webp'
  },
  'James Corns': {
    bio: "Steps in early and looks to end points on his terms. His overhead game is decisive, with the smash used to close out rallies. Brings high intensity throughout and delivers in key moments, finishing points when the pressure is highest.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/James-Corns.webp'
  },
  'David Allardice': {
    bio: "Plays with relentless intent and keeps the pace high from the first point. His overhead game is a constant threat, finishing points when the opportunity comes. Unpredictable under pressure and a clear crowd favourite, he brings energy that lifts every match.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/David-Allardice.webp'
  },
  'Luan Krige': {
    bio: "One of the country’s top-ranked players, he brings intensity and authority into every match. His movement and court coverage allow him to stay in control across all phases of play. Experienced and comfortable under pressure, he delivers when the level lifts.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Luan-Krige-1.webp'
  },
  'Marc Anderson': {
    bio: "Brings a fearless, high-intensity approach and looks to impose from the outset. His overhead game, led by a strong smash, is his main weapon. He will make his Guardrisk North vs South debut in 2026, bringing energy and a willingness to take risks.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Marc-Anderson.webp'
  },
  'Yazeed Abbas': {
    bio: "Moves exceptionally well and covers the court with speed and intent. Quick to react, he stays in rallies and adjusts as points unfold. An experienced player who reads the game clearly and handles pressure with a calm, measured approach.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/05/Yazeed-Abbas.webp'
  },
  'Martin Redelinghuys': {
    bio: "Combines a strong attacking instinct with clear decision-making under pressure. His smash is a genuine weapon, used with intent rather than force alone. Experienced and comfortable in big moments, he reads situations well and delivers when the match is on the line.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Done-Martin-Redelinghuys.webp'
  },
  'DJ Broeksma': {
    bio: "Feeds off momentum and lifts the tempo when matches start to turn. His bandeja and vibora give him control in transition, allowing him to shift pressure quickly. An experienced player who brings energy into every exchange and keeps the match moving forward.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/DJ-Broeksma.webp'
  },
  'Craig Smith': {
    bio: "Controls the net with calm, precise volleying and keeps exchanges on his terms. He builds momentum through positioning and consistency, forcing errors rather than chasing winners. In big moments, he stays composed and makes clear decisions under pressure.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Craig-Smith.webp'
  },
  'James Munro': {
    bio: "Varies his game well and keeps opponents guessing. His volleying is calm and controlled, allowing him to manage pace and shift direction when needed. Unpredictable in how he constructs points, he is a crowd favourite who brings flair into matches.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/James-Munro.webp'
  },
  'Christian Coetzee': {
    bio: "Takes control early and plays on the front foot. His overhead game is a genuine weapon, finishing points with authority when chances appear. Stays composed under pressure and reads the game well, making smart decisions at key moments.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Christian-Coetzee.webp'
  },
  'Joshua Heath': {
    bio: "Adapts well across different phases of the game and reads situations clearly. His overhead game gives him a reliable way to finish points, while his sense of momentum helps him shift matches when it counts. Brings energy and control into every exchange.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Done-Joshua-Heath.webp'
  },
  'Tiaan van Wyk': {
    bio: "Builds points with patience and chooses his moments well. His overhead game gives him a reliable finish, used when openings present. Comfortable under pressure, he stays composed and executes in key situations, bringing a steady presence into high-stakes matches.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Done-Tiaan-van-Wyk.webp'
  },
  'Jason Smit': {
    bio: "Controls the net with firm, early volleys and looks to keep exchanges short. He plays at a high tempo and stays composed when points tighten. With strong experience behind him, he brings drive and intensity that carries through every match.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Jason-Smit.webp'
  },
  'Ockie Oosthuizen': {
    bio: "Brings pace and intent from the first ball, looking to take control early. His overhead game is a major threat, with the smash used to finish decisively. Fast and reactive, he plays with unpredictability and injects energy into every rally.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Ockie-Oosthuizen.webp'
  },
  'Oloff van Achterbergh': {
    bio: "Covers ground quickly and reads play early, often turning defence into advantage through movement alone. Fast and reactive, he adapts to different phases of the match with ease. An experienced player who handles pressure well and makes smart decisions when it matters.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Oloff-van-Achterbergh.webp'
  },
  'Botha Pretorius': {
    bio: "Lives at the net and looks to finish points before they settle. His volleys are firm and decisive, cutting off angles and forcing quick decisions. When momentum swings his way, he builds on it fast and reads the moment well.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Done-Botha-Pretorius.webp'
  },
  'Anthony Scholtz': {
    bio: "Plays with balance and control, adjusting as rallies unfold. His overheads give him a reliable finishing option, while he manages the flow of the match well. An experienced player who understands when to slow things down and when to step in.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Anthony-Scholtz.webp'
  },
  'Chris Westerhof': {
    bio: "Steps forward early and dictates play with confidence. His volleying is calm and precise, allowing him to control exchanges without overplaying. In big moments, he holds his level and makes the right calls, marking him as a serious competitor on court.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/04/Chris-Westerhof.webp'
  },
  'Philip Franken': {
    bio: "Moves exceptionally well and covers the court with purpose, keeping rallies alive and turning defence into opportunity. He plays at a high tempo and lifts his level under pressure. A big-match player who stays composed and delivers when the stakes are highest.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/05/Philip-Franken.webp'
  },
  'Gren Forte': {
    bio: "Brings a calm, controlled presence and adapts well as matches unfold. His bandeja and vibora help him manage tempo and create openings without forcing play. Unpredictable in his shot selection, he reads situations well and uses experience to stay one step ahead.",
    image: 'https://northvssouthpadel.co.za/wp-content/uploads/2026/05/Gren-Aspeling.peg_.webp'
  }
};

// ── Static rosters ────────────────────────────────────────────────────────────
const DIVISIONS = {
  "Men's Open": {
    north: [
      'Paul Anderson', 'Brad Vermeulen', 'Dean Nortier', 'Charl Vos', 'Adam van Harte',
      'Tiaan Erasmus', 'Chadley Brown', 'Aidan Carrazedo', 'Brandon Weir Smith',
      'Chevaan Davids', 'Gustav Hefer', 'Josh Deutchmann', 'Josh Van Rensburg',
      'Juan Louis van Antwerpen', 'Mark Morreira', 'Pierre Le Grange', 'Steven Loock',
      'Tremayne Mitchell', 'Warren Kuhn', 'Zaidy Patel', 'Bradwin Williams',
      'Yasser Assamo', 'Keagan Rooy', 'Eggie van Heerden', 'Mark Stillerman',
      'Joel van Rensburg', 'Richard Ashforth', 'Farhaan Sayanvala'
    ],
    south: [
      'Paul Waldburger', 'Brett Hilarides', 'Bryce Wigston', 'Calvin Crouse', 'Cam Weir',
      'Paul Atkinson', 'James Corns', 'David Allardice', 'Luan Krige', 'Marc Anderson',
      'Yazeed Abbas', 'Martin Redelinghuys', 'DJ Broeksma', 'Craig Smith', 'James Munro',
      'Christian Coetzee', 'Joshua Heath', 'Tiaan van Wyk', 'Jason Smit', 'Ockie Oosthuizen',
      'Oloff van Achterbergh', 'Botha Pretorius', 'Anthony Scholtz', 'Chris Westerhof',
      'Philip Franken', 'Gren Forte', 'Shaun Legas', 'Seb Millan', 'Jason Blakey-Milner'
    ],
  },
};

// ── Animation variants ─────────────────────────────────────────────────────────
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

// ── Components ────────────────────────────────────────────────────────────────

const PlayerModal = ({ player, onClose }) => {
  if (!player) return null;
  const bioData = PLAYER_BIOS[player.name];

  const finalImage = (bioData?.image && !bioData.image.includes('player.svg'))
    ? bioData.image
    : (player.imageUrl && !player.imageUrl.includes('player.svg'))
      ? player.imageUrl
      : PLACEHOLDER_SVG;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white rounded-[32px] md:rounded-[48px] overflow-hidden max-w-2xl w-[92%] md:w-full shadow-2xl relative max-h-[80vh] md:max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 md:top-8 md:right-8 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-all">
          <X className="w-5 h-5 md:w-6 md:h-6 text-black" />
        </button>

        <div className="flex flex-col md:flex-row h-full overflow-y-auto">
          <div className="w-full md:w-1/2 aspect-[4/5] md:aspect-auto relative bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
            {finalImage === PLACEHOLDER_SVG ? (
              <div className="w-full h-full bg-gray-50 flex items-center justify-center p-12 md:p-20">
                <img src={PLACEHOLDER_SVG} alt="Placeholder" className="w-full h-full object-contain opacity-20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <User className="w-16 h-16 md:w-24 md:h-24 text-gray-200" />
                </div>
              </div>
            ) : (
              <img src={finalImage} alt={player.name} className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent md:hidden" />
          </div>

          <div className="w-full md:w-1/2 p-6 md:p-14 flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-magenta mb-3 md:mb-4" style={{ color: MAGENTA }}>Tournament Pro</p>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter italic mb-4 md:mb-6 leading-none">{player.name}</h2>
            <div className="w-12 h-1 bg-gold mb-6 md:mb-8" style={{ background: GOLD }} />

            <p className="text-gray-600 leading-relaxed font-medium mb-6 md:mb-8 text-sm md:text-base">
              {bioData?.bio || "Participating in the elite Guardrisk North vs South 2026. Bringing high-level tactical skill and regional pride to the ultimate padel showdown."}
            </p>

            <div className="flex gap-4">
              <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 rounded-2xl border border-gray-100">
                <Shield className="w-4 h-4 text-magenta" style={{ color: MAGENTA }} />
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Elite Squad</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const SponsorMarquee = () => {
  return (
    <div className="w-full bg-[#fff] py-8 md:py-24 overflow-hidden border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-6 mb-8 md:mb-16 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400">Official Tournament Partners</p>
      </div>
      <div className="flex overflow-hidden relative">
        <motion.div
          className="flex gap-12 md:gap-24 items-center whitespace-nowrap"
          animate={{ x: [0, -2500] }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        >
          {[...sponsorImages, ...sponsorImages, ...sponsorImages].map((sponsor, idx) => (
            <div key={`${sponsor.id}-${idx}`} className="w-32 md:w-48 h-16 md:h-24 flex items-center justify-center grayscale hover:grayscale-0 transition-all duration-700 opacity-50 hover:opacity-100 px-4">
              <img src={sponsor.src} alt="Sponsor" className="max-w-full max-h-full object-contain" />
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

const SectionHeader = ({ tag, title, light = false }) => (
  <div className="mb-4 md:mb-12">
    <p className={`text-[10px] font-black uppercase tracking-[0.4em] mb-2 md:mb-4 ${light ? 'text-white/60' : 'text-magenta/50'}`} style={{ color: light ? undefined : `${MAGENTA}80` }}>
      {tag}
    </p>
    <h2 className={`text-2xl md:text-6xl font-black uppercase tracking-tighter italic leading-[1] md:leading-[0.9] ${light ? 'text-white' : 'text-magenta'}`} style={{ color: light ? WHITE : MAGENTA }}>
      {title}
    </h2>
  </div>
);

const PlayerGridCard = ({ name, imageUrl, accent, onClick }) => {
  const bioData = PLAYER_BIOS[name];
  const isCaptain = bioData?.isCaptain;
  const finalImageUrl = (bioData?.image && !bioData.image.includes('player.svg')) ? bioData.image : imageUrl;

  return (
    <motion.button
      whileHover={{ y: -5 }}
      onClick={onClick}
      className="relative aspect-[3/4] rounded-2xl md:rounded-[32px] overflow-hidden group bg-gray-100 shadow-lg"
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        {finalImageUrl && !finalImageUrl.includes('player.svg') ? (
          <img src={finalImageUrl} alt={name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <User className="w-12 h-12 md:w-20 md:h-20 text-gray-400 opacity-30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
      </div>

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 p-4 md:p-6 flex flex-col items-start text-left">
        {isCaptain && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-2 shadow-xl">
            <Star className="w-3 h-3 text-gold fill-gold" style={{ color: GOLD, fill: GOLD }} />
            <span className="text-[8px] font-black uppercase tracking-widest text-white">Captain</span>
          </div>
        )}
        <h4 className="text-white font-black uppercase tracking-tighter italic text-sm md:text-xl leading-none group-hover:text-gold transition-colors" style={{ color: WHITE }}>{name}</h4>
      </div>

      {/* Hover Reveal Overlay */}
      <div className="absolute inset-0 bg-magenta/20 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `${accent}22` }} />
    </motion.button>
  );
};

// ── Results Data ─────────────────────────────────────────────────────────────
const TOURNAMENT_DATA = {
  id: '6404918',
  name: "Guardrisk North vs South 2026",
  lastUpdated: 'Live Updates',
  scores: {
    overall: { north: 3, south: 2 },
    friday: { north: 3, south: 2 },
    saturday: { north: 0, south: 0 },
    sunday: { north: 0, south: 0 }
  },
  matches: [
    { id: 1, team1: 'Adam Van Harte / Aidan Carrazedo', team2: 'Paul Waldburger / Jason Blakey-Milner', score: '1-0', winner: 'north', status: 'Completed', round: 'Men-Doubles' },
    { id: 2, team1: 'Bradwin Williams / Brandon Weir-Smith', team2: 'Luan Krige / Shaun Leagas', score: '2-0', winner: 'north', status: 'Completed', round: 'Men-Doubles' },
    { id: 3, team1: 'Chadley Brown / Charl Vos', team2: 'Joshua Heath / Anthony Scholtz', score: '0-1', winner: 'south', status: 'Completed', round: 'Men-Doubles' },
    { id: 4, team1: 'Chevaan Davids / Dean Nortier', team2: 'Brett Hilarides / Bryce Wigston', score: '0-2', winner: 'south', status: 'Completed', round: 'Men-Doubles' },
    { id: 5, team1: 'Farhaan Sayanvala / Joel Van Rensburg', team2: 'Calvin Crouse / Cameron Weir', score: '1-0', winner: 'north', status: 'Completed', round: 'Men-Doubles' },
    { id: 6, team1: 'Joshua Van Rensburg / Egmond Van heerden', team2: 'chris westerhof / Craig Smith', score: 'Upcoming', winner: null, status: '16/05 15:00', round: 'Men-Doubles' },
    { id: 7, team1: 'Gustav Hefer / Pierre Le grange', team2: 'David Allardice / DJ Broeksma', score: 'Upcoming', winner: null, status: '16/05 15:00', round: 'Men-Doubles' },
    { id: 8, team1: 'Juan-Louis Van Antwerpen / Josh Deutschmann', team2: 'James Corns / JAMES MUNRO', score: 'Upcoming', winner: null, status: '16/05 14:30', round: 'Men-Doubles' },
    { id: 9, team1: 'Keagan Rooy / Mark Morreira', team2: 'Marc Anderson / Martin Redelinghuys', score: 'Upcoming', winner: null, status: '16/05 14:30', round: 'Men-Doubles' },
    { id: 10, team1: 'Mark Stillerman / Paul Anderson', team2: 'Ockie Oosthuizen / Oloff van Achterbergh', score: 'Upcoming', winner: null, status: '16/05 14:30', round: 'Men-Doubles' },
    { id: 11, team1: 'Richard Ashforth / Steven Loock', team2: 'Philip Franken / Sebastian millan', score: 'Upcoming', winner: null, status: '16/05 14:30', round: 'Men-Doubles' },
    { id: 12, team1: 'Tiaan Erasmus / Tremayne Mitchell', team2: 'Tiaan Van Wyk / Yazeed Abbas', score: 'Upcoming', winner: null, status: '16/05 14:30', round: 'Men-Doubles' },
    { id: 13, team1: 'Warren Kuhn / Yasser Assamo', team2: 'Paul Atkinson / Aaron Marks', score: 'Upcoming', winner: null, status: '16/05 10:00', round: 'Men-Doubles' },
    { id: 14, team1: 'Zaidy Patel / Adam Van Harte', team2: 'Scott Whysall / Hamza Kana', score: 'Upcoming', winner: null, status: '16/05 14:00', round: 'Men-Doubles' }
  ]
};

const ResultsSection = () => {
  const [activeTab, setActiveTab] = useState('standings'); 
  const [liveData, setLiveData] = useState(TOURNAMENT_DATA);
  const { getTeamTournamentResults, loading } = useRankedin();
  
  const [user, setUser] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const { permissions } = useAdminPermissions(user?.email);
  const isAdmin = permissions?.role === 'super_admin' || (permissions && permissions.id) || new URLSearchParams(window.location.search).get('admin') === 'true';
  
  const [isEditing, setIsEditing] = useState(false);
  const [manualScores, setManualScores] = useState(TOURNAMENT_DATA.scores);

  // Load manual scores from Supabase or localStorage on mount
  useEffect(() => {
    const savedScores = localStorage.getItem('nvs_manual_scores');
    if (savedScores) {
      try {
        setManualScores(JSON.parse(savedScores));
      } catch (e) {
        console.error("Failed to parse saved scores", e);
      }
    }
  }, []);

  const handleSaveScores = () => {
    localStorage.setItem('nvs_manual_scores', JSON.stringify(manualScores));
    setIsEditing(false);
  };

  useEffect(() => {
    const fetchLiveResults = async () => {
      try {
        const results = await getTeamTournamentResults(TOURNAMENT_DATA.id);
        
        if (results && results.Matches && results.Matches.length > 0) {
          const formattedMatches = results.Matches.map((m, i) => ({
            id: i + 1,
            team1: m.Team1Players || m.Team1Name,
            team2: m.Team2Players || m.Team2Name,
            score: m.Score || 'Upcoming',
            winner: m.WinnerTeamId === results.Team1Id ? 'north' : (m.WinnerTeamId === results.Team2Id ? 'south' : null),
            status: m.IsFinished ? 'Completed' : (m.MatchDateFormatted || 'Upcoming'),
            round: m.CategoryName || 'Men-Doubles'
          }));

          setLiveData(prev => ({
            ...prev,
            scores: manualScores || { 
              overall: {
                north: results.Team1Score || 0, 
                south: results.Team2Score || 0 
              },
              friday: { north: 0, south: 0 },
              saturday: { north: 0, south: 0 },
              sunday: { north: 0, south: 0 }
            },
            matches: formattedMatches,
            lastUpdated: 'Live Updates'
          }));
        }
      } catch (err) {
        console.error("Error fetching live results:", err);
      }
    };

    fetchLiveResults();
    const interval = setInterval(fetchLiveResults, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [getTeamTournamentResults, manualScores]);

  const displayData = {
    ...liveData,
    scores: manualScores || liveData.scores
  };

  const northWins = displayData.scores.overall.north;
  const southWins = displayData.scores.overall.south;
  const totalWins = northWins + southWins;
  const winPercentage = totalWins > 0 ? Math.round((northWins / totalWins) * 100) : 50;
  const leaderText = northWins > southWins 
    ? `North +${northWins - southWins}` 
    : (southWins > northWins ? `South +${southWins - northWins}` : 'Teams Level');

  return (
    <section id="results" className="py-20 md:py-32 bg-white relative overflow-hidden">
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e2e2e2;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: ${MAGENTA};
          }
        `}
      </style>
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-magenta/20 to-transparent" style={{ background: `linear-gradient(to right, transparent, ${MAGENTA}33, transparent)` }} />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-magenta/5 blur-3xl rounded-full" style={{ background: `${MAGENTA}08` }} />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-gold/5 blur-3xl rounded-full" style={{ background: `${GOLD}08` }} />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 md:mb-20 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400">Live Tournament Results</p>
            </div>
            <h2 className="text-3xl md:text-6xl font-black uppercase tracking-tighter italic leading-none" style={{ color: MAGENTA }}>
              Battle for Supremacy
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-200 transition-all"
              >
                {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                {isEditing ? 'Cancel' : 'Edit Scores'}
              </button>
            )}
            <button
              onClick={() => setActiveTab('standings')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'standings' ? 'bg-white shadow-md text-magenta translate-y-[-1px]' : 'text-gray-400 hover:text-gray-600'}`}
              style={{ color: activeTab === 'standings' ? MAGENTA : undefined }}
            >
              <LayoutGrid className="w-4 h-4" />
              Standings
            </button>
            <button
              onClick={() => setActiveTab('matches')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'matches' ? 'bg-white shadow-md text-magenta translate-y-[-1px]' : 'text-gray-400 hover:text-gray-600'}`}
              style={{ color: activeTab === 'matches' ? MAGENTA : undefined }}
            >
              <List className="w-4 h-4" />
              Matches
            </button>
          </div>
        </div>

        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-8 bg-gray-50 rounded-[32px] border border-gray-200 shadow-xl"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black uppercase tracking-tighter italic" style={{ color: MAGENTA }}>Manual Score Entry</h3>
              <button onClick={handleSaveScores} className="flex items-center gap-2 px-6 py-3 bg-magenta text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg" style={{ background: MAGENTA }}>
                <Save className="w-4 h-4" /> Save All Scores
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {['overall', 'friday', 'saturday', 'sunday'].map(day => (
                <div key={day} className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">{day}</p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold uppercase text-magenta" style={{ color: MAGENTA }}>North</span>
                      <input 
                        type="number" 
                        value={manualScores[day].north} 
                        onChange={e => setManualScores({...manualScores, [day]: {...manualScores[day], north: parseInt(e.target.value) || 0}})}
                        className="w-16 p-2 bg-gray-50 border border-gray-100 rounded-lg text-center font-black"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold uppercase text-gold" style={{ color: GOLD }}>South</span>
                      <input 
                        type="number" 
                        value={manualScores[day].south} 
                        onChange={e => setManualScores({...manualScores, [day]: {...manualScores[day], south: parseInt(e.target.value) || 0}})}
                        className="w-16 p-2 bg-gray-50 border border-gray-100 rounded-lg text-center font-black"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'standings' ? (
            <motion.div
              key="standings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Main Scoreboard */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="bg-gradient-to-br from-gray-900 to-black rounded-[40px] p-8 md:p-12 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Trophy className="w-32 h-32 text-white" />
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                        <Activity className="w-4 h-4 text-gold" style={{ color: GOLD }} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">Overall Standing</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 py-4">
                      {/* Team North */}
                      <div className="flex flex-col items-center text-center">
                        <img src="/images/kitkat-group-logo.png" alt="North" className="w-12 h-12 md:w-16 md:h-16 object-contain mb-4" />
                        <div className="text-6xl md:text-8xl font-black italic tracking-tighter leading-none text-white">
                          {displayData.scores.overall.north}
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">VS</div>
                        <div className="h-12 w-px bg-white/10" />
                      </div>

                      {/* Team South */}
                      <div className="flex flex-col items-center text-center">
                        <img src={southLogo} alt="South" className="w-12 h-12 md:w-16 md:h-16 object-contain mb-4" />
                        <div className="text-6xl md:text-8xl font-black italic tracking-tighter leading-none text-white">
                          {displayData.scores.overall.south}
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 flex items-center justify-center gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Current Leader:</span>
                      <span className="text-xs font-black uppercase tracking-widest text-magenta italic" style={{ color: MAGENTA }}>{leaderText}</span>
                    </div>
                  </div>
                </div>

                {/* Daily Breakdown Grid */}
                <div className="grid grid-cols-3 gap-4">
                  {['friday', 'saturday', 'sunday'].map(day => (
                    <div key={day} className="bg-white border border-gray-100 rounded-3xl p-4 md:p-6 shadow-sm">
                      <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 text-center">{day}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col items-center">
                          <span className="text-xs md:text-xl font-black italic" style={{ color: MAGENTA }}>{displayData.scores[day].north}</span>
                          <span className="text-[6px] font-black uppercase text-magenta/40" style={{ color: `${MAGENTA}66` }}>North</span>
                        </div>
                        <div className="h-6 w-px bg-gray-100" />
                        <div className="flex flex-col items-center">
                          <span className="text-xs md:text-xl font-black italic" style={{ color: GOLD }}>{displayData.scores[day].south}</span>
                          <span className="text-[6px] font-black uppercase text-gold/40" style={{ color: `${GOLD}66` }}>South</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats Card */}
              <div className="bg-gray-50 rounded-[40px] p-8 md:p-10 border border-gray-100 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter italic mb-8" style={{ color: MAGENTA }}>Current Advantage</h3>
                  <div className="space-y-6">
                    <div className="p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Winning Percentage</span>
                        <span className="text-sm font-black text-magenta" style={{ color: MAGENTA }}>{winPercentage}%</span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${winPercentage}%` }} 
                          className="h-full bg-magenta" 
                          style={{ background: MAGENTA }} 
                        />
                      </div>
                    </div>

                    <div className="p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center" style={{ background: `${GOLD}1A` }}>
                          <Users className="w-6 h-6 text-gold" style={{ color: GOLD }} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Matches</p>
                          <p className="text-xl font-black italic">{displayData.matches.filter(m => m.score !== 'Upcoming').length.toString().padStart(2, '0')} / 112</p>
                          <p className="text-[8px] text-gray-400 font-black uppercase tracking-wider mt-1">Fri: 28 · Sat: 56 · Sun: 28</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 p-6 bg-magenta rounded-3xl text-white" style={{ background: MAGENTA }}>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Next Milestone</p>
                  <p className="text-lg font-black italic tracking-tight leading-tight">57 Matches wins to secure bragging rights</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="matches"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar"
            >
              {displayData.matches.map((match, idx) => (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative bg-white hover:bg-gray-50 border border-gray-100 rounded-[24px] md:rounded-[32px] p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-12 transition-all hover:shadow-xl hover:translate-y-[-2px]"
                >
                  <div className="flex items-center gap-4 w-full md:w-32 shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${match.score !== 'Upcoming' ? 'bg-green-50' : 'bg-gray-50'}`}>
                      {match.score !== 'Upcoming' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Clock className="w-5 h-5 text-gray-300" />}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{match.round}</span>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-4 md:gap-12 w-full">
                    {/* Kit Kat Team North Side */}
                    <div className={`flex items-center justify-end gap-6 ${match.winner === 'north' || match.score === 'Upcoming' ? 'opacity-100' : 'opacity-40'}`}>
                      <p className="text-xs md:text-lg font-black uppercase tracking-tighter text-right leading-tight">{match.team1}</p>
                      <div className="w-2 h-12 bg-magenta rounded-full shrink-0" style={{ background: MAGENTA }} />
                    </div>

                    {/* Score */}
                    <div className="flex flex-col items-center px-6 py-2 bg-gray-100 rounded-2xl shrink-0 min-w-[80px]">
                      <span className="text-xl font-black italic tracking-tighter">{match.score === 'Upcoming' ? 'VS' : match.score}</span>
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-400">{match.score === 'Upcoming' ? 'Upcoming' : 'Final Score'}</span>
                    </div>

                    {/* Team South Side */}
                    <div className={`flex items-center gap-6 ${match.winner === 'south' || match.score === 'Upcoming' ? 'opacity-100' : 'opacity-40'}`}>
                      <div className="w-2 h-12 bg-gold rounded-full shrink-0" style={{ background: GOLD }} />
                      <p className="text-xs md:text-lg font-black uppercase tracking-tighter leading-tight">{match.team2}</p>
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <div className={`px-4 py-2 rounded-full border ${match.score !== 'Upcoming' ? 'border-gray-100 text-gray-400 group-hover:bg-magenta group-hover:text-white group-hover:border-magenta' : 'border-dashed border-gray-200 text-gray-200'} text-[10px] font-black uppercase tracking-widest transition-all`} style={{ '--hover-bg': MAGENTA }}>
                      {match.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

const NorthVsSouth = () => {
  const [dbPlayers, setDbPlayers] = useState([]);
  const [activeDiv, setActiveDiv] = useState("Men's Open");
  const [selectedTeam, setSelectedTeam] = useState('north'); // 'north' or 'south'
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  useEffect(() => {
    supabase.from('players').select('name, image_url').then(({ data }) => {
      if (data) setDbPlayers(data);
    });
  }, []);

  const findDbPlayer = (name) => dbPlayers.find(p => p.name?.toLowerCase() === name.toLowerCase());
  const division = DIVISIONS[activeDiv];

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen font-sans bg-white text-[#111] selection:bg-[#c200ab] selection:text-white" style={{ '--magenta': MAGENTA, '--gold': GOLD }}>
      <Navbar isDark={false} accentColor={MAGENTA} />

      <AnimatePresence>
        {selectedPlayer && (
          <PlayerModal
            player={selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
      </AnimatePresence>

      {/* ═══════════════ HERO ═══════════════════════════════════════════════════ */}
      <section className="relative min-h-[80vh] md:min-h-screen flex flex-col justify-start md:justify-end p-6 md:p-12 pt-24 md:pt-0 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={heroImg} alt="Hero" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-magenta/80 via-magenta/20 to-transparent" style={{ background: `linear-gradient(to top, ${MAGENTA}dd, ${MAGENTA}22, transparent)` }} />
        </div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
          className="absolute top-28 right-6 md:top-32 md:right-12 z-20 bg-white p-5 md:p-6 rounded-2xl md:rounded-3xl shadow-2xl max-w-[240px] md:max-w-[280px] border-t-4 hidden sm:block"
          style={{ borderColor: GOLD }}
        >
          <div className="flex gap-3 mb-4">
            <div className="flex -space-x-3">
              {[
                PLAYER_BIOS['Paul Anderson'].image,
                PLAYER_BIOS['Paul Waldburger'].image,
                PLAYER_BIOS['Brett Hilarides'].image
              ].map((img, i) => (
                <div key={i} className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                  <img src={img} alt="Player" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 leading-tight">
              56 Elite<br />Players
            </div>
          </div>
          <h4 className="font-black text-xs md:text-sm uppercase tracking-wider mb-2">Invitation Only</h4>
          <p className="text-[10px] md:text-[11px] text-gray-500 leading-relaxed mb-4">
            Official SAPA Key Event. Team rosters are strictly curated from the best in SA.
          </p>
          <button onClick={() => scrollTo('the-event')} className="flex items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-magenta" style={{ color: MAGENTA }}>
            Join the Experience <ArrowRight className="w-3 h-3" />
          </button>
        </motion.div>

        <div className="relative z-10 max-w-7xl mx-auto w-full py-6 md:py-0">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col items-center md:items-start">
            <motion.div variants={fadeInUp} className="flex flex-col md:flex-row items-center gap-4 md:gap-6 mb-8 md:mb-8">
              <div className="bg-white p-3 md:p-2 rounded-2xl shadow-xl">
                <img src={nvsLogo} alt="Official Logo" className="h-32 md:h-32 w-auto object-contain" />
              </div>
              <div className="hidden md:block h-16 w-px bg-white/30" />
              <p className="text-white text-[10px] md:text-sm font-black uppercase tracking-[0.4em] leading-tight text-center md:text-left">Guardrisk<br />North Vs South<br />2026</p>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-white text-4xl sm:text-7xl md:text-[9rem] font-black uppercase tracking-tighter italic leading-[0.9] mb-6 md:mb-12 drop-shadow-2xl text-center md:text-left"
              style={{ textShadow: '0 20px 80px rgba(0,0,0,0.3)' }}
            >
              THE ULTIMATE<br />BRAGGING RIGHTS
            </motion.h1>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                onClick={() => scrollTo('rosters')}
                className="px-8 py-4 md:px-10 md:py-5 bg-white rounded-full font-black text-[10px] md:text-xs uppercase tracking-widest hover:scale-105 transition-transform shadow-xl w-full sm:w-auto"
                style={{ color: MAGENTA }}
              >
                View Teams
              </button>
              <button
                onClick={() => scrollTo('the-event')}
                className="px-8 py-4 md:px-10 md:py-5 rounded-full font-black text-[10px] md:text-xs uppercase tracking-widest hover:scale-105 transition-transform shadow-xl text-white w-full sm:w-auto"
                style={{ background: GOLD }}
              >
                The Event
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ TOURNAMENT RESULTS ══════════════════════════════════════ */}
      <ResultsSection />

      {/* ═══════════════ THE EVENT ═══════════════════════════════════════════════ */}
      <section id="the-event" className="py-12 md:py-40 px-6 bg-white relative">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-24 items-center">
          <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <SectionHeader tag="The Experience" title="Guardrisk North Vs South Padel" />
            <div className="space-y-4 md:space-y-8">
              <p className="text-base md:text-2xl text-gray-500 leading-relaxed font-medium">
                Each May, players from Johannesburg, Durban and Cape Town arrive in Camps Bay for a weekend that is talked about long after the final match.
              </p>
              <p className="text-base md:text-2xl text-gray-500 leading-relaxed font-medium">
                Guardrisk North vs South is an <span className="text-magenta font-black" style={{ color: MAGENTA }}>invitation-only, team-based</span> padel tournament played over three days at The Rotunda. Recognised as an official SAPA Key Event, it blends high-level competition with the kind of atmosphere that makes people stay longer, cheer louder and come back year after year.
              </p>
              <p className="text-lg md:text-2xl font-black italic tracking-tight" style={{ color: MAGENTA }}>
                This is where rivalries are settled — at least until next May.
              </p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative group">
            <div className="absolute inset-0 bg-gold/10 rounded-[24px] md:rounded-[40px] -rotate-2 md:-rotate-3 transition-transform group-hover:rotate-0" style={{ background: `${GOLD}15` }} />
            <img src={actionImg} alt="Action" className="relative z-10 w-full h-auto rounded-[24px] md:rounded-[40px] shadow-2xl" />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ TITLE SPONSOR ═══════════════════════════════════════════ */}
      <section className="py-12 md:py-32 bg-gray-50 border-y border-gray-100 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex flex-col items-center"
            >
              <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.5em] text-magenta mb-8 md:mb-12" style={{ color: MAGENTA }}>Title Sponsor</p>

              <a
                href="https://guardrisk.co.za/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative mb-8 md:mb-16 block group"
              >
                <div className="absolute inset-0 bg-magenta/5 blur-3xl rounded-full group-hover:bg-magenta/10 transition-colors" style={{ background: `${MAGENTA}05` }} />
                <motion.img
                  whileHover={{ scale: 1.05 }}
                  src={new URL('../assets/sponsors/Gaurdrisk-Logo.png', import.meta.url).href}
                  alt="Guardrisk"
                  className="relative z-10 h-16 md:h-32 w-auto object-contain transition-transform"
                />
              </a>

              <div className="max-w-4xl">
                <h3 className="text-2xl md:text-5xl font-black uppercase tracking-tighter italic leading-tight mb-6 md:mb-10" style={{ color: MAGENTA }}>
                  Powering the ultimate<br className="hidden md:block" /> padel showdown
                </h3>
                <p className="text-gray-500 text-sm md:text-xl font-medium leading-relaxed max-w-2xl mx-auto mb-8 md:mb-12">
                  As the title sponsor, Guardrisk is proud to support the elite Guardrisk North vs South tournament. We are committed to excellence, competitive spirit, and the high-performance community that defines South African padel.
                </p>

                <motion.a
                  href="https://guardrisk.co.za/"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white border border-gray-200 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest text-magenta shadow-sm hover:shadow-lg transition-all"
                  style={{ color: MAGENTA }}
                >
                  Visit Guardrisk <ExternalLink className="w-3 h-3 md:w-4 md:h-4" />
                </motion.a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ THE FORMAT ══════════════════════════════════════════════ */}
      <section className="py-12 md:py-32 bg-magenta text-white px-6 overflow-hidden relative" style={{ background: MAGENTA }}>
        <div className="absolute top-0 right-0 w-full md:w-1/3 h-full opacity-10 md:opacity-20 pointer-events-none">
          <img src={venueImg} alt="Venue" className="w-full h-full object-cover" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <SectionHeader tag="How It Works" title="The Format & Match Play" light />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
            <div className="space-y-6 md:space-y-10">
              <p className="text-base md:text-3xl font-black italic leading-tight" style={{ color: GOLD }}>
                "Guardrisk North vs South follows a structured team format aligned with SAPA standards."
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-6">
                {[
                  { label: 'The Format', desc: 'Team North vs Team South showdown. Multi-round match play across the day.' },
                  { label: 'Match Play', desc: 'Standard padel scoring applied to all matches. Pairings rotate thoughtfully.' },
                ].map(item => (
                  <div key={item.label} className="p-5 md:p-8 rounded-[20px] md:rounded-[32px] bg-white/10 border border-white/20 backdrop-blur-sm">
                    <h4 className="font-black text-[10px] md:text-sm uppercase tracking-wider mb-2 text-white">{item.label}</h4>
                    <p className="text-[10px] md:text-xs text-white/60 font-bold leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-white/60 text-xs md:text-base leading-relaxed font-medium">
                Every match contributes to the overall team score - no match stands alone. Momentum builds with each round, rivalries intensify, and every game has the power to shift the balance between North and South.
              </p>
            </div>
            <div className="flex flex-col justify-center">
              <div className="p-6 md:p-10 rounded-[24px] md:rounded-[40px] bg-gold/10 border border-white/10" style={{ background: `${GOLD}20` }}>
                <h3 className="text-xl md:text-3xl font-black uppercase tracking-tighter mb-4 md:mb-6 text-white italic">Teamwork & Consistency</h3>
                <p className="text-white/80 text-sm md:text-base leading-relaxed font-medium mb-6 md:mb-8">
                  Teamwork, consistency, and fighting for every point will determine which side claims ultimate bragging rights. What remains constant is the sense that everyone on court is part of something shared.
                </p>
                <div className="flex items-center gap-4 text-white font-black uppercase tracking-[0.2em] text-[8px] md:text-xs">
                  <MapPin className="w-3 h-3 md:w-4 md:h-4 text-gold" style={{ color: GOLD }} /> The Rotunda · Camps Bay
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ MEET THE TEAMS ═════════════════════════════════════════ */}
      <section id="rosters" className="py-12 md:py-32 bg-[#fafafa] overflow-hidden px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-8 md:mb-16 gap-6">
            <SectionHeader tag="The Contenders" title="Tournament Squads" />

            {/* Team Selector Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-full border border-gray-200 w-full lg:w-auto overflow-hidden relative">
              <motion.div
                className="absolute inset-y-1 rounded-full shadow-lg z-0"
                animate={{ x: selectedTeam === 'north' ? 0 : '100%', width: '50%' }}
                style={{ background: selectedTeam === 'north' ? MAGENTA : GOLD }}
              />
              <button
                onClick={() => setSelectedTeam('north')}
                className={`relative z-10 flex-1 lg:px-10 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedTeam === 'north' ? 'text-white' : 'text-gray-400'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <img src="/images/kitkat-group-logo.png" alt="Kit Kat" className={`h-3 w-auto ${selectedTeam === 'north' ? 'brightness-0 invert' : ''}`} />
                  <span>Team North</span>
                </div>
              </button>
              <button
                onClick={() => setSelectedTeam('south')}
                className={`relative z-10 flex-1 lg:px-10 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedTeam === 'south' ? 'text-white' : 'text-gray-400'}`}
              >
                Team South
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selectedTeam}
              initial={{ opacity: 0, x: selectedTeam === 'north' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: selectedTeam === 'north' ? 20 : -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-12"
            >
              {/* Team Spotlight Header */}
              <div className="bg-white rounded-[32px] md:rounded-[48px] p-8 md:p-12 shadow-xl border border-gray-100 flex flex-col md:flex-row items-center gap-8 md:gap-16">
                <div
                  className="w-24 h-24 md:w-32 md:h-32 rounded-[32px] md:rounded-[40px] flex items-center justify-center p-5 md:p-8 shadow-inner shrink-0"
                  style={{ background: selectedTeam === 'north' ? `${MAGENTA}10` : `${GOLD}10` }}
                >
                  <img src={selectedTeam === 'north' ? "/images/kitkat-group-logo.png" : southLogo} alt="NVS Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-3xl md:text-5xl font-black uppercase tracking-tighter italic mb-4" style={{ color: selectedTeam === 'north' ? MAGENTA : GOLD }}>
                    {selectedTeam === 'north' ? (
                      <span className="flex items-center gap-3">
                        <img src="/images/kitkat-group-logo.png" alt="Kit Kat" className="h-8 md:h-12 w-auto" />
                        <span>Team North</span>
                      </span>
                    ) : 'Team South'}
                  </h3>
                  <p className="text-gray-500 text-sm md:text-lg leading-relaxed font-medium max-w-3xl">
                    {selectedTeam === 'north'
                      ? <span><img src="/images/kitkat-group-logo.png" alt="Kit Kat" className="h-4 w-auto inline-block align-middle mr-2" />Team North arrives with purpose and pace. Led by Paul Anderson, this is a side that plays forward, fast and with clear intent. There is an edge to their game, driven by ambition and a readiness to take control early.</span>
                      : "Measured, tactical and composed. United by regional familiarity and expectation, Team South brings a strong desire to keep the bragging rights where they believe they belong."
                    }
                  </p>
                </div>
              </div>

              {/* Player Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                {(selectedTeam === 'north' ? division.north : division.south).map((name) => (
                  <PlayerGridCard
                    key={name}
                    name={name}
                    imageUrl={findDbPlayer(name)?.image_url}
                    accent={selectedTeam === 'north' ? MAGENTA : GOLD}
                    onClick={() => setSelectedPlayer({ name, imageUrl: findDbPlayer(name)?.image_url })}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* ═══════════════ QUOTE SECTION ══════════════════════════════════════════ */}
      <section className="py-16 md:py-40 bg-white border-t border-gray-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Quote className="w-10 h-10 md:w-20 md:h-20 text-magenta/10 mx-auto mb-6 md:mb-12" style={{ color: `${MAGENTA}20` }} />
          <h2 className="text-xl md:text-5xl font-black uppercase tracking-tight italic leading-tight mb-8 md:mb-12" style={{ color: MAGENTA }}>
            "This is more than a tournament — it's where rivalries are forged and legends are born."
          </h2>
        </div>
      </section>

      {/* ═══════════════ DESTINATION & VENUE ══════════════════════════════════════ */}
      <section id="venue" className="py-12 md:py-40 bg-[#0a0a0a] text-white px-6 relative overflow-hidden">
        {/* Background Watermark */}
        <div className="absolute top-0 right-0 w-full h-full opacity-30 pointer-events-none">
          <img src={venueImg} alt="Venue Wide" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-[#0a0a0a]" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-32 items-start">
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <SectionHeader tag="Location" title="Destination & Venue" light />
              <div className="space-y-6 md:space-y-10">
                <div>
                  <h3 className="text-xl md:text-4xl font-black uppercase tracking-tighter italic mb-4 md:mb-6" style={{ color: GOLD }}>Camps Bay · Cape Town</h3>
                  <p className="text-white/70 text-base md:text-xl leading-relaxed font-medium mb-6 md:mb-8">
                    Camps Bay brings together mountain, beach and city energy in one place. In May, the pace is measured, the light is softer and the area feels settled rather than busy.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gold/20 flex items-center justify-center shrink-0" style={{ background: `${GOLD}33` }}>
                        <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gold" style={{ color: GOLD }} />
                      </div>
                      <p className="text-[9px] md:text-xs text-white/50 font-bold uppercase tracking-widest leading-relaxed">Walkable<br />Accommodation</p>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-magenta/20 flex items-center justify-center shrink-0" style={{ background: `${MAGENTA}33` }}>
                        <Camera className="w-4 h-4 md:w-5 md:h-5 text-magenta" style={{ color: MAGENTA }} />
                      </div>
                      <p className="text-[9px] md:text-xs text-white/50 font-bold uppercase tracking-widest leading-relaxed">Sunset<br />Drinks & Spas</p>
                    </div>
                  </div>
                </div>

                <p className="text-white/60 text-sm md:text-base leading-relaxed font-medium">
                  Courts sit close to sought after restaurants, established spas and walkable accommodation. While matches play out, partners can dip in and out with spa time, long lunches and sunset drinks, all without leaving the neighbourhood.
                </p>

                <p className="text-lg md:text-2xl font-black italic tracking-tight" style={{ color: MAGENTA }}>
                  The game takes centre stage and the weekend finds its flow.
                </p>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="space-y-8 md:space-y-12">
              <div className="relative group">
                <div className="absolute inset-0 bg-magenta/20 rounded-[24px] md:rounded-[40px] blur-3xl group-hover:bg-magenta/30 transition-all" />
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 p-6 md:p-12 rounded-[24px] md:rounded-[40px] shadow-2xl">
                  <h3 className="text-2xl md:text-5xl font-black uppercase tracking-tighter italic mb-4 md:mb-8">The Rotunda</h3>
                  <p className="text-white/70 text-sm md:text-lg leading-relaxed font-medium mb-4 md:mb-8">
                    Built in the early 1900s, the Rotunda has long been a gathering place in Camps Bay. Over the years it hosted dances, boxing matches and social events, drawing people in to watch, linger and be part of something shared.
                  </p>
                  <p className="text-white/70 text-sm md:text-lg leading-relaxed font-medium mb-6 md:mb-12">
                    The circular layout keeps players and spectators within the same shared space, creating a focused and energetic atmosphere around every match. Newly installed sound and lighting elevate the setting further, adding pace, drama and presence to the on court action.
                  </p>

                  <div className="flex items-center gap-4 md:gap-6 p-4 md:p-6 bg-white/5 rounded-2xl md:rounded-3xl border border-white/10">
                    <Music className="w-6 h-6 md:w-8 md:h-8 text-gold" style={{ color: GOLD }} />
                    <div>
                      <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Atmosphere</p>
                      <p className="text-[10px] md:text-sm font-bold text-white">Elevated Sound & Lighting</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-10 bg-gold/10 rounded-[24px] md:rounded-[40px] border border-gold/20" style={{ background: `${GOLD}10` }}>
                <p className="text-base md:text-xl font-bold italic leading-relaxed text-white">
                  "Padel fits this environment naturally. The game thrives on proximity, rhythm and collective attention... More than a venue, it sets the tone for the weekend."
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SPONSORSHIP ══════════════════════════════════════════════ */}
      <section id="sponsorship" className="py-12 md:py-40 bg-white px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-24 items-start">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <SectionHeader tag="Partnership" title="Sponsorship Opportunities" />
              <div className="space-y-6 md:space-y-8 text-gray-600 font-medium text-base md:text-xl leading-relaxed">
                <p>
                  Guardrisk North vs South offers brands the opportunity to align with one of the fastest-growing sports in South Africa, set against a venue that already draws strong foot traffic and high-value audiences.
                </p>
                <p>
                  Sponsorship goes beyond logo placement. Partners gain consistent visibility across match play, social moments and digital content, with authentic engagement from players and spectators throughout the weekend.
                </p>
                <p className="text-magenta font-black italic text-lg md:text-2xl" style={{ color: MAGENTA }}>
                  It’s a chance to be associated with competitive sport, a well-known setting and a crowd that stays, watches and talks about the event — long after the final match and the bragging rights are decided.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-gray-50 rounded-[32px] md:rounded-[48px] p-8 md:p-16 border border-gray-100 shadow-xl"
            >
              <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tighter italic mb-8 md:mb-12" style={{ color: GOLD }}>Placements</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-12">
                {/* Partnership */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-magenta mb-4" style={{ color: MAGENTA }}>Title & Partnership</h4>
                  <p className="text-sm md:text-base font-bold text-gray-800">Naming Rights Sponsor</p>
                </div>

                {/* Court Branding */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-magenta mb-4" style={{ color: MAGENTA }}>Court Branding</h4>
                  <ul className="text-sm md:text-base font-bold text-gray-800 space-y-2">
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold" style={{ background: GOLD }} /> Entrance Gate Padding</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold" style={{ background: GOLD }} /> Net Tape Branding</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold" style={{ background: GOLD }} /> Court Cage Boards</li>
                    <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gold" style={{ background: GOLD }} /> Entrance Floor Mats</li>
                  </ul>
                </div>

                {/* Venue Branding */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-magenta mb-4" style={{ color: MAGENTA }}>Venue Branding</h4>
                  <p className="text-sm md:text-base font-bold text-gray-800">Rotunda Wall Panels</p>
                </div>

                {/* Engagement */}
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-magenta mb-4" style={{ color: MAGENTA }}>On-Site Engagement</h4>
                  <p className="text-sm md:text-base font-bold text-gray-800">Activation Stations</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <SponsorMarquee />

      <footer className="py-10 md:py-24 bg-[#fff] border-t border-gray-100 text-center px-6">
        <img src={nvsLogo} alt="Official Logo" className="h-12 md:h-28 mx-auto mb-6 md:mb-12" />
        <p className="text-[8px] md:text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] md:tracking-[0.5em] leading-relaxed">Guardrisk North Vs South · © 2026 4M Padel</p>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100;400;700;900&display=swap');
        :root { font-family: 'Outfit', sans-serif; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #fff; }
        ::-webkit-scrollbar-thumb { background: ${MAGENTA}; border-radius: 5px; }
        ::selection { background: ${MAGENTA}; color: #fff; }
        html { scroll-behavior: smooth; }
      `}} />
    </div>
  );
};

export default NorthVsSouth;
