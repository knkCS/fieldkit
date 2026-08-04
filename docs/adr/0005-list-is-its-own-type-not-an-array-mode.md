# `list` is its own field type, not a third array mode

`list` holds `string[]` — a flat array of scalars, with pagination and search over the entries. It is a separate field type rather than a `mode: "scalar"` added to `array`, because neither existing array mode produces that value: `dynamic` yields `{key, value}[]` and `keyed` yields `Record<string, string>`. Folding `list` in would make one `field_type` span three mutually incompatible value shapes, and would migrate knkCMS core's eight seeded `list` fields for no gain.

`array` already spans two shapes behind one id. That is a wart to live with, not a pattern to extend.

> Core's side of this comparison is tabulated in [knkCMS core parity](../knkcms-core-parity.md).
