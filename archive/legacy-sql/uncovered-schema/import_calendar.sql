-- Add missing columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS organiser TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sapa_category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_number TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue TEXT;

-- Clear existing events for fresh import
TRUNCATE TABLE events RESTART IDENTITY;

-- Insert Data
INSERT INTO events (date, title, city, organiser, sapa_category, event_number, status, venue) VALUES
('2026-02-07', 'Padel Odyssey Finals 7/8 Feb', 'Jhb', 'Padel Odyssey', 'Gold', '1', 'Confirmed', 'KCC'),
('2026-03-14', '13-15 March', 'Jhb', 'R&B', 'Gold', '2', 'Date available offered to R&B', 'R&B Jhb'),
('2026-03-21', '20-22 March', '', '', 'Gold', '3', 'Date available', ''),
('2026-03-21', 'Kings of the Court - 360 Major', 'Jhb', '360', 'Gold', '4', 'Pending with organiser', 'JHB - TBC'),
('2026-03-28', 'JHB Major 1. 25-29 March', 'Jhb', 'Shez', 'Major', 'M1', 'Confirmed', 'KCC/NetSet/105'),
('2026-04-04', 'Easter Weekend. 3-6 April', '', '', 'Gold', '5', 'Date available', ''),
('2026-04-11', '10-12 April', '', 'CT private event', 'Gold', '6', 'Date available', ''),
('2026-04-18', 'CT Major 2. 16-19 April', 'CT', 'R&B', 'Major', 'M2', 'Confirmed', 'R&B CT'),
('2026-05-02', '30 Apr- 3 May. Vaal Open', 'Vaal', 'Christo 10by20', 'Gold 1', '7', 'Date available', '10by20 Vanderbijl'),
('2026-05-09', 'Chiquita Cup', 'JHB', '360?', 'Affiliated event', 'K1', 'Confirmed', 'KCC?'),
('2026-05-14', 'North vs South', 'CT', 'NvsS', 'Affiliated event', 'K2', 'Confirmed', 'Camps Bay'),
('2026-05-23', '22-24 May', 'CT', 'Arturf', 'Gold', '8', 'Date available', 'Arturf'),
('2026-05-30', '29-31 May Virgin Gold', 'PTA', 'Virgin Padel', 'Gold', '', 'Confirmed', 'Groenkloof'),
('2026-05-30', '29-31 May Aura Gold', 'CT', 'Aura', 'Gold', '9', 'Date available', 'Aura'),
('2026-06-13', '12-14 June - Premier Padel Quali', 'Jhb', 'Shez', 'Gold', '10', 'Confirmed', 'KCC/Munyaka'),
('2026-06-13', '13 June SSPC gold 2', 'Jhb', 'SSPC', 'Gold 2', '', 'Confirmed', 'Sandton'),
('2026-06-20', '19-21 Jun', 'Jhb', 'Virgin Padel', 'Gold', '11', 'Confirmed', 'Bel Air / Lonehill'),
('2026-06-27', 'PADL1000 - 360 Major', 'Jhb', '360', 'Gold', '12', 'Confirmed', 'JHB - TBC'),
('2026-06-27', '27 Jun', 'CT', 'Aura', 'Gold', '13', 'Date available', 'Aura'),
('2026-07-11', '10-12 July SA Open Major', 'Jhb', '360', 'Major', 'M3', '', 'JHB - TBC'),
('2026-07-18', '17-19 July', 'CT', 'Atlantic Padel', 'Gold', '13', 'Date available', 'Atlantic Padel'),
('2026-07-26', 'Premier Padel', 'PTA', 'Primedia', 'FIP event', 'K3', '', 'Pretoria'),
('2026-08-05', 'Diamond League Knock outs', 'Jhb', '360', 'League - TBC', '', '?', ''),
('2026-08-08', '7-9 Aug Women''s Day w/e', 'Jhb', 'Virgin Padel', 'Gold 3', '14', 'Confirmed', 'Old Eds'),
('2026-08-08', '7-9 Aug Aura Gold', 'CT', 'Aura', 'Gold', '14', 'Date available', 'Aura'),
('2026-08-15', 'Diamond League Finals', 'Jhb', '360', 'League - TBC', '', '?', ''),
('2026-08-22', 'Padel Odyssey 2 Finals 21-23 Aug', 'Jhb', 'Padel Odyssey', 'Gold', '15', 'Confirmed', 'KCC'),
('2026-08-26', '24 - 27 Aug SAPA Durban Major 4', 'Durban', 'Virgin Padel', 'Major', 'M4', 'Confirmed', 'Gateway & Ballito'),
('2026-09-12', '11-13 Sept', 'CT', 'Arturf', 'Gold', '16', 'Pending with organiser', 'Arturf'),
('2026-09-19', '360 Cup - 360 Major', 'Jhb', '360', 'Gold', '17', 'Confirmed', 'JHB - TBC'),
('2026-09-24', '24-27 Sept - Heritage Day w/e', '', '', 'Gold', '18', 'Date available', ''),
('2026-10-01', 'SAPA Nationals Major 5', 'Bloem', 'TBC', 'Major', 'M5', 'TBC', 'Bloem TBC'),
('2026-10-10', '9-11 Oct', '', '', 'Gold', '19', 'Date available', ''),
('2026-10-17', '16-18 Oct', 'CT', 'Atlantic Padel', 'Gold', '20', 'Date available', 'Atlantic Padel'),
('2026-10-24', '23-25 Oct', '', '', 'Gold', '21', 'Date available', ''),
('2026-10-24', '23-25 Oct', 'CT', 'Virgin Padel', 'Gold 4', '22', 'Confirmed', 'Epicentre'),
('2026-10-24', '23-25 Oct', '', '', 'Gold', '', '', ''),
('2026-10-31', '30- 1 Nov', 'CT', 'Aura', 'Gold', '23', 'Date available', 'Aura'),
('2026-11-07', '6-8 Nov', '', '', 'Gold', '24', 'Date available', ''),
('2026-11-14', '13-15 Nov', 'Jhb', 'Virgin Padel', 'Gold 5', '25', 'Date available', 'Lonehill - TBC'),
('2026-11-27', 'SAPA Superfinals Major 6', 'Jhb', 'TBC', 'Major', 'M6', 'TBC', 'TBC'),
('2026-11-28', '360 JHB Finals', 'Jhb', '360', 'Gold', '26', 'Date available', 'JHB - TBC'),
('2026-12-05', 'Summer Slam - 360 Major', 'Jhb', '360', 'Gold', '27', 'Confirmed', 'JHB - TBC');