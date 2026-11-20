import React from 'react';
export default function RegistrationLicenseBadge({ license = '' }) {
    return <span className={'tm-status ' + (license.includes('Full') || license.includes('Temporary') ? 'done' : 'warn')}>{license || 'No licence'}</span>;
}
