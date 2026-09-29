import { blockTypeSpecs, duplicateBlockTypes } from "./block-types";
import { partitionSchemaBySections } from "./partition";
import { partitionTabByCards } from "./partition-cards";
import type { FieldTypePlugin, Position } from "./plugin";
import { allowedInPosition } from "./positions";
import { isSearchWeight } from "./search";
import type { Field } from "./types";
import { toPath, validateSettings } from "./validate-settings";
import { virtualTableRowSpecKind } from "./virtual-table-row-spec";

export type SpecFieldErrorCode =
	| "duplicate_accessor"
	| "empty_name"
	| "empty_accessor"
	| "loose_field_in_carded_tab"
	/** A Virtual Table naming a Blueprint *and* carrying children — two Row
	 * Specs where ADR-0017 allows exactly one. */
	| "virtual_table_row_spec_ambiguous"
	/** A Virtual Table with neither a linked nor an embedded Row Spec. */
	| "virtual_table_row_spec_missing"
	/** A Field in a Position its type does not list (ADR-0022) — a Group in a
	 * Row Spec, a Section in a Reference Spec. At that Field, with the
	 * `position` and the `field_type` as params. It replaced the Row Spec's
	 * own `virtual_table_row_field_type` before any Catalogue shipped, and was
	 * renamed from `position` before the freeze (#223, D7). */
	| "invalid_position"
	/** An Accessor beginning with `_`: reserved in every Position for `_id`,
	 * `_type`, `_order` and what value shapes need later (ADR-0022). */
	| "reserved_accessor"
	/** A `config` key holding a value it does not accept — a `search` other
	 * than `off`, `A`, `B`, `C` or `D`. At the key. */
	| "invalid_config"
	/** `config.search` on a type the Catalogue marks as having no text. At
	 * the key. */
	| "search_without_text"
	/** A Block Type of a Blocks Field repeating the `type` an earlier one
	 * declared — reported at each repeat's `type`. */
	| "duplicate_block_type"
	/** A Reference Field's `blueprints` entry naming a Blueprint an earlier
	 * entry already names — two Reference Specs for one target. At each
	 * repeat's `blueprint`. */
	| "duplicate_blueprint"
	/** A Field whose `field_type` no plugin in the map registers. Its
	 * settings are not checked — there is nothing to check them against. */
	| "unknown_field_type"
	/** A settings key the type's `settingsSchema` does not declare. */
	| "unknown_setting"
	/** A declared setting whose value the type's `settingsSchema` refuses. */
	| "invalid_setting";

export interface SpecFieldError {
	accessor: string;
	/** One of fieldkit's codes, or one a caller's `policy` reports. */
	code: SpecFieldErrorCode | (string & {});
	message: string;
	/**
	 * Where in the Spec the error is, `/`-separated: the Accessor of each
	 * Field from the root, with `children` between a Field and the Fields it
	 * holds, then — for a settings error — `settings` and the key:
	 * `/authors/children/name/settings/placeholder`. A segment holding `/` or
	 * `~` is escaped as in RFC 6901. The grammar is shared with the Go
	 * module's `ValidateSpec` (`conformance/README.md`).
	 */
	path: string;
	/** Detail a message may interpolate, keyed by name — `field_type` for
	 * `unknown_field_type`. Absent when the code says everything. */
	params?: Record<string, unknown>;
}

export interface SpecValidationResult {
	valid: boolean;
	errors: string[];
	fieldErrors: SpecFieldError[];
}

/**
 * An error a caller's policy reports about one Field. `path` is relative to
 * the Field: `""`, the default, is the Field itself, `/config/localizable` a
 * key of it.
 */
export interface SpecPolicyError {
	code: string;
	message: string;
	path?: string;
	params?: Record<string, unknown>;
}

/**
 * A caller's own rules, run on every Field at every depth beside fieldkit's —
 * where a Consumer's policy goes (refusing `localizable: true` on a content
 * Blueprint, say), so that fieldkit ships none. `path` is the Field's own and
 * `position` where it sits. Go's `ValidateSpec` takes the same hook
 * (`WithPolicy`).
 */
export type SpecPolicy = (
	field: Field,
	at: { path: string; position: Position },
) => SpecPolicyError[];

export interface ValidateSpecOptions {
	policy?: SpecPolicy;
	/**
	 * The Spec is a Resolved Spec's `fields` (ADR-0020), validated when a
	 * Release is cut: every rule applies, now also to the Fields each pinned
	 * Blueprint Release was inlined as — so a linked part's Positions are
	 * checked once it is known what it is linked as. A Virtual Table that
	 * links a Blueprint and has children is then resolved, not ambiguous;
	 * that rule is the authored Spec's. Go's `ValidateResolvedSpec`.
	 */
	resolved?: boolean;
}

export function validateSpec(
	fields: Field[],
	plugins: Map<string, FieldTypePlugin>,
	options: ValidateSpecOptions = {},
): SpecValidationResult {
	const errors: string[] = [];
	const fieldErrors: SpecFieldError[] = [];

	// Count fields per type
	const typeCounts = new Map<string, number>();
	for (const field of fields) {
		typeCounts.set(
			field.field_type,
			(typeCounts.get(field.field_type) ?? 0) + 1,
		);
	}

	// Check maxPerSpec constraints
	for (const [typeId, count] of typeCounts) {
		const plugin = plugins.get(typeId);
		if (plugin?.maxPerSpec != null && count > plugin.maxPerSpec) {
			errors.push(
				`Field type "${plugin.name}" (${typeId}) is limited to ${plugin.maxPerSpec} per spec, but ${count} were found`,
			);
		}
	}

	// Every check below but the card-layout rule walks every Spec a Field
	// holds (`nestedSpecs`): a Group's or a Virtual Table's `children`, and
	// the Specs a type holds in its settings — a Block Type's Fields, a
	// Reference Spec — which it names through its plugin's `heldSpecs`. Each
	// field list is its OWN duplicate-accessor namespace: the same accessor
	// reused in a sibling group, in a Block Type, or at a different nesting
	// level is NOT a collision, so `seen` is never shared across lists.
	//
	// Walking settings moves the line ADR-0007 drew for this function, which
	// walked `children` only (#208 for Block Types, ADR-0022 for the Reference
	// Spec). The settings' shape is still read by each plugin, never here.
	checkAccessors(fields, [], plugins, fieldErrors);
	checkCardLayout(fields, fieldErrors);
	checkVirtualTables(
		fields,
		[],
		plugins,
		options.resolved ?? false,
		fieldErrors,
	);
	checkTypesAndSettings(fields, [], plugins, fieldErrors);
	checkBlockTypes(fields, [], plugins, fieldErrors);
	checkSettingsRules(fields, [], plugins, fieldErrors);
	checkFields(fields, [], "root", plugins, options.policy, fieldErrors);
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}

	return { valid: errors.length === 0, errors, fieldErrors };
}

type Segments = readonly (string | number)[];

interface NestedSpec {
	list: Segments;
	fields: Field[];
	position: Position;
}

/**
 * The field lists a Field holds, each with the path segments of the list
 * itself and the Position its Fields sit in: its `children` at `…/children`,
 * in the Position its type names for them (`childrenPosition`) or else its
 * own, and each Spec its type holds in settings (`heldSpecs`) — a Block Type's
 * Fields at `…/settings/allowed_blocks/<i>/fields`, a Reference Spec at
 * `…/settings/spec` (and a resolved linked one at `…/settings/blueprints/<i>/spec`).
 * A Field in a list sits at the list's segments plus
 * its Accessor: the path grammar `conformance/README.md` states and Go's
 * `ValidateSpec` shares.
 *
 * Only a registered type's settings are walked — an unknown type's settings
 * mean nothing to anyone — but its `children` are, as they always were.
 */
function nestedSpecs(
	field: Field,
	segments: Segments,
	position: Position,
	plugins: Map<string, FieldTypePlugin>,
): NestedSpec[] {
	const plugin = plugins.get(field.field_type);
	const lists: NestedSpec[] = [];
	if (field.children?.length) {
		lists.push({
			list: [...segments, "children"],
			fields: field.children,
			position: plugin?.childrenPosition ?? position,
		});
	}
	for (const spec of plugin?.heldSpecs?.(field) ?? []) {
		lists.push({
			list: [...segments, ...spec.segments],
			fields: spec.fields,
			position: spec.position,
		});
	}
	return lists;
}

function checkAccessors(
	fields: Field[],
	list: Segments,
	plugins: Map<string, FieldTypePlugin>,
	fieldErrors: SpecFieldError[],
): void {
	const seen = new Map<string, number>();
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		const path = toPath(segments);
		// Card markers are exempt from the empty-name rule: a card's title is
		// OPTIONAL (empty = untitled, card-layout Decision 3). Accessor rules
		// below apply to them unchanged.
		if (field.field_type !== "card" && !field.config.name.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_name",
				message: "Name must not be empty",
				path,
			});
		}
		if (!accessor.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_accessor",
				message: "Accessor must not be empty",
				path,
			});
		} else {
			seen.set(accessor, (seen.get(accessor) ?? 0) + 1);
		}
		// Reserved in every Position (ADR-0022): `_id`, `_type` and `_order`
		// sit beside a row's or a Block's values, and a Field named like one
		// would collide with it. Go's `ValidateSpec` has the same rule.
		if (accessor.startsWith("_")) {
			fieldErrors.push({
				accessor,
				code: "reserved_accessor",
				message: `Accessor "${accessor}" must not begin with "_"`,
				path,
			});
		}
		for (const nested of nestedSpecs(field, segments, "root", plugins)) {
			checkAccessors(nested.fields, nested.list, plugins, fieldErrors);
		}
	}
	for (const [accessor, count] of seen) {
		if (count > 1) {
			fieldErrors.push({
				accessor,
				code: "duplicate_accessor",
				message: `Duplicate accessor "${accessor}"`,
				path: toPath([...list, accessor]),
			});
		}
	}
}

/**
 * Card-layout Decision 4: once a tab contains a card marker, every field in
 * that tab lives in a card — a field BEFORE the tab's first marker is an
 * error, flagged per field so shells outline and tab badges count it. The
 * editor never produces this state: insertCard AND moveCardToSection
 * (0.13.0, #46) both auto-wrap a target tab's loose fields first — the
 * rule catches hand-written schemas. The renderer still degrades gracefully (implicit
 * untitled card) — a schema is data; this rule only reports the violation.
 * Top-level only: cards inside groups are a non-goal.
 *
 * Go's `ValidateSpec` enforces the same rule (`cardLayout` in
 * `go/cards.go`), so it agrees with `commons/fieldspec`'s system-field
 * merge, which places a missing system Field after a leading card rather than
 * manufacture this state.
 */
function checkCardLayout(fields: Field[], fieldErrors: SpecFieldError[]): void {
	for (const tab of partitionSchemaBySections(fields).tabs) {
		const { cards, hasCards } = partitionTabByCards(tab.fields);
		// No separate `cards.length === 0` check: partitionTabByCards only
		// ever returns an empty `cards` array when hasCards is ALSO false
		// (an empty tab, or one with no card markers), so `!hasCards` already
		// covers it.
		if (!hasCards || cards[0].card !== null) continue;
		for (const loose of cards[0].fields) {
			fieldErrors.push({
				accessor: loose.config.api_accessor,
				code: "loose_field_in_carded_tab",
				message: `Field "${loose.config.api_accessor}" must be inside a card`,
				path: toPath([loose.config.api_accessor]),
			});
		}
	}
}

/**
 * ADR-0017: a Virtual Table declares its Row Spec in exactly one of two ways —
 * a linked Blueprint in `settings.blueprint`, or an embedded one in its own
 * `children`. What a Row Spec may hold is the `row` Position (ADR-0022),
 * which `checkFields` enforces for every container alike.
 *
 * Checked here rather than in the plugin's `toZodType`, because an authored
 * Spec with two Row Specs is a Spec the Author must fix before saving, not a
 * value to reject at submit: the editor shows these against the offending
 * Field the way it shows a duplicate Accessor.
 *
 * Walks every nested Spec like the accessor check, so a Virtual Table inside a
 * Group, or declared among a Block Type's Fields, is checked too.
 *
 * `resolveSpec()` puts a linked Row Spec into `children` (ADR-0004), so a
 * *Resolved* linked Virtual Table names a Blueprint and has children at once.
 * On an authored Spec that is two Row Specs; with `resolved`, the Spec is a
 * Resolved Spec's `fields` and it is one resolved Row Spec, whose Fields the
 * Position check then reaches (ADR-0020).
 */
function checkVirtualTables(
	fields: Field[],
	list: Segments,
	plugins: Map<string, FieldTypePlugin>,
	resolved: boolean,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const segments = [...list, field.config.api_accessor];
		if (field.field_type === "virtual_table") {
			checkVirtualTable(field, segments, resolved, fieldErrors);
		}
		for (const nested of nestedSpecs(field, segments, "root", plugins)) {
			checkVirtualTables(
				nested.fields,
				nested.list,
				plugins,
				resolved,
				fieldErrors,
			);
		}
	}
}

function checkVirtualTable(
	field: Field,
	segments: Segments,
	resolved: boolean,
	fieldErrors: SpecFieldError[],
): void {
	const accessor = field.config.api_accessor;
	const path = toPath(segments);
	const kind = virtualTableRowSpecKind(field);

	if (kind === "both" && !resolved) {
		fieldErrors.push({
			accessor,
			code: "virtual_table_row_spec_ambiguous",
			message: `Virtual Table "${accessor}" has both a linked and an embedded Row Spec; it must have exactly one`,
			path,
		});
	} else if (kind === "neither") {
		fieldErrors.push({
			accessor,
			code: "virtual_table_row_spec_missing",
			message: `Virtual Table "${accessor}" has no Row Spec: link a Blueprint or declare its Fields`,
			path,
		});
	}
}

/**
 * ADR-0018: every Field names a registered type, and its `settings` are what
 * that type's `settingsSchema` declares — nothing more, and each of the right
 * shape. The same rule, over the same schemas, is the Go module's
 * `ValidateSpec`; the shared conformance fixtures hold the two to one answer.
 *
 * A type without a `settingsSchema` accepts any settings, as every type did
 * before the Catalogue. A Field of an unknown type is reported once and its
 * settings are left alone; its children are still walked, as every check here
 * walks `children` whatever holds them. A Spec held in settings is walked the
 * same way, each Field against its own type.
 */
function checkTypesAndSettings(
	fields: Field[],
	list: Segments,
	plugins: Map<string, FieldTypePlugin>,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		const plugin = plugins.get(field.field_type);
		if (!plugin) {
			fieldErrors.push({
				accessor,
				code: "unknown_field_type",
				message: `Field "${accessor}" has an unknown type "${field.field_type}"`,
				path: toPath(segments),
				params: { field_type: field.field_type },
			});
		} else if (plugin.settingsSchema) {
			const settingsPath = toPath([...segments, "settings"]);
			for (const error of validateSettings(
				plugin.settingsSchema,
				field.settings,
			)) {
				fieldErrors.push({
					accessor,
					code: error.code,
					message:
						error.code === "unknown_setting"
							? `Field "${accessor}" has an unknown setting "${error.path}"`
							: `Field "${accessor}" has an invalid setting "${error.path}"`,
					path: settingsPath + error.path,
				});
			}
		}
		for (const nested of nestedSpecs(field, segments, "root", plugins)) {
			checkTypesAndSettings(nested.fields, nested.list, plugins, fieldErrors);
		}
	}
}

/**
 * The rules across a Blocks Field's settings that its settings schema cannot
 * state: no two Block Types share a `type`, and a Block Type's `fields` is a
 * list of Fields — one that is not cannot be walked, and is one
 * `invalid_setting` rather than half a Spec. Go's `ValidateSpec` runs the same
 * rules as the `blocks` type's hook.
 */
function checkBlockTypes(
	fields: Field[],
	list: Segments,
	plugins: Map<string, FieldTypePlugin>,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		for (const index of duplicateBlockTypes(field)) {
			fieldErrors.push({
				accessor,
				code: "duplicate_block_type",
				message: `Field "${accessor}" has Block Types sharing one type`,
				path: toPath([
					...segments,
					"settings",
					"allowed_blocks",
					index,
					"type",
				]),
			});
		}
		for (const invalid of blockTypeSpecs(field).invalid) {
			fieldErrors.push({
				accessor,
				code: "invalid_setting",
				message: `Field "${accessor}" has an invalid setting "${toPath(invalid.slice(1))}"`,
				path: toPath([...segments, ...invalid]),
			});
		}
		for (const nested of nestedSpecs(field, segments, "root", plugins)) {
			checkBlockTypes(nested.fields, nested.list, plugins, fieldErrors);
		}
	}
}

/**
 * The rules across a Field's settings its type states through its plugin's
 * `settingsRules` — a Reference Field's `blueprints` entries naming one
 * Blueprint twice, a Reference Spec that is not a list of Fields — each at
 * the Field's path plus the rule's segments. Walks every nested Spec, as the
 * other checks do.
 */
function checkSettingsRules(
	fields: Field[],
	list: Segments,
	plugins: Map<string, FieldTypePlugin>,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		const plugin = plugins.get(field.field_type);
		for (const error of plugin?.settingsRules?.(field) ?? []) {
			fieldErrors.push({
				accessor,
				code: error.code,
				message: error.message,
				path: toPath([...segments, ...error.segments]),
			});
		}
		for (const nested of nestedSpecs(field, segments, "root", plugins)) {
			checkSettingsRules(nested.fields, nested.list, plugins, fieldErrors);
		}
	}
}

/**
 * The rules that need to know where a Field sits, then the caller's policy —
 * one walk that carries the Position down.
 *
 * - **Position** (ADR-0022): a Field whose type does not list the Position it
 *   sits in is `invalid_position`. One check for every container: it is the Row
 *   Spec's allow-list (ADR-0017) and the Reference Spec's rule, each
 *   expressed as the Positions a type declares, and whatever the next
 *   container needs. An unregistered type is `unknown_field_type` already
 *   and is not reported twice.
 * - **`config.search`**: `off` or a weight `A`–`D`, and only on a type the
 *   Catalogue marks as having text (`catalogue.hasText`). Unset — `null`,
 *   `""` — is absent (ADR-0021).
 */
function checkFields(
	fields: Field[],
	list: Segments,
	position: Position,
	plugins: Map<string, FieldTypePlugin>,
	policy: SpecPolicy | undefined,
	fieldErrors: SpecFieldError[],
): void {
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		const segments = [...list, accessor];
		const path = toPath(segments);
		const plugin = plugins.get(field.field_type);
		if (plugin && !allowedInPosition(plugin, position)) {
			fieldErrors.push({
				accessor,
				code: "invalid_position",
				message: `Field "${accessor}" of type "${field.field_type}" is not allowed in position "${position}"`,
				path,
				params: { position, field_type: field.field_type },
			});
		}
		const search: unknown = field.config.search;
		if (search !== undefined && search !== null && search !== "") {
			const searchPath = toPath([...segments, "config", "search"]);
			if (!isSearchWeight(search)) {
				fieldErrors.push({
					accessor,
					code: "invalid_config",
					message: `Field "${accessor}" has an invalid search setting`,
					path: searchPath,
				});
			} else if (plugin && !plugin.catalogue?.hasText) {
				fieldErrors.push({
					accessor,
					code: "search_without_text",
					message: `Field "${accessor}" of type "${field.field_type}" has no text to search`,
					path: searchPath,
				});
			}
		}
		for (const error of policy?.(field, { path, position }) ?? []) {
			fieldErrors.push({
				accessor,
				code: error.code,
				message: error.message,
				path: path + (error.path ?? ""),
				...(error.params ? { params: error.params } : {}),
			});
		}
		for (const nested of nestedSpecs(field, segments, position, plugins)) {
			checkFields(
				nested.fields,
				nested.list,
				nested.position,
				plugins,
				policy,
				fieldErrors,
			);
		}
	}
}
