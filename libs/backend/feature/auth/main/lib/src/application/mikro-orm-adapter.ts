import type { BetterAuthOptions } from 'better-auth';
import type { DBAdapter, DBTransactionAdapter, Where } from 'better-auth';
import type { EntityManager, Connection } from '@mikro-orm/core';

/** Raw database row returned by PostgreSQL — structure depends on queried table. */
type DbRow = Record<string, unknown>;

interface CreateParams<T extends Record<string, unknown>> {
  model: string;
  data: Omit<T, 'id'>;
  select?: string[];
  forceAllowId?: boolean;
}

interface FindOneParams {
  model: string;
  where: Where[];
  select?: string[];
}

interface FindManyParams {
  model: string;
  where?: Where[];
  limit?: number;
  select?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' };
  offset?: number;
}

interface UpdateParams {
  model: string;
  where: Where[];
  update: Record<string, unknown>;
}

interface IncrementOneParams {
  model: string;
  where: Where[];
  increment: Record<string, number>;
  set?: Record<string, unknown>;
}

const MODEL_TABLE: Record<string, string> = {
  user: 'better_auth_users',
  session: 'better_auth_sessions',
  account: 'better_auth_accounts',
  verification: 'better_auth_verification',
};

function getTableName(model: string): string {
  return MODEL_TABLE[model] ?? model;
}

function whereClause(where: Where[] | undefined): { clause: string; values: unknown[] } {
  if (!where || where.length === 0) {
    return { clause: '', values: [] };
  }
  const conditions: string[] = [];
  const values: unknown[] = [];
  for (const w of where) {
    const idx = values.length;
    values.push(w.value);
    conditions.push(`"${w.field}" = $${idx + 1}`);
  }
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

export function createMikroOrmAdapter(entityManager: EntityManager): DBAdapter<BetterAuthOptions> {
  const conn = entityManager.getConnection();

  function buildAdapter(conn: Connection): DBTransactionAdapter<BetterAuthOptions> {
    return {
      id: 'mikro-orm',

      async create<T extends Record<string, unknown>, R = T>({ model, data }: CreateParams<T>): Promise<R> {
        const record = data as Record<string, unknown>;
        const table = getTableName(model);
        const columns = Object.keys(record).filter((key) => record[key] !== undefined);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map((key) => record[key]);
        const colList = columns.map((c) => `"${c}"`).join(', ');
        const rows = await conn.execute(
          `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) RETURNING *`,
          values,
        );
        return rows[0] as R;
      },

      async findOne<T>({ model, where }: FindOneParams): Promise<T | null> {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const rows = await conn.execute(`SELECT * FROM ${table} ${clause} LIMIT 1`, values);
        return rows.length > 0 ? (rows[0] as T) : null;
      },

      async findMany<T>({ model, where, limit, offset, sortBy }: FindManyParams): Promise<T[]> {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        let orderClause = '';
        if (sortBy) {
          orderClause = ` ORDER BY "${sortBy.field}" ${(sortBy.direction ?? 'asc').toUpperCase()}`;
        }
        let limitClause = '';
        if (limit !== undefined) {
          limitClause = ` LIMIT ${limit}`;
        }
        if (offset !== undefined) {
          limitClause += ` OFFSET ${offset}`;
        }
        return (await conn.execute(`SELECT * FROM ${table} ${clause}${orderClause}${limitClause}`, values)) as T[];
      },

      async count({ model, where }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const res = await conn.execute(`SELECT COUNT(*) AS cnt FROM ${table} ${clause}`, values);
        return Number((res[0] as DbRow).cnt ?? 0);
      },

      async update<T>({ model, where, update: data }: UpdateParams): Promise<T | null> {
        const table = getTableName(model);
        const { clause: whereStr, values: whereVals } = whereClause(where);
        const cols = Object.keys(data);
        const setParts = cols.map((c, i) => `"${c}" = $${i + whereVals.length + 1}`).join(', ');
        const allValues = [...whereVals, ...cols.map((c) => data[c])];
        await conn.execute(`UPDATE ${table} SET ${setParts} ${whereStr}`, allValues);
        // Return the updated row
        const { clause: rc, values: rv } = whereClause(where);
        const updated = await conn.execute(`SELECT * FROM ${table} ${rc} LIMIT 1`, rv);
        return updated.length > 0 ? (updated[0] as T) : null;
      },

      async updateMany({ model, where, update: data }) {
        const table = getTableName(model);
        const { clause: whereStr, values: whereVals } = whereClause(where);
        const cols = Object.keys(data);
        const setParts = cols.map((c, i) => `"${c}" = $${i + whereVals.length + 1}`).join(', ');
        const allValues = [...whereVals, ...cols.map((c) => data[c])];
        const res = await conn.execute(`UPDATE ${table} SET ${setParts} ${whereStr}`, allValues);
        return (res as { length?: number }).length ?? 0;
      },

      async delete({ model, where }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        await conn.execute(`DELETE FROM ${table} ${clause}`, values);
      },

      async deleteMany({ model, where }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const res = await conn.execute(`DELETE FROM ${table} ${clause}`, values);
        return (res as { length?: number }).length ?? 0;
      },

      async consumeOne<T>({ model, where }: FindOneParams): Promise<T | null> {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const rows = await conn.execute(`SELECT * FROM ${table} ${clause} LIMIT 1 FOR UPDATE`, values);
        if (rows.length === 0) {
          return null;
        }
        const row = rows[0] as DbRow;
        await conn.execute(`DELETE FROM ${table} WHERE "id" = $1`, [row.id]);
        return row as T;
      },

      async incrementOne<T>({ model, where, increment, set }: IncrementOneParams): Promise<T | null> {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const rows = await conn.execute(`SELECT * FROM ${table} ${clause} LIMIT 1 FOR UPDATE`, values);
        if (rows.length === 0) {
          return null;
        }
        const row = rows[0] as DbRow;
        const updates: Record<string, number> = {};
        for (const [field, delta] of Object.entries(increment)) {
          const val = typeof row[field] === 'number' ? row[field] : 0;
          updates[field] = val + delta;
        }
        if (set) {
          Object.assign(updates, set);
        }
        const uCols = Object.keys(updates);
        const setParts = uCols.map((c, i) => `"${c}" = $${i + 2}`).join(', ');
        await conn.execute(`UPDATE ${table} SET ${setParts} WHERE "id" = $1`, [
          row.id,
          ...uCols.map((c) => updates[c]),
        ]);
        return { ...row, ...updates } as T;
      },
    };
  }

  // Build the default adapter using the main connection
  const adapter = buildAdapter(conn);

  // Full adapter including transaction
  return {
    ...adapter,
    async transaction<R>(fn: (adapter: DBTransactionAdapter<BetterAuthOptions>) => Promise<R>): Promise<R> {
      return entityManager.transactional((trx) => {
        // Better-Auth expects the callback to receive an adapter instance
        // Build one using the transaction's connection
        const txAdapter = buildAdapter(trx.getConnection());
        return fn(txAdapter);
      });
    },
  };
}
