/** A pending cart is saved before the payment popup; the server grants paid status. */
export function legacyEventCheckout({event,profile,email,name,phone,divisions,partners,feeFor,reference,isTest,commerce}) {
    const payer=String(email||'').trim().toLowerCase();
    if (!payer || !reference || !divisions.length) throw new Error('Choose your profile and divisions.');
    const rows=[],covers=[],lineItems=[],fees={}; let amount=0;
    for (const division of [...new Set(divisions)]) {
        const part=partners[division]||{}, partner=part.partnerProfile;
        const fee=Number(feeFor(division));
        if (!Number.isFinite(fee)||fee<0) throw new Error('Entry pricing is unavailable.');
        fees[division]=fee;
        rows.push({event_id:event.id,email:payer,full_name:name,phone,division,registered_by:payer,
            partner_name:partner?.name||part.partnerName||null,partner_email:partner?.email||null,payment_status:'pending',is_test:isTest});
        covers.push({type:'entry',email:payer,division,event_id:event.id});
        lineItems.push({label:`${division} — ${name}`,amount:fee});amount+=fee;
        if (part.payForPartner&&partner?.email) {
            rows.push({event_id:event.id,email:partner.email,full_name:partner.name,division,registered_by:payer,
                partner_name:name,partner_email:payer,payment_status:'pending',is_test:isTest});
            covers.push({type:'entry',email:partner.email,division,event_id:event.id});
            lineItems.push({label:`${division} — ${partner.name}`,amount:fee});amount+=fee;
        }
    }
    amount=Math.round(amount*100)/100;
    return {player_id:profile.id,event_id:event.id,amount,currency:'ZAR',status:'processing',payment_type:'event_entry_fee',
        payment_method:'paystack',reference,is_test:isTest,metadata:{source:'manual_event',email:payer,registrant_email:payer,
            registrant_name:name,event_id:event.id,event_name:event.event_name,registration_rows:rows,covers,line_items:lineItems,
            division_entry_fees:fees,division_names:divisions.join(', '),event_dates:event.event_dates,
            event_venue:[event.venue,event.city].filter(Boolean).join(', '),event_url:`https://4mpadel.co.za/calendar/${event.slug||event.id}`,
            commerce,reference}};
}
