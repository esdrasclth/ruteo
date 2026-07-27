import { randomInt } from 'crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// Human-readable route code, e.g. "RT-8K2P9Q".
export function generateRouteCode(): string {
  let body = '';
  for (let i = 0; i < 6; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `RT-${body}`;
}
