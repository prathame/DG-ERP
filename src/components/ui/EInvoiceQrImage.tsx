import { useEffect, useState } from 'react';
import { generateQrDataUrl } from '../../lib/upiQr';
import { resolveIrnQrPayload } from '../../lib/utils';

type Props = {
  qrCode: string;
  size?: number;
  className?: string;
  alt?: string;
};

/** E-Invoice IRN QR rendered from local qrcode (no external API). */
export function EInvoiceQrImage({ qrCode, size = 240, className, alt = 'E-Invoice QR code' }: Props) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    const payload = resolveIrnQrPayload({ qrCode });
    if (!payload) {
      setSrc('');
      return;
    }
    generateQrDataUrl(payload, size).then(url => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qrCode, size]);

  if (!src) {
    return <div className={className} style={{ width: size, height: size }} aria-hidden />;
  }

  return <img src={src} alt={alt} width={size} height={size} className={className} />;
}
