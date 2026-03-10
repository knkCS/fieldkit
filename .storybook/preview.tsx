import type { Preview } from "@storybook/react";
import { Provider } from "@knkcs/anker/primitives";

const preview: Preview = {
  decorators: [
    (Story) => (
      <Provider>
        <Story />
      </Provider>
    ),
  ],
};

export default preview;
