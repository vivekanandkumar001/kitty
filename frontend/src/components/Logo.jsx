import React from 'react';

/**
 * Kitty brand mark — geometric cat, faith-green gradient, gold split nose.
 * Works at any size (favicon → navbar → hero).
 */
export default function Logo({ size = 36, className = '', style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Kitty"
      className={className}
      style={{ display: 'block', ...style }}
    >
      <defs>
        <linearGradient id="kitty-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12B76A" />
          <stop offset="0.55" stopColor="#079455" />
          <stop offset="1" stopColor="#064E3B" />
        </linearGradient>
        <linearGradient id="kitty-logo-cat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2FEF6" />
          <stop offset="1" stopColor="#C9EFD8" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="15" fill="url(#kitty-logo-bg)" />
      <rect x="1.2" y="1.2" width="61.6" height="61.6" rx="13.8" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="2" />

      <g fill="url(#kitty-logo-cat)">
        <path d="M18 27.5 13.5 9.8c4.9 1.3 9.4 4.9 12.9 10.4L18 27.5Z" />
        <path d="M46 27.5 50.5 9.8c-4.9 1.3-9.4 4.9-12.9 10.4L46 27.5Z" />
        <ellipse cx="32" cy="39" rx="17.5" ry="14.5" />
      </g>

      <circle cx="24" cy="37.5" r="2.2" fill="#064E3B" />
      <circle cx="40" cy="37.5" r="2.2" fill="#064E3B" />
      <path d="M32 43.8l2.7 2.5-2.7 2.5-2.7-2.5L32 43.8Z" fill="#E3B959" />
    </svg>
  );
}
