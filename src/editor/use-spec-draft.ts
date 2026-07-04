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

	// Reset guard: a new prop identity with EQUAL content is ignored
	// (consumers may build fresh arrays every render). Genuinely new
	// content adopts the new baseline, but a dirty draft is KEPT — an
	// author's in-progress work must survive a background refetch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: guard reads draft/baseline but must run only on prop change
	useEffect(() => {
		if (schema === baseline) return;
		if (JSON.stringify(schema) === JSON.stringify(baseline)) return;
		const wasDirty = draft !== baseline;
		setBaseline(schema);
		if (!wasDirty) setDraft(schema);
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
		setDraft(next);
	}, []);

	const save = useCallback(async () => {
		if (!validation.valid || saving) return;
		setSaving(true);
		setSaveError(null);
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
	};
}
