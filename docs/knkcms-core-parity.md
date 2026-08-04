# Parity with knkCMS core field types

Where fieldkit's catalogue stands against the field types knkCMS core registers, and what each divergence would cost to close. Several ADRs argue from what core does — 0002, 0005, 0008, 0010 — and this is the table behind those arguments.

**Read on 2026-08-04** against fieldkit `6166953` (v0.14.0) and core at `internal/model/`, `pkg/model/`, `web/src/components/field-types/`. Read from source, never from documentation. Re-verify before acting; both repos move.

## How to re-verify

| What | Where |
|---|---|
| core registry | `internal/model/*/` — one `RegisterFieldType(X{})` per type; the id is each type's `ID()` |
| core settings the **backend** interprets | `type *Settings struct` in the same file |
| core settings the **frontend** interprets | `web/src/components/field-types/field-type-*/`, via `name="settings.<key>"` |
| fieldkit registry and settings | `src/schema/field-types/*.ts` |

Core stores `settings` as free-form JSON. A missing Go `Settings` struct does **not** mean "no settings" — it means Go ignores them and React reads them, so both columns matter. Two types below have settings in one place only.

**Counts: core 27, fieldkit 27, 21 ids shared** — `toc_reference` left fieldkit on 2026-08-04 (ADR-0010), taking a shared id with it, and `single_reference` arrived to keep the total at 27.

## A. Compatible — no work

| id | Settings |
|---|---|
| `boolean` `time` | none either side |
| `checkboxes` `radio` | `options` — identical |
| `select` | `options`, `multiple` — identical |
| `media` | `accept`, `max_items` — identical |
| `fieldset` | `blueprint`, `collapsible` — identical (ADR-0003) |
| `list` | `max_items_per_page` — identical (ADR-0005) |
| `virtual_table` | `blueprint`, `always_latest`, `max_records_per_page` — identical |
| `code` `color` `markdown` | core free-form; fieldkit adds `language` / `default_color` / `placeholder` |
| `text` | `placeholder`, `prepend`, `append` — identical |

`virtual_table` is worth a note: core's Go struct also carries `fields`, an inline row schema. It is code-emitted only, the config UI cannot edit it, and the derivation pipeline is instructed never to produce it — so the editable surface really is the three keys fieldkit has.

`media`, `select` and `virtual_table` matched from the start; `fieldset` and `list` were then built to match deliberately, both citing "so seeded specs migrate without a rewrite". That is the established pattern, and section B is worth holding to it.

## B. Divergent — candidates for change

Ranked by seeded data affected.

### B1. `rich_text` — two divergences, both blocking

| | core | fieldkit |
|---|---|---|
| editor config key | `settings.text_type` | `settings.editor_spec` |
| view mode values | `"default"` \| `"minimal"` | `"full"` \| `"compact"` |

**88 `rich_text` fields** across the two Boorberg derivations. In seeded SQL `view_mode` appears 32 times — 18 `"default"`, 14 `"minimal"`. **Neither value is legal in fieldkit.** Every seeded rich-text field needs a fieldkit change or a data migration.

A third spelling exists: core's `outline_tree` reads `settings.text_type_id`, and `title_scope` reads `settings.text_type`.

### B2. `reference` — the settings nearly match; the value does not

| | core | fieldkit |
|---|---|---|
| settings | `blueprints`, `always_latest`, `max_items`, `max_depth`, `attributes`, **`max_items_per_page`**, **`children`** | `blueprints`, `max_items`, `max_depth`, **`pin_mode`**, `attributes` (a `Field[]` Spec, not a `string[]`) |
| value | flat `ContentReferenceFlat[]` with `ancestor_ids`, `parent_id`, `index`; attributes positional | nested `{ id, pin?, attributes?, children? }`; attributes keyed by Accessor |

The value divergence is settled, not open: **ADR-0008** chose fieldkit's nested shape because it makes an orphan unrepresentable, and core maps at its own save/load boundary. It is recorded here because a settings-only comparison makes `reference` look identical when the shapes behind it are not.

The settings row moved after the reading above. #63 rebuilt the plugin: `always_latest` is gone, and `attributes` is gone as a `string[]` — it returns as an Attribute Spec, `Field[]`, not a list of keys. `max_items` is now a pure cap that never changes the value's shape (ADR-0005). #65 then made the value genuinely nest — drag-and-drop, collapse, and a recursive Schema that keeps a branch through a parse — so `max_depth` now has depths to cap; both caps are still declared and unenforced, and #66 owns enforcing them. #68 added `pin_mode`, which is what supersedes `always_latest`: core's boolean said "always latest" where fieldkit's three-valued setting says which *kind* of target a Pin points at, `"none"` being what the boolean's `true` meant. A mapper reads it to decide which of core's two columns to write. #67 then landed `attributes` as an Attribute Spec: typed Fields rather than core's bare strings, with values keyed by Accessor rather than positionally aligned to the settings array — so a mapper has to pair core's array positions with fieldkit's Accessors in both directions, and core's untyped string values have to be read as whatever type the Attribute Field declares.

Open: core's two extra settings keys. **46 `reference` fields** in the derivations.

### B3. `date` — different names, and two core-only concepts

| core | fieldkit |
|---|---|
| `min`, `max` | `min_date`, `max_date` |
| `enable` | `enable_range` |
| `locale`, `validity_role` | — |

`validity_role` is **in production data** — `published_date` ×2, `valid_from`, `valid_until` in the Boorberg legal_norm seed. It drives temporal validity, so it cannot simply be dropped: fieldkit needs it, or the concept needs relocating.

### B4. `section` — same id, opposite purpose

core declares `SectionSettings{ render_card bool }`; fieldkit has `orientation`. fieldkit's `section` is a layout marker whose `fieldComponent` returns `null`, and it expresses core's card intent as a separate `card` type (**ADR-0006**).

One finding worth acting on independently: `render_card` appears **only** in core's Go struct. No frontend code writes or reads it. It may be dead.

### B5. `group` — same id, different cardinality

fieldkit's `group` is repeatable (`min_items`/`max_items`, rows validated at `authors.1.name`). core's has no settings in either place and is a plain container. Confirm core's intent before assuming fieldkit is the odd one out.

### B6. `number` and `array` — fieldkit has settings, core has none

core has no Go struct and no `settings.*` reads for either. fieldkit offers `min`/`max`/`step`/`prepend`/`append` and `mode`/`keys`. Additive rather than conflicting, so nothing breaks — but core cannot author them.

### B7. `textarea`

fieldkit adds `rows`; core has `placeholder` only. Additive.

### B8. `FieldConfig` — core's is a strict subset

core: `name`, `api_accessor`, `required`, `instructions`. fieldkit adds `default_value`, `unique`, `localizable`, `hidden`, `read_only`, `condition` — and **ADR-0011** adds `locked_settings`.

Being a subset means core's stored specs load into fieldkit unchanged, which is what makes the preview in the [`blueprint-review` skill](https://github.com/knkCS/skills/tree/main/blueprint-review) work. It also means core cannot author the six extra keys, and `locked_settings` needs core to populate it for `pin_mode` to be safely frozen.

## C. core-only — not in fieldkit

| core type | Used in the 2 derivations | Settings |
|---|---|---|
| `title_data` | 0 (used in `migration/legal_norm/`) | `blueprint`, `title_blueprint`, `allow_default` |
| `title_scope` | 0 (used in `boorberg_conware_erfassung`) | `target_fields`, `text_type` |
| `ti_overlay` | 0 (whole `typesetting_instructions` track) | — |
| `outline_tree` | 0 | `levels`, `text_type_id` |
| `manipulation_tree` | 0 | `blueprints`, `replacement_blueprints`, `always_latest`, `max_items`, plus frontend-only `enable_validity_filtering`, `latest_release_strategy`, `max_items_per_page` |
| `toc_reference` | 0 | none the backend interprets, and no config UI — core addresses the type *by id* to expand a publication subtree |

**None has derivation-level demand.** All six are knkCMS publishing machinery. Per **ADR-0002** they belong to the Consumer, and **ADR-0010** established the corollary: fieldkit exports the parts to assemble a domain type rather than leaving each Consumer to build one from nothing.

`toc_reference` joined this list on 2026-08-04, and is the corollary's first user: core mints it with `createReferencePlugin({ id: "toc_reference", name: …, maxPerSpec: 1, availableIn: ["blueprint"] })` and gets fieldkit's Reference Tree, browse drawer, count cell, settings editor and Zod schema. The other five still have to be written by hand.

## D. fieldkit-only

`blocks`, `card`, `email`, `slug`, `url` — unreachable from an xml-to-blueprint derivation today. `email`/`url`/`slug` are plausible future core additions; `card` is entangled with B4.

## Decided — do not re-open

| Question | Decision |
|---|---|
| Should `fieldset` store its children? | No — adapter-backed, resolved via `resolveSpec()` (**ADR-0003**, **ADR-0004**) |
| Should `list` be an `array` mode? | No — separate type; one `field_type` must not span incompatible value shapes (**ADR-0005**) |
| Should `section` carry a `render_card` flag? | No — `card` is its own marker (**ADR-0006**) |
| Should fieldkit emit core's flat reference value? | No — nested shape; core maps at its boundary (**ADR-0008**) |
| Should the reference picker know about status/assignee? | No — the adapter describes its filters and columns as Specs (**ADR-0009**) |
| Should fieldkit keep `toc_reference`? | No — it moved to the Consumer on 2026-08-04; fieldkit exports `createReferencePlugin()` (**ADR-0010**) |
| Who decides a setting is unsafe to change? | The Consumer, via `locked_settings` (**ADR-0011**) |

## Pending decisions not yet in code

Verified still absent from the registry on 2026-08-04:

- **`locked_settings`** (ADR-0011) — not yet on `FieldConfig`.

**Landed since this was written:** `single_reference` (ADR-0008), which holds `Reference | null` and which core has no counterpart for; and `toc_reference`'s removal (ADR-0010), which put shared at 21 and core-only at 6 exactly as predicted.

## Two framing questions

1. **Which direction is authoritative?** Every divergence in B closes by changing fieldkit *or* by changing core plus migrating seeded data. B1 and B3 have live data behind them, so those cost money either way. Note that `fieldset` and `list` were both closed by fieldkit adopting core's keys — if that is the standing convention, most of B answers itself.
2. **How far does "generic" go?** With `list` and `fieldset` shipped and `toc_reference` gone, the boundary ADR-0002 drew is holding. The six in section C are the test of it: plugin extension point, or built-in types? `toc_reference` shows the extension point can be made cheap — but only because a reference tree was already there to export.

## Caveats

- Usage counts come from `boor/general/docs/blueprints/` only — the two xml-to-blueprint derivations. The hand-written tracks under `migration/` use more, notably `title_data` and `ti_overlay`. Count those before prioritising.
- `render_card` being dead (B4) is a finding, not a decision.
