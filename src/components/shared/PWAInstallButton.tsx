import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export function PWAInstallButton({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { canInstall, isIosDevice, isInstalled, installApp } = usePWAInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled) return null;
  if (!canInstall && !isIosDevice) return null;

  return (
    <>
      <button
        type="button"
        title="Install App"
        aria-label="Install App"
        onClick={() => {
          if (canInstall) {
            installApp();
          } else {
            setShowIosGuide(true);
          }
        }}
        className={
          compact
            ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-colors whitespace-nowrap shrink-0'
            : iconOnly
            ? 'flex items-center justify-center lg:px-0 lg:py-2.5 gap-2 px-4 py-2.5 w-full bg-accent/20 text-white hover:bg-accent/30 rounded-lg text-xs font-bold transition-colors whitespace-nowrap'
            : 'flex items-center justify-center gap-2 px-4 py-2.5 w-full bg-accent/20 text-white hover:bg-accent/30 rounded-lg text-xs font-bold transition-colors whitespace-nowrap'
        }
      >
        <Download size={14} className="shrink-0" />
        <span className={iconOnly ? 'lg:hidden' : undefined}>Install App</span>
      </button>

      {showIosGuide && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface text-primary rounded-2xl max-w-sm w-full p-5 shadow-xl border border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base">Install PrimeStock on iOS</h3>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 text-text-muted hover:text-primary"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-text-secondary mb-3">
              Install PrimeStock BMS for offline POS access and fullscreen speed:
            </p>
            <ol className="text-sm text-primary space-y-2 list-decimal list-inside">
              <li>
                Tap the <Share size={14} className="inline mx-1 text-accent" /> <strong>Share</strong>{' '}
                button in Safari.
              </li>
              <li>
                Scroll down and select <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top right corner.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
