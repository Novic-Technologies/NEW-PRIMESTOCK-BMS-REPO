import React from 'react';
import { cn } from '../../lib/utils';

interface PrimeStockLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}

export function PrimeStockLogo({
  variant = 'dark',
  size = 'md',
  showTagline = false,
  className,
}: PrimeStockLogoProps) {
  const iconSizes = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-12 h-12',
  };

  const titleSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  const isLightText = variant === 'light';

  return (
    <div className={cn('inline-flex items-center gap-3 select-none', className)}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(iconSizes[size], 'shrink-0 drop-shadow-sm')}
        aria-hidden="true"
      >
        <rect
          width="64"
          height="64"
          rx="16"
          fill={isLightText ? '#103152' : '#0A2540'}
          stroke={isLightText ? '#00C37F' : '#0A2540'}
          strokeOpacity={isLightText ? 0.55 : 0.12}
          strokeWidth="2"
        />
        <path
          d="M32 13L49 22.8V42.2L32 52L15 42.2V22.8L32 13Z"
          fill={isLightText ? '#0A2540' : '#13395E'}
          stroke="#FFFFFF"
          strokeOpacity="0.24"
          strokeWidth="1.5"
        />
        <path d="M32 13L49 22.8L32 32.6L15 22.8L32 13Z" fill="#00C37F" />
        <path d="M20.5 26L32 32.6V46.5L20.5 39.8V26Z" fill="#FFFFFF" />
        <path d="M43.5 26L34.5 31.2V45L43.5 39.8V26Z" fill="#00C37F" fillOpacity="0.85" />
        <path d="M24.5 22.8L32 18.5L39.5 22.8L32 27.1L24.5 22.8Z" fill="#0A2540" fillOpacity="0.28" />
      </svg>

      <div className="min-w-0 leading-none">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-bold tracking-tight whitespace-nowrap',
              titleSizes[size],
              isLightText ? 'text-white' : 'text-primary'
            )}
          >
            PRIMESTOCK
          </span>
          <span
            className={cn(
              'font-extrabold text-[11px] tracking-widest uppercase',
              isLightText ? 'text-accent' : 'text-accent'
            )}
          >
            BMS UG
          </span>
        </div>
        {showTagline && (
          <p
            className={cn(
              'text-[11px] mt-1 tracking-wide font-medium truncate',
              isLightText ? 'text-white/65' : 'text-text-muted'
            )}
          >
            Built &amp; managed by Novic Technologies
          </p>
        )}
      </div>
    </div>
  );
}
