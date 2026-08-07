#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { Command } from "commander";
import { generate } from "./commands/generate.js";
import { inventory } from "./commands/inventory.js";
import { validate } from "./commands/validate.js";

const program = new Command();
const defaultData = path.resolve("data/generated");

program.name("acme").description("ACME Email corpus and Twenty CRM workshop CLI").version("0.1.0");
program.command("generate").option("--output <directory>", "generated dataset directory", defaultData)
  .action(async ({ output }) => generate(path.resolve(output)));
program.command("inventory").option("--data <directory>", "dataset directory", defaultData)
  .option("--report <file>", "coverage report", path.resolve("reports/inventory.json"))
  .action(async ({ data, report }) => inventory(path.resolve(data), path.resolve(report)));
program.command("validate").option("--data <directory>", "dataset directory", defaultData)
  .action(async ({ data }) => validate(path.resolve(data)));

await program.parseAsync();

