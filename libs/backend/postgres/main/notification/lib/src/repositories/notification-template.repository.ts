import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { NotificationTemplateEntity } from '../infrastructure/data-access/entities';

@Injectable()
export class NotificationTemplateRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  async findOneByCode(code: string): Promise<NotificationTemplateEntity | null> {
    return this.entityManager.findOne(NotificationTemplateEntity, { code });
  }
}
