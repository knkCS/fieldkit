import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { DrawerRoot } from "@knkcs/anker/components";
import { SearchInput } from "@knkcs/anker/forms";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { PinMode } from "../../schema/reference";
import type { Field } from "../../schema/types";
import { getDefaultValues } from "../../schema/zod-builder";
import { SpecDataTable } from "../../table/spec-data-table";
import type { PinTarget, ReferenceItem } from "../adapters";
import { FieldRenderer } from "../field-renderer";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import { useStableValue } from "../hooks/use-stable-value";
import { useFieldKit } from "../provider";

/** How many Contents one page of the browse shows. Fixed rather than
 * configurable: it is a property of this drawer's layout, not of the Field. */
const PAGE_SIZE = 10;

/**
 * What the results table shows when the Adapter does not describe a Content —
 * the one property fieldkit itself knows every Content has. This is the
 * degrade ADR-0009 asks for: a name column, not an error.
 */
const NAME_ONLY_COLUMNS: Field[] = [
	{
		field_type: "text",
		config: {
			name: "Name",
			api_accessor: "display_name",
			required: false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	},
];

/**
 * One choosable Pin target — or the newest Version, which is the absence of
 * one.
 *
 * A real `<Button>` rather than a styled row, so what a person clicks is what a
 * keyboard reaches, and the label and its description together are the
 * accessible name.
 */
function PinTargetOption({
	label,
	description,
	onSelect,
}: {
	label: string;
	description?: string;
	onSelect: () => void;
}) {
	return (
		<Button
			variant="outline"
			justifyContent="flex-start"
			height="auto"
			py="2"
			px="3"
			onClick={onSelect}
		>
			<Stack gap="0" align="start" textAlign="left">
				<Text fontSize="sm">{label}</Text>
				{description && (
					<Text fontSize="xs" color="fg.muted" fontWeight="normal">
						{description}
					</Text>
				)}
			</Stack>
		</Button>
	);
}
PinTargetOption.displayName = "PinTargetOption";

export interface ReferencePickerDrawerProps {
	open: boolean;
	onClose: () => void;
	/**
	 * Called with the Content the person chose and the Pin they chose for it —
	 * `null` for the newest Version, which is what a Field that does not pin
	 * always answers.
	 *
	 * Closing is the caller's to do, so the drawer can stay open across the
	 * second step.
	 */
	onPick: (content: ReferenceItem, pin: string | null) => void;
	/** The Blueprints the Field is constrained to. */
	blueprintIds: string[];
	/** The Field being filled in, so an Adapter failure names it. */
	fieldId: string;
	/**
	 * Whether the Field pins, and to which kind of target — the only thing that
	 * decides whether this drawer has one step or two.
	 *
	 * Defaults to not pinning, so a caller that has no such setting keeps the
	 * one-step flow.
	 */
	pinMode?: PinMode;
	title?: string;
}

/**
 * Adding a Reference, in one step or two.
 *
 * **Step one — browse the Contents the Adapter offers.** Browsing rather than
 * only searching is the point: someone filling in a form has to be able to find
 * one Content among thousands without remembering its name. So this is a
 * paginated table over a total the Adapter reports, with a search box and,
 * where the Adapter describes them, filters.
 *
 * Neither the filters nor the columns are fieldkit's vocabulary. The Adapter
 * describes both as Specs (ADR-0009); the filter form is rendered by
 * `FieldRenderer` and the results by `SpecDataTable`, so each field type brings
 * its own control and its own cell for free. The values the filter form
 * collects are handed back through `search` as an opaque record — this
 * component never reads a key of it, and never reshapes it.
 *
 * **Step two — choose what to pin to**, and only when the Field pins. The
 * Adapter normalises whichever kind `pin_mode` named into an id, a label and a
 * description, so fieldkit models neither a Release nor a Version (ADR-0008);
 * this step just lists what came back, plus the newest Version, which is the
 * choice that stores no Pin at all. A Field that does not pin never reaches
 * here and never asks the Adapter anything.
 */
export function ReferencePickerDrawer({
	open,
	onClose,
	onPick,
	blueprintIds,
	fieldId,
	pinMode = "none",
	title = "Add reference",
}: ReferencePickerDrawerProps) {
	const { adapters, getAllPlugins } = useFieldKit();
	const adapter = adapters.reference;
	const plugins = getAllPlugins();
	const report = useAdapterErrorReporter(fieldId, "Reference adapter failed");

	const filterSpec = useMemo(
		() => adapter?.getSearchFilters?.() ?? [],
		[adapter],
	);
	const columnSpec = useMemo(
		() => adapter?.getResultColumns?.() ?? NAME_ONLY_COLUMNS,
		[adapter],
	);

	// A form of its own, deliberately: the filter values are the Adapter's
	// business and must never land in the form the Consumer owns. Nested
	// `FormProvider` is what keeps the two apart while still letting the
	// filters render through fieldkit's ordinary renderer. This and
	// `EditDrawer` are the only two places fieldkit calls `useForm` — see
	// docs/react-hook-form-reference.md.
	const filterForm = useForm({
		defaultValues: getDefaultValues(filterSpec, plugins),
	});
	// The record itself, held at a stable identity — never a JSON round-trip
	// of it. Fieldkit passes these values through without inspecting or
	// reshaping them, and re-parsing would silently rewrite a value type the
	// Adapter chose.
	const filters = useStableValue(
		(useWatch({ control: filterForm.control }) ?? {}) as Record<
			string,
			unknown
		>,
	);

	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
	const [items, setItems] = useState<ReferenceItem[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);

	// The Content step one settled on, and what it may be pinned to. Non-null
	// is what "we are on step two" means — there is no separate step state to
	// disagree with it.
	const [picked, setPicked] = useState<ReferenceItem | null>(null);
	const [targets, setTargets] = useState<PinTarget[]>([]);
	const [loadingTargets, setLoadingTargets] = useState(false);

	// Narrowing puts you back on page one — page 4 of the old results says
	// nothing about the new ones. Adjusted during render, the documented way
	// (and the way `blueprint-picker.tsx` re-seeds its input), so the search
	// below runs once on the right page instead of firing on the stale one
	// first.
	const narrowing = useStableValue({ query, filters });
	const lastNarrowing = useRef(narrowing);
	if (lastNarrowing.current !== narrowing) {
		lastNarrowing.current = narrowing;
		setPage(1);
	}

	// Each open starts the browse over. The drawer's body — the search box
	// included — is unmounted while closed, so it comes back empty; the state
	// behind it has to agree, or the results would stay narrowed by a query
	// nothing on screen shows. Filters are different: their controls keep their
	// values, so what is on screen and what is sent still match.
	const wasOpen = useRef(open);
	if (wasOpen.current !== open) {
		wasOpen.current = open;
		if (open) {
			setQuery("");
			setPage(1);
			// Adding a Reference starts at step one every time. Reopening onto
			// the second step would ask about a Content nobody just chose.
			setPicked(null);
		}
	}

	useEffect(() => {
		// Not until someone looks. A form can hold many Reference Fields, and
		// none of them should browse a catalogue nobody has opened.
		if (!adapter || !open) return;
		let cancelled = false;
		setLoading(true);
		adapter
			.search({
				blueprintIds,
				query,
				filters,
				page,
				page_size: PAGE_SIZE,
			})
			.then((result) => {
				if (cancelled) return;
				setItems(result.items);
				setTotal(result.total);
				setLoading(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setItems([]);
				setTotal(0);
				setLoading(false);
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [adapter, open, blueprintIds, query, filters, page, report]);

	// Only once a Content is on the table, and only for a Field that pins: the
	// targets belong to that one Content, so there is nothing to ask until step
	// one has settled.
	useEffect(() => {
		if (!adapter || !picked || pinMode === "none") return;
		let cancelled = false;
		setLoadingTargets(true);
		adapter
			.listPinTargets(picked.id, pinMode)
			.then((result) => {
				if (cancelled) return;
				setTargets(result);
				setLoadingTargets(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				// The newest Version is still on offer below, so a failed lookup
				// costs the targets and not the ability to add a Reference.
				setTargets([]);
				setLoadingTargets(false);
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [adapter, picked, pinMode, report]);

	function handlePick(row: Record<string, unknown>) {
		const content = items.find((item) => item.id === row.id);
		if (!content) return;
		// One step or two, decided by the Field and nothing else. Not pinning
		// means there is no target to choose and none to store.
		if (pinMode === "none") {
			onPick(content, null);
			return;
		}
		setTargets([]);
		setPicked(content);
	}

	if (picked) {
		return (
			<DrawerRoot
				open={open}
				onClose={onClose}
				title={pinMode === "release" ? "Choose a release" : "Choose a version"}
				closeLabel="Cancel"
			>
				<Stack gap="2" data-testid="reference-picker-pin-step">
					<Flex align="center" gap="2">
						{/* Back rather than a step indicator: two steps do not need
						    a map, and the Content already chosen is the only
						    context the second one is missing. */}
						<Button
							size="xs"
							variant="ghost"
							onClick={() => setPicked(null)}
							aria-label="Back"
						>
							<ChevronLeft size={14} />
							Back
						</Button>
						<Text fontSize="sm" fontWeight="medium">
							{picked.display_name}
						</Text>
					</Flex>

					{/* First and always available, including while the targets are
					    still loading and after a lookup that failed: no Pin is a
					    real answer, not a fallback (ADR-0008). */}
					<PinTargetOption
						label="Newest version"
						description="Follows the content as it changes"
						onSelect={() => onPick(picked, null)}
					/>

					{loadingTargets ? (
						<Text fontSize="sm" color="fg.muted">
							Loading…
						</Text>
					) : (
						targets.map((target) => (
							<PinTargetOption
								key={target.id}
								label={target.label}
								description={target.description}
								onSelect={() => onPick(picked, target.id)}
							/>
						))
					)}
				</Stack>
			</DrawerRoot>
		);
	}

	return (
		<DrawerRoot open={open} onClose={onClose} title={title} closeLabel="Cancel">
			<Stack gap="4" data-testid="reference-picker">
				<SearchInput
					aria-label="Search content"
					placeholder="Search content…"
					// Restored on the way back from step two, which remounts this
					// box: the search state survives, so what it shows has to as
					// well or the results would stay narrowed by an invisible query.
					defaultValue={query}
					// The default debounce is the point: the incumbent control
					// searched on every keystroke, which a paginated browse over a
					// real catalogue cannot afford.
					onSearch={setQuery}
				/>

				{filterSpec.length > 0 && (
					<Box data-testid="reference-picker-filters">
						<FormProvider {...filterForm}>
							<FieldRenderer schema={filterSpec} />
						</FormProvider>
					</Box>
				)}

				<Text
					fontSize="sm"
					color="fg.muted"
					data-testid="reference-picker-total"
				>
					{total === 1 ? "1 content" : `${String(total)} contents`}
				</Text>

				<SpecDataTable
					schema={columnSpec}
					data={items}
					plugins={plugins}
					loading={loading}
					variant="hoverable"
					// Server-driven: `items` is already the page the Adapter
					// returned, and `total` is the count only it can know.
					page={page}
					total={total}
					pageSize={PAGE_SIZE}
					onPageChange={setPage}
					onRowClick={(_index, row) => handlePick(row)}
					emptyState="No content matches"
				/>
			</Stack>
		</DrawerRoot>
	);
}
ReferencePickerDrawer.displayName = "ReferencePickerDrawer";
