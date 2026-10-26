import React from 'react';
import { Link } from 'react-router-dom';

export default function TenderBridgeLogo({
  variant = 'default', // 'default' | 'business' | 'organization'
  theme = 'light',     // 'light' | 'dark'
  to = '/',
  className = '',
  size = 'md',        // 'sm' | 'md' | 'lg'
}) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#ffffff' : '#0e243e';
  const subtitleColor = isDark ? '#6ee7b7' : '#0284c7';

  const iconSizes = {
    sm: { width: 30, height: 22 },
    md: { width: 38, height: 28 },
    lg: { width: 48, height: 35 },
  };

  const textSizes = {
    sm: { title: '16px', sub: '9px' },
    md: { title: '20px', sub: '10px' },
    lg: { title: '24px', sub: '11px' },
  };

  const icon = (
    <svg
      width={iconSizes[size].width}
      height={iconSizes[size].height}
      viewBox="0 0 44 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tbBridgeGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="tbBridgeGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Upper main suspension cable */}
      <path
        d="M2 28 C 12 12, 32 12, 42 28"
        stroke="url(#tbBridgeGrad1)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Lower supporting deck cable */}
      <path
        d="M6 28 C 15 17, 29 17, 38 28"
        stroke="url(#tbBridgeGrad2)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Central stay cables */}
      <line x1="16" y1="20" x2="16" y2="28" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <line x1="22" y1="16" x2="22" y2="28" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
      <line x1="28" y1="20" x2="28" y2="28" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      {/* Roadway base */}
      <line x1="2" y1="28" x2="42" y2="28" stroke={isDark ? '#475569' : '#94a3b8'} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  const content = (
    <div
      className={`tb-logo-wrapper ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        textDecoration: 'none',
      }}
    >
      {icon}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span
          style={{
            color: textColor,
            fontSize: textSizes[size].title,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          TenderBridge
        </span>
        {variant === 'business' && (
          <span
            style={{
              color: subtitleColor,
              fontSize: textSizes[size].sub,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginTop: '2px',
            }}
          >
            Business
          </span>
        )}
        {variant === 'organization' && (
          <span
            style={{
              color: subtitleColor,
              fontSize: textSizes[size].sub,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginTop: '2px',
            }}
          >
            Organizations
          </span>
        )}
      </div>
    </div>
  );

  if (!to) return content;
  return (
    <Link to={to} style={{ textDecoration: 'none', display: 'inline-flex' }} aria-label="TenderBridge home">
      {content}
    </Link>
  );
}
