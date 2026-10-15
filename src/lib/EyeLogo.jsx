import React from 'react';

// Small animated eye mark (JARVIS cyan). Blinks every few seconds; iris glows.
export default function EyeLogo({ size = 26, title = "God's Pandora" }) {
  return (
    <svg className="eye-logo" width={size} height={size * 0.62} viewBox="0 0 64 40" role="img" aria-label={title}>
      <defs>
        <radialGradient id="eyeIris" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#7fe9ff" />
          <stop offset="75%" stopColor="#8b6bff" />
          <stop offset="100%" stopColor="#005f80" />
        </radialGradient>
        <clipPath id="eyeLid">
          <path className="eye-lid" d="M2 20 Q32 -6 62 20 Q32 46 2 20 Z" />
        </clipPath>
      </defs>
      <path d="M2 20 Q32 -6 62 20 Q32 46 2 20 Z" fill="rgba(139,107,255,.06)" stroke="#8b6bff" strokeWidth="2.4" strokeLinejoin="round" />
      <g clipPath="url(#eyeLid)">
        <g className="eye-iris">
          <circle cx="32" cy="20" r="11" fill="url(#eyeIris)" />
          <circle cx="32" cy="20" r="4.6" fill="#03121b" />
          <circle cx="28.5" cy="16.5" r="2" fill="#ffffff" opacity=".9" />
        </g>
      </g>
    </svg>
  );
}
