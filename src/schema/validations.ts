// src/schema/validations.ts
import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";
import { isUnset } from "./unset";

/**
 * The validations a Field may declare beside its settings, each a rule its
 * type may or may not honour: `min_length`, `max_length` and `pattern` live in
 * `field.validation`, `unique` in `field.config` (it spans Contents, so only a
 * host can check it). `pattern_message` is not one of its own: it is
 * `pattern`'s message, and applies exactly where `pattern` does.
 *
 * A type's Catalogue entry lists the ones it honours (`validations`), because
 * a validation a type does not honour is silently ignored — a `min_length` on
 * a date (#313). A date's limits are `settings.min_date`/`max_date`, a
 * number's `settings.min`/`max`.
 */
export type ValidationKey = "min_length" | "max_length" | "pattern" | "unique";

/** Every validation, in the order the Catalogue and the editor list them. */
export const VALIDATION_KEYS: readonly ValidationKey[] = [
	"min_length",
	"max_length",
	"pattern",
	"unique",
];

/**
 * The validations a plugin honours. A plugin without Catalogue facts — a
 * Consumer's own type, which no Catalogue lists — is not judged: every
 * validation is offered, and its own `toZodType` decides what it reads.
 */
export function applicableValidations(
	plugin: FieldTypePlugin | undefined,
): readonly ValidationKey[] {
	if (!plugin?.catalogue) return VALIDATION_KEYS;
	const declared = plugin.catalogue.validations ?? [];
	return VALIDATION_KEYS.filter((key) => declared.includes(key));
}

/** One validation a Field declares that its type does not honour. */
export interface InapplicableValidation {
	key: ValidationKey | "pattern_message";
	/** Where it sits in the Field: `["validation", "min_length"]`,
	 * `["config", "unique"]`. */
	segments: readonly [string, string];
}

/**
 * The validations a Field declares that its type does not honour, in
 * `VALIDATION_KEYS` order. A declaration is a value that is not Unset
 * (ADR-0021), and for `unique` only `true`: `false` asks for nothing, and is
 * what the editor's checkbox writes when it is cleared.
 */
export function inapplicableValidations(
	field: Field,
	plugin: FieldTypePlugin | undefined,
): InapplicableValidation[] {
	const applicable = applicableValidations(plugin);
	const validation = (field.validation ?? {}) as Record<string, unknown>;
	const found: InapplicableValidation[] = [];
	for (const key of ["min_length", "max_length", "pattern"] as const) {
		if (!applicable.includes(key) && !isUnset(validation[key])) {
			found.push({ key, segments: ["validation", key] });
		}
	}
	if (!applicable.includes("pattern") && !isUnset(validation.pattern_message)) {
		found.push({
			key: "pattern_message",
			segments: ["validation", "pattern_message"],
		});
	}
	if (!applicable.includes("unique") && field.config.unique === true) {
		found.push({ key: "unique", segments: ["config", "unique"] });
	}
	return found;
}

/**
 * The validations an editor offers on a Field: the ones its type honours —
 * `pattern_message` with `pattern` — and any it declares that the type does
 * not, so an author can clear what `validateSpec()` refuses rather than be
 * stuck with it. Empty means there is nothing to show: a date, a select.
 */
export function offeredValidations(
	field: Field,
	plugin: FieldTypePlugin | undefined,
): ReadonlySet<InapplicableValidation["key"]> {
	const offered = new Set<InapplicableValidation["key"]>(
		applicableValidations(plugin),
	);
	if (offered.has("pattern")) offered.add("pattern_message");
	for (const { key } of inapplicableValidations(field, plugin)) {
		offered.add(key);
	}
	return offered;
}
