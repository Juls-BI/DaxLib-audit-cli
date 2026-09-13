import chalk from "chalk";
import { Finding } from "./types";

export function printReport(findings: Finding[], packageDir: string): void {
    const errors = findings.filter((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning");

    console.log(chalk.bold(`\ndaxlib audit: ${packageDir}\n`));

    if (findings.length === 0) {
        console.log(chalk.green("✓ No issues found. Looks ready to submit."));
        return;
    }

    const byCheck = new Map<string, Finding[]>();
    for (const f of findings) {
        const list = byCheck.get(f.check) ?? [];
        list.push(f);
        byCheck.set(f.check, list);
    }

    for (const [check, list] of byCheck) {
        console.log(chalk.underline(check));
        for (const f of list) {
            const icon = f.severity === "error" ? chalk.red("✗") : chalk.yellow("!");
            const loc = f.location ? chalk.dim(` (${f.location})`) : "";
            console.log(`  ${icon} ${f.message}${loc}`);
        }
        console.log("");
    }

    console.log(
        chalk.bold(
            `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${
                warnings.length === 1 ? "" : "s"
            }`
        )
    );

    if (errors.length > 0) {
        console.log(chalk.red("\n✗ Not ready to submit — fix the errors above first."));
    } else {
        console.log(chalk.yellow("\n! No errors, but review the warnings above before submitting."));
    }
}
