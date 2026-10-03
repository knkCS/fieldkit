import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { builtInFieldTypes } from "../../../schema/field-types";
import { formDefaults } from "../../../schema/form-defaults";
import type { Schema } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";
import { testPlugins } from "./helpers";

export interface ConsumerHarnessProps {
	schema: Schema;
	/** The Consumer's validation, wired through zodResolver. */
	zodSchema: z.ZodTypeAny;
	defaultValues: Record<string, unknown>;
	/** Names the harness's region and prefixes its buttons, so two harnesses
	 * can share one document: `within(screen.getByRole("region", { name }))`. */
	name?: string;
	/** Whether SpecForm starts mounted. */
	initiallyMounted?: boolean;
}

/**
 * The Consumer harness: a Consumer that owns its form (`useForm` held here,
 * above SpecForm) and mounts and unmounts SpecForm against it, as an anker
 * nav-link tab does (anker ADR 0004: only the active tab is mounted). Its
 * Save button lives outside the toggle, so a save can happen while SpecForm
 * is unmounted. The form is `noValidate`: without it, native `required`
 * intercepts a submit before React Hook Form sees it.
 *
 * Buttons: "<name> Save", "<name> Toggle" (mount/unmount SpecForm),
 * "<name> Reset" (`reset()` to the default values). With no `name`, the
 * plain labels "Save", "Toggle", "Reset".
 */
export function ConsumerHarness({
	schema,
	zodSchema,
	defaultValues,
	name,
	initiallyMounted = true,
}: ConsumerHarnessProps) {
	const methods = useForm({
		resolver: zodResolver(zodSchema),
		defaultValues,
	});
	const [mounted, setMounted] = useState(initiallyMounted);
	const label = (text: string) => (name ? `${name} ${text}` : text);
	return (
		<section aria-label={name ?? "Consumer"}>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={testPlugins}>
					<form noValidate onSubmit={methods.handleSubmit(() => {})}>
						{mounted && <SpecForm schema={schema} />}
						<button type="submit">{label("Save")}</button>
						<button type="button" onClick={() => setMounted((m) => !m)}>
							{label("Toggle")}
						</button>
						<button type="button" onClick={() => methods.reset(defaultValues)}>
							{label("Reset")}
						</button>
					</form>
				</FieldKitProvider>
			</FormProvider>
		</section>
	);
}
ConsumerHarness.displayName = "ConsumerHarness";

/** ConsumerHarness inside anker's Provider, for a test's `render()`. */
export function ConsumerHarnessApp(props: ConsumerHarnessProps) {
	return (
		<Provider>
			<ConsumerHarness {...props} />
		</Provider>
	);
}
ConsumerHarnessApp.displayName = "ConsumerHarnessApp";

export interface SavingConsumerProps {
	schema: Schema;
	/** The stored record the form is seeded with, through formDefaults. */
	stored: Record<string, unknown>;
	/** The Consumer's persistence; the harness awaits it. */
	onSave: (values: Record<string, unknown>) => Promise<void>;
	/** A failed save, where a Consumer navigates to its Content tab. */
	onInvalid?: () => void;
	/** A value the Consumer sets itself, from a "Set <accessor>" button —
	 * how a test changes the form while SpecForm is unmounted. */
	consumerSet?: { accessor: string; value: unknown };
}

/**
 * spec-form.mdx's "A Consumer-owned Save across unmounting tabs", as
 * written there: the form held above the toggle (standing in for the
 * router outlet), seeded through formDefaults, the Consumer's own resolver,
 * a Save outside the toggle that validates through handleSubmit and, on
 * success, re-baselines on the snapshot taken when Save started. `isDirty`
 * is rendered where a Consumer would hand it to anker's setTabDirty.
 *
 * Buttons: "Save", "Toggle", and "Set <accessor>" with `consumerSet`.
 * The dirty state: `data-testid="dirty"`.
 */
export function SavingConsumer({
	schema,
	stored,
	onSave,
	onInvalid,
	consumerSet,
}: SavingConsumerProps) {
	const methods = useForm({
		resolver: zodResolver(specToZodSchema(schema, builtInFieldTypes)),
		defaultValues: formDefaults(schema, stored, builtInFieldTypes),
	});
	const { isDirty } = methods.formState;
	const [mounted, setMounted] = useState(true);

	const save = () => {
		const { getValues, handleSubmit, reset } = methods;
		// Taken when Save starts: the baseline is what was sent.
		const snapshot = structuredClone(getValues());
		return handleSubmit(
			async (values) => {
				await onSave(values);
				// The baseline becomes the snapshot; then the dirty state is
				// recomputed against it, which keepValues alone leaves empty.
				// keepSubmitCount: SpecForm counts failed saves by it, and
				// cannot notice a rewind made while it is unmounted.
				reset(snapshot, { keepValues: true, keepSubmitCount: true });
				reset(getValues(), {
					keepDefaultValues: true,
					keepSubmitCount: true,
				});
			},
			() => onInvalid?.(),
		)();
	};

	return (
		<Provider>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={builtInFieldTypes}>
					<form noValidate onSubmit={(e) => e.preventDefault()}>
						{mounted && <SpecForm schema={schema} />}
					</form>
					<button type="button" onClick={save}>
						Save
					</button>
					<button type="button" onClick={() => setMounted((m) => !m)}>
						Toggle
					</button>
					{consumerSet && (
						<button
							type="button"
							onClick={() =>
								methods.setValue(consumerSet.accessor, consumerSet.value, {
									shouldDirty: true,
								})
							}
						>
							Set {consumerSet.accessor}
						</button>
					)}
					<output data-testid="dirty">{String(isDirty)}</output>
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}
SavingConsumer.displayName = "SavingConsumer";
