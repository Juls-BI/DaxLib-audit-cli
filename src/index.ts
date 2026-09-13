#!/usr/bin/env node
import { Command } from "commander";
import * as path from "path";
import { checkStructure } from "./checks/structure";
import { loadManifest } from "./checks/manifest";
import { checkFunctions } from "./checks/functions";
import { printReport } from "./report";
import { Finding } from "./types";

const program = new Command();

program
    .name("daxlib-audit")
    .description("Audits a daxlib package folder (manifest.daxlib + lib/functions.tmdl) before submission")
    .argument("[path]", "path to the package version folder, e.g. packages/d/datatides.sixsigma/0.1.0", ".")
    .option("--json", "print findings as JSON instead of a formatted report")
    .action((inputPath: string, options: { json?: boolean }) => {
        const packageDir = path.resolve(process.cwd(), inputPath);
        const findings: Finding[] = [];

        findings.push(...checkStructure(packageDir));

        const { manifest, findings: manifestFindings } = loadManifest(packageDir);
        findings.push(...manifestFindings);

        findings.push(...checkFunctions(packageDir, manifest));

        if (options.json) {
            console.log(JSON.stringify(findings, null, 2));
        } else {
            printReport(findings, packageDir);
        }

        const hasErrors = findings.some((f) => f.severity === "error");
        process.exit(hasErrors ? 1 : 0);
    });

program.parse();
