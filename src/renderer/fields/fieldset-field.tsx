import { Box, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { FieldProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { useFieldKit } from "../provider";
import { NestedItemFields } from "./item-fields";

/** "ready" covers both "nothing to fetch" and "the fetch came back". */
type ResolveStatus = "ready" | "loading" | "error";

/**
 * `fieldset` — one Blueprint's Fields embedded inline as a single record,
 * nested under the Fieldset's own accessor (ADR-0003).
 *
 * The children are never stored in the spec. A consumer who ran
 * `resolveSpec()` hands them in as `field.children`, nothing is fetched, and
 * those children are in the generated Schema — a required one blocks submit
 * and reports on itself (#53). A consumer who did not gets the documented
 * degrade path: this component self-resolves through
 * `adapters.blueprint.getSchema` **for display only**. Fields resolved that
 * way render and hold values, but the Schema was built before they existed,
 * so nothing about them is validated. That is the reason to resolve.
 *
 * With no blueprint adapter at all the established stub renders, so a form
 * that contains a Fieldset still works for a consumer who configured none.
 */
export function FieldsetField({
	field,
	readOnly,
}: FieldProps<FieldsetSettings>) {
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const blueprintAdapter = adapters.blueprint;
	const blueprintId = settings?.blueprint;
	const collapsible = settings?.collapsible ?? false;

	// Presence, not length: `resolveSpec()` attaches an EMPTY array for a
	// Blueprint with no Fields, and that is a resolved Fieldset — re-fetching
	// it would be the double round-trip resolving exists to avoid. An authored
	// Fieldset has no `children` key at all (`createField`), so null and
	// undefined are the honest "not resolved" signal.
	//
	// A boolean, not the array itself: an unstable `children` identity from a
	// re-rendering parent must not re-run the fetch below.
	const isResolved = field.children != null;
	const needsFetch = !isResolved && !!blueprintAdapter && !!blueprintId;

	const [fetched, setFetched] = useState<Field[] | null>(null);
	// Seeded rather than defaulted to "ready": the effect only runs after the
	// first paint, and "This blueprint has no fields" must not flash in the
	// meantime.
	const [status, setStatus] = useState<ResolveStatus>(() =>
		needsFetch ? "loading" : "ready",
	);
	// Open by default: a form user who cannot see a required field cannot
	// fill it in, so collapsing is something they choose, not something the
	// form does to them.
	const [open, setOpen] = useState(true);
	const contentId = useId();

	useEffect(() => {
		if (isResolved || !blueprintAdapter || !blueprintId) return;

		let cancelled = false;
		setStatus("loading");
		blueprintAdapter
			.getSchema(blueprintId)
			.then((fields) => {
				if (cancelled) return;
				setFetched(fields);
				setStatus("ready");
			})
			.catch((error) => {
				if (cancelled) return;
				console.error("Blueprint schema fetch failed:", error);
				setFetched(null);
				setStatus("error");
			});

		// A blueprint swapped mid-flight must not be overwritten by the
		// previous blueprint's fields arriving late.
		return () => {
			cancelled = true;
		};
	}, [isResolved, blueprintAdapter, blueprintId]);

	const children = isResolved ? (field.children ?? []) : (fetched ?? []);

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{() => {
				if (!isResolved && !blueprintAdapter) {
					return <StatusText>Blueprint adapter not configured</StatusText>;
				}
				if (!isResolved && !blueprintId) {
					return <StatusText>No blueprint selected</StatusText>;
				}
				if (status === "loading") {
					return <StatusText>Loading blueprint fields…</StatusText>;
				}
				if (status === "error") {
					return <StatusText>Failed to load blueprint fields</StatusText>;
				}
				if (children.length === 0) {
					return <StatusText italic>This blueprint has no fields</StatusText>;
				}

				const nested = (
					<NestedItemFields
						childFields={children}
						parentAccessor={accessor}
						readOnly={readOnly}
					/>
				);

				if (!collapsible) return <RecordFrame>{nested}</RecordFrame>;

				return (
					<RecordFrame>
						<Flex mb={open ? 2 : 0}>
							<IconButton
								aria-label={`${open ? "Collapse" : "Expand"} ${config.name}`}
								aria-expanded={open}
								aria-controls={contentId}
								size="xs"
								variant="ghost"
								onClick={() => setOpen((current) => !current)}
							>
								{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
							</IconButton>
						</Flex>
						{/* `hidden`, not unmounted: the children stay registered with
						    the form, so a collapsed fieldset keeps its values and a
						    submit still carries them.

						    Deliberately not Chakra's `Collapsible`, whose exit
						    animation never completes under jsdom — it leaves the
						    content without `hidden` and the trigger reporting
						    `aria-expanded="true"` after a close, so neither the
						    collapse nor its accessible state could be tested. */}
						<Box id={contentId} hidden={!open}>
							{nested}
						</Box>
					</RecordFrame>
				);
			}}
		</FormField>
	);
}
FieldsetField.displayName = "FieldsetField";

/** The embedded record's bounding box — the same treatment a group row gets,
 * because both mark "these fields belong to one nested value". Named for the
 * record, not the shape: `Frame` alone would read as lucide's icon of that
 * name, which is this plugin's own icon. */
function RecordFrame({ children }: { children: ReactNode }) {
	return (
		<Box borderWidth="1px" borderColor="border" borderRadius="md" p={4}>
			{children}
		</Box>
	);
}
RecordFrame.displayName = "RecordFrame";

function StatusText({
	children,
	italic,
}: {
	children: ReactNode;
	italic?: boolean;
}) {
	return (
		<Text
			color="fg.muted"
			fontSize="sm"
			fontStyle={italic ? "italic" : undefined}
		>
			{children}
		</Text>
	);
}
StatusText.displayName = "StatusText";
