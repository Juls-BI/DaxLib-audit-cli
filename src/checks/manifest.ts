import * as fs from "fs";
import * as path from "path";
import { Finding, Manifest } from "../types";

const REQUIRED_FIELDS: (keyof Manifest)[] = [
    "$schema",
    "id",
    "version",
    "authors",
    "description",
    "tags",
    "releaseNotes",
    "repositoryUrl",
    "readme",
    "icon",
];

// Two or more PascalCase segments joined by dots, e.g. Contoso.SixSigma
const PACKAGE_ID_PATTERN = /^([A-Z][A-Za-z0-9]*)(\.[A-Z][A-Za-z0-9]*)+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function loadManifest(packageDir: string): { manifest: Manifest | null; findings: Finding[] } {
    const findings: Finding[] = [];
    const manifestPath = path.join(packageDir, "manifest.daxlib");

    if (!fs.existsSync(manifestPath)) {
        // structure.ts already reports this as missing; nothing further to check here.
        return { manifest: null, findings };
    }

    const raw = fs.readFileSync(manifestPath, "utf8");
    let manifest: Manifest;
    try {
        manifest = JSON.parse(raw);
    } catch (err) {
        findings.push({
            severity: "error",
            check: "manifest",
            message: `manifest.daxlib is not valid JSON: ${(err as Error).message}`,
            location: "manifest.daxlib",
        });
        return { manifest: null, findings };
    }

    for (const field of REQUIRED_FIELDS) {
        const value = manifest[field];
        if (value === undefined || value === null || value === "") {
            findings.push({
                severity: "error",
                check: "manifest",
                message: `manifest.daxlib is missing required field "${field}"`,
                location: "manifest.daxlib",
            });
        }
    }

    if (manifest.id && !PACKAGE_ID_PATTERN.test(manifest.id)) {
        findings.push({
            severity: "error",
            check: "manifest",
            message: `manifest "id" ("${manifest.id}") should be dot-separated PascalCase segments, e.g. Contoso.SixSigma`,
            location: "manifest.daxlib",
        });
    }

    if (manifest.version && !SEMVER_PATTERN.test(manifest.version)) {
        findings.push({
            severity: "error",
            check: "manifest",
            message: `manifest "version" ("${manifest.version}") should be a plain semver string, e.g. 0.1.0`,
            location: "manifest.daxlib",
        });
    }

    if (manifest.readme && manifest.readme !== "/README.md") {
        findings.push({
            severity: "warning",
            check: "manifest",
            message: `manifest "readme" is "${manifest.readme}", expected "/README.md"`,
            location: "manifest.daxlib",
        });
    }

    if (manifest.icon && manifest.icon !== "/icon.png") {
        findings.push({
            severity: "warning",
            check: "manifest",
            message: `manifest "icon" is "${manifest.icon}", expected "/icon.png"`,
            location: "manifest.daxlib",
        });
    }

    if (manifest.id && manifest.repositoryUrl) {
        const expectedSuffix = `/packages/${manifest.id[0].toLowerCase()}/${manifest.id.toLowerCase()}`;
        if (!manifest.repositoryUrl.toLowerCase().endsWith(expectedSuffix)) {
            findings.push({
                severity: "warning",
                check: "manifest",
                message: `manifest "repositoryUrl" doesn't end with "${expectedSuffix}" — double check it points at this package's own folder`,
                location: "manifest.daxlib",
            });
        }
    }

    return { manifest, findings };
}
