import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { PanelSectionProps } from "../field-config-panel";

/**
 * Read-only definition summary rendered INSTEAD of the editable sections
 * when the selected field is a system field (`field.system`). System
 * definitions are server-canonical: any edit made in the panel would
 * silently revert on the host's next read, so nothing interactive is
 * mounted at all — including the plugin's settingsComponent, which the
 * editor cannot force-disable (it is arbitrary consumer UI).
 */
export function SystemFieldSummary({
	field,
	labels,
}: Pick<PanelSectionProps, "field" | "plugin" | "labels">) {
	return (
		<Box data-testid="panel-system-summary">
			<Text
				fontSize="sm"
				color="fg.muted"
				mb="3"
				data-testid="panel-system-notice"
			>
				{labels.panelSystemNotice}
			</Text>
			<SummaryRow label={labels.accessor}>
				<Text as="span" fontFamily="mono" fontSize="xs">
					{field.config.api_accessor}
				</Text>
			</SummaryRow>
			<SummaryRow label={labels.required}>
				{field.config.required ? "✓" : "—"}
			</SummaryRow>
			{field.config.instructions && (
				<SummaryRow label={labels.instructions}>
					{field.config.instructions}
				</SummaryRow>
			)}
		</Box>
	);
}
SystemFieldSummary.displayName = "SystemFieldSummary";

function SummaryRow({
	label,
	children,
}: {
	label: string | undefined;
	children: ReactNode;
}) {
	return (
		<Flex gap="2" py="1" fontSize="sm" align="baseline">
			<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
				{label}
			</Text>
			<Box>{children}</Box>
		</Flex>
	);
}
