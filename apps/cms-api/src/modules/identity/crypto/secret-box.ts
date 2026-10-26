import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { type IAppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.constants';
import { SECRET_BOX } from '../domain/Identity.constants';

/** An encrypted secret and the id of the key that encrypted it. */
export interface SealedSecret {
  readonly ciphertext: string;
  readonly kid: string;
}

/** Thrown when a secret can't be opened. Never carries key or plaintext. */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

const EMPTY_SALT = Buffer.alloc(0);

/** HKDF-SHA256 of the env secret: a uniform 32-byte AES key whatever its form. */
export function deriveSecretBoxKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      SECRET_BOX.HKDF_DIGEST,
      Buffer.from(secret, 'utf8'),
      EMPTY_SALT,
      SECRET_BOX.HKDF_INFO,
      SECRET_BOX.KEY_BYTES,
    ),
  );
}

/** AAD: a ciphertext opens only for the account and kid it was sealed for. */
function aadOf(context: string, kid: string): Buffer {
  return Buffer.from(`${context}:${kid}`, 'utf8');
}

/**
 * D8: AES-256-GCM with the current TOTP_ENC_KEY (`seal`) and the
 * current or previous key (`open`), picked by the stored kid. An unknown kid
 * or a tampered ciphertext throws (fail closed).
 */
@Injectable()
export class SecretBox {
  private readonly currentKid: string;
  /** kid -> derived AES key. Current key plus the optional previous one. */
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    const { encKid, previousEncKid } = config.auth.totp;
    const { totpEncKey, totpEncPreviousKey } = config.secrets;
    this.currentKid = encKid;
    const keys = new Map<string, Buffer>();
    if (totpEncKey !== undefined) {
      keys.set(encKid, deriveSecretBoxKey(totpEncKey));
    }
    if (previousEncKid !== undefined && totpEncPreviousKey !== undefined) {
      keys.set(previousEncKid, deriveSecretBoxKey(totpEncPreviousKey));
    }
    this.keys = keys;
  }

  /** True when `kid` is the current key (no re-encryption needed). */
  isCurrent(kid: string): boolean {
    return kid === this.currentKid;
  }

  /** Encrypts with the current key. `context` is bound in as AAD. */
  seal(plaintext: string, context: string): SealedSecret {
    const key = this.keys.get(this.currentKid);
    if (key === undefined) {
      throw new SecretBoxError('TOTP_ENC_KEY is not configured');
    }
    const iv = randomBytes(SECRET_BOX.IV_BYTES);
    const cipher = createCipheriv(SECRET_BOX.CIPHER, key, iv, {
      authTagLength: SECRET_BOX.TAG_BYTES,
    });
    cipher.setAAD(aadOf(context, this.currentKid));
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const ciphertext = [
      SECRET_BOX.VERSION,
      iv.toString('base64url'),
      body.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join(SECRET_BOX.SEPARATOR);
    return { ciphertext, kid: this.currentKid };
  }

  /** Decrypts a sealed secret; throws SecretBoxError on any mismatch. */
  open(sealed: SealedSecret, context: string): string {
    const key = this.keys.get(sealed.kid);
    if (key === undefined) {
      throw new SecretBoxError(`No TOTP encryption key for kid ${sealed.kid}`);
    }
    const parts = sealed.ciphertext.split(SECRET_BOX.SEPARATOR);
    const [version, ivPart, bodyPart, tagPart] = parts;
    if (
      parts.length !== 4 ||
      version !== SECRET_BOX.VERSION ||
      ivPart === undefined ||
      bodyPart === undefined ||
      tagPart === undefined
    ) {
      throw new SecretBoxError('Unknown TOTP secret format');
    }
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (
      iv.length !== SECRET_BOX.IV_BYTES ||
      tag.length !== SECRET_BOX.TAG_BYTES
    ) {
      throw new SecretBoxError('Unknown TOTP secret format');
    }
    try {
      const decipher = createDecipheriv(SECRET_BOX.CIPHER, key, iv, {
        authTagLength: SECRET_BOX.TAG_BYTES,
      });
      decipher.setAAD(aadOf(context, sealed.kid));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(bodyPart, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretBoxError('TOTP secret failed authentication');
    }
  }
}
