# daxlib package formatting guide

The conventions this CLI audits, in one place. This mirrors the `daxlib-udf-formatter` Claude skill used to produce packages in this format.

## Function naming

Every function name is fully qualified and quoted: `FUNCTION '<YourNamespace>.<PackageName>.<FunctionName>' = (...)`. `<YourNamespace>` is your own vendor/brand prefix (e.g. a company or personal handle) — daxlib only requires it not start with `Dax.` or `DaxLib.`. A call from one function to another — same package or a different one — must also use the fully qualified quoted name, e.g. `'YourNamespace.YourLibrary.SomeOtherFunction'(Table, ValueColumn, OrderColumn)`, never the short name.

## Parameter types

- A table parameter is always `TABLEREF`, never `TABLE` — in both the parameter declaration and the `@param {tableref}` doc tag.
- A column parameter is `COLUMNREF`.
- A scalar parameter uses the most specific type when it's fixed for every caller: `DOUBLE`, `INTEGER`, `STRING`, `DATETIME`. Fall back to `SCALAR` only when the real type genuinely varies by caller, and say so in the doc comment.

## Doc comments

Every function gets a `///` block immediately above its `FUNCTION` line:

```
/// One or two sentences of plain-English description. Reference any other function by its full qualified name in single quotes.
/// @param {type} ParamName – description, lowercase type tag (double, integer, string, datetime, tableref, columnref, scalar)
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
