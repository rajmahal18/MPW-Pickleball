import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12386f",
        court: "#1f6fb2",
        lime: "#f4b11f",
        gold: "#f4b11f",
        flame: "#e85d2a",
        paper: "#f6f8fb",
        line: "#d8e0ea"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(18,56,111,.08)"
      }
    }
  },
  plugins: []
};
export default config;
