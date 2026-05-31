#!/usr/bin/env node
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { main } = await jiti.import("../src/cli.ts");

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
