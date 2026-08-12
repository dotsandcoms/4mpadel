-- Insert 3 dummy blog posts into the blogs table
-- Assuming the table was created using create_blog_table.sql

INSERT INTO blogs (title, slug, category, author, content, status, views, date, image_url)
VALUES 
(
    'Tips for Improving Your Smash',
    'tips-for-improving-your-smash',
    'Coaching',
    'Pierre Le Grange',
    '<p>The smash is one of the most exciting and dominant shots in padel, but it takes precision and technique to execute perfectly. In this guide, we break down the core components of a match-winning smash.</p><h2>1. Positioning is Everything</h2><p>Before you even think about hitting the ball, your feet must be correctly positioned. Always try to get under and slightly behind the ball. Moving quickly with small adjustment steps is key.</p><h2>2. The Contact Point</h2><p>Aim to strike the ball at the highest point possible, slightly in front of your head. Hitting it too late or too far behind will result in a weak shot that bounces up perfectly for your opponents.</p><h2>3. Use Your Body Weight</h2><p>A great smash isn’t just about arm strength; it’s about transferring your weight from your back foot to your front foot as you strike.</p><p>Practice these basics next time you hit the court, and watch your lob defense transform into a lethal attacking weapon!</p>',
    'Published',
    1240,
    '2026-01-15',
    'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop'
),
(
    'WPT 2026: What to Expect',
    'wpt-2026-what-to-expect',
    'News',
    'Sarah Jenkins',
    '<p>The World Padel Tour is gearing up for its most expansive year yet in 2026. With new locations added to the calendar and rising stars challenging the established veterans, the upcoming season promises unparalleled excitement.</p><h2>New Tour Stops</h2><p>This year, the tour will reach new audiences with debut tournaments in South Africa and Australia, highlighting the sport''s incredible global growth.</p><h2>Players to Watch</h2><p>Keep an eye on the emerging young talent from Argentina and Spain, who have been dominating the challenger circuits and are hungry for main draw success.</p><p>Stay tuned to our blog as we bring you exclusive coverage from the ground once the season kicks off!</p>',
    'Draft',
    0,
    '2026-02-01',
    'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop'
),
(
    'Nutrition for Padel Players',
    'nutrition-for-padel-players',
    'Health',
    'Dr. Smith',
    '<p>Padel is an intense, fast-paced sport that requires short bursts of maximum energy combined with long-term endurance. Fueling your body correctly can be the difference between winning a third-set tiebreak and fading early.</p><h2>Pre-Match Fuel</h2><p>About 2-3 hours before your match, focus on complex carbohydrates. A bowl of oatmeal, whole-grain pasta, or a sweet potato provides sustained energy. Avoid heavy, fatty foods that take a long time to digest.</p><h2>Hydration is Crucial</h2><p>Don''t wait until you are thirsty to drink. Start your hydration process the day before a big tournament, and ensure you are taking sips of water or an electrolyte drink during every changeover.</p><h2>Post-Match Recovery</h2><p>Within 30-45 minutes of finishing your match, consume a mix of protein and fast-absorbing carbohydrates. A protein shake with a banana is a perfect, easy-to-digest option to help repair muscle tissue.</p>',
    'Published',
    890,
    '2025-12-20',
    'https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1453&auto=format&fit=crop'
);
