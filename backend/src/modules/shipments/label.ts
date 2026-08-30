import { toSVG } from 'bwip-js';

export interface LabelData {
  trackingNumber: string;
  recipientName: string;
  recipientPhone?: string | null;
  destinationLabel?: string | null;
  destinationCountry?: string | null;
  weightKg?: number | null;
  codAmount?: number | null;
  currency?: string | null;
  tenantName?: string | null;
  trackingUrl: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Nested SVGs keep their own viewBox, so we can place a full bwip-js SVG at an
// (x, y, w, h) box and it scales to fit.
function embed(
  svg: string,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const inner = svg.replace(/^<\?xml[^>]*\?>/, '');
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

// Builds a 100mm x 150mm (10:15) courier label as a self-contained SVG string.
export function buildLabelSvg(data: LabelData): string {
  const W = 400;
  const H = 600;

  const barcode = toSVG({
    bcid: 'code128',
    text: data.trackingNumber,
    scale: 3,
    height: 12,
    includetext: false,
  });
  const qr = toSVG({
    bcid: 'qrcode',
    text: data.trackingUrl,
    scale: 4,
  });

  const lines: string[] = [];
  const detail = (label: string, value?: string | null) => {
    if (value) lines.push(`${label}: ${value}`);
  };
  detail('Tel', data.recipientPhone ?? undefined);
  detail('Destino', data.destinationLabel ?? undefined);
  detail('País', data.destinationCountry ?? undefined);
  if (data.weightKg != null) lines.push(`Peso: ${data.weightKg} kg`);
  if (data.codAmount != null && data.codAmount > 0) {
    lines.push(`COD: ${data.codAmount} ${data.currency ?? ''}`.trim());
  }

  const detailText = lines
    .map(
      (line, i) =>
        `<text x="24" y="${300 + i * 26}" font-size="18" fill="#111">${esc(line)}</text>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#fff" stroke="#000" stroke-width="2"/>
  <rect x="1" y="1" width="${W - 2}" height="52" fill="#111"/>
  <text x="24" y="36" font-size="26" fill="#fff" font-weight="bold">${esc(data.tenantName ?? 'RUTEO')}</text>
  <text x="${W - 24}" y="36" font-size="18" fill="#fff" text-anchor="end">GUÍA</text>

  <text x="24" y="96" font-size="14" fill="#555">TRACKING</text>
  <text x="24" y="126" font-size="30" fill="#000" font-weight="bold">${esc(data.trackingNumber)}</text>

  ${embed(barcode, 24, 145, W - 48, 70)}

  <line x1="16" y1="240" x2="${W - 16}" y2="240" stroke="#ccc" stroke-width="1"/>
  <text x="24" y="270" font-size="20" fill="#000" font-weight="bold">${esc(data.recipientName)}</text>
  ${detailText}

  ${embed(qr, W - 168, H - 176, 152, 152)}
  <text x="${W - 92}" y="${H - 12}" font-size="12" fill="#555" text-anchor="middle">Escanea para rastrear</text>
</svg>`;
}
