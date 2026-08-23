import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export interface PaymentsEntityInput {
  name: string;
}

export class PaymentsEntity {
  id: string = randomUUID();
  name!: string;
  createdAt: Date = new Date();

  constructor(input?: PaymentsEntityInput) {
    if (input) {
      this.name = input.name;
    }
  }
}

export const PaymentsEntitySchema = new EntitySchema<PaymentsEntity>({
  class: PaymentsEntity,
  tableName: 'payments',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'varchar', length: 255 },
    createdAt: {
      type: 'timestamptz',
      fieldName: 'created_at',
      onCreate: () => new Date(),
    },
  },
});
