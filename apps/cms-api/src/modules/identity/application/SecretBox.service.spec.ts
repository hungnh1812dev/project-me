import {
  devEnv,
  TEST_SECRET_32_BYTES,
  TEST_TOTP_ENC_KID,
  TEST_TOTP_ENC_PREVIOUS_KID,
} from '../../../../test/fixtures/Env.fixture';
import { loadAppConfig } from '../../../config/AppConfig.setup';
import { SECRET_BOX } from '../domain/Identity.constants';
import {
  deriveSecretBoxKey,
  SecretBox,
  SecretBoxError,
} from './SecretBox.service';

const PLAINTEXT = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const ACCOUNT = '0190f1d2-7c3a-7b4e-8a5f-1234567890ab';
const OTHER_ACCOUNT = '0190f1d2-7c3a-7b4e-8a5f-ba0987654321';
const PREVIOUS_SECRET = 'previous-test-secret-0123456789abcdef';

function boxWith(env: Record<string, string | undefined> = {}): SecretBox {
  return new SecretBox(
    loadAppConfig(
      devEnv({
        TOTP_ENC_KEY: TEST_SECRET_32_BYTES,
        TOTP_ENC_KID: TEST_TOTP_ENC_KID,
        ...env,
      }),
    ),
  );
}

describe('deriveSecretBoxKey (HKDF-SHA256)', () => {
  it('derives a stable 32-byte key per secret', () => {
    const key = deriveSecretBoxKey(TEST_SECRET_32_BYTES);
    expect(key).toHaveLength(SECRET_BOX.KEY_BYTES);
    expect(deriveSecretBoxKey(TEST_SECRET_32_BYTES).equals(key)).toBe(true);
    expect(deriveSecretBoxKey(PREVIOUS_SECRET).equals(key)).toBe(false);
  });
});

describe('SecretBox (AES-256-GCM, D8)', () => {
  it('round-trips with the current kid and a v1 ciphertext', () => {
    const box = boxWith();
    const sealed = box.seal(PLAINTEXT, ACCOUNT);
    expect(sealed.kid).toBe(TEST_TOTP_ENC_KID);
    expect(sealed.ciphertext.split(SECRET_BOX.SEPARATOR)).toHaveLength(4);
    expect(sealed.ciphertext.startsWith(`${SECRET_BOX.VERSION}.`)).toBe(true);
    expect(sealed.ciphertext).not.toContain(PLAINTEXT);
    expect(box.open(sealed, ACCOUNT)).toBe(PLAINTEXT);
  });

  it('uses a fresh IV every time', () => {
    const box = boxWith();
    expect(box.seal(PLAINTEXT, ACCOUNT).ciphertext).not.toBe(
      box.seal(PLAINTEXT, ACCOUNT).ciphertext,
    );
  });

  it('binds the ciphertext to the account (AAD)', () => {
    const box = boxWith();
    const sealed = box.seal(PLAINTEXT, ACCOUNT);
    expect(() => box.open(sealed, OTHER_ACCOUNT)).toThrow(SecretBoxError);
  });

  it('binds the ciphertext to the kid (AAD)', () => {
    const previous = {
      TOTP_ENC_PREVIOUS_KEY: TEST_SECRET_32_BYTES,
      TOTP_ENC_PREVIOUS_KID: TEST_TOTP_ENC_PREVIOUS_KID,
    };
    const box = boxWith(previous);
    const sealed = box.seal(PLAINTEXT, ACCOUNT);
    // Same key material under another kid must still fail.
    expect(() =>
      box.open({ ...sealed, kid: TEST_TOTP_ENC_PREVIOUS_KID }, ACCOUNT),
    ).toThrow(SecretBoxError);
  });

  it('rejects a tampered ciphertext', () => {
    const box = boxWith();
    const sealed = box.seal(PLAINTEXT, ACCOUNT);
    const parts = sealed.ciphertext.split(SECRET_BOX.SEPARATOR);
    const body = Buffer.from(parts[2] ?? '', 'base64url');
    body[0] = (body[0] ?? 0) ^ 1;
    parts[2] = body.toString('base64url');
    expect(() =>
      box.open(
        { ...sealed, ciphertext: parts.join(SECRET_BOX.SEPARATOR) },
        ACCOUNT,
      ),
    ).toThrow(SecretBoxError);
  });

  it.each(['', 'v2.a.b.c', 'v1.a.b', 'v1.AAAA.AAAA.AAAA'])(
    'rejects the malformed ciphertext %j',
    (ciphertext) => {
      expect(() =>
        boxWith().open({ ciphertext, kid: TEST_TOTP_ENC_KID }, ACCOUNT),
      ).toThrow(SecretBoxError);
    },
  );

  it('fails closed on an unknown kid', () => {
    const box = boxWith();
    const sealed = box.seal(PLAINTEXT, ACCOUNT);
    expect(() => box.open({ ...sealed, kid: 'retired' }, ACCOUNT)).toThrow(
      SecretBoxError,
    );
  });

  it('opens secrets sealed with the previous key after a rotation', () => {
    const before = boxWith({
      TOTP_ENC_KEY: PREVIOUS_SECRET,
      TOTP_ENC_KID: TEST_TOTP_ENC_PREVIOUS_KID,
    });
    const sealed = before.seal(PLAINTEXT, ACCOUNT);
    const after = boxWith({
      TOTP_ENC_PREVIOUS_KEY: PREVIOUS_SECRET,
      TOTP_ENC_PREVIOUS_KID: TEST_TOTP_ENC_PREVIOUS_KID,
    });
    expect(after.isCurrent(sealed.kid)).toBe(false);
    expect(after.open(sealed, ACCOUNT)).toBe(PLAINTEXT);
    expect(after.seal(PLAINTEXT, ACCOUNT).kid).toBe(TEST_TOTP_ENC_KID);
  });

  it('refuses to seal without TOTP_ENC_KEY', () => {
    expect(() =>
      boxWith({ TOTP_ENC_KEY: undefined }).seal(PLAINTEXT, ACCOUNT),
    ).toThrow(SecretBoxError);
  });
});
