// src/renderer/spec-form/tab-shell.tsx
import { Box, Tabs } from "@chakra-ui/react";
import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { SpecPartition } from "../../schema/partition";
import { buildSearchIndex } from "./search-index";
import { useContainerOrientation } from "./use-container-orientation";

/**
 * Shared stateful shell for SpecFormTabs (edit) and SpecFormReadTabs
 * (read). Contains NO react-hook-form hooks — read mode must render
 * without a FormProvider, and putting the shared state here (instead of
 * duplicating it per mode) is what lets both modes share it without
 * breaking that rule. The two copies drifted once before this existed.
 */
export function useTabShell(partition: SpecPartition, defaultTabLabel: string) {
	const [activeTab, setActiveTab] = useState("tab-0");
	const { orientation, containerRef } = useContainerOrientation(
		partition.orientation,
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const searchIndex = useMemo(
		() => buildSearchIndex(partition.tabs, defaultTabLabel),
		[partition, defaultTabLabel],
	);

	// Reset to the first tab when the partition identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: partition is a reset trigger, not read in the effect body
	useEffect(() => {
		setActiveTab("tab-0");
	}, [partition]);

	return {
		activeTab,
		setActiveTab,
		orientation,
		containerRef,
		rootRef,
		searchIndex,
	};
}

export interface TabShellProps {
	orientation: "horizontal" | "vertical";
	containerRef: (node: HTMLElement | null) => void;
	rootRef: RefObject<HTMLDivElement | null>;
	activeTab: string;
	onTabChange: (value: string) => void;
	/** The FieldSearch node (or false when the schema yields no index). */
	searchNode: ReactNode;
	tabTriggers: ReactNode;
	/** The Tabs.Content panels. */
	children: ReactNode;
}

/** Presentational tab shell shared by edit and read modes. */
export function TabShell({
	orientation,
	containerRef,
	rootRef,
	activeTab,
	onTabChange,
	searchNode,
	tabTriggers,
	children,
}: TabShellProps) {
	// Merge the orientation hook's callback ref with the RefObject the
	// mode components query synchronously (jump scoping). Memoized so its
	// identity is stable across renders — otherwise React would detach and
	// reattach containerRef (and its ResizeObserver) on every render.
	const setRoot = useCallback(
		(node: HTMLDivElement | null) => {
			rootRef.current = node;
			containerRef(node);
		},
		[containerRef, rootRef],
	);

	return (
		<Box ref={setRoot}>
			{/* Vertical Tabs.Root is a row-flex container (nav column beside
			    content), so the search must live OUTSIDE it to span the full
			    width above nav+content instead of becoming a row item. */}
			{orientation === "vertical" && searchNode && (
				<Box mb="3">{searchNode}</Box>
			)}
			<Tabs.Root
				value={activeTab}
				onValueChange={(e) => onTabChange(e.value)}
				orientation={orientation}
				// NEVER pass lazyMount/unmountOnExit: RHF needs all panels in the DOM.
			>
				{orientation === "horizontal" ? (
					<Box
						display="flex"
						alignItems="center"
						justifyContent="space-between"
						gap="4"
					>
						<Tabs.List flex="1">{tabTriggers}</Tabs.List>
						{searchNode}
					</Box>
				) : (
					<Tabs.List>{tabTriggers}</Tabs.List>
				)}
				{children}
			</Tabs.Root>
		</Box>
	);
}
TabShell.displayName = "TabShell";
