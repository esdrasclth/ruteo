import { randomInt } from 'crypto';

// Unambiguous alphabet (no 0/O/1/I) for human-readable, globally unique codes.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateTrackingNumber(): string {
  let body = '';
  for (let i = 0; i < 10; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `RUT-${body}`;
}
