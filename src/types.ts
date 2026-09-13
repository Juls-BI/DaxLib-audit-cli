export type Severity = "error" | "warning";

export interface Finding {
    severity: Severity;
    check: string;
    message: string;
    location?: string;
}

export interface Manifest {
    $schema?: string;
    id?: string;
    version?: string;
    authors?: string;
    description?: string;
    tags?: string;
    releaseNotes?: string;
    repositoryUrl?: string;
    readme?: string;
    icon?: string;
    [key: string]: unknown;
}

export interface ParsedParam {
    name: string;
    type: string;
}

export interface ParsedFunction {
    name: string;
    docLines: string[];
    params: ParsedParam[];
    body: string;
    annotations: Record<string, string>;
    startLine: number;
}

export interface AuditResult {
    findings: Finding[];
    functionCount: number;
}
