import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import type { Schema } from "../../../schema/types";
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
