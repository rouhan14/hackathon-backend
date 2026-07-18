import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProviderName } from '@prisma/client';
import { ProviderAdapter } from './provider-adapter';

export const PROVIDER_ADAPTERS = Symbol('PROVIDER_ADAPTERS');

@Injectable()
export class ProviderRegistry {
  private readonly adapters: Map<ProviderName, ProviderAdapter>;

  constructor(@Inject(PROVIDER_ADAPTERS) adapters: readonly ProviderAdapter[]) {
    this.adapters = new Map(
      adapters.map((adapter) => [adapter.provider, adapter]),
    );
  }

  get(provider: ProviderName): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new NotFoundException(
        `Provider adapter "${provider}" is not registered.`,
      );
    }
    return adapter;
  }

  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }
}
