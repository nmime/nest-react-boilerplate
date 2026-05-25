#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const migrationRoots = ["libs"];
const errors = [];

function listFiles(root) {
  const files = [];

  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);

      if (statSync(path).isDirectory()) {
        visit(path);
      } else {
        files.push(path);
      }
    }
  };

  visit(root);

  return files.sort();
}

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unquote(identifier) {
  return identifier.replace(/^"|"$/g, "");
}

function columnsFromName(name) {
  return name
    .split(",")
    .map((part) =>
      unquote(part.trim())
        .replace(/\W+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("_");
}

function fail(file, message) {
  errors.push(`${relative(repoRoot, file)}: ${message}`);
}

function validateNoEnums(file, sql) {
  const normalized = normalizeSql(sql).toLowerCase();

  if (/\bcreate\s+type\b[\s\S]*\bas\s+enum\b/.test(normalized)) {
    fail(
      file,
      "PostgreSQL ENUM types are not allowed; use VARCHAR plus a CHECK constraint.",
    );
  }

  if (/\benum\s*\(/.test(normalized)) {
    fail(
      file,
      "ENUM-like column types are not allowed; use VARCHAR plus a CHECK constraint.",
    );
  }
}

function validateCreateTableColumns(file, sql) {
  const createTableRegex =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]*?)\);/gi;

  for (const match of sql.matchAll(createTableRegex)) {
    const table = match[1];
    const body = match[2];

    for (const rawLine of body.split(/\n/)) {
      const line = rawLine.trim().replace(/,$/, "");

      if (
        !line ||
        /^constraint\b/i.test(line) ||
        /^primary\s+key\b/i.test(line) ||
        /^unique\b/i.test(line) ||
        /^check\b/i.test(line)
      ) {
        continue;
      }

      if (!/^"?[a-zA-Z0-9_]+"?\s+/i.test(line)) {
        continue;
      }

      if (!/\bnot\s+null\b/i.test(line)) {
        fail(file, `column in ${table} must be explicitly NOT NULL: ${line}`);
      }
    }
  }
}

function validateAlterTableAddColumns(file, sql) {
  const addColumnRegex =
    /alter\s+table\s+"?([a-zA-Z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-zA-Z0-9_]+"?\s+[^;]+);/gi;

  for (const match of sql.matchAll(addColumnRegex)) {
    const table = match[1];
    const columnDefinition = match[2].trim();

    if (!/\bnot\s+null\b/i.test(columnDefinition)) {
      fail(
        file,
        `ALTER TABLE ${table} ADD COLUMN must define the column as NOT NULL: ${columnDefinition}`,
      );
    }
  }
}

function validateOnlineDdlHints(file, sql) {
  const normalized = normalizeSql(sql).toLowerCase();
  const looksMysql = /\b(engine|charset|collate)\s*=|`[^`]+`/.test(
    normalized,
  );

  if (!looksMysql) {
    return;
  }

  const ddlRegex = /alter\s+table\s+[^;]+\b(?:add|drop)\s+column\b[^;]*;/gi;

  for (const match of normalized.matchAll(ddlRegex)) {
    const statement = match[0];

    if (
      !/\balgorithm\s*=\s*instant\b/.test(statement) ||
      !/\block\s*=\s*default\b/.test(statement)
    ) {
      fail(
        file,
        "MySQL/MariaDB ADD/DROP COLUMN migrations must include ALGORITHM=INSTANT and LOCK=DEFAULT.",
      );
    }
  }
}

function validateUniqueNames(file, sql) {
  const constraintRegex =
    /constraint\s+"?([a-zA-Z0-9_]+)"?\s+unique\s*\(([^)]+)\)/gi;

  for (const match of sql.matchAll(constraintRegex)) {
    const actual = match[1];
    const cols = columnsFromName(match[2]);
    const tableMatch = sql
      .slice(0, match.index)
      .match(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?\s*\([^;]*$/i,
      );
    const table = tableMatch?.[1];

    if (table) {
      const expected = `uq__${table}__${cols}`;

      if (actual !== expected) {
        fail(file, `unique constraint must be named ${expected}, got ${actual}`);
      }
    } else if (!/^uq__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(actual)) {
      fail(
        file,
        `unique constraint name must match uq__{table}__{columns}: ${actual}`,
      );
    }
  }

  const indexRegex =
    /create\s+(unique\s+)?index\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?\s+on\s+"?([a-zA-Z0-9_]+)"?\s*\(([^)]+)\)/gi;

  for (const match of sql.matchAll(indexRegex)) {
    const isUnique = Boolean(match[1]);
    const actual = match[2];
    const table = match[3];
    const cols = columnsFromName(match[4]);
    const expected = `${isUnique ? "uq" : "ix"}__${table}__${cols}`;

    if (actual !== expected) {
      fail(file, `index must be named ${expected}, got ${actual}`);
    }
  }
}

function validateForeignKeyNames(file, sql) {
  const fkRegex =
    /constraint\s+"?([a-zA-Z0-9_]+)"?\s+foreign\s+key\s*\(([^)]+)\)/gi;

  for (const match of sql.matchAll(fkRegex)) {
    const actual = match[1];
    const column = columnsFromName(match[2]);
    const tableMatch = sql
      .slice(0, match.index)
      .match(
        /(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?[\s\S]*$/i,
      );
    const table = tableMatch?.[1];

    if (!table) {
      if (!/^fk__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(actual)) {
        fail(file, `foreign key name must match fk__{table}__{column}: ${actual}`);
      }

      continue;
    }

    const expected = `fk__${table}__${column}`;

    if (actual !== expected) {
      fail(file, `foreign key must be named ${expected}, got ${actual}`);
    }
  }
}

function validateCheckConstraintNames(file, sql) {
  const checkRegex = /constraint\s+"?([a-zA-Z0-9_]+)"?\s+check\b/gi;

  for (const match of sql.matchAll(checkRegex)) {
    const actual = match[1];

    if (!/^ck__[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/.test(actual)) {
      fail(file, `check constraint name must match ck__{table}__{rule}: ${actual}`);
    }
  }
}

const migrationFiles = migrationRoots.flatMap((root) =>
  listFiles(join(repoRoot, root)).filter((file) =>
    /\/migrations\/Migration\d+.*\.ts$/.test(file),
  ),
);

for (const file of migrationFiles) {
  const source = readFileSync(file, "utf8");

  validateNoEnums(file, source);
  validateCreateTableColumns(file, source);
  validateAlterTableAddColumns(file, source);
  validateOnlineDdlHints(file, source);
  validateUniqueNames(file, source);
  validateForeignKeyNames(file, source);
  validateCheckConstraintNames(file, source);
}

if (errors.length > 0) {
  console.error("Database migration standards check failed:");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(JSON.stringify({ status: "ok", checked: migrationFiles.length }));
