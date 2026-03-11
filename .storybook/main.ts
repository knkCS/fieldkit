import type { StorybookConfig } from "@storybook/react-vite";
import remarkGfm from "remark-gfm";

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
	addons: [
		{
			name: "@storybook/addon-essentials",
			options: { docs: false },
		},
		{
			name: "@storybook/addon-docs",
			options: {
				mdxPluginOptions: {
					mdxCompileOptions: {
						remarkPlugins: [remarkGfm],
					},
				},
			},
		},
		"@storybook/addon-a11y",
	],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	typescript: {
		reactDocgen: "react-docgen-typescript",
	},
};

export default config;
