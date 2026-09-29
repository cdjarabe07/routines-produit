import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { createLogger } from '@/services/logger';

const log = createLogger('qr');

/** QR code généré localement (aucun service externe), rendu en SVG. */
export function QrCode({ value, label, size = 148 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (!cancelled) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch((error: unknown) => {
        log.error('Génération du QR code impossible', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (failed) return <p role="alert">QR code indisponible</p>;
  if (!src) return <div style={{ width: size, height: size }} aria-busy="true" />;
  return <img src={src} width={size} height={size} alt={`QR code : ${label}`} />;
}
