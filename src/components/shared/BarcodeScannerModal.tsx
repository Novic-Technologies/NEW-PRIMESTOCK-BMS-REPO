import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Keyboard } from 'lucide-react';
import { CameraViewfinderSkeleton } from './Skeletons';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onDetected,
  title = 'Scan Product Barcode',
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = useRef(`barcode-reader-${crypto.randomUUID().slice(0, 8)}`);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setCameraError(null);
    setIsStarting(true);

    const startCamera = async () => {
      try {
        const scanner = new Html5Qrcode(regionId.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 240, height: 140 },
          },
          (decodedText) => {
            if (cancelled) return;
            const clean = decodedText.trim();
            if (clean) {
              scanner
                .stop()
                .catch(() => {})
                .finally(() => {
                  onDetected(clean);
                  onClose();
                });
            }
          },
          () => {
            // ignore frame decode misses
          }
        );
        if (!cancelled) setIsStarting(false);
      } catch (err: any) {
        if (!cancelled) {
          setIsStarting(false);
          setCameraError(
            err?.message ||
              'Camera access is unavailable. You can enter or paste the barcode below.'
          );
        }
      }
    };

    const timer = setTimeout(startCamera, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const current = scannerRef.current;
      scannerRef.current = null;
      if (current) {
        try {
          if (current.isScanning) {
            current.stop().catch(() => {});
          }
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [isOpen, onClose, onDetected]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;
    onDetected(clean);
    setManualCode('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-primary/60 backdrop-blur-sm z-[70] flex items-center justify-center p-3 sm:p-4 no-print">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="p-5 border-b border-border flex items-center justify-between bg-primary text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Camera size={20} />
            <h3 className="text-lg font-bold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="hover:bg-white/10 p-1.5 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="relative rounded-xl overflow-hidden bg-surface-alt border border-border min-h-[220px] flex items-center justify-center">
            <div id={regionId.current} className="w-full" />
            {isStarting && !cameraError && <CameraViewfinderSkeleton />}
            {cameraError && (
              <div className="p-5 text-center space-y-1">
                <Camera size={28} className="mx-auto text-text-muted opacity-50" />
                <p className="text-xs font-semibold text-primary">Camera unavailable</p>
                <p className="text-xs text-text-muted">{cameraError}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="block text-xs font-bold text-primary uppercase tracking-wider">
              <Keyboard size={13} className="inline mr-1.5 text-text-muted" />
              USB Scanner / Manual Barcode Entry
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 font-mono"
                placeholder="Type or scan barcode..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary whitespace-nowrap px-4">
                Apply
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
