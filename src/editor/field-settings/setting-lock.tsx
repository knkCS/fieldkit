// src/editor/field-settings/setting-lock.tsx
import { Flex, Text } from "@chakra-ui/react";
import { Lock } from "lucide-react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { lockedSetting } from "../../schema/locked-settings";
import type { LockedSetting } from "../../schema/types";

/**
 * How a settings control learns that the Consumer froze the setting it edits
 * (ADR-0011).
 *
 * A **context**, not a prop on `SettingsProps`, and read by the *control*
 * rather than by the settings editor that arranges the controls. That is what
 * makes honouring the lock the default: a control already knows which settings
 * key it writes, so declaring that key is all it takes, and every settings
 * editor built out of fieldkit's controls — a Consumer's included — gets the
 * lock without a line of its own.
 *
 * The gap ADR-0011 names is a settings component that renders its own raw
 * controls and never reaches this hook. That component still renders an
 * editable control over a frozen setting; what it can no longer do is write it
 * — `SettingsSection` puts every frozen key back through
 * `restoreLockedSettings` on the way out.
 */
const NOTHING_FROZEN: LockedSetting[] = [];

const SettingLockContext = createContext<LockedSetting[]>(NOTHING_FROZEN);

/** What `useSettingLock` tells a control about the setting it edits. */
export interface SettingLock {
	/** The settings key asked about — carried back so a control can render the
	 * lock without repeating the key. */
	key: string;
	locked: boolean;
	/** The Consumer's own prose. `undefined` when the setting is not frozen, or
	 * when the Consumer froze it without saying why. */
	reason: string | undefined;
}

export interface SettingLockProviderProps {
	/** Straight from the Field's `config.locked_settings`. Absent means nothing
	 * is frozen, which is the ordinary case. */
	locked: LockedSetting[] | undefined;
	children: ReactNode;
}

/**
 * Publishes one Field's frozen settings to the controls below it.
 *
 * Mounted by the config panel's Type settings section, around the plugin's own
 * settings editor — the one place that knows both the Field and the component
 * editing its settings.
 */
export function SettingLockProvider({
	locked,
	children,
}: SettingLockProviderProps) {
	const value = Array.isArray(locked) ? locked : NOTHING_FROZEN;
	return (
		<SettingLockContext.Provider value={value}>
			{children}
		</SettingLockContext.Provider>
	);
}
SettingLockProvider.displayName = "SettingLockProvider";

/**
 * Whether the Consumer froze `settingsKey`, and why.
 *
 * Outside a provider — a settings editor mounted in a Storybook story, or in a
 * Consumer's own panel — nothing is ever frozen, on the same terms as
 * `SettingsProps.onDrillIn`: a control must still render where the config
 * panel is not.
 */
export function useSettingLock(settingsKey: string): SettingLock {
	const locked = useContext(SettingLockContext);
	return useMemo(() => {
		const entry = lockedSetting(locked, settingsKey);
		return {
			key: settingsKey,
			locked: entry !== undefined,
			reason: typeof entry?.reason === "string" ? entry.reason : undefined,
		};
	}, [locked, settingsKey]);
}

/**
 * The Consumer's reason, rendered beside the control it explains — and nothing
 * at all when the setting is not frozen, so a control can mount it
 * unconditionally.
 *
 * The reason is displayed **as given**. It is deliberately not routed through
 * the editor's `labels` tables: only the Consumer can say "12 contents use this
 * blueprint", and fieldkit never sees that string among its own translations
 * (ADR-0011).
 */
export function SettingLockReason({ lock }: { lock: SettingLock }) {
	if (!lock.locked) return null;
	return (
		<Flex
			align="center"
			gap="1"
			mt="1"
			data-testid={`setting-locked-${lock.key}`}
		>
			{/* Decorative: the disabled control is what says "you cannot change
			    this", and the sentence beside it says why. */}
			<Lock size={12} aria-hidden="true" />
			<Text fontSize="xs" color="fg.muted">
				{lock.reason}
			</Text>
		</Flex>
	);
}
SettingLockReason.displayName = "SettingLockReason";
