// src/renderer/fields/virtual-table-row-drawer.tsx

import { Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { DrawerRoot } from "@knkcs/anker/components";
import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { Field } from "../../schema/types";
import { getDefaultValues, specToZodSchema } from "../../schema/zod-builder";
import { FieldRenderer } from "../field-renderer";
import { useFieldKit } from "../provider";

export interface VirtualTableRowDrawerProps {
	/** The resolved Row Spec — the columns, rendered here as a form. */
	rowSpec: Field[];
	/** The row being edited, or undefined for a row being added. */
	initialValues?: Record<string, unknown>;
	/** Messages the Consumer's own form already holds against this row, keyed
	 * by column Accessor, so an invalid row opens with its errors showing
	 * rather than looking clean until the first save attempt. */
	initialErrors?: Record<string, string>;
	title: string;
	onSave: (values: Record<string, unknown>) => void;
	onCancel: () => void;
}

/**
 * One row of a Virtual Table, edited in a drawer.
 *
 * The Row Spec is rendered by fieldkit's own renderer, so every column brings
 * the control, the Zod type and the error message its Field Type already
 * defines — this drawer has no case for any of them.
 *
 * It edits a **draft**: its own form, seeded from the row, validated by the
 * Row Spec's own Schema. Cancelling drops the draft and writes nothing; only
 * saving hands values back, which is what makes cancel a discard rather than
 * an undo the Consumer's form would have to implement.
 *
 * Mounted only while open, so each open starts from the row it was given and
 * there is no stale draft to reset.
 */
export function VirtualTableRowDrawer({
	rowSpec,
	initialValues,
	initialErrors,
	title,
	onSave,
	onCancel,
}: VirtualTableRowDrawerProps) {
	const { getAllPlugins } = useFieldKit();
	const plugins = getAllPlugins();

	const resolver = useMemo(
		() => zodResolver(specToZodSchema(rowSpec, plugins)),
		[rowSpec, plugins],
	);

	const defaults = useMemo(
		() => ({ ...getDefaultValues(rowSpec, plugins), ...initialValues }),
		[rowSpec, plugins, initialValues],
	);

	const methods = useForm({ resolver, defaultValues: defaults });
	const { setError } = methods;

	// The messages the row already carried, put back on the Fields they came
	// from. Set after the form exists rather than passed as state, because
	// react-hook-form owns the error store the renderer reads.
	//
	// Once, on open: the drawer is mounted only while open, and re-applying
	// them would put an error back on a Field the Author has since corrected.
	const errorsOnOpen = useRef(initialErrors);
	useEffect(() => {
		for (const [accessor, message] of Object.entries(
			errorsOnOpen.current ?? {},
		)) {
			if (accessor === "") continue;
			setError(accessor, { type: "server", message });
		}
	}, [setError]);

	const rowLevelError = initialErrors?.[""];

	const submit = methods.handleSubmit((values) => {
		// The Row Spec describes what a row *edits*, not everything a row
		// holds: a stored row carries keys no column names (a backend id), and
		// the row array's Zod type passes them through for exactly that reason.
		// So the edited row goes back on top of the one that came in.
		onSave({ ...initialValues, ...values });
	});

	return (
		<DrawerRoot
			open
			onClose={onCancel}
			title={title}
			onSave={submit}
			saveLabel="Save"
			closeLabel="Cancel"
		>
			<Stack gap="4" data-testid="virtual-table-row-drawer">
				{rowLevelError !== undefined && (
					<Text fontSize="sm" color="fg.error">
						{rowLevelError}
					</Text>
				)}
				{rowSpec.length === 0 ? (
					<Text fontSize="sm" color="fg.muted">
						This table's Row Spec has no fields.
					</Text>
				) : (
					<FormProvider {...methods}>
						<FieldRenderer schema={rowSpec} />
					</FormProvider>
				)}
			</Stack>
		</DrawerRoot>
	);
}
VirtualTableRowDrawer.displayName = "VirtualTableRowDrawer";
