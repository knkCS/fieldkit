import { Box, Flex } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconButton } from "@knkcs/anker/atoms";
import { Tooltip } from "@knkcs/anker/primitives";
import { Copy, GripVertical, Lock, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Field } from "../schema/types";

export interface FieldShellToolbarLabels {
	drag: string;
	edit: string;
	duplicate: string;
	delete: string;
	systemLocked: string;
}

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
	 * `maxPerSpec`) — reuses `labels.duplicate` as the aria-label either way. */
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
			borderRadius="md"
			bg={selected ? "bg-subtle" : undefined}
			opacity={isDragging ? 0.6 : 1}
			p="2"
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
					onClick={(e) => e.stopPropagation()}
				>
					{field.system && (
						<Box
							as="span"
							color="fg.muted"
							px="1"
							aria-label={labels.systemLocked}
							role="img"
						>
							<Lock size={12} />
						</Box>
					)}
					{/* closeOnEscape=false: the open tooltip's Escape handler stops
					    propagation at the document (capture phase), which would
					    swallow the Escape that cancels a keyboard drag. */}
					<Tooltip content={labels.drag} closeOnEscape={false}>
						<IconButton
							aria-label={labels.drag}
							size="2xs"
							variant="ghost"
							{...attributes}
							{...listeners}
						>
							<GripVertical size={14} />
						</IconButton>
					</Tooltip>
					<Tooltip content={labels.edit}>
						<IconButton
							aria-label={labels.edit}
							size="2xs"
							variant="ghost"
							onClick={() => onEdit(accessor)}
						>
							<Pencil size={14} />
						</IconButton>
					</Tooltip>
					<Tooltip content={labels.duplicate}>
						<IconButton
							aria-label={labels.duplicate}
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
						<Tooltip content={labels.delete}>
							<IconButton
								aria-label={labels.delete}
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
			<Box inert pointerEvents="none" userSelect="none">
				{children}
			</Box>
		</Box>
	);
}
FieldShell.displayName = "FieldShell";
