-- 1. First, explicitly update the existing known text values to standard 24-hour time strings
UPDATE calendar SET start_time = '08:00:00', end_time = '22:00:00' WHERE id = 1;
UPDATE calendar SET start_time = '08:00:00', end_time = '18:00:00' WHERE id IN (2, 3);

-- 2. Convert the columns from text/varchar to the proper TIME data type
-- (This will automatically cast any other valid 'HH:MM AM/PM' strings to TIME type)
ALTER TABLE calendar ALTER COLUMN start_time TYPE TIME USING start_time::TIME;
ALTER TABLE calendar ALTER COLUMN end_time TYPE TIME USING end_time::TIME;
