import { ConfigService } from '@nestjs/config';
import { TokenVaultService } from './token-vault.service';

describe('TokenVaultService', () => {
  it('encrypts credentials with authenticated encryption', () => {
    const config = new ConfigService({
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    });
    const vault = new TokenVaultService(config);

    const encrypted = vault.encrypt('provider-secret');

    expect(encrypted).not.toContain('provider-secret');
    expect(vault.decrypt(encrypted)).toBe('provider-secret');
  });

  it('rejects ciphertext that has been modified', () => {
    const config = new ConfigService({
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    });
    const vault = new TokenVaultService(config);
    const encrypted = vault.encrypt('provider-secret');
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;

    expect(() => vault.decrypt(tampered)).toThrow(
      'Stored provider credential could not be decrypted.',
    );
  });
});
