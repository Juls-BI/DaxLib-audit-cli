import * as fs from "fs";
import * as path from "path";
import { Finding, Manifest, ParsedFunction, ParsedParam } from "../types";

const FUNCTION_HEADER = /^FUNCTION\s+'([^']+)'\s*=/;
const ANNOTATION_LINE = /^\s*annotation\s+(\w+)\s*=\s*(.+?)\s*$/;
const DOC_LINE = /^\s*\/\/\/(.*)$/;
const PARAM_TAG = /@param\s+\{([^}]*)\}\s+(\w+)/g;
const RETURNS_TAG = /@returns/;

function extractParamBlock(source: string, headerIndex: number): { block: string; afterIndex: number } {
    const openParenIndex = source.indexOf("(", headerIndex);
    if (openParenIndex === -1) return { block: "", afterIndex: headerIndex };

    let depth = 0;
    let i = openParenIndex;
    for (; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") {
            depth--;
            if (depth === 0) {
                i++;
                break;
            }
        }
    }
    return { block: source.slice(openParenIndex + 1, i - 1), afterIndex: i };
}

function parseParams(block: string): ParsedParam[] {
    const params: ParsedParam[] = [];
    const parts = block.split(",");
    for (const part of parts) {
        const match = part.match(/(\w+)\s*:\s*([\w\s]+)/);
        if (match) {
            params.push({ name: match[1].trim(), type: match[2].trim() });
        }
    }
    return params;
}

export function parseFunctions(tmdlContent: string): ParsedFunction[] {
    const lines = tmdlContent.split(/\r?\n/);

    const headerIndices: number[] = [];
    lines.forEach((line, idx) => {
        if (FUNCTION_HEADER.test(line)) headerIndices.push(idx);
    });

    const functions: ParsedFunction[] = [];

    for (let h = 0; h < headerIndices.length; h++) {
        const idx = headerIndices[h];
        const headerMatch = lines[idx].match(FUNCTION_HEADER)!;
        const name = headerMatch[1];

        // Doc comment lines sit immediately above the FUNCTION header, with no
        // blank line in between — walk backward collecting them.
        const docLines: string[] = [];
        let d = idx - 1;
        while (d >= 0) {
            const docMatch = lines[d].match(DOC_LINE);
            if (!docMatch) break;
            docLines.unshift(docMatch[1].trim());
            d--;
        }

        const nextHeaderIdx = h + 1 < headerIndices.length ? headerIndices[h + 1] : lines.length;

        // The next function's doc comment (and any trailing blank lines) sit
        // between this function's last annotation and the next header — trim
        // those off so they aren't mistaken for part of this function's body.
        let bodyEnd = nextHeaderIdx;
        while (bodyEnd > idx && DOC_LINE.test(lines[bodyEnd - 1])) bodyEnd--;
        while (bodyEnd > idx && lines[bodyEnd - 1].trim() === "") bodyEnd--;

        const blockLines = lines.slice(idx, bodyEnd);
        const blockText = blockLines.join("\n");

        const { block: paramBlock } = extractParamBlock(blockText, 0);
        const params = parseParams(paramBlock);

        const annotations: Record<string, string> = {};
        for (const bLine of blockLines) {
            const aMatch = bLine.match(ANNOTATION_LINE);
            if (aMatch) annotations[aMatch[1]] = aMatch[2];
        }

        functions.push({
            name,
            docLines,
            params,
            body: blockText,
            annotations,
            startLine: idx + 1,
        });
    }

    return functions;
}

export function checkFunctions(packageDir: string, manifest: Manifest | null): Finding[] {
    const findings: Finding[] = [];
    const tmdlPath = path.join(packageDir, "lib", "functions.tmdl");
    if (!fs.existsSync(tmdlPath)) return findings;

    const content = fs.readFileSync(tmdlPath, "utf8");
    const functions = parseFunctions(content);

    if (functions.length === 0) {
        findings.push({
            severity: "error",
            check: "functions",
            message: "No FUNCTION declarations found in lib/functions.tmdl",
            location: "lib/functions.tmdl",
        });
        return findings;
    }

    const shortNameToFullName = new Map<string, string>();
    for (const fn of functions) {
        const shortName = fn.name.split(".").pop() ?? fn.name;
        shortNameToFullName.set(shortName, fn.name);
    }

    for (const fn of functions) {
        const loc = `lib/functions.tmdl:${fn.startLine}`;

        // Naming convention: fully qualified, and namespace matches manifest id.
        const lastDot = fn.name.lastIndexOf(".");
        if (lastDot === -1) {
            findings.push({
                severity: "error",
                check: "naming",
                message: `Function "${fn.name}" is not namespaced (expected "<PackageId>.${fn.name}")`,
                location: loc,
            });
        } else if (manifest?.id) {
            const namespace = fn.name.slice(0, lastDot);
            if (namespace !== manifest.id) {
                findings.push({
                    severity: "error",
                    check: "naming",
                    message: `Function "${fn.name}" namespace "${namespace}" doesn't match manifest id "${manifest.id}"`,
                    location: loc,
                });
            }
        }

        // Table parameters must be TABLEREF, not TABLE.
        for (const param of fn.params) {
            if (param.type.toUpperCase() === "TABLE") {
                findings.push({
                    severity: "error",
                    check: "types",
                    message: `Parameter "${param.name}" in "${fn.name}" is typed TABLE — daxlib expects TABLEREF`,
                    location: loc,
                });
            }
        }

        // Doc comments: must exist, must have @returns, must have @param for every parameter.
        if (fn.docLines.length === 0) {
            findings.push({
                severity: "error",
                check: "docs",
                message: `"${fn.name}" has no /// doc comment block`,
                location: loc,
            });
        } else {
            const docText = fn.docLines.join("\n");
            if (!RETURNS_TAG.test(docText)) {
                findings.push({
                    severity: "error",
                    check: "docs",
                    message: `"${fn.name}" doc comment is missing an @returns tag`,
                    location: loc,
                });
            }

            const documentedParams = new Set<string>();
            let paramTagMatch;
            const tagRegex = new RegExp(PARAM_TAG);
            while ((paramTagMatch = tagRegex.exec(docText)) !== null) {
                documentedParams.add(paramTagMatch[2]);
            }
            for (const param of fn.params) {
                if (!documentedParams.has(param.name)) {
                    findings.push({
                        severity: "error",
                        check: "docs",
                        message: `"${fn.name}" doc comment has no @param tag for "${param.name}"`,
                        location: loc,
                    });
                }
            }

            // A table parameter's @param tag should be typed {tableref}, not {table}.
            const tableTagRegex = /@param\s+\{table\}\s+(\w+)/gi;
            let tableTagMatch;
            while ((tableTagMatch = tableTagRegex.exec(docText)) !== null) {
                findings.push({
                    severity: "warning",
                    check: "docs",
                    message: `"${fn.name}" doc comment tags "${tableTagMatch[1]}" as {table} — should be {tableref}`,
                    location: loc,
                });
            }
        }

        // Package annotations must be present and match the manifest.
        const pkgId = fn.annotations["DAXLIB_PackageId"];
        const pkgVersion = fn.annotations["DAXLIB_PackageVersion"];
        if (!pkgId) {
            findings.push({
                severity: "error",
                check: "annotations",
                message: `"${fn.name}" is missing annotation DAXLIB_PackageId`,
                location: loc,
            });
        } else if (manifest?.id && pkgId !== manifest.id) {
            findings.push({
                severity: "error",
                check: "annotations",
                message: `"${fn.name}" annotation DAXLIB_PackageId ("${pkgId}") doesn't match manifest id ("${manifest.id}")`,
                location: loc,
            });
        }
        if (!pkgVersion) {
            findings.push({
                severity: "error",
                check: "annotations",
                message: `"${fn.name}" is missing annotation DAXLIB_PackageVersion`,
                location: loc,
            });
        } else if (manifest?.version && pkgVersion !== manifest.version) {
            findings.push({
                severity: "error",
                check: "annotations",
                message: `"${fn.name}" annotation DAXLIB_PackageVersion ("${pkgVersion}") doesn't match manifest version ("${manifest.version}")`,
                location: loc,
            });
        }

        // Cross-references to sibling functions must use the fully qualified quoted form.
        let bodyForScan = fn.body;
        for (const [, fullName] of shortNameToFullName) {
            const qualifiedCallPattern = new RegExp(`'${fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'\\s*\\(`, "g");
            bodyForScan = bodyForScan.replace(qualifiedCallPattern, "");
        }
        for (const [shortName, fullName] of shortNameToFullName) {
            if (fullName === fn.name) continue; // a function calling itself recursively isn't a cross-reference concern here
            const bareCallPattern = new RegExp(`(?<!['\\w])${shortName}\\s*\\(`, "g");
            if (bareCallPattern.test(bodyForScan)) {
                findings.push({
                    severity: "warning",
                    check: "cross-reference",
                    message: `"${fn.name}" appears to call "${shortName}" unqualified — use '${fullName}'(...) instead`,
                    location: loc,
                });
            }
        }
    }

    return findings;
}
