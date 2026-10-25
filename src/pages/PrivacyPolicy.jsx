import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

const sections = [
    ['Information we collect', 'When you create an account, edit your profile, enter an event or contact us, we collect the information you provide. This may include your name, email address, phone number, nationality, region, club, player category, playing preferences, biography, profile photos and identity information needed for player registration. We also keep event entries, rankings, results, licence information, payment references and support messages. We receive basic device, app version, usage and diagnostic information to operate and improve our services.'],
    ['How we use information', 'We use information to manage accounts and player profiles, organise tournaments, process entries and licences, display rankings and results, communicate service updates, provide support, prevent misuse and improve reliability. Notification preferences can be managed in the app. Optional information is used for the feature you choose to use.'],
    ['Public player and event information', 'Player names, profile photos, player biographies, club information, rankings, results and event participation may be visible to other people through public profiles and event pages. Information you publish may be viewed or copied by others. Account credentials, identity numbers and private contact information are not intended for public display.'],
    ['Payments and service providers', 'Payments are processed by payment providers such as Paystack. We receive payment status and transaction references; payment card details are handled by the payment provider. We use providers including Supabase, Expo, Vercel and authentication providers to operate the website and apps. Organisers, clubs and federations may receive information needed to manage your participation. These providers and organisations process information under their own applicable policies and arrangements.'],
    ['Photos, maps, calendar and Apple Watch', 'Photos you choose to upload are stored for your profile or gallery. Selecting a photo does not upload your entire photo library. Google Maps provides Android venue previews and directions. The Maps SDK receives device and request metadata, an IP address, a pseudonymous identifier and diagnostic information, and may collect map interactions to operate and improve Google services. Our venue preview looks up the venue address; it does not track your location in the background. Calendar features let you choose whether to add an event to your calendar. The Apple Watch companion receives a limited schedule from your paired iPhone, including event details and entry status; it does not receive your login credentials or payment references.'],
    ['Cookies, analytics and diagnostics', 'The website uses browser storage and cookies for features such as sign-in, preferences and analytics. Website analytics and performance tools may collect usage, browser and device information. Apps also use local storage for preferences and saved state, and diagnostics to identify failures. You can manage browser cookies and system permissions through your browser or device settings; disabling them may affect some features.'],
    ['Storage, security and retention', 'Information may be processed in South Africa and in countries where our providers operate. We use technical and organisational safeguards intended to protect information, but no system is completely secure. We keep information for as long as reasonably needed to provide the service, resolve disputes and meet applicable recordkeeping obligations. Account deletion may require retaining limited transaction or event records where applicable obligations require it.'],
    ['Your choices and requests', 'You can update your profile and notification preferences in Account & settings. To ask about access, correction, deletion or the use of your personal information, contact info@4mpadel.co.za. We may verify your identity before responding to protect your account. This policy does not limit rights you have under applicable privacy law.'],
    ['Young players', 'Junior participation should be arranged with the involvement of a parent or guardian where required. A parent or guardian can contact us about a young player’s personal information or request its correction or deletion.'],
    ['Changes to this policy', 'We may update this policy as our services change. The date below identifies the current version. We will communicate material changes where appropriate.'],
];

export default function PrivacyPolicy() {
    return (
        <main className="bg-[#F5F6F3] px-6 py-12 text-[#17251E] md:py-20">
            <Helmet>
                <title>Privacy Policy | 4M Padel</title>
                <meta name="description" content="How 4M Padel handles information across its website, mobile apps and Apple Watch companion." />
                <link rel="canonical" href="https://4mpadel.co.za/privacy-policy" />
            </Helmet>
            <article className="mx-auto max-w-3xl">
                <Link to="/" className="text-sm underline underline-offset-4">Back to 4M Padel</Link>
                <h1 className="mt-8 text-3xl font-semibold tracking-tight md:text-5xl">Privacy Policy</h1>
                <p className="mt-4 text-sm text-[#59655E]">Last updated: 12 October 2026</p>
                <p className="mt-8 text-base leading-7">This policy explains how 4M Padel handles personal information when you use 4mpadel.co.za, our mobile apps and our Apple Watch companion.</p>
                {sections.map(([title, copy]) => (
                    <section key={title} className="mt-10">
                        <h2 className="text-xl font-semibold">{title}</h2>
                        <p className="mt-3 text-base leading-7 text-[#39483F]">{copy}</p>
                    </section>
                ))}
                <section id="account-deletion" className="mt-10 scroll-mt-8 rounded-2xl border border-[#D8DDD7] bg-white p-6">
                    <h2 className="text-xl font-semibold">Delete your 4M Padel account</h2>
                    <p className="mt-3 leading-7">In the app, open Account &amp; settings, choose Delete account and follow the confirmation steps.</p>
                    <p className="mt-3 leading-7">You can also request deletion without installing the app. Email info@4mpadel.co.za from the email address linked to your 4M Padel account, with the subject “Delete my 4M Padel account”. If you cannot access that email address, contact us so we can verify your identity. Never send your password.</p>
                    <a className="mt-4 inline-flex rounded-full bg-[#365C24] px-5 py-3 font-semibold text-white" href="mailto:info@4mpadel.co.za?subject=Delete%20my%204M%20Padel%20account">Request account deletion by email</a>
                    <p className="mt-4 leading-7">Deletion removes your login account, personal player profile, profile and gallery photos, saved schedule, follows and notification/device records. Limited transaction and event records may be retained or anonymised for recordkeeping, dispute resolution and event results, as described above. We may verify your identity before completing an emailed request.</p>
                </section>
                <section className="mt-10 border-t border-[#D8DDD7] pt-8">
                    <h2 className="text-xl font-semibold">Contact</h2>
                    <p className="mt-3 leading-7">For privacy questions, email <a className="underline underline-offset-4" href="mailto:info@4mpadel.co.za">info@4mpadel.co.za</a> or visit our <Link className="underline underline-offset-4" to="/contact">contact page</Link>.</p>
                </section>
            </article>
        </main>
    );
}
