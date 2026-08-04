// src/editor/panel-sections/settings-section.tsx
import { Text } from "@chakra-ui/react";
import { restoreLockedSettings } from "../../schema/locked-settings";
import type { PanelSectionProps } from "../field-config-panel";
import { SettingLockProvider } from "../field-settings/setting-lock";

/**
 * Type-settings section: delegates to the plugin's own settingsComponent,
 * ported from field-modal.tsx:499-510 (defaultSettings fallback, immediate
 * apply — no local buffering, unlike the modal's original Save-on-close).
 *
 * It is also the one place a Field's frozen settings meet the component
 * editing them (ADR-0011), and it honours them on both sides:
 *
 * - **Reading** — `SettingLockProvider` publishes the list, and each control
 *   below asks about the key it writes. Every settings editor assembled from
 *   fieldkit's controls therefore renders the lock without a line of its own.
 * - **Writing** — `restoreLockedSettings` puts each frozen key back on the way
 *   out. That is what a settings component the ADR predicts — one that never
 *   checks the list, which only a Consumer can write — still cannot get past.
 */
export function SettingsSection({
	field,
	plugin,
	onFieldChange,
	labels,
	onDrillIn,
	plugins,
}: PanelSectionProps) {
	const SettingsComponent = plugin?.settingsComponent;

	if (!SettingsComponent) {
		return (
			<Text fontSize="sm" color="fg.muted">
				{labels.panelNoSettings}
			</Text>
		);
	}

	const settings = field.settings ?? plugin?.defaultSettings ?? null;
	const locked = field.config.locked_settings;

	return (
		<SettingLockProvider locked={locked}>
			<SettingsComponent
				settings={settings}
				field={field}
				onChange={(next) =>
					onFieldChange({
						...field,
						settings: restoreLockedSettings(locked, settings, next),
					})
				}
				// A settings editor holding a Spec of its own configures it through
				// the panel's incumbent drill-in rather than a nested editor of its
				// own — see SettingsProps.onDrillIn.
				onDrillIn={onDrillIn}
				plugins={plugins}
			/>
		</SettingLockProvider>
	);
}
SettingsSection.displayName = "SettingsSection";
