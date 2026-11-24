import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';
import { cn } from '../../lib/utils';

interface ThemeToggleButtonProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggleButton({ compact = false, className }: ThemeToggleButtonProps) {
  const { preference, resolvedTheme, cyclePreference } = useThemeStore();

  const label =
    preference === 'system'
      ? `Theme: System (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`
      : preference === 'dark'
      ? 'Theme: Dark'
      : 'Theme: Light';

  const shortText =
    preference === 'system' ? 'System' : preference === 'dark' ? 'Dark' : 'Light';

  return (
    <button
      type="button"
      onClick={cyclePreference}
      title={`${label} — click to switch`}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-alt/80 hover:bg-surface-alt text-text-secondary hover:text-text-primary transition-colors',
        compact ? 'p-2' : 'px-2.5 py-1.5 text-xs font-semibold',
        className
      )}
    >
      {preference === 'system' ? (
        <Monitor size={15} className="text-accent shrink-0" />
      ) : resolvedTheme === 'dark' ? (
        <Moon size={15} className="text-accent shrink-0" />
      ) : (
        <Sun size={15} className="text-accent-alt shrink-0" />
      )}
      {!compact && <span className="hidden xl:inline">{shortText}</span>}
    </button>
  );
}
