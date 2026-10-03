// src/table/edit-drawer.tsx

import { zodResolver } from "@hookform/resolvers/zod";
import { DrawerRoot } from "@knkcs/anker/components";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldKitProvider } from "../renderer/provider";
import { SpecForm } from "../renderer/spec-form/spec-form";
import { formDefaults } from "../schema/form-defaults";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { fieldProducesValue, specToZodSchema } from "../schema/zod-builder";

export interface EditDrawerProps {
	schema: Schema;
	plugins: FieldTypePlugin[];
	initialValues?: Record<string, unknown>;
	isOpen: boolean;
	onClose: () => void;
	onSave: (values: Record<string, unknown>) => void;
	title?: string;
}

export function EditDrawer({
	schema,
	plugins,
	initialValues,
	isOpen,
	onClose,
	onSave,
	title = "Edit",
}: EditDrawerProps) {
	const zodSchema = useMemo(
		() => specToZodSchema(schema, plugins),
		[schema, plugins],
	);

	// A row stored before rows carried `_id`s gets them here, in the defaults,
	// so the drawer opens clean and the save stores them (ADR-0023) — the same
	// normalisation SpecForm applies to a form it is handed.
	const defaults = useMemo(
		() => formDefaults(schema, initialValues, plugins),
		[schema, plugins, initialValues],
	);

	const methods = useForm({
		resolver: zodResolver(zodSchema),
		defaultValues: defaults,
	});

	const formRef = useRef<HTMLFormElement>(null);

	// The keys the Schema owns: every Field it composes a value for.
	const editedKeys = useMemo(() => {
		const pluginIds = new Set(plugins.map((p) => p.id));
		return schema
			.filter((f) => fieldProducesValue(f) && pluginIds.has(f.field_type))
			.map((f) => f.config.api_accessor);
	}, [schema, plugins]);

	const handleSave = useCallback(
		(values: Record<string, unknown>) => {
			// react-hook-form submits what the Schema parsed, and the Schema is a
			// z.object built from the Spec — so every key the Spec doesn't name
			// (a row's id, its timestamps) is gone by the time it reaches here.
			// A Spec describes what a form edits, not the whole record, so the
			// row goes back underneath: edited fields win, the rest survives.
			//
			// The parsed values are canonical too (ADR-0021): a Field cleared to
			// Unset is absent from them, not "". So the Schema's keys come off
			// the row first — a cleared Field must stay cleared, not fall back to
			// the value the row had before.
			const rest = { ...initialValues };
			for (const key of editedKeys) delete rest[key];
			onSave({ ...rest, ...values });
		},
		[onSave, initialValues, editedKeys],
	);

	const handleDrawerSave = useCallback(() => {
		formRef.current?.requestSubmit();
	}, []);

	// Reset form when initialValues change (new row selected)
	useEffect(() => {
		methods.reset(defaults);
	}, [defaults, methods]);

	return (
		<DrawerRoot
			open={isOpen}
			onClose={onClose}
			title={title}
			onSave={handleDrawerSave}
			saveLabel="Save"
			closeLabel="Cancel"
		>
			<div data-testid="edit-drawer">
				<FormProvider {...methods}>
					{/* The generated Schema is the validator, so the browser's own
					    constraint check must stay out of the way: it fires first,
					    blocks the submit before react-hook-form sees it, and
					    replaces fieldkit's per-field messages with its own bubble.
					    Worse inside SpecForm, whose inactive tabs stay mounted but
					    hidden — a browser cannot focus an invalid control it has
					    hidden, so Save would silently do nothing rather than jump
					    to the offending tab. */}
					<form
						ref={formRef}
						noValidate
						onSubmit={methods.handleSubmit(handleSave)}
					>
						<FieldKitProvider plugins={plugins}>
							<SpecForm schema={schema} />
						</FieldKitProvider>
					</form>
				</FormProvider>
			</div>
		</DrawerRoot>
	);
}
EditDrawer.displayName = "EditDrawer";
