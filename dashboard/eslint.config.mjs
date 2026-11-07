import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/*", "node_modules/*"]),
  {
    rules: {
      // This app relies on client-only localStorage reads after mount. The
      // rules below flag those established patterns; revisit alongside a
      // move to server-backed sessions.
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
