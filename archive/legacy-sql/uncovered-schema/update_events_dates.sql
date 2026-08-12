-- Add end_date column if it doesn't already exist
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS end_date DATE;

-- Update rows based on provided event_dates
UPDATE calendar SET start_date = '2026-02-07', end_date = '2026-02-08' WHERE id = 1;  -- 7 - 8 February 2026
UPDATE calendar SET start_date = '2026-03-13', end_date = '2026-03-15' WHERE id = 2;  -- 13 - 15 March
UPDATE calendar SET start_date = '2026-03-21', end_date = '2026-03-22' WHERE id = 3;  -- 21 - 22 March
UPDATE calendar SET start_date = '2026-03-25', end_date = '2026-03-29' WHERE id = 4;  -- 25 - 29 March
UPDATE calendar SET start_date = '2026-04-03', end_date = '2026-04-06' WHERE id = 5;  -- 3 - 6 April
UPDATE calendar SET start_date = '2026-04-03', end_date = '2026-04-06' WHERE id = 6;  -- 3 - 6 April
UPDATE calendar SET start_date = '2026-04-03', end_date = '2026-04-06' WHERE id = 7;  -- 3 - 6 April
UPDATE calendar SET start_date = '2026-04-10', end_date = '2026-04-12' WHERE id = 8;  -- 10 - 12 April
UPDATE calendar SET start_date = '2026-04-16', end_date = '2026-04-19' WHERE id = 9;  -- 16 - 19 April
UPDATE calendar SET start_date = '2026-04-24', end_date = '2026-04-26' WHERE id = 10; -- 24 - 26 April
UPDATE calendar SET start_date = '2026-04-25', end_date = '2026-04-27' WHERE id = 11; -- 25 - 27 April
UPDATE calendar SET start_date = '2026-04-30', end_date = '2026-05-03' WHERE id = 12; -- 30 Apr - 3 May
UPDATE calendar SET start_date = '2026-05-08', end_date = '2026-05-10' WHERE id = 13; -- 8 - 10 May
UPDATE calendar SET start_date = '2026-05-08', end_date = '2026-05-10' WHERE id = 14; -- 8 - 10 May
UPDATE calendar SET start_date = '2026-05-08', end_date = '2026-05-10' WHERE id = 15; -- 8 - 10 May
UPDATE calendar SET start_date = '2026-05-15', end_date = '2026-05-17' WHERE id = 16; -- 15 - 17 May
UPDATE calendar SET start_date = '2026-05-22', end_date = '2026-05-24' WHERE id = 17; -- 22 - 24 May
UPDATE calendar SET start_date = '2026-05-29', end_date = '2026-05-31' WHERE id = 18; -- 29 - 31 May
UPDATE calendar SET start_date = '2026-05-29', end_date = '2026-05-31' WHERE id = 19; -- 29 - 31 May
UPDATE calendar SET start_date = '2026-06-05', end_date = '2026-06-07' WHERE id = 20; -- 5 - 7 June
UPDATE calendar SET start_date = '2026-06-05', end_date = '2026-06-07' WHERE id = 21; -- 5 - 7 June
UPDATE calendar SET start_date = '2026-06-12', end_date = '2026-06-14' WHERE id = 22; -- 12 - 14 June
UPDATE calendar SET start_date = '2026-06-13', end_date = '2026-06-13' WHERE id = 23; -- 13 June
UPDATE calendar SET start_date = '2026-06-19', end_date = '2026-06-21' WHERE id = 24; -- 19 - 21 June
UPDATE calendar SET start_date = '2026-06-19', end_date = '2026-06-21' WHERE id = 25; -- 19 - 21 June
UPDATE calendar SET start_date = '2026-06-19', end_date = '2026-06-21' WHERE id = 26; -- 19 - 21 June
UPDATE calendar SET start_date = '2026-06-26', end_date = '2026-06-27' WHERE id = 27; -- 26 - 27 June
UPDATE calendar SET start_date = '2026-06-26', end_date = '2026-06-27' WHERE id = 28; -- 26 - 27 June
UPDATE calendar SET start_date = '2026-06-27', end_date = '2026-06-27' WHERE id = 29; -- 27 June
UPDATE calendar SET start_date = '2026-07-03', end_date = '2026-07-05' WHERE id = 30; -- 3 - 5 July
UPDATE calendar SET start_date = '2026-07-10', end_date = '2026-07-12' WHERE id = 31; -- 10 - 12 July
UPDATE calendar SET start_date = '2026-07-17', end_date = '2026-07-19' WHERE id = 32; -- 17 - 19 July
UPDATE calendar SET start_date = '2026-07-26', end_date = '2026-08-02' WHERE id = 33; -- 26 July - 2 Aug
UPDATE calendar SET start_date = '2026-08-27', end_date = '2026-08-30' WHERE id = 34; -- 27 - 30 Aug
UPDATE calendar SET start_date = '2026-09-24', end_date = '2026-10-01' WHERE id = 35; -- 24 Sep - 1 Oct
