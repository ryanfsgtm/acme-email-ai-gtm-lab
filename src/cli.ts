#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { Command } from "commander";
import { inventory } from "./commands/inventory.js";
import { validate } from "./commands/validate.js";
import { attioDoctor } from "./commands/attio-doctor.js";
import { attioExport } from "./commands/attio-export.js";
import { attioPlan } from "./commands/attio-plan.js";
import { attioApply } from "./commands/attio-apply.js";
import { attioVerify } from "./commands/attio-verify.js";

const program = new Command();
const defaultData = path.resolve("data/generated");

program.name("acme").description("ACME Email corpus and Attio CRM workshop CLI").version("0.2.0");
program.command("inventory").option("--data <directory>", "dataset directory", defaultData)
  .option("--report <file>", "coverage report", path.resolve("reports/inventory.json"))
  .action(async ({ data, report }) => inventory(path.resolve(data), path.resolve(report)));
program.command("validate").option("--data <directory>", "dataset directory", defaultData)
  .action(async ({ data }) => validate(path.resolve(data)));

const attio = program.command("attio").description("Prepare and verify an Attio workshop workspace");
attio.command("doctor").description("Verify Attio credentials and required read permissions without writing")
  .action(attioDoctor);
attio.command("export").description("Build deterministic Attio import artifacts from the authored corpus")
  .option("--data <directory>", "dataset directory", defaultData)
  .option("--out <directory>", "seed artifact directory", path.resolve("seed/attio"))
  .action(async ({ data, out }) => attioExport(path.resolve(data), path.resolve(out)));
attio.command("plan").description("Create a reviewable dry-run plan; never writes to Attio")
  .option("--seed <directory>", "seed artifact directory", path.resolve("seed/attio"))
  .option("--report <file>", "plan report", path.resolve("reports/attio-seed-plan.json"))
  .action(async ({ seed, report }) => attioPlan(path.resolve(seed), path.resolve(report)));
attio.command("apply").description("Apply the approved, resumable Attio seed plan")
  .requiredOption("--approve", "confirm that the seed plan was reviewed")
  .option("--data <directory>", "dataset directory", defaultData)
  .option("--seed <directory>", "seed artifact directory", path.resolve("seed/attio"))
  .option("--ledger <file>", "resumable import ledger", path.resolve("reports/attio-import-ledger.jsonl"))
  .option("--concurrency <number>", "maximum concurrent API requests", "10")
  .action(async ({ data, seed, ledger, approve, concurrency }) => {
    const parsedConcurrency = Number.parseInt(concurrency, 10);
    if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1 || parsedConcurrency > 20) {
      throw new Error("--concurrency must be an integer from 1 to 20");
    }
    await attioApply(path.resolve(data), path.resolve(seed), path.resolve(ledger), Boolean(approve), parsedConcurrency);
  });
attio.command("verify").description("Reconcile the complete ACME corpus against live Attio records")
  .option("--seed <directory>", "seed artifact directory", path.resolve("seed/attio"))
  .option("--report <file>", "verification report", path.resolve("reports/attio-verification.json"))
  .action(async ({ seed, report }) => attioVerify(path.resolve(seed), path.resolve(report)));

await program.parseAsync();
