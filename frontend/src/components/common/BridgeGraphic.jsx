import React from 'react';

export default function BridgeGraphic({ variant = 'business' }) {
  const accentColor = variant === 'business' ? '#06b6d4' : '#38bdf8';
  const nodeGlow = variant === 'business' ? '#22d3ee' : '#60a5fa';

  return (
    <div
      className="bridge-graphic-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '240px',
        overflow: 'hidden',
        borderRadius: '16px',
        marginTop: 'auto',
        marginBottom: '28px',
        background: 'linear-gradient(180deg, #07172c 0%, #0a223f 50%, #061325 100%)',
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5), 0 8px 30px rgba(0,0,0,0.3)',
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 600 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#040e1b" />
            <stop offset="60%" stopColor="#0a2544" />
            <stop offset="100%" stopColor="#06182e" />
          </linearGradient>
          <linearGradient id="waterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06182e" />
            <stop offset="100%" stopColor="#020913" />
          </linearGradient>
          <linearGradient id="towerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0f2b4c" />
          </linearGradient>
          <linearGradient id="beamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.1" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Night Sky */}
        <rect width="600" height="240" fill="url(#skyGrad)" />

        {/* Distant stars */}
        <circle cx="45" cy="25" r="1" fill="#ffffff" opacity="0.4" />
        <circle cx="120" cy="40" r="1.2" fill="#ffffff" opacity="0.6" />
        <circle cx="210" cy="18" r="0.8" fill="#ffffff" opacity="0.3" />
        <circle cx="280" cy="35" r="1.5" fill="#38bdf8" opacity="0.7" />
        <circle cx="430" cy="22" r="1" fill="#ffffff" opacity="0.5" />
        <circle cx="510" cy="45" r="1.2" fill="#ffffff" opacity="0.6" />
        <circle cx="570" cy="15" r="0.8" fill="#ffffff" opacity="0.4" />

        {/* City Skyline Silhouette */}
        <path
          d="M0 160 L15 160 L15 145 L30 145 L30 160 L50 160 L50 138 L65 138 L65 160 L90 160 L90 125 L105 125 L105 160 L140 160 L140 135 L155 135 L155 160 L190 160 L190 142 L205 142 L205 160 L380 160 L380 140 L400 140 L400 160 L440 160 L440 130 L455 130 L455 160 L480 160 L480 145 L500 145 L500 160 L540 160 L540 132 L560 132 L560 160 L600 160 L600 240 L0 240 Z"
          fill="#061220"
          opacity="0.85"
        />

        {/* City Windows (warm & cyan lights) */}
        <rect x="94" y="132" width="2" height="3" fill="#fde047" opacity="0.7" />
        <rect x="98" y="138" width="2" height="3" fill="#38bdf8" opacity="0.7" />
        <rect x="94" y="145" width="2" height="3" fill="#fde047" opacity="0.6" />
        <rect x="145" y="142" width="2" height="3" fill="#fde047" opacity="0.8" />
        <rect x="150" y="148" width="2" height="3" fill="#38bdf8" opacity="0.6" />
        <rect x="445" y="136" width="2" height="3" fill="#38bdf8" opacity="0.7" />
        <rect x="450" y="142" width="2" height="2" fill="#fde047" opacity="0.8" />
        <rect x="545" y="138" width="2" height="3" fill="#fde047" opacity="0.7" />

        {/* Water Surface */}
        <rect x="0" y="160" width="600" height="80" fill="url(#waterGrad)" />

        {/* Ambient bridge glow on water */}
        <ellipse cx="320" cy="185" rx="140" ry="20" fill="#0284c7" opacity="0.25" filter="url(#glow)" />
        <ellipse cx="160" cy="180" rx="80" ry="12" fill={accentColor} opacity="0.2" filter="url(#glow)" />

        {/* Water reflection ripples */}
        <line x1="260" y1="175" x2="380" y2="175" stroke="#38bdf8" strokeWidth="1" opacity="0.4" />
        <line x1="280" y1="182" x2="360" y2="182" stroke={accentColor} strokeWidth="1.2" opacity="0.5" />
        <line x1="300" y1="190" x2="340" y2="190" stroke="#60a5fa" strokeWidth="0.9" opacity="0.3" />
        <line x1="120" y1="172" x2="190" y2="172" stroke="#38bdf8" strokeWidth="0.8" opacity="0.3" />
        <line x1="430" y1="174" x2="490" y2="174" stroke="#38bdf8" strokeWidth="0.8" opacity="0.3" />

        {/* Suspension Tower 1 (Main Pylon) */}
        <g opacity="0.95">
          {/* Main Tower Legs */}
          <polygon points="310,40 316,40 324,162 316,162" fill="url(#towerGrad)" />
          <polygon points="334,40 340,40 348,162 340,162" fill="url(#towerGrad)" />
          {/* Tower cross struts */}
          <rect x="313" y="70" width="24" height="4" fill="#38bdf8" opacity="0.8" />
          <rect x="316" y="110" width="25" height="5" fill="#38bdf8" opacity="0.8" />
          {/* Tower spire beacon */}
          <line x1="325" y1="20" x2="325" y2="40" stroke="#60a5fa" strokeWidth="2.5" />
          <circle cx="325" cy="20" r="3" fill="#ffffff" filter="url(#glow)" />
          <circle cx="325" cy="20" r="1.5" fill="#00ffff" />
        </g>

        {/* Suspension Tower 2 (Secondary Left Pylon) */}
        <g opacity="0.85">
          <polygon points="152,70 156,70 162,162 157,162" fill="url(#towerGrad)" />
          <polygon points="168,70 172,70 178,162 173,162" fill="url(#towerGrad)" />
          <rect x="154" y="95" width="16" height="3" fill="#38bdf8" opacity="0.7" />
          <line x1="162" y1="55" x2="162" y2="70" stroke="#60a5fa" strokeWidth="2" />
          <circle cx="162" cy="55" r="2.5" fill="#ffffff" filter="url(#glow)" />
        </g>

        {/* Main Suspension Cables */}
        <path
          d="M0 135 Q 162 60 325 38"
          stroke="#38bdf8"
          strokeWidth="2.4"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M325 38 Q 460 100 600 150"
          stroke="#38bdf8"
          strokeWidth="2.4"
          fill="none"
          opacity="0.9"
        />

        {/* Secondary Cable Arcs */}
        <path
          d="M60 158 Q 162 80 240 158"
          stroke="#06b6d4"
          strokeWidth="1.6"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M240 158 Q 325 50 440 158"
          stroke="#06b6d4"
          strokeWidth="1.8"
          fill="none"
          opacity="0.75"
        />

        {/* Vertical Cable Stays (Illuminated) */}
        <line x1="190" y1="105" x2="190" y2="158" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
        <line x1="220" y1="120" x2="220" y2="158" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
        <line x1="250" y1="95" x2="250" y2="158" stroke="#38bdf8" strokeWidth="1.2" opacity="0.7" />
        <line x1="280" y1="70" x2="280" y2="158" stroke="#38bdf8" strokeWidth="1.4" opacity="0.75" />
        <line x1="305" y1="50" x2="305" y2="158" stroke="#38bdf8" strokeWidth="1.5" opacity="0.8" />
        <line x1="350" y1="52" x2="350" y2="158" stroke="#38bdf8" strokeWidth="1.5" opacity="0.8" />
        <line x1="380" y1="75" x2="380" y2="158" stroke="#38bdf8" strokeWidth="1.4" opacity="0.75" />
        <line x1="410" y1="102" x2="410" y2="158" stroke="#38bdf8" strokeWidth="1.2" opacity="0.7" />
        <line x1="440" y1="122" x2="440" y2="158" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
        <line x1="480" y1="135" x2="480" y2="158" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5" />

        {/* Bridge Roadway Deck */}
        <polygon points="0,158 600,158 600,165 0,165" fill="#0f2847" />
        <line x1="0" y1="158" x2="600" y2="158" stroke="#60a5fa" strokeWidth="2.5" />
        <line x1="0" y1="160" x2="600" y2="160" stroke="#00ffff" strokeWidth="1" opacity="0.8" />

        {/* Traffic Light Trails (white & cyan) */}
        <line x1="120" y1="161" x2="280" y2="161" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="12 8" opacity="0.9" />
        <line x1="330" y1="161" x2="520" y2="161" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="18 10" opacity="0.8" />
        <line x1="20" y1="162" x2="100" y2="162" stroke="#f87171" strokeWidth="1.2" strokeDasharray="14 6" opacity="0.7" />

        {/* Cyber Network Nodes & Interconnecting Data Beams */}
        {/* Node 1 */}
        <circle cx="162" cy="55" r="4" fill={nodeGlow} filter="url(#glow)" />
        <circle cx="162" cy="55" r="2" fill="#ffffff" />
        {/* Node 2 */}
        <circle cx="250" cy="95" r="4" fill={nodeGlow} filter="url(#glow)" />
        <circle cx="250" cy="95" r="2" fill="#ffffff" />
        {/* Node 3 */}
        <circle cx="325" cy="20" r="5" fill="#38bdf8" filter="url(#glow)" />
        <circle cx="325" cy="20" r="2.5" fill="#ffffff" />
        {/* Node 4 */}
        <circle cx="380" cy="75" r="4" fill={nodeGlow} filter="url(#glow)" />
        <circle cx="380" cy="75" r="2" fill="#ffffff" />
        {/* Node 5 */}
        <circle cx="440" cy="122" r="3.5" fill={nodeGlow} filter="url(#glow)" />
        <circle cx="440" cy="122" r="1.8" fill="#ffffff" />

        {/* Connecting Data Rays between Nodes */}
        <line x1="162" y1="55" x2="250" y2="95" stroke={accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
        <line x1="250" y1="95" x2="325" y2="20" stroke={accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
        <line x1="325" y1="20" x2="380" y2="75" stroke={accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
        <line x1="380" y1="75" x2="440" y2="122" stroke={accentColor} strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
      </svg>
    </div>
  );
}
