// src/table/edit-drawer.tsx

import { zodResolver } from "@hookform/resolvers/zod";
import { DrawerRoot } from "@knkcs/anker/components";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldRenderer } from "../renderer/field-renderer";
import { FieldKitProvider } from "../renderer/provider";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { getDefaultValues, specToZodSchema } from "../schema/zod-builder";

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

	const defaults = useMemo(() => {
		const specDefaults = getDefaultValues(schema);
		return { ...specDefaults, ...initialValues };
	}, [schema, initialValues]);

	const methods = useForm({
		resolver: zodResolver(zodSchema),
		defaultValues: defaults,
	});

	const formRef = useRef<HTMLFormElement>(null);

	const handleSave = useCallback(
		(values: Record<string, unknown>) => {
			onSave(values);
		},
		[onSave],
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
					<form ref={formRef} onSubmit={methods.handleSubmit(handleSave)}>
						<FieldKitProvider plugins={plugins}>
							<FieldRenderer schema={schema} />
						</FieldKitProvider>
					</form>
				</FormProvider>
			</div>
		</DrawerRoot>
	);
}
EditDrawer.displayName = "EditDrawer";
