const ticketId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function helpTicketFromSearch(search) {
    const params = new URLSearchParams(search);
    const id = params.get('ticket');
    return params.getAll('ticket').length === 1 && id && ticketId.test(id) ? id : null;
}
