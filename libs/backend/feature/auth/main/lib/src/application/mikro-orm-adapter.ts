import type { BetterAuthOptions } from "better-auth";
import type { DBAdapter, Where } from "better-auth";
import type { EntityManager, Connection } from "@mikro-orm/core";

const MODEL_TABLE: Record<string, string> = {
  user: "better_auth_users",
  session: "better_auth_sessions",
  account: "better_auth_accounts",
  verification: "better_auth_verification",
};

function getTableName(model: string): string {
  return MODEL_TABLE[model] ?? model;
}

function whereClause(where: Where[] | undefined): { clause: string; values: any[] } {
  if (!where || where.length === 0) {return { clause: "", values: [] };}
  const conditions: string[] = [];
  const values: any[] = [];
  for (const w of where) {
    const idx = values.length;
    values.push(w.value);
    conditions.push(`"${w.field}" = $${idx + 1}`);
  }
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

export function createMikroOrmAdapter(
  entityManager: EntityManager,
): DBAdapter<BetterAuthOptions> {
  const conn = entityManager.getConnection();

  function buildAdapter(conn: Connection): Omit<DBAdapter<BetterAuthOptions>, "transaction"> {
    return {
      id: "mikro-orm",

      async create({ model, data }) {
        const table = getTableName(model);
        const columns = Object.keys(data).filter((k) => data[k] !== undefined);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const values = columns.map((k) => data[k]);
        const colList = columns.map((c) => `"${c}"`).join(", ");
        await conn.execute(
          `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
          values,
        );
        if (!data.id) {
          const lastRow = await conn.execute(
            `SELECT * FROM ${table} ORDER BY "id" DESC LIMIT 1`,
          );
          return lastRow[0] as any;
        }
        return { ...(data as any) };
      },

      async findOne({ model, where }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const rows = await conn.execute(
          `SELECT * FROM ${table} ${clause} LIMIT 1`,
          values,
        );
        return (rows[0] as any) ?? null;
      },

      async findMany({ model, where, limit, offset, sortBy }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        let orderClause = "";
        if (sortBy) {
          orderClause = ` ORDER BY "${sortBy.field}" ${(sortBy.direction ?? "asc").toUpperCase()}`;
        }
        let limitClause = "";
        if (limit !== undefined) {limitClause = ` LIMIT ${limit}`;}
        if (offset !== undefined) {limitClause += ` OFFSET ${offset}`;}
        return (await conn.execute(
          `SELECT * FROM ${table} ${clause}${orderClause}${limitClause}`,
          values,
        )) as any[];
      },

      async count({ model, where }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const res = await conn.execute(
          `SELECT COUNT(*) AS cnt FROM ${table} ${clause}`,
          values,
        );
        return Number((res[0] as any).cnt ?? 0);
      },

      async update({ model, where, update: data }) {
        const table = getTableName(model);
        const { clause: whereStr, values: whereVals } = whereClause(where);
        const cols = Object.keys(data);
        const setParts = cols.map((c, i) => `"${c}" = $${i + whereVals.length + 1}`).join(", ");
        const allValues = [...whereVals, ...cols.map((c) => data[c])];
        await conn.execute(
          `UPDATE ${table} SET ${setParts} ${whereStr}`,
          allValues,
        );
        // Return the updated row
        const { clause: rc, values: rv } = whereClause(where);
        const updated = await conn.execute(
          `SELECT * FROM ${table} ${rc} LIMIT 1`,
          rv,
        );
        return updated[0] as any;
      },

      async updateMany({ model, where, update: data }) {
        const table = getTableName(model);
        const { clause: whereStr, values: whereVals } = whereClause(where);
        const cols = Object.keys(data);
        const setParts = cols.map((c, i) => `"${c}" = $${i + whereVals.length + 1}`).join(", ");
        const allValues = [...whereVals, ...cols.map((c) => data[c])];
        const res = await conn.execute(
          `UPDATE ${table} SET ${setParts} ${whereStr}`,
          allValues,
        );
        return (res as any).length ?? 0;
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
        return (res as any).length ?? 0;
      },

      async consumeOne({ model, where }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const rows = await conn.execute(
          `SELECT * FROM ${table} ${clause} LIMIT 1 FOR UPDATE`,
          values,
        );
        if (rows.length === 0) {return null;}
        const row = rows[0] as any;
        await conn.execute(`DELETE FROM ${table} WHERE "id" = $1`, [row.id]);
        return row;
      },

      async incrementOne({ model, where, increment, set }) {
        const table = getTableName(model);
        const { clause, values } = whereClause(where);
        const rows = await conn.execute(
          `SELECT * FROM ${table} ${clause} LIMIT 1 FOR UPDATE`,
          values,
        );
        if (rows.length === 0) {return null;}
        const row = rows[0] as any;
        const updates: Record<string, any> = {};
        for (const [field, delta] of Object.entries(increment)) {
          const val = typeof row[field] === "number" ? row[field] : 0;
          updates[field] = val + delta;
        }
        if (set) {Object.assign(updates, set);}
        const uCols = Object.keys(updates);
        const setParts = uCols.map((c, i) => `"${c}" = $${i + 2}`).join(", ");
        await conn.execute(
          `UPDATE ${table} SET ${setParts} WHERE "id" = $1`,
          [row.id, ...uCols.map((c) => updates[c])],
        );
        return { ...row, ...updates };
      },
    };
  }

  // Build the default adapter using the main connection
  const adapter = buildAdapter(conn);

  // Full adapter including transaction
  return {
    ...adapter,
    async transaction(fn) {
      return entityManager.transactional((trx) => {
        // Better-Auth expects the callback to receive an adapter instance
        // Build one using the transaction's connection
        const txAdapter = buildAdapter(trx.getConnection());
        return fn({ ...(txAdapter as any), transaction: async (innerFn: any) => innerFn(txAdapter) });
      });
    },
  } as DBAdapter<BetterAuthOptions>;
}
