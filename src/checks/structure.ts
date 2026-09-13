import * as fs from "fs";
import * as path from "path";
import { Finding } from "../types";

const REQUIRED_ENTRIES = [
    { rel: "manifest.daxlib", kind: "file" as const },
    { rel: "README.md", kind: "file" as const },
    { rel: "icon.png", kind: "file" as const },
    { rel: "lib", kind: "dir" as const },
    { rel: "lib/functions.tmdl", kind: "file" as const },
];

export function checkStructure(packageDir: string): Finding[] {
    const findings: Finding[] = [];

    for (const entry of REQUIRED_ENTRIES) {
        const full = path.join(packageDir, entry.rel);
        if (!fs.existsSync(full)) {
            findings.push({
                severity: "error",
                check: "structure",
                message: `Missing required ${entry.kind}: ${entry.rel}`,
                location: entry.rel,
            });
            continue;
        }
        const stat = fs.statSync(full);
        const isDir = stat.isDirectory();
        if (entry.kind === "dir" && !isDir) {
            findings.push({
                severity: "error",
                check: "structure",
                message: `${entry.rel} exists but is not a directory`,
                location: entry.rel,
            });
        }
        if (entry.kind === "file" && isDir) {
            findings.push({
                severity: "error",
                check: "structure",
                message: `${entry.rel} exists but is a directory, expected a file`,
                location: entry.rel,
            });
        }
    }

    return findings;
}
