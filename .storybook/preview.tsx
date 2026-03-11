import { ChakraProvider } from "@chakra-ui/react";
import type { Preview } from "@storybook/react";
import type React from "react";
import system from "@knkcs/anker/theme";

const withChakra = (Story: React.ComponentType) => (
	<ChakraProvider value={system}>
		<Story />
	</ChakraProvider>
);

const preview: Preview = {
	decorators: [withChakra],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
};

export default preview;
