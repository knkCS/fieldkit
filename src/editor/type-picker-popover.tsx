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
}

export function TypePickerPopover({
	plugins,
	context,
	currentSpec,
	onPick,
	triggerLabel,
	pickerLabels,
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
