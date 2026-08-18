import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      ftonsite: {
        name: "flutter training onsite",
        source: "src/index.ts",
      },
    },
  },
});
