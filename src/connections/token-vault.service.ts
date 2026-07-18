import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_VERSION = 'v1';

@Injectable()
export class TokenVaultService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      KEY_VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(encryptedValue: string): string {
    const [version, ivValue, tagValue, ciphertextValue] =
      encryptedValue.split('.');
    if (version !== KEY_VERSION || !ivValue || !tagValue || !ciphertextValue) {
      throw new InternalServerErrorException(
        'Stored provider credential has an unsupported format.',
      );
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Stored provider credential could not be decrypted.',
      );
    }
  }

  private get key(): Buffer {
    const configured = this.config.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!configured) {
      throw new InternalServerErrorException(
        'TOKEN_ENCRYPTION_KEY must be configured before connecting providers.',
      );
    }

    const key = /^[a-f\d]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
    }
    return key;
  }
}
