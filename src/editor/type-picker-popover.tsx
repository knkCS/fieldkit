// src/editor/type-picker-popover.tsx
import { Box } from "@chakra-ui/react";
import { IconButton } from "@knkcs/anker/atoms";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@knkcs/anker/primitives";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { FieldContext, FieldTypePlugin } from "../schema/plugin";
import type { Schema } from "../schema/types";
import type { TypePickerLabels } from "./type-picker";
import { TypePicker } from "./type-picker";

export interface TypePickerPopoverProps {
	plugins: FieldTypePlugin[];
	context?: FieldContext;
	currentSpec: Schema;
	onPick: (pluginId: string) => void; // parent inserts + selects
	triggerLabel: string; // aria-label for the ⊕ button
	pickerLabels?: TypePickerLabels;
	/** Greys the trigger out rather than hiding it, so an affordance that
	 * cannot be used is still visible next to whatever says why (ADR-0011's
	 * frozen settings-nested Spec is the case that needs it). */
	disabled?: boolean;
}

export function TypePickerPopover({
	plugins,
	context,
	currentSpec,
	onPick,
	triggerLabel,
	pickerLabels,
	disabled,
}: TypePickerPopoverProps) {
	const [open, setOpen] = useState(false);
	return (
		<Popover
			open={open}
			onOpenChange={(e) => setOpen(e.open)}
			lazyMount
			unmountOnExit
		>
			<PopoverTrigger asChild>
				<IconButton
					aria-label={triggerLabel}
					size="2xs"
					variant="ghost"
					colorPalette="primary"
					disabled={disabled}
				>
					<Plus size={14} />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent minWidth="sm" maxHeight="20rem" overflowY="auto">
				<Box p="2">
					<TypePicker
						plugins={plugins}
						context={context}
						currentSpec={currentSpec}
						onSelect={(id) => {
							setOpen(false);
							onPick(id);
						}}
						labels={pickerLabels}
					/>
				</Box>
			</PopoverContent>
		</Popover>
	);
}
TypePickerPopover.displayName = "TypePickerPopover";
