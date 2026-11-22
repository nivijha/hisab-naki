import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const N = 16384;
const R = 8;
const P = 1;
const PREFIX = 'scrypt';

const MIN_N = 1024;
const MAX_N = 262144;
const MAX_R = 32;
const MAX_P = 16;
const MAX_SALT_LENGTH = 64;
const MAX_MEMORY = 32 * 1024 * 1024;

type ScryptParams = { N: number; r: number; p: number };

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key as Buffer);
      }
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await deriveKey(password, salt, { N, r: R, p: P });
  return [PREFIX, N, R, P, salt.toString('hex'), derived.toString('hex')].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false;
  }

  const parsedN = Number(parts[1]);
  const parsedR = Number(parts[2]);
  const parsedP = Number(parts[3]);
  if (
    !Number.isInteger(parsedN) ||
    parsedN < MIN_N ||
    parsedN > MAX_N ||
    (parsedN & (parsedN - 1)) !== 0 ||
    !Number.isInteger(parsedR) ||
    parsedR < 1 ||
    parsedR > MAX_R ||
    !Number.isInteger(parsedP) ||
    parsedP < 1 ||
    parsedP > MAX_P ||
    128 * parsedN * parsedR > MAX_MEMORY
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'hex');
    expected = Buffer.from(parts[5], 'hex');
  } catch {
    return false;
  }

  if (
    salt.length === 0 ||
    salt.length > MAX_SALT_LENGTH ||
    expected.length !== KEY_LENGTH
  ) {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await deriveKey(password, salt, {
      N: parsedN,
      r: parsedR,
      p: parsedP,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
