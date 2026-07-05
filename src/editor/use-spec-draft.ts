import { useCallback, useEffect, useMemo, useState } from "react";
import {
	partitionSchemaBySections,
	type SpecPartition,
} from "../schema/partition";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import {
	type SpecValidationResult,
	validateSpec,
} from "../schema/validate-spec";

export interface SpecDraft {
	draft: Schema;
	partition: SpecPartition;
	validation: SpecValidationResult;
	dirty: boolean;
	apply: (next: Schema) => void;
	save: () => Promise<void>;
	saving: boolean;
	saveError: unknown | null;
	discard: () => void;
	/**
	 * Amendment 3: true when a genuinely content-changed `schema` prop arrived
	 * while the draft was dirty — the draft is kept (an author's in-progress
	 * work must survive a background refetch), but Save would now overwrite
	 * whatever just arrived. Cleared by `apply`, `save`, and `discard` — any
	 * of those is the author acting on the current state, at which point the
	 * notice has served its purpose.
	 */
	baselineConflict: boolean;
}

export function useSpecDraft(
	schema: Schema,
	plugins: FieldTypePlugin[],
	onCommit: (schema: Schema) => void | Promise<void>,
	onDirtyChange?: (dirty: boolean) => void,
): SpecDraft {
	const [baseline, setBaseline] = useState<Schema>(schema);
	const [draft, setDraft] = useState<Schema>(schema);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<unknown | null>(null);
	const [baselineConflict, setBaselineConflict] = useState(false);

	// Reset guard: a new prop identity with EQUAL content is ignored
	// (consumers may build fresh arrays every render). Genuinely new
	// content adopts the new baseline, but a dirty draft is KEPT — an
	// author's in-progress work must survive a background refetch. When that
	// happens, flag baselineConflict so the host can warn the author that
	// Save will now overwrite the incoming content (Amendment 3).
	//
	// F6: BEFORE that conflict check, handle the echo of our OWN save. A
	// synchronous `onCommit` (e.g. `onCommit={setSchema}`, explicitly allowed
	// by the `void | Promise<void>` signature) can flush the new `schema`
	// prop before `save()`'s post-await `setBaseline(draft)` continuation has
	// run — so this effect can see new-content `schema` vs. the still-stale
	// `baseline` while `dirty` is (at that instant, truthfully) still true.
	// That is NOT a background conflict: if the incoming content matches the
	// CURRENT DRAFT byte-for-byte, it can only be our own save's echo,
	// regardless of timing — adopt it as the new baseline silently instead
	// of latching a false "changed in the background" warning.
	// biome-ignore lint/correctness/useExhaustiveDependencies: guard reads draft/baseline but must run only on prop change
	useEffect(() => {
		if (schema === baseline) return;
		if (JSON.stringify(schema) === JSON.stringify(baseline)) return;
		if (JSON.stringify(schema) === JSON.stringify(draft)) {
			setBaseline(schema);
			return;
		}
		const wasDirty = draft !== baseline;
		setBaseline(schema);
		if (!wasDirty) setDraft(schema);
		else setBaselineConflict(true);
	}, [schema]);

	const partition = useMemo(() => partitionSchemaBySections(draft), [draft]);
	const pluginMap = useMemo(
		() => new Map(plugins.map((p) => [p.id, p])),
		[plugins],
	);
	const validation = useMemo(
		() => validateSpec(draft, pluginMap),
		[draft, pluginMap],
	);

	const dirty = draft !== baseline;

	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);

	const apply = useCallback((next: Schema) => {
		setSaveError(null);
		setBaselineConflict(false);
		setDraft(next);
	}, []);

	// Invariant: baseline always tracks the last successfully committed
	// content. If the user discards or edits while a save is in flight and
	// the save then succeeds, the baseline advances to the committed
	// snapshot — dirty then truthfully reflects draft-vs-committed, and
	// discard restores the committed content.
	const save = useCallback(async () => {
		if (!validation.valid || saving) return;
		setSaving(true);
		setSaveError(null);
		setBaselineConflict(false);
		try {
			await onCommit(draft);
			setBaseline(draft); // advance ONLY on success
		} catch (error) {
			setSaveError(error);
		} finally {
			setSaving(false);
		}
	}, [draft, validation.valid, saving, onCommit]);

	const discard = useCallback(() => {
		setSaveError(null);
		setBaselineConflict(false);
		setDraft(baseline);
	}, [baseline]);

	return {
		draft,
		partition,
		validation,
		dirty,
		apply,
		save,
		saving,
		saveError,
		discard,
		baselineConflict,
	};
}
