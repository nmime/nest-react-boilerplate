import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import { PaymentsEntity } from '../entities';

export interface PaymentsRepositoryError {
  code: 'repository_error';
}

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  list(): ResultAsync<PaymentsEntity[], PaymentsRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.find(PaymentsEntity, {}, { orderBy: { createdAt: 'DESC' } }),
      () => ({ code: 'repository_error' as const }),
    );
  }

  create(name: string): ResultAsync<PaymentsEntity, PaymentsRepositoryError> {
    return ResultAsync.fromPromise(this.persist(name), () => ({ code: 'repository_error' as const }));
  }

  private async persist(name: string): Promise<PaymentsEntity> {
    const entity = new PaymentsEntity({ name });
    this.entityManager.persist(entity);
    await this.entityManager.flush();
    return entity;
  }
}
