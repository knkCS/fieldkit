// src/rich-text-spec/editor-spec-editor.tsx

import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type {
	EditorNodeCategory,
	EditorNodePlugin,
	EditorSpec,
	NodeOptions,
} from "./types";

export interface EditorSpecEditorProps {
	spec: EditorSpec;
	onChange: (spec: EditorSpec) => void;
	nodePlugins: EditorNodePlugin[];
	markPlugins: EditorNodePlugin[];
}

const categoryLabels: Record<EditorNodeCategory, string> = {
	formatting: "Formatting",
	structure: "Structure",
	media: "Media",
	reference: "References",
	special: "Special",
};

const categoryOrder: EditorNodeCategory[] = [
	"formatting",
	"structure",
	"media",
	"reference",
	"special",
];

interface PluginToggleProps {
	plugin: EditorNodePlugin;
	enabled: boolean;
	settings: NodeOptions | undefined;
	onToggle: (pluginId: string, isMark: boolean) => void;
	onSettingsChange: (
		pluginId: string,
		isMark: boolean,
		settings: NodeOptions,
	) => void;
}

function PluginToggle({
	plugin,
	enabled,
	settings,
	onToggle,
	onSettingsChange,
}: PluginToggleProps) {
	const [expanded, setExpanded] = useState(false);
	const hasSettings = plugin.settingsSpec && plugin.settingsSpec.length > 0;
	const Icon = plugin.icon;

	const handleSettingChange = useCallback(
		(key: string, value: unknown) => {
			const current = settings ?? plugin.defaultSettings ?? {};
			onSettingsChange(plugin.id, plugin.isMark, {
				...current,
				[key]: value,
			});
		},
		[settings, plugin, onSettingsChange],
	);

	return (
		<div
			data-testid={`plugin-toggle-${plugin.id}`}
			style={{
				border: "1px solid var(--chakra-colors-border)",
				borderRadius: "6px",
				padding: "8px 12px",
				marginBottom: "4px",
				background: enabled
					? "var(--chakra-colors-bg-subtle)"
					: "var(--chakra-colors-bg-surface)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
				}}
			>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						cursor: "pointer",
					}}
				>
					<input
						type="checkbox"
						checked={enabled}
						onChange={() => onToggle(plugin.id, plugin.isMark)}
						data-testid={`toggle-${plugin.id}`}
						style={{ marginRight: "8px" }}
					/>
				</label>

				{Icon && (
					<span
						style={{
							color: "var(--chakra-colors-fg-subtle)",
							display: "flex",
							alignItems: "center",
						}}
					>
						<Icon size={16} />
					</span>
				)}

				<span style={{ fontWeight: 500, fontSize: "14px", flex: 1 }}>
					{plugin.name}
				</span>

				<span
					style={{
						color: "var(--chakra-colors-fg-subtle)",
						fontSize: "12px",
						flex: 2,
					}}
				>
					{plugin.description}
				</span>

				{hasSettings && enabled && (
					<button
						type="button"
						data-testid={`settings-toggle-${plugin.id}`}
						onClick={() => setExpanded(!expanded)}
						style={{
							border: "none",
							background: "none",
							cursor: "pointer",
							padding: "2px",
							display: "flex",
							alignItems: "center",
							color: "var(--chakra-colors-fg-subtle)",
						}}
						aria-label={`${expanded ? "Hide" : "Show"} settings for ${plugin.name}`}
					>
						{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
					</button>
				)}
			</div>

			{hasSettings && enabled && expanded && (
				<div
					data-testid={`settings-panel-${plugin.id}`}
					style={{
						marginTop: "8px",
						paddingTop: "8px",
						borderTop: "1px solid var(--chakra-colors-border)",
					}}
				>
					{plugin.settingsSpec?.map((field) => {
						const currentValue =
							settings?.[field.config.api_accessor] ??
							plugin.defaultSettings?.[field.config.api_accessor] ??
							"";

						return (
							<div
								key={field.config.api_accessor}
								style={{
									marginBottom: "6px",
									display: "flex",
									alignItems: "center",
									gap: "8px",
								}}
							>
								<label
									style={{
										fontSize: "13px",
										fontWeight: 500,
										minWidth: "100px",
									}}
								>
									{field.config.name}
								</label>
								<input
									type="text"
									value={String(currentValue)}
									onChange={(e) =>
										handleSettingChange(
											field.config.api_accessor,
											e.target.value,
										)
									}
									data-testid={`setting-${plugin.id}-${field.config.api_accessor}`}
									style={{
										flex: 1,
										padding: "4px 8px",
										border: "1px solid var(--chakra-colors-border)",
										borderRadius: "4px",
										fontSize: "13px",
									}}
								/>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
PluginToggle.displayName = "PluginToggle";

function groupByCategory(
	plugins: EditorNodePlugin[],
): Map<EditorNodeCategory, EditorNodePlugin[]> {
	const groups = new Map<EditorNodeCategory, EditorNodePlugin[]>();
	for (const plugin of plugins) {
		const existing = groups.get(plugin.category) ?? [];
		existing.push(plugin);
		groups.set(plugin.category, existing);
	}
	return groups;
}

function EditorSpecEditorInner({
	spec,
	onChange,
	nodePlugins,
	markPlugins,
}: EditorSpecEditorProps) {
	const allPlugins = useMemo(
		() => [...markPlugins, ...nodePlugins],
		[markPlugins, nodePlugins],
	);

	const grouped = useMemo(() => groupByCategory(allPlugins), [allPlugins]);

	const handleToggle = useCallback(
		(pluginId: string, isMark: boolean) => {
			const collection = isMark ? "marks" : "nodes";
			const current = spec[collection];

			if (pluginId in current) {
				// Remove — disable
				const { [pluginId]: _, ...rest } = current;
				onChange({ ...spec, [collection]: rest });
			} else {
				// Add — enable with default settings
				const plugin = allPlugins.find((p) => p.id === pluginId);
				const defaults = plugin?.defaultSettings ?? {};
				onChange({
					...spec,
					[collection]: { ...current, [pluginId]: { ...defaults } },
				});
			}
		},
		[spec, onChange, allPlugins],
	);

	const handleSettingsChange = useCallback(
		(pluginId: string, isMark: boolean, settings: NodeOptions) => {
			const collection = isMark ? "marks" : "nodes";
			onChange({
				...spec,
				[collection]: {
					...spec[collection],
					[pluginId]: settings,
				},
			});
		},
		[spec, onChange],
	);

	return (
		<div data-testid="editor-spec-editor">
			{categoryOrder.map((category) => {
				const plugins = grouped.get(category);
				if (!plugins || plugins.length === 0) return null;

				return (
					<div
						key={category}
						data-testid={`category-${category}`}
						style={{ marginBottom: "16px" }}
					>
						<h4
							style={{
								fontSize: "12px",
								fontWeight: 600,
								textTransform: "uppercase",
								letterSpacing: "0.05em",
								color: "var(--chakra-colors-fg-subtle)",
								marginBottom: "8px",
								marginTop: 0,
							}}
						>
							{categoryLabels[category]}
						</h4>
						{plugins.map((plugin) => {
							const collection = plugin.isMark ? spec.marks : spec.nodes;
							const enabled = plugin.id in collection;
							const settings = collection[plugin.id];

							return (
								<PluginToggle
									key={plugin.id}
									plugin={plugin}
									enabled={enabled}
									settings={settings}
									onToggle={handleToggle}
									onSettingsChange={handleSettingsChange}
								/>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

export const EditorSpecEditor = EditorSpecEditorInner;
(EditorSpecEditor as { displayName?: string }).displayName = "EditorSpecEditor";
