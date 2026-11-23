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
      <div
        className={cn(
          iconSizes[size],
          'shrink-0 rounded-xl bg-white flex items-center justify-center p-1 overflow-hidden shadow-xs',
          isLightText ? 'ring-1 ring-white/25' : 'border border-border'
        )}
      >
        <img
          src="/assets/aistudio/Minimalist_Navy_Monogram_Emblem_804982e2.png"
          alt="PRIMESTOCK BMS UG logo"
          className="w-full h-full object-contain"
        />
      </div>

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
              isLightText ? 'text-slate-300' : 'text-accent'
            )}
          >
            BMS UG
          </span>
        </div>
        {showTagline && (
          <p
            className={cn(
              'text-[11px] mt-1 tracking-wide font-medium truncate',
              isLightText ? 'text-slate-300/80' : 'text-text-muted'
            )}
          >
            Built &amp; managed by Novic Technologies
          </p>
        )}
      </div>
    </div>
  );
}
