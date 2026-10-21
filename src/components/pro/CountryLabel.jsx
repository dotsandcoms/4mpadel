import React, { useState } from 'react';
import { countryName } from '../../utils/proPadelView';

export default function CountryLabel({ code, label, flagOnly = false }) {
  const countryCode = typeof code === 'string' ? code.toLowerCase() : '';
  const [failedCode, setFailedCode] = useState(null);
  const showFlag = /^[a-z]{2}$/.test(countryCode) && failedCode !== countryCode;

  return <span className="pro-country-label" title={flagOnly ? label || countryName(code) : undefined}>
    {showFlag && <img
      className="pro-country-flag"
      src={`https://flagcdn.com/w20/${countryCode}.png`}
      alt=""
      width="20"
      height="14"
      loading="lazy"
      onError={() => setFailedCode(countryCode)}
    />}
    <span className={flagOnly ? 'sr-only' : undefined}>{label || countryName(code)}</span>
  </span>;
}
