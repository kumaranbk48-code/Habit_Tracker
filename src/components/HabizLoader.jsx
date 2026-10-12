import React from 'react';

/**
 * HabizLoader - Official HabiZ loading screen component
 * Features the isolated neon teal/emerald ribbon 'H' with subtle ambient glow
 */
export default function HabizLoader({ 
  text = 'Loading...', 
  subtext = 'Small habits. Big shifts.', 
  size = 'md', // 'sm' | 'md' | 'lg' | 'fullscreen'
  className = '' 
}) {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    fullscreen: 'w-16 h-16'
  };

  const containerPadding = size === 'fullscreen' 
    ? 'min-h-screen' 
    : size === 'lg' 
    ? 'min-h-[50vh]' 
    : size === 'md' 
    ? 'py-12' 
    : 'py-6';

  return (
    <div className={`flex flex-col items-center justify-center ${containerPadding} select-none ${className}`}>
      <div className="relative flex items-center justify-center">
        {/* Ambient Teal Radial Glow */}
        <div className="absolute -inset-3 rounded-full bg-[#2dd4bf]/20 blur-xl animate-pulse" />
        
        {/* Glowing Logo Icon */}
        <img
          src="/habiz-logo.png"
          alt="HabiZ Loading"
          className={`${iconSizes[size] || iconSizes.md} object-contain relative z-10 transition-transform duration-700 animate-pulse drop-shadow-[0_0_16px_rgba(45,212,191,0.5)]`}
        />
      </div>

      {text && (
        <div className="mt-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2dd4bf] animate-ping" />
          <span className="text-xs font-semibold text-slate-200 tracking-wide">{text}</span>
        </div>
      )}

      {subtext && size !== 'sm' && (
        <span className="mt-1 text-[11px] font-medium text-[#2dd4bf]/70 tracking-wider uppercase">
          {subtext}
        </span>
      )}
    </div>
  );
}
