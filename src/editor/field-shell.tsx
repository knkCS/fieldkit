import { Box, Flex } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconButton } from "@knkcs/anker/atoms";
import { Tooltip } from "@knkcs/anker/primitives";
import { Copy, Eye, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Field } from "../schema/types";
import type { EditorLabels } from "./spec-editor";

/** A Pick of EditorLabels — the toolbar consumes the SAME flat key names as
 * EditorLabels (dragField/editField/duplicateField/deleteField/viewField)
 * instead of its own drag/edit/duplicate/delete names, so a host can pass
 * its merged EditorLabels straight through without a renaming layer. */
export type FieldShellToolbarLabels = Pick<
	Required<EditorLabels>,
	"dragField" | "editField" | "duplicateField" | "deleteField" | "viewField"
>;

export interface FieldShellProps {
	field: Field;
	selected: boolean;
	invalid?: boolean;
	onSelect: (accessor: string) => void;
	onEdit: (accessor: string) => void;
	onDuplicate: (accessor: string) => void;
	onDelete: (accessor: string) => void;
	moveMenu?: ReactNode;
	labels: FieldShellToolbarLabels;
	children: ReactNode;
	/** F2c/F4a: disables the Duplicate toolbar button (its accessor is
	 * duplicated in the draft, and/or its field_type has reached
	 * `maxPerSpec`) — reuses `labels.duplicateField` as the aria-label either way. */
	duplicateDisabled?: boolean;
}

export function FieldShell({
	field,
	selected,
	invalid,
	onSelect,
	onEdit,
	onDuplicate,
	onDelete,
	moveMenu,
	labels,
	children,
	duplicateDisabled,
}: FieldShellProps) {
	const accessor = field.config.api_accessor;
	// Capability-based, not a `field.system` special case at the call site:
	// "nothing in the panel is editable" — today that's exactly `field.system`,
	// but a future partial-editability model changes THIS predicate, not the
	// icon logic below that reads it.
	const fullyLocked = field.system;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: accessor,
	});

	const borderColor = invalid
		? "danger.600"
		: selected
			? "accent"
			: "transparent";

	return (
		<Box
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			position="relative"
			borderWidth="2px"
			borderColor={borderColor}
			data-invalid={invalid ? "true" : undefined}
			borderRadius="md"
			bg={selected ? "bg-subtle" : undefined}
			opacity={isDragging ? 0.6 : 1}
			py="2"
			pr="2"
			// pl clears the absolutely-positioned persistent grip below — the
			// inert preview must not render underneath it.
			pl="10"
			cursor="pointer"
			role="button"
			tabIndex={0}
			aria-label={field.config.name}
			data-testid={`shell-${accessor}`}
			onClick={() => onSelect(accessor)}
			onKeyDown={(e) => {
				// Only react to keys targeted at the shell itself; keys from
				// toolbar buttons must neither select the shell nor be blocked
				// from reaching dnd-kit's document-level keyboard listener.
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(accessor);
				}
			}}
		>
			{selected && (
				<Flex
					position="absolute"
					top="-4"
					right="2"
					gap="0.5"
					bg="bg-surface"
					borderWidth="1px"
					borderColor="border"
					borderRadius="md"
					boxShadow="sm"
					zIndex="docked"
					data-testid={`shell-toolbar-${accessor}`}
					onClick={(e) => e.stopPropagation()}
				>
					{fullyLocked ? (
						<Tooltip content={labels.viewField}>
							<IconButton
								aria-label={labels.viewField}
								size="2xs"
								variant="ghost"
								// Nothing to focus in the read-only summary — select the
								// field instead of firing onEdit (verified no-op there).
								onClick={() => onSelect(accessor)}
							>
								<Eye size={14} />
							</IconButton>
						</Tooltip>
					) : (
						<Tooltip content={labels.editField}>
							<IconButton
								aria-label={labels.editField}
								size="2xs"
								variant="ghost"
								onClick={() => onEdit(accessor)}
							>
								<Pencil size={14} />
							</IconButton>
						</Tooltip>
					)}
					<Tooltip content={labels.duplicateField}>
						<IconButton
							aria-label={labels.duplicateField}
							size="2xs"
							variant="ghost"
							disabled={duplicateDisabled}
							onClick={() => onDuplicate(accessor)}
						>
							<Copy size={14} />
						</IconButton>
					</Tooltip>
					{moveMenu}
					{!field.system && (
						<Tooltip content={labels.deleteField}>
							<IconButton
								aria-label={labels.deleteField}
								size="2xs"
								variant="ghost"
								colorPalette="red"
								onClick={() => onDelete(accessor)}
							>
								<Trash2 size={14} />
							</IconButton>
						</Tooltip>
					)}
				</Flex>
			)}
			{/* Persistent drag handle (panel-tabs spec 2026-07-13, Decision 6):
			    THE handle — always visible, before the field content, the
			    card-header grip idiom (same GripVertical, same 2xs IconButton).
			    The selection toolbar above no longer carries one. Absolutely
			    positioned into the shell's pl="10" gutter so the F8 inert
			    wrapper below stays byte-identical.
			    closeOnEscape=false: the open tooltip's Escape handler stops
			    propagation at the document (capture phase), which would swallow
			    the Escape that cancels a keyboard drag. A plain click on the
			    grip (under PointerSensor's 8px activation distance) bubbles to
			    the shell's onClick and selects — the card-header behavior. */}
			<Box position="absolute" top="2" left="1.5">
				<Tooltip content={labels.dragField} closeOnEscape={false}>
					<IconButton
						aria-label={labels.dragField}
						size="2xs"
						variant="ghost"
						{...attributes}
						{...listeners}
					>
						<GripVertical size={14} />
					</IconButton>
				</Tooltip>
			</Box>
			{/* F8: the JSX boolean shorthand `inert` (i.e. passing the JS boolean
			    `true`) is only recognized as a boolean DOM property by React 19.
			    The peer range allows React >=18, where React DOM logs "Received
			    `true` for a non-boolean attribute" and drops it entirely — the
			    canvas preview is then NOT actually inert (focus/AT can still
			    reach it) on a React 18 host, even though this repo's own React
			    19 dev dependency masks the bug locally.
			    Deviation from the adjudicated fix (`{ inert: "" }`): verified
			    empirically against the installed React 19 that an EMPTY string
			    does not work — React 19 now treats `inert` as a boolean-typed
			    property, and an empty string is JS-falsy, so React drops the
			    attribute exactly like the bug it's meant to fix (confirmed via
			    this file's own regression test going red). A non-empty STRING
			    value sidesteps both failure modes: React 19 accepts any
			    "truthy" value for a boolean-typed prop and keeps the attribute
			    present (dev-only console warning, attribute unaffected); React
			    18, which doesn't recognize `inert` as boolean-typed at all,
			    falls back to its generic passthrough for a plain string value
			    and sets the attribute directly — no boolean coercion involved
			    either way. */}
			<Box
				{...({ inert: "true" } as Record<string, unknown>)}
				pointerEvents="none"
				userSelect="none"
			>
				{children}
			</Box>
		</Box>
	);
}
FieldShell.displayName = "FieldShell";
