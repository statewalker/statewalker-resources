// vitest.config.js
import path from "node:path";

export default {
  plugins: [],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
  },
}