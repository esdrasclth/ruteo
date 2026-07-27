import { randomInt } from 'crypto';

// Unambiguous alphabet (no 0/O/1/I) for human-readable locker codes.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// Virtual locker code assigned to a customer, e.g. "BOX-7K2P9Q".
export function generateLockerCode(): string {
  let body = '';
  for (let i = 0; i < 6; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `BOX-${body}`;
}
