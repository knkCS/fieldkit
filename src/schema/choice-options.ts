// src/schema/choice-options.ts
import { z } from "zod";
import { foldLetters } from "./accessor";
import type { SettingsRuleError } from "./plugin";
import type { Field } from "./types";

/**
 * One **Option** of a choice Field — `select`, `radio`, `checkboxes`
 * (ADR-0028). The Key is what Content stores and templates read; the Label is
 * what an Author and an Editor see.
 */
export interface ChoiceOption {
	key: string;
	label: string;
}

/** The longest Key an Option may have. */
export const OPTION_KEY_MAX_LENGTH = 64;

/**
 * What an Option's Key must match (ADR-0028): lowercase ASCII letters, digits,
 * `_` and `-`, starting with a letter or digit, at most 64 characters. Strict,
 * because a Key is stored in Content and read by templates. Every option key
 * in core's data already fits.
 *
 * It is written once, here, and reaches Go through the Catalogue's `pattern`
 * — so it stays inside what JS and RE2 read alike.
 */
export const OPTION_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * The `options` setting the three choice types share: an ordered list of
 * Key and Label, list order being display order (ADR-0028). A Label is
 * non-empty — an Unset one is stripped before the check, so it is reported
 * missing at the Label. The old `{ [key]: label }` map is `invalid_setting`
 * at `options`: no reader of it is kept.
 *
 * Unique Keys are a rule across the list a schema cannot state —
 * {@link choiceOptionsRules}.
 */
export const choiceOptionsSchema = z.array(
	z
		.object({
			key: z.string().regex(OPTION_KEY_PATTERN),
			label: z.string().min(1),
		})
		.strict(),
);

/**
 * The Options a choice Field's settings hold, read leniently: anything but a
 * list holds none, and an entry that is not an object, or whose Key is not a
 * string, is skipped. A missing Label reads as `""`. What is wrong with them
 * is `validateSpec`'s to report, not the reader's — a renderer shows what it
 * can.
 */
export function choiceOptions(settings: unknown): ChoiceOption[] {
	if (typeof settings !== "object" || settings === null) return [];
	const options = (settings as { options?: unknown }).options;
	if (!Array.isArray(options)) return [];
	const read: ChoiceOption[] = [];
	for (const entry of options) {
		if (typeof entry !== "object" || entry === null) continue;
		const { key, label } = entry as { key?: unknown; label?: unknown };
		if (typeof key !== "string") continue;
		read.push({ key, label: typeof label === "string" ? label : "" });
	}
	return read;
}

/**
 * Selected Keys in the Options' order — the order every reader shows them in
 * (ADR-0028), whatever order the value happens to hold them in. A Key no
 * Option has comes after the known ones, in the value's order, so a reader
 * that shows it raw still shows it. Non-strings are dropped.
 */
export function inOptionOrder(
	options: readonly ChoiceOption[],
	keys: readonly unknown[],
): string[] {
	const rank = new Map<string, number>();
	options.forEach((option, index) => {
		if (!rank.has(option.key)) rank.set(option.key, index);
	});
	const strings = keys.filter((key): key is string => typeof key === "string");
	const known = strings.filter((key) => rank.has(key));
	const unknown = strings.filter((key) => !rank.has(key));
	known.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
	return [...known, ...unknown];
}

/** The Label of the first Option with `key`, or `undefined` for none. */
export function optionLabel(
	options: readonly ChoiceOption[],
	key: string,
): string | undefined {
	return options.find((option) => option.key === key)?.label;
}

/**
 * The rule across a choice Field's Options its schema cannot state: a Key is
 * unique within the Field (ADR-0028). `duplicate_option_key` at each repeat's
 * `key`, as `duplicate_blueprint` is at each repeat. A Key that is Unset — not
 * a string, or `""` — repeats nothing; the schema reports it missing. Go runs
 * the same rule (`duplicateOptionKeys`, `go/rules.go`).
 */
export function choiceOptionsRules(field: Field): SettingsRuleError[] {
	const settings = field.settings as { options?: unknown } | null | undefined;
	const options = settings?.options;
	if (!Array.isArray(options)) return [];
	const errors: SettingsRuleError[] = [];
	const seen = new Set<string>();
	options.forEach((entry, index) => {
		if (typeof entry !== "object" || entry === null) return;
		const key = (entry as { key?: unknown }).key;
		if (typeof key !== "string" || key === "") return;
		if (seen.has(key)) {
			errors.push({
				segments: ["settings", "options", index, "key"],
				code: "duplicate_option_key",
				message: `Option key "${key}" is used by an earlier option`,
			});
		} else {
			seen.add(key);
		}
	});
	return errors;
}

/**
 * The Key a Label suggests, which the editor presets while a new Option's Key
 * still follows its Label: German letters spelled out and other accents
 * stripped (as {@link accessorFromName} does), lowercased, every run of other
 * characters turned into one `-`, then trimmed to {@link OPTION_KEY_PATTERN} —
 * no leading `-` or `_`, no trailing `-`, at most 64 characters.
 *
 * `"Sehr groß"` → `"sehr-gross"`, `"12 Monate"` → `"12-monate"`. `""` when
 * nothing usable is left; the Author then types a Key.
 *
 * A preset only: a Key already stored is never re-derived from it.
 */
export function optionKeyFromLabel(label: string): string {
	return foldLetters(label)
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "-")
		.replace(/^[-_]+/, "")
		.slice(0, OPTION_KEY_MAX_LENGTH)
		.replace(/-+$/, "");
}
