import React from 'react';
import { gatewayComparisonLabel } from './gatewayComparison.js';

export default function GatewayComparisonCell({ link }) {
  const comparison = link?.state === 'matched' ? link.comparison : null;
  const presentation = {
    agree: { tone: 'info', label: 'Records agree' },
    different: { tone: 'warning', label: 'Differences found' },
    incomplete: { tone: 'neutral', label: 'Incomplete comparison' },
  }[comparison?.state] || { tone: 'neutral', label: 'Not compared' };
  return <>
    <span className={`ap-status ap-status--${presentation.tone}`}>{presentation.label}</span>
    <small>{comparison ? gatewayComparisonLabel(comparison) : 'Requires one accessible, exact 4M reference match.'}</small>
  </>;
}
