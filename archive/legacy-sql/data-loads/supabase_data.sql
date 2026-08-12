-- Clear existing data (optional, but good for a clean slate)
truncate table players restart identity;
truncate table events restart identity;

-- Insert Scraped Players (Top 5 from SAPA Ranking)
insert into players (name, rank_label, points, win_rate, image_url) values
('Pierre Le Grange', 'SAPA Rank #1', 478, '88%', null),
('Richard Ashforth', 'SAPA Rank #2', 300, '85%', null),
('Mark Stillerman', 'SAPA Rank #2 (tied)', 300, '60%', 'https://example.com/dynamics_player.png'),
('Juan-Louis Van Antwerpen', 'SAPA Rank #3', 225, '82%', null),
('Egmond Van Heerden', 'SAPA Rank #4', 180, '75%', null),
('Chevaan Davids', 'SAPA Rank #4 (tied)', 180, '75%', null);

-- Insert Scraped Tournaments
insert into events (title, date, time, location, category, status) values
('Autumn League - Intermediate Division', '2026-02-02', '18:00', 'Johannesburg', 'League', 'live'),
('Autumn League Division 1', '2026-02-04', '18:00', 'Johannesburg', 'League', 'live'),
('FNL Ladies Intermediate Showdown', '2026-02-13', '08:00 AM', 'Gqeberha', 'Ladies Intermediate', 'upcoming'),
('Babolat Ramadhan Invitational', '2026-02-20', '09:00 AM', 'Johannesburg', 'SAPA Bronze', 'upcoming'),
('THE KCC CUP', '2026-03-20', '08:00 AM', 'Johannesburg', 'Cup', 'upcoming'),
('SAPA Johannesburg Major 1/2026', '2026-03-25', '09:00 AM', 'Johannesburg', 'SAPA Major', 'upcoming');
