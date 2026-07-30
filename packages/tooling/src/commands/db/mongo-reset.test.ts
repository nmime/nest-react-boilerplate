// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MongoClient } from "mongodb";
import { dropSelectedMongoDatabase } from "./mongo-reset.ts";

describe("MongoDB reset", () => {
  it("drops only the explicitly selected database", async () => {
    const selected: string[] = [];
    const dropped: string[] = [];
    const client = {
      db(database: string) {
        selected.push(database);
        return {
          async dropDatabase() {
            dropped.push(database);
            return true;
          },
        };
      },
    } as unknown as Pick<MongoClient, "db">;

    await dropSelectedMongoDatabase(client, "nest_react_boilerplate");

    assert.deepEqual(selected, ["nest_react_boilerplate"]);
    assert.deepEqual(dropped, ["nest_react_boilerplate"]);
  });
});
