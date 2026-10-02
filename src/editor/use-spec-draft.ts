import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	partitionSchemaBySections,
	type SpecPartition,
} from "../schema/partition";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { canonicalSpecSettings } from "../schema/unset";
import {
	type SpecValidationResult,
	validateSpec,
} from "../schema/validate-spec";
import { deepEqual } from "./deep-equal";

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

/**
 * What a host that commits from its own page header needs of the draft
 * (fieldkit#315). Neither callback need be memoized — the hook latches the
 * latest one, as it does `onDirtyChange`.
 */
export interface SpecDraftOptions {
	/** Every change to the draft, its settings canonical (ADR-0021) — the
	 * form the host saves. Not called on mount: the draft then IS `schema`. */
	onDraftChange?: (draft: Schema) => void;
	/** The draft's validation, on mount and on every change, so a host's own
	 * Save can refuse while the draft has errors. */
	onValidationChange?: (validation: SpecValidationResult) => void;
}

/** How many handed-out drafts the hook remembers while waiting for the host
 * to commit one. Each is a `Schema` sharing structure with its neighbours;
 * the cap only bounds a session that edits for very long without a save. */
const HANDED_DRAFTS_CAP = 200;

export function useSpecDraft(
	schema: Schema,
	plugins: FieldTypePlugin[],
	onCommit?: (schema: Schema) => void | Promise<void>,
	onDirtyChange?: (dirty: boolean) => void,
	options?: SpecDraftOptions,
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
	// CURRENT DRAFT, it can only be our own save's echo, regardless of
	// timing — adopt it as the new baseline silently instead of latching a
	// false "changed in the background" warning.
	// Comparisons are deepEqual, not JSON.stringify byte-equality: backends
	// that store the schema in Postgres jsonb re-order object keys on
	// read-back, so a post-save echo is content-equal but never
	// byte-identical (#37). They are also blind to how an Unset setting is
	// spelled: a save commits canonical settings (ADR-0021), so its echo
	// lacks the `settings: null` the draft may still hold, and is the same
	// content all the same.
	//
	// The echo adopts the DRAFT as the baseline, not the incoming `schema`:
	// `dirty` is by reference, and a host that commits from its own header
	// (fieldkit#315) passes back a copy — its own, canonical, re-read — so
	// adopting `schema` would leave the draft dirty forever after a save.
	//
	// That host's save can also be overtaken: the author edits on while it is
	// in flight, and the content that comes back matches a draft handed out
	// EARLIER, not the current one. `handedRef` remembers what onDraftChange
	// handed out since the baseline last moved, so such an echo becomes the
	// baseline silently too — the draft stays dirty with the later edits, and
	// Discard returns to what was actually saved.
	const handedRef = useRef<Schema[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: guard reads draft/baseline but must run only on prop change
	useEffect(() => {
		if (schema === baseline) return;
		if (sameContent(schema, baseline)) return;
		if (sameContent(schema, draft)) {
			handedRef.current = [];
			setBaseline(draft);
			return;
		}
		const handed = handedRef.current;
		const echoed = handed.findIndex((h) => sameContent(schema, h));
		if (echoed !== -1) {
			handedRef.current = handed.slice(echoed + 1);
			setBaseline(handed[echoed]);
			return;
		}
		handedRef.current = [];
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

	// fieldkit#315: the host-owned commit's two channels, latched the same way.
	const optionsRef = useRef(options);
	useEffect(() => {
		optionsRef.current = options;
	});
	useEffect(() => {
		optionsRef.current?.onValidationChange?.(validation);
	}, [validation]);
	const handedOutRef = useRef(draft);
	useEffect(() => {
		if (draft === handedOutRef.current) return; // mount: the draft IS `schema`
		handedOutRef.current = draft;
		const onDraftChange = optionsRef.current?.onDraftChange;
		if (!onDraftChange) return;
		handedRef.current = [...handedRef.current, draft].slice(-HANDED_DRAFTS_CAP);
		onDraftChange(canonicalSpecSettings(draft));
	}, [draft]);

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
		// Without onCommit the host commits from its own Save (fieldkit#315).
		if (!onCommit || !validation.valid || saving) return;
		setSaving(true);
		setSaveError(null);
		setBaselineConflict(false);
		try {
			// Settings are stored canonical (ADR-0021): an Unset setting is
			// absent, not "" or null. The draft itself is left as it is — the
			// author's controls may still hold the empty value they cleared to.
			await onCommit(canonicalSpecSettings(draft));
			handedRef.current = [];
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

/** Equal content, with every Unset setting read as absent (ADR-0021). */
function sameContent(a: Schema, b: Schema): boolean {
	return deepEqual(canonicalSpecSettings(a), canonicalSpecSettings(b));
}
