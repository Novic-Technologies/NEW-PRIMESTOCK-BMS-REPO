import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeImageProps {
  value: string;
  size?: number;
  alt?: string;
  className?: string;
}

export function QrCodeImage({
  value,
  size = 96,
  alt = 'URA EFRIS Verification QR Code',
  className = '',
}: QrCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0B1F3A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) return null;

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={alt}
      className={`rounded border border-slate-200 bg-white p-1 ${className}`}
    />
  );
}
