import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#3d63f5",
          600: "#2f4fd6",
          700: "#243fae",
        },
      },
    },
  },
  plugins: [],
};
export default config;
