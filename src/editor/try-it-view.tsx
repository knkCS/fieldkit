// src/editor/try-it-view.tsx
import { Flex } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@knkcs/anker/atoms";
import { toaster } from "@knkcs/anker/primitives";
import { useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { SpecForm } from "../renderer/spec-form/spec-form";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import { getDefaultValues, specToZodSchema } from "../schema/zod-builder";

export interface TryItViewProps {
	/** The draft schema being edited — Try-it renders a real form from it. */
	schema: Schema;
	plugins: FieldTypePlugin[];
	labels: {
		testSubmit: string;
		testSubmitSuccess: string;
		/** Passed through to the underlying `SpecForm`'s `labels` prop. */
		defaultTab?: string;
		searchPlaceholder?: string;
		noResults?: string;
		optionalMarker?: string;
		tabErrors?: string;
		tabErrorsOne?: string;
		searchLabel?: string;
		unsavedChanges?: string;
	};
}

// Self-contained scratch form: `SpecForm` gets its own `useForm` instance
// here rather than sharing the consumer's, so typing into Try-it can never
// leak into (or be persisted by) the real editor session. The caller
// guarantees a fresh mount on every entry to Try-it (e.g. a changing `key`)
// so scratch data can't survive an exit — this component only needs to
// build the form once per mount.
export function TryItView({ schema, plugins, labels }: TryItViewProps) {
	const zodSchema = useMemo(
		() => specToZodSchema(schema, plugins),
		[schema, plugins],
	);
	const methods = useForm({
		resolver: zodResolver(zodSchema),
		defaultValues: getDefaultValues(schema, plugins),
	});

	const onValid = () => {
		toaster.create({ title: labels.testSubmitSuccess, type: "success" });
	};

	return (
		<FormProvider {...methods}>
			{/* `noValidate` for the same reason `EditDrawer` carries it: the
			    Schema validates, and the browser's constraint check would
			    otherwise intercept the submit before react-hook-form ran — on a
			    tab SpecForm has hidden, silently. An Author testing their draft
			    must see the Spec's own validation, not the browser's. */}
			<form
				noValidate
				onSubmit={methods.handleSubmit(onValid)}
				data-testid="try-it-form"
			>
				<SpecForm
					schema={schema}
					labels={{
						defaultTab: labels.defaultTab,
						searchPlaceholder: labels.searchPlaceholder,
						noResults: labels.noResults,
						optionalMarker: labels.optionalMarker,
						tabErrors: labels.tabErrors,
						tabErrorsOne: labels.tabErrorsOne,
						searchLabel: labels.searchLabel,
						unsavedChanges: labels.unsavedChanges,
					}}
				/>
				<Flex justify="flex-end" mt="6">
					<Button type="submit" variant="solid">
						{labels.testSubmit}
					</Button>
				</Flex>
			</form>
		</FormProvider>
	);
}
TryItView.displayName = "TryItView";
