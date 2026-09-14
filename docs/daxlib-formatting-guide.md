# daxlib package formatting guide

The conventions this CLI audits, in one place. This mirrors the `daxlib-udf-formatter` Claude skill used to produce packages in this format.

## Function naming

Every function is DECLARED fully qualified and quoted: `FUNCTION '<YourNamespace>.<PackageName>.<FunctionName>' = (...)`. `<YourNamespace>` is your own vendor/brand prefix (e.g. a company or personal handle) — daxlib only requires it not start with `Dax.` or `DaxLib.`.

Quoting is ONLY correct on that declaration line. A CALL from one function to another — same package or a different one — must use the fully qualified name WITHOUT quotes, e.g. `YourNamespace.YourLibrary.SomeOtherFunction(Table, ValueColumn, OrderColumn)`. Two mistakes are equally wrong and both get rejected in review: calling the bare short name (`SomeOtherFunction(...)`), and calling the qualified name still wrapped in quotes (`'YourNamespace.YourLibrary.SomeOtherFunction'(...)`). Confirmed by real daxlib PR review on multiple packages — this file previously (incorrectly) recommended the quoted form for calls too; don't reintroduce that.

## Parameter types

- A table parameter is always `TABLEREF`, never `TABLE` — in both the parameter declaration and the `@param {tableref}` doc tag.
- A column parameter is `COLUMNREF`.
- A whole-number scalar is `INT64`, never `INTEGER` — `INTEGER` is not a valid daxlib type hint and gets rejected in review.
- A decimal scalar is `DOUBLE` (or `DECIMAL`, seen accepted in at least one merged package — prefer `DOUBLE` unless you have a specific reason).
- Other scalars: `STRING`, `DATETIME`. Fall back to `SCALAR` only when the real type genuinely varies by caller, and say so in the doc comment. A scalar whose real type is always a string can also be written `SCALAR STRING`.

## Reserved words

A parameter or `VAR` name can't collide (case-insensitively) with a word in DAX/MDX's reserved-word list — even though it reads like an ordinary identifier, daxlib's compiler rejects it. `Table` and `Avg` have both been rejected in real PR review; the CLI's `src/reservedWords.ts` carries a fuller (but not guaranteed exhaustive) list pulled from DAX's own reserved-word grammar. If a reviewer flags a name that isn't in that list, add it there. When in doubt, prefer a slightly more specific name anyway (`SourceTable` rather than `Table`, `Mean` rather than `Avg`).

## Doc comments

Every function gets a `///` block immediately above its `FUNCTION` line:

```
/// One or two sentences of plain-English description. Reference any other function by its full qualified name in single quotes (this is documentation prose, not a call site, so the quotes here are just for readability).
/// @param {type} ParamName – description, lowercase type tag (double, int64, string, datetime, tableref, columnref, scalar)
/// @returns What the function returns, including BLANK()/edge-case behavior. Example: '<YourNamespace>.<PackageName>.<FunctionName>'(sample args) → sample result
```

One `@param` per parameter, in declaration order, plus exactly one `@returns`.

## Package annotations

Every function ends with:

```
    annotation DAXLIB_PackageId = <YourNamespace>.<PackageName>
    annotation DAXLIB_PackageVersion = <version>
```

Both must match `manifest.daxlib`'s `id` and `version` exactly.

## manifest.daxlib

A JSON file despite the extension:

```json
{
  "$schema": "https://raw.githubusercontent.com/daxlib/daxlib/refs/heads/main/schemas/manifest/1.0.0/manifest.1.0.0.schema.json",
  "id": "<YourNamespace>.<PackageName>",
  "version": "<version>",
  "authors": "<your name or handle>",
  "description": "<one sentence>",
  "tags": "<comma-separated tags>",
  "releaseNotes": "<one paragraph>",
  "repositoryUrl": "https://github.com/daxlib/daxlib/tree/main/packages/d/<lowercase packageid>",
  "readme": "/README.md",
  "icon": "/icon.png"
}
```

## Folder structure for submission

```
packages/<first-letter-lowercase-of-packageid>/<packageid-lowercase>/<version>/
  icon.png
  lib/
    functions.tmdl
  manifest.daxlib
  README.md
```

Example: a package with id `Contoso.SixSigma` version `0.1.0` → `packages/c/contoso.sixsigma/0.1.0/`.
