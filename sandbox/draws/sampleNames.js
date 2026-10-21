// Deterministic fictional identities for the sandbox's original sample entries.
const women = ['Amelia','Zara','Sophie','Mila','Leah','Chloe','Nadia','Isabella','Ella','Aisha','Grace','Hannah','Ruby','Maya','Olivia','Layla'];
const men = ['Adam','Liam','Ethan','Noah','Oliver','Daniel','Joshua','Caleb','Isaac','Nathan','Leo','Samuel','Luke','Ryan','Aaron','Dylan','Connor','Owen','Finn','Jacob','Alex','Benjamin','Theo','Sebastian','Max','Julian','Elias','Henry','Gabriel','Reuben','Toby','Jasper'];
const surnames = ['Bennett','Jacobs','Daniels','Morgan','Parker','Adams','Botha','Williams','Clarke','Naidoo','Lewis','Meyer','Brooks','Patel','Reed','Thomas','Grant','Hendricks','Carter','Peters','Walker','Cooper','Davids','Taylor','Ross','Foster','Baker','Martin','Hill','Evans','Scott','Anderson'];
export function sampleName(group, index, partner = false) {
    const n = index - 1;
    const extra = n>=32 ? ` ${['James','Blake','Jordan','Riley','Quinn','Hayes','Ellis'][Math.floor(n/32)-1]}` : ''; 
    if (group === 1) return `${women[n % women.length]}${extra} ${surnames[n % surnames.length]}`;
    if(group === 3 && partner) return `${women[n % women.length]}${extra} ${surnames[(n+9)%surnames.length]}`;
    const offset = group === 3 ? 16 : 0;
    return `${men[(n + offset + (partner ? 11 : 0)) % men.length]}${extra} ${surnames[(n + offset + (group === 3 ? 5 : 0) + (partner ? 7 : 0)) % surnames.length]}`;
}
function groupFrom(text = '') {
    if (/Ladies Open/.test(text)) return 1;
    if (/Mixed Open|Men(?:s)? (?:Division 2|Div 2)/.test(text)) return 3;
    if (/Men(?:s)? Open/.test(text)) return 2;
    const email = text.match(/(?:sample|partner)-([123])-\d+@example\.test/);
    return email ? Number(email[1]) : null;
}
export function renameSampleData(value, context = null) {
    if (Array.isArray(value)) return value.map(item => renameSampleData(item, context));
    if (value && typeof value === 'object') {
        const hints = [value.full_name, value.player_one_name, value.team_name, value.email, value.snapshot?.email, value.snapshot?.partner_email].filter(Boolean).join(' ');
        const group = groupFrom(hints) || context;
        const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameSampleData(item, group)]));
        const mixedEmail = (value.partner_email || value.snapshot?.partner_email || '').match(/^partner-3-(\d+)@example\.test$/);
        if(mixedEmail){
            const name=sampleName(3,Number(mixedEmail[1]),true);
            if('partner_name' in result)result.partner_name=name;
            if('player_two_name' in result)result.player_two_name=name;
            if(result.team_name && result.player_one_name)result.team_name=`${result.player_one_name} / ${name}`;
        }
        return result;
    }
    if (typeof value !== 'string') return value;
    const group = groupFrom(value) || context;
    return value.replace(/(Ladies Open|Mixed Open|Mens? Open|Mens? Division 2|Mens? Div 2) Player (\d+)/g, (_, label, index) => sampleName(groupFrom(label), Number(index)))
        .replace(/(?:(Ladies Open|Mixed Open|Mens? Open|Mens? Division 2|Mens? Div 2) )?Partner (\d+)/g, (original, label, index) => (groupFrom(label) || group) ? sampleName(groupFrom(label) || group, Number(index), true) : original);
}
