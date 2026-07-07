import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	/** Accepts either a plain next-Schema value or a functional updater
	 * `(draft) => Schema` (mirroring React's setState) — the latter lets a
	 * caller apply an edit relative to whatever the draft is AT THE TIME the
	 * update actually runs (e.g. an undo toast's onClick, fired well after
	 * the click that created it, or an edit handler invoked from a closure
	 * over a since-stale `draft`), without needing to track the live draft
	 * itself via a ref. */
	apply: (next: Schema | ((draft: Schema) => Schema)) => void;
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
	/** Same map useSpecDraft builds internally for validateSpec — returned so
	 * consumers (e.g. SpecEditor) don't need to rebuild an identical
	 * `new Map(plugins.map(...))` from the same plugins array. */
	pluginMap: Map<string, FieldTypePlugin>;
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
	// baselineJson is recomputed only when `baseline` itself changes, not on
	// every render that hands this effect a fresh-identity `schema` (the
	// common case — consumers may build a new array every render). The
	// incoming `schema` still gets stringified per identity-change below;
	// that half is unavoidable since it's the value actually varying.
	const baselineJson = useMemo(() => JSON.stringify(baseline), [baseline]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: guard reads draft/baseline/baselineJson but must run only on prop change
	useEffect(() => {
		if (schema === baseline) return;
		if (JSON.stringify(schema) === baselineJson) return;
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

	// Call-latest ref: consumers need not memoize onDirtyChange — identity
	// churn must not re-fire the notification effect.
	const onDirtyChangeRef = useRef(onDirtyChange);
	useEffect(() => {
		onDirtyChangeRef.current = onDirtyChange;
	});
	useEffect(() => {
		onDirtyChangeRef.current?.(dirty);
	}, [dirty]);

	const apply = useCallback((next: Schema | ((draft: Schema) => Schema)) => {
		setSaveError(null);
		setBaselineConflict(false);
		setDraft((prev) => (typeof next === "function" ? next(prev) : next));
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
		pluginMap,
	};
}
