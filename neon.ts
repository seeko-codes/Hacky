import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: false,
  functions: {
    // Live updates over WebSocket (see functions/realtime.ts). Deploy with
    // `npx neon@latest deploy --env .env.local`; the secret comes from that file.
    realtime: {
      name: "live updates",
      source: "./functions/realtime.ts",
      env: { REALTIME_TOKEN_SECRET: process.env.REALTIME_TOKEN_SECRET! },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
