# daxlib-audit-cli
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)
![Version](https://img.shields.io/badge/version-0.1.0-orange)
![daxlib](https://img.shields.io/badge/daxlib-package%20auditor-6f42c1)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

A command-line auditor for a [daxlib](https://github.com/daxlib/daxlib) package folder — checks `manifest.daxlib` and `lib/functions.tmdl` for the conventions this package follows before you open a PR: fully-qualified `PackageId.FunctionName` naming, `TABLEREF` (not `TABLE`) parameter typing, complete `///` doc comments, and package annotations that match the manifest.

Built to pair with the `daxlib-udf-formatter` Claude skill: format with the skill, audit with this CLI, then submit.

## What it checks

- **structure** — `manifest.daxlib`, `README.md`, `icon.png` and `lib/functions.tmdl` are all present
- **manifest** — valid JSON, every required field present, `id` is dot-separated PascalCase, `version` is semver, `readme`/`icon` paths and `repositoryUrl` match convention
- **naming** — every function name is fully qualified and its namespace matches the manifest `id`
- **types** — no `TABLE` parameters (should be `TABLEREF`)
- **docs** — every function has a `///` doc block with an `@returns` tag and an `@param` tag for every parameter, and no `@param {table}` tags
- **annotations** — every function has `DAXLIB_PackageId`/`DAXLIB_PackageVersion` annotations that match the manifest
- **cross-reference** — a function calling a sibling function uses its fully-qualified quoted name, not the short name

## Install

```bash
npm install
npm run build
```

## Usage

```bash
node dist/index.js path/to/packages/<letter>/<yournamespace.yourlibrary>/<version>
```

Or, after `npm link` (or a global install), just:

```bash
daxlib-audit path/to/packages/<letter>/<yournamespace.yourlibrary>/<version>
```

Defaults to the current directory if no path is given. Add `--json` to get findings as JSON instead of the formatted report (useful for CI).

Exit code is `0` when there are no errors (warnings alone don't fail the run) and `1` when there's at least one error.

## Try it on the included fixtures

```bash
npm run build
node dist/index.js fixtures/valid-package
node dist/index.js fixtures/broken-package
```

`fixtures/valid-package` is a sample `Contoso.SixSigma` package and should report no issues. `fixtures/broken-package` is the same package with five deliberate mistakes seeded in (a `TABLE` parameter, a missing `@returns`, a missing `@param`, a mismatched package version, and an unqualified cross-reference call) so you can see what each check catches. Neither fixture is tied to any real namespace — the CLI validates whatever namespace your own `manifest.daxlib` declares.

## Related

- [`daxlib`](https://github.com/daxlib/daxlib) — the package registry this CLI audits packages for
- `daxlib-udf-formatter` — a Claude skill that converts raw DAX UDFs into this same package format. [`skill/SKILL.md`](skill/SKILL.md) is a reference copy of its exact instructions (editing it here does not change the live skill); [`docs/daxlib-formatting-guide.md`](docs/daxlib-formatting-guide.md) covers the same rules written up as human-facing documentation

## License

This project is licensed under the MIT License.
