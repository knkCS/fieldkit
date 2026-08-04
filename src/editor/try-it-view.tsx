// src/editor/try-it-view.tsx
import { Box, Flex } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@knkcs/anker/atoms";
import { Alert, toaster } from "@knkcs/anker/primitives";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useFieldKit } from "../renderer/provider";
import { SpecForm } from "../renderer/spec-form/spec-form";
import type { FieldTypePlugin } from "../schema/plugin";
import {
	type BlueprintSchemaAdapter,
	resolveSpec,
	specNeedsResolution,
} from "../schema/resolve-spec";
import type { Schema } from "../schema/types";
import { getDefaultValues, specToZodSchema } from "../schema/zod-builder";

export interface TryItViewProps {
	/** The draft schema being edited — Preview renders a real form from it. */
	schema: Schema;
	plugins: FieldTypePlugin[];
	labels: {
		testSubmit: string;
		testSubmitSuccess: string;
		/** Alert title when the draft's Fieldsets could not be resolved.
		 * Required, unlike the pass-throughs below, so the compiler holds
		 * `SpecEditor` to forwarding it. */
		previewResolveFailed: string;
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

/**
 * Preview mode.
 *
 * A Consumer of the Spec like any other, so it runs the two-phase load
 * ADR-0004 requires: resolve the draft, *then* build the Schema from it. That
 * is what makes Preview show the form a form user will actually meet — an
 * unresolved Fieldset validates as an opaque record, so a required Field
 * inside it would not block the test submit (#54).
 */
export function TryItView({ schema, plugins, labels }: TryItViewProps) {
	const { adapters } = useFieldKit();
	const resolution = useResolvedDraft(schema, adapters.blueprint);
	// `useForm` seeds its defaults once per mount, so the scratch form must be
	// remounted whenever the Spec beneath it changes — otherwise it validates
	// against the new draft while still holding the old one's seeded values.
	// SpecEditor's own nonce only covers ENTRY to Preview, not a draft that
	// changes (or finishes resolving) while Preview is open.
	const formKey = useIdentityKey(
		resolution.status === "loading" ? schema : resolution.schema,
	);

	// The draft's own shape as a skeleton — the same treatment a Consumer
	// fetching the Spec itself gets. `loading` short-circuits before SpecForm
	// touches react-hook-form, so no scratch form exists yet to seed from a
	// Spec that is about to change.
	if (resolution.status === "loading") {
		return <SpecForm schema={schema} loading />;
	}

	return (
		<>
			{resolution.status === "failed" && (
				<Box mb="4">
					<Alert
						role="alert"
						status="warning"
						title={labels.previewResolveFailed}
					/>
				</Box>
			)}
			<TryItForm
				key={formKey}
				schema={resolution.schema}
				plugins={plugins}
				labels={labels}
			/>
		</>
	);
}
TryItView.displayName = "TryItView";

/** A number that changes only when `value`'s identity does — a `key` for a
 * subtree that has to be rebuilt from scratch when its input is replaced. */
function useIdentityKey(value: unknown): number {
	const seen = useRef(value);
	const key = useRef(0);
	if (seen.current !== value) {
		seen.current = value;
		key.current += 1;
	}
	return key.current;
}

type Resolution =
	| { status: "loading" }
	/** Resolved — or nothing to resolve, which renders the same. */
	| { status: "ready"; schema: Schema }
	/** The Blueprint fetch rejected; `schema` is the unresolved draft Preview
	 * falls back to, so an Author still gets to try the rest of their form. */
	| { status: "failed"; schema: Schema };

/**
 * Resolves the draft, without gating the render when there is nothing to
 * fetch: a Spec with no Fieldset, or a host with no blueprint adapter, is
 * ready on the first paint rather than after a skeleton frame it never needed.
 *
 * Keyed on `adapters.blueprint` rather than the whole adapters object, for the
 * reason `FieldsetField` is: the wrapper's identity is not stable across a
 * host's renders, and only this capability is read.
 */
function useResolvedDraft(
	schema: Schema,
	blueprint: BlueprintSchemaAdapter | undefined,
): Resolution {
	const [resolution, setResolution] = useState<Resolution>(() =>
		specNeedsResolution(schema, { blueprint })
			? { status: "loading" }
			: { status: "ready", schema },
	);

	useEffect(() => {
		if (!specNeedsResolution(schema, { blueprint })) {
			// Identity-guarded, here and below, so the mount pass — where the
			// initializer above already reached this answer — costs no second
			// render, and a re-run for an unchanged draft doesn't remount the
			// skeleton mid-fetch.
			setResolution((current) =>
				current.status === "ready" && current.schema === schema
					? current
					: { status: "ready", schema },
			);
			return;
		}

		let cancelled = false;
		setResolution((current) =>
			current.status === "loading" ? current : { status: "loading" },
		);
		resolveSpec(schema, { blueprint })
			.then((resolved) => {
				if (!cancelled) setResolution({ status: "ready", schema: resolved });
			})
			.catch((error) => {
				if (cancelled) return;
				// A Blueprint that won't load is the host's problem to see, and
				// the Alert above only has room to say that it happened.
				console.error("Preview spec resolution failed:", error);
				setResolution({ status: "failed", schema });
			});

		// A draft edited mid-flight must not be overwritten by the previous
		// draft's resolution arriving late.
		return () => {
			cancelled = true;
		};
	}, [schema, blueprint]);

	return resolution;
}

// Self-contained scratch form: `SpecForm` gets its own `useForm` instance
// here rather than sharing the consumer's, so typing into Preview can never
// leak into (or be persisted by) the real editor session. It only ever builds
// the form once per mount, and is mounted fresh for each Spec it is given —
// `TryItView`'s `formKey` above within a Preview session, `SpecEditor`'s
// nonce across entries into one, so scratch data can't survive an exit.
//
// Takes the RESOLVED schema: the Zod schema, the seeded defaults, and the
// rendered fields must all agree about which Fields exist.
function TryItForm({ schema, plugins, labels }: TryItViewProps) {
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
TryItForm.displayName = "TryItForm";
