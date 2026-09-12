import type { Meta, StoryObj } from "@storybook/react";
import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  title: "Astravestis/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "space",
      values: [{ name: "space", value: "#0b0c10" }],
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {
  args: {
    title: "Astravestis",
    subtitle: "A beautiful design system inspired by the cosmos.",
  },
};
