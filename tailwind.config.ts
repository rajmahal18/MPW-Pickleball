import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12221b",
        court: "#0f6f5d",
        lime: "#cbe856",
        paper: "#f5f7f1",
        line: "#d9e0d6"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(18,34,27,.08)"
      }
    }
  },
  plugins: []
};
export default config;
