import * as fs from "fs";
import * as path from "path";
import { Finding, Manifest, ParsedFunction, ParsedParam } from "../types";
import { DAX_RESERVED_WORDS } from "../reservedWords";

const FUNCTION_HEADER = /^FUNCTION\s+'([^']+)'\s*=/;
const ANNOTATION_LINE = /^\s*annotation\s+(\w+)\s*=\s*(.+?)\s*$/;
const DOC_LINE = /^\s*\/\/\/(.*)$/;
const PARAM_TAG = /@param\s+\{([^}]*)\}\s+(\w+)/g;
const RETURNS_TAG = /@returns/;
const VAR_DECL = /^\s*VAR\s+([A-Za-z_]\w*)\s*=/gm;

// A reference to another function, quoted or bare: 'Some.Qualified.Name'( or Some.Qualified.Name(
// (dots included in the bare alternative so a fully-qualified unquoted call, e.g.
// DataTides.SixSigma.NormSInv(, is captured whole rather than matched from its last segment).
const CALL_REF = /'([A-Za-z_][\w.]*)'\s*\(|(?<!['\w.])([A-Za-z_][\w.]*)\s*\(/g;

// Known-invalid type hints and their correct replacement — both the actual DAX
// parameter type and the lowercase doc-tag word daxlib docs use for it.
// Confirmed by real daxlib PR review; not necessarily exhaustive.
const INVALID_PARAM_TYPES: Record<string, string> = {
    TABLE: "TABLEREF",
    INTEGER: "INT64",
};
const INVALID_DOC_TAGS: Record<string, string> = {
    table: "tableref",
    integer: "int64",
};

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

        // Known-invalid parameter type hints (e.g. TABLE should be TABLEREF, INTEGER should be INT64).
        for (const param of fn.params) {
            const replacement = INVALID_PARAM_TYPES[param.type.toUpperCase()];
            if (replacement) {
                findings.push({
                    severity: "error",
                    check: "types",
                    message: `Parameter "${param.name}" in "${fn.name}" is typed ${param.type.toUpperCase()} — daxlib expects ${replacement}`,
                    location: loc,
                });
            }
        }

        // Parameter names can't collide with a DAX/MDX reserved word (e.g. "Table", "Avg") —
        // daxlib's compiler rejects these even though they look like ordinary identifiers.
        for (const param of fn.params) {
            if (DAX_RESERVED_WORDS.has(param.name.toUpperCase())) {
                findings.push({
                    severity: "error",
                    check: "reserved-words",
                    message: `Parameter "${param.name}" in "${fn.name}" is a DAX reserved word and can't be used as a parameter name — rename it (e.g. "${param.name}" → "Source${param.name}" or similar)`,
                    location: loc,
                });
            }
        }

        // Same for VAR names declared anywhere in the function body.
        {
            const varRegex = new RegExp(VAR_DECL);
            let varMatch;
            const seen = new Set<string>();
            while ((varMatch = varRegex.exec(fn.body)) !== null) {
                const varName = varMatch[1];
                if (DAX_RESERVED_WORDS.has(varName.toUpperCase()) && !seen.has(varName)) {
                    seen.add(varName);
                    findings.push({
                        severity: "error",
                        check: "reserved-words",
                        message: `VAR "${varName}" in "${fn.name}" is a DAX reserved word and can't be used as a variable name — rename it`,
                        location: loc,
                    });
                }
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

            // A @param doc tag using one of the known-invalid type words (e.g. {table}, {integer})
            // should use the corrected word instead, matching the actual parameter type.
            for (const [badTag, goodTag] of Object.entries(INVALID_DOC_TAGS)) {
                const tagRegex = new RegExp(`@param\\s+\\{${badTag}\\}\\s+(\\w+)`, "gi");
                let tagMatch;
                while ((tagMatch = tagRegex.exec(docText)) !== null) {
                    findings.push({
                        severity: "warning",
                        check: "docs",
                        message: `"${fn.name}" doc comment tags "${tagMatch[1]}" as {${badTag}} — should be {${goodTag}}`,
                        location: loc,
                    });
                }
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

        // Cross-references to sibling functions must use the fully qualified NAME
        // WITHOUT quotes — e.g. DataTides.SixSigma.NormSInv( Yield ), not
        // 'DataTides.SixSigma.NormSInv'( Yield ) and not the bare short name
        // NormSInv( Yield ). Quoting is only correct on the FUNCTION declaration
        // line itself; every call site (same package or cross-package) is bare.
        {
            const callRegex = new RegExp(CALL_REF);
            let callMatch;
            while ((callMatch = callRegex.exec(fn.body)) !== null) {
                const quotedName = callMatch[1];
                const bareName = callMatch[2];
                const name = quotedName ?? bareName;
                const quoted = quotedName !== undefined;

                const shortName = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
                const fullNameForShort = shortNameToFullName.get(shortName);
                if (!fullNameForShort) continue; // not a call to a sibling function in this file
                if (fullNameForShort === fn.name) continue; // recursive self-call, not a cross-reference concern here

                if (quoted) {
                    findings.push({
                        severity: "error",
                        check: "cross-reference",
                        message: `"${fn.name}" calls '${name}'(...) with quotes — daxlib expects the fully qualified name WITHOUT quotes: ${fullNameForShort}(...)`,
                        location: loc,
                    });
                } else if (name !== fullNameForShort) {
                    findings.push({
                        severity: "error",
                        check: "cross-reference",
                        message: `"${fn.name}" appears to call "${name}" unqualified — use ${fullNameForShort}(...) instead (no quotes)`,
                        location: loc,
                    });
                }
                // else: bare + fully qualified — the correct form, no finding.
            }
        }
    }

    return findings;
}
