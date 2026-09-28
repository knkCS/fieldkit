// src/renderer/spec-form/mint-row-ids.tsx

import { useEffect, useMemo } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { mintMissingIds } from "../../schema/row-ids";
import type { Schema } from "../../schema/types";
import { fieldProducesValue } from "../../schema/zod-builder";
import { useFieldKit } from "../provider";

/**
 * Mints an `_id` into every row the form holds without one (ADR-0023) — a
 * value stored before rows carried ids, or by a Consumer that never minted
 * them — so that its rows validate, and are stored with ids on the next save.
 *
 * Into the form's **defaults**, not only its values: a Field whose value is
 * still its default gets the minted value as its new default too
 * (`resetField`), so opening a record does not make the form dirty. A value
 * that already differs from its default is dirty anyway, and is minted into
 * in place.
 *
 * Top-level Fields only, and only those whose type mints ids: a container
 * mints into what it holds, so a Group inside a Fieldset is reached through
 * the Fieldset. Watched rather than run once, because a Consumer commonly
 * `reset()`s the form with a fetched record after SpecForm has mounted.
 *
 * Renders nothing. A component rather than a hook in SpecForm's body, because
 * read mode must not call react-hook-form's hooks.
 */
export function MintRowIds({ schema }: { schema: Schema }) {
	const { control, resetField, setValue } = useFormContext();
	const { defaultValues } = useFormState({ control });
	const { getAllPlugins } = useFieldKit();
	const plugins = getAllPlugins();

	const holders = useMemo(() => {
		const minting = new Set(plugins.filter((p) => p.mintIds).map((p) => p.id));
		return schema.filter(
			(field) => fieldProducesValue(field) && minting.has(field.field_type),
		);
	}, [schema, plugins]);

	const names = useMemo(
		() => holders.map((field) => field.config.api_accessor),
		[holders],
	);
	const values = useWatch({ control, name: names }) as unknown[];

	useEffect(() => {
		holders.forEach((field, index) => {
			const name = field.config.api_accessor;
			const value = values[index];
			if (value === undefined) return;
			const minted = mintMissingIds([field], { [name]: value }, plugins)[name];
			if (minted === value) return;
			const initial = (defaultValues as Record<string, unknown> | undefined)?.[
				name
			];
			if (JSON.stringify(initial) === JSON.stringify(value)) {
				resetField(name, { defaultValue: minted });
			} else {
				setValue(name, minted, { shouldDirty: true });
			}
		});
	}, [holders, values, plugins, defaultValues, resetField, setValue]);

	return null;
}
MintRowIds.displayName = "MintRowIds";
