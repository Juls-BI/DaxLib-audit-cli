---
name: daxlib-udf-formatter
description: "Use when the user pastes raw DAX UDFs (e.g. copied straight from DAX Query View) and wants them converted into daxlib submission format — namespaced function names, JSDoc-style doc comments, TABLEREF typing, package annotations, and the manifest.daxlib file."
---

# daxlib UDF formatter

Converts raw/draft DAX user-defined functions into daxlib's package format, and produces the accompanying manifest.daxlib and folder layout for submission to https://github.com/daxlib/daxlib.

This is a generic formatter, not tied to one namespace. The vendor/brand prefix (e.g. Contoso) is the user's own choice for a given package, not a daxlib requirement — always get the full package id from them rather than assuming it, since they may use a different namespace for a different package.

## Before starting

If not already stated in the message, ask (briefly, in one go, not one question at a time) for whatever of these is missing:
- The full package id (PascalCase, dot-separated), e.g. `Contoso.SixSigma`, `Contoso.ColourContrast` — do not assume the vendor/namespace part. The only hard rule from daxlib itself is that it can't start with `Dax.` or `DaxLib.`
- Version (semver, e.g. 0.1.0) — if this is an update to an existing package, ask whether the version should bump
- A one-sentence description of the library, for the manifest

If the package already exists earlier in the conversation, reuse its known id/version/description instead of asking again. Never carry a namespace over to a package it hasn't been used for yet.

## Function naming convention

Every function is DECLARED fully qualified and quoted: `FUNCTION '<PackageId>.<FunctionName>' = (...)`, where `<PackageId>` is the full id gathered above (e.g. `Contoso.SixSigma`). Never leave a function unqualified — this is what daxlib requires and what distinguishes a real package function from a plain measure-style helper.

Quoting is ONLY correct on that declaration line. A CALL from one function to another — inside the same package or a different one — must use the fully qualified name WITHOUT quotes, e.g. `Contoso.SixSigma.ProcessSigmaWithin(Table, ValueColumn, OrderColumn)`. Both of these get rejected in daxlib review: calling the bare short name (`ProcessSigmaWithin(...)`), and calling the qualified name still wrapped in quotes (`'Contoso.SixSigma.ProcessSigmaWithin'(...)`). This has been the single most common daxlib review comment on generated packages — double-check every cross-function call before handing back the file.

## Parameter types

- A table parameter is always typed `TABLEREF`, never `TABLE`. This applies to both the parameter declaration and the `@param {tableref}` doc tag.
- A whole-number parameter is `INT64`, never `INTEGER` — `INTEGER` looks plausible but daxlib rejects it.
- A column parameter is `COLUMNREF`.
- A scalar parameter should use the most specific type when it's genuinely fixed for every caller: DOUBLE, INT64, STRING, DATETIME. A decimal scalar can also be written DECIMAL (seen accepted in at least one merged package), but prefer DOUBLE unless there's a specific reason to use DECIMAL. Only fall back to the generic SCALAR when the real type varies by caller (e.g. an order/sequence column that could be a date, datetime, or integer), and say so in the doc comment when that's why SCALAR was chosen. A scalar that's always a string specifically can also be written SCALAR STRING.

## Reserved words

Neither a parameter name nor a `VAR` name may collide (case-insensitively) with a DAX/MDX reserved word — daxlib's compiler rejects it even though it reads like an ordinary identifier. Two real examples from review: a table parameter named `Table` (reserved — use `SourceTable` or similar instead) and a variable named `Avg` (reserved — use `Mean` or similar instead). Before finalizing a package, mentally check every parameter and `VAR` name against this risk, especially short, generic names like `Table`, `Row`, `Column`, `Value`, `Date`, `Type`, `Avg`, `Sum`, `Count`, `Min`, `Max`, `Rank`, `Order`, `Level`, `Measure` used bare (not as part of a longer compound name like `ValueColumn`, which is fine).

## Variable and parameter naming

Drop any leading-underscore convention from draft/DAX-Query-View code (`_Table` → `SourceTable`, `_Mean` → `Mean`, etc.) when converting into the library — but never rename onto a reserved word (see above); pick a slightly more specific name instead (`_Table` → `SourceTable`, not `Table`). Do this as a careful mechanical rename that preserves logic exactly — never change behavior while renaming.

## Doc comments

Every function gets a `///` comment block immediately above its `FUNCTION` line:

```
/// One or two sentences of plain-English description. Reference any other function by its full qualified name in single quotes, e.g. 'Contoso.SixSigma.Cp', never by its short name — this quoting is documentation prose only, not how the actual call in the code below should look (that's unquoted; see "Function naming convention" above).
/// @param {type} ParamName – description of the parameter, lowercase type tag (double, int64, string, datetime, tableref, columnref, scalar)
/// @returns What the function returns, including BLANK()/edge-case behavior. Example: '<PackageId>.<FunctionName>'(sample args) → sample result
```

One `@param` line per parameter, in declaration order. Keep the `@returns` line's worked example concrete (real-looking numbers), not abstract.

## Package annotations

Every function ends with two annotation lines matching the manifest exactly:

```
    annotation DAXLIB_PackageId = <PackageId>
    annotation DAXLIB_PackageVersion = <version>
```

where `<PackageId>` is the exact same value as the manifest's `id` field (e.g. `Contoso.SixSigma`), not just a vendor prefix on its own.

## manifest.daxlib

Despite the `.daxlib` extension this is a JSON file. Template (fields to fill in are the same ones gathered above):

```json
{
  "$schema": "https://raw.githubusercontent.com/daxlib/daxlib/refs/heads/main/schemas/manifest/1.0.0/manifest.1.0.0.schema.json",
  "id": "<PackageId>",
  "version": "<version>",
  "authors": "<your name or handle>",
  "description": "<one sentence, what the library does>",
  "tags": "<comma-separated topical tags>",
  "releaseNotes": "<one paragraph describing what's in this release>",
  "repositoryUrl": "https://github.com/daxlib/daxlib/tree/main/packages/<first letter of packageid, lowercase>/<packageid, lowercase>",
  "readme": "/README.md",
  "icon": "/icon.png"
}
```

`id` must exactly match the `DAXLIB_PackageId` annotation value used in every function. `repositoryUrl`'s path segment is the manifest `id` lowercased (e.g. `contoso.sixsigma`).

## README.md

```markdown
# <PackageId>

One short paragraph: what the library does and why it's reusable/model-agnostic where relevant.

## Usage

(2-3 DAX code examples showing representative functions called with realistic arguments, one comment per parameter on the same line)

## Functions

- **FunctionName** — one-line description
(one bullet per function)

## Documentation

- See the `manifest.daxlib` and `lib/functions.tmdl` files for full parameter and return details.

## License

State the license this package is released under.
```

## Folder structure for submission

```
packages/<first-letter-lowercase-of-packageid>/<packageid-lowercase>/<version>/
  icon.png            (unchanged — never regenerate or modify this)
  lib/
    functions.tmdl    (the converted functions, this file's output)
  manifest.daxlib
  README.md
```

Example: package id `Contoso.SixSigma` version `0.1.0` → `packages/c/contoso.sixsigma/0.1.0/`.

## Output format

Give the full `functions.tmdl` content as a single DAX code block, and the manifest as a JSON code block, so both are copy-paste ready. If the user is only asking about one of the pieces (just the functions, just the manifest), give only that piece rather than everything every time.

## Also watch for

- Comment lines should generally not be manually wrapped — write each doc comment as a single continuous line, however long, unless the user asks otherwise.
- If a function calls another function that doesn't yet exist in fully-qualified form in the pasted input, flag it rather than guessing its final name.
- Never assume a namespace from a past package carries over to a new one — always confirm the full package id for whatever library is being formatted right now.
- Before handing back the file, re-scan every `VAR ... =` inside every function body for a bare, unqualified, or quoted call to a sibling function (see "Function naming convention") — this is easy to miss when a package has many small helper functions calling each other.
- Run the output through `daxlib-audit-cli` (or mentally re-check against `docs/daxlib-formatting-guide.md`) before calling a conversion finished — reserved words and internal-call quoting are the two mistakes that most often slip through.
