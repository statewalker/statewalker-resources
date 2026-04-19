import { newAdapter } from "../../lib/newAdapter.js";

export const [getError, setError] = newAdapter<Error | undefined>(
  "context.error",
);
