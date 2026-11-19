import { resolveRegistrationLicenseCategory } from './registrationLicense.js';
export function registrationIssues(registration, players, event) {
    const issues=[];
    if(String(registration.payment_status).toLowerCase()!=='paid') issues.push('Entry payment outstanding');
    for(const [name,email] of [[registration.full_name,registration.email],[registration.partner_name,registration.partner_email]]) {
        if(!name && !email)continue;
        const category=resolveRegistrationLicenseCategory(email,event.id,players.get(String(email||'').trim().toLowerCase()));
        if(category==='none')issues.push(`${name||email}: licence not verified`);
    }
    return issues;
}
export function reviewFingerprint(registrations, players, event) {
    return JSON.stringify(registrations.map(r=>[r.id,r.full_name,r.partner_name,r.email,r.partner_email,r.status,r.payment_status,registrationIssues(r,players,event)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
