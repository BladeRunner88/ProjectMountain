import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

const resolve = {
  alias: {
    "@": root,
  },
}

const exclude = ["**/node_modules/**", "**/.next/**"]

export default defineConfig({
  resolve,
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "node",
          environment: "node",
          // Service/store logic under features/ runs without a DOM.
          include: ["features/**/*.test.ts"],
          exclude,
        },
      },
      {
        resolve,
        test: {
          name: "jsdom",
          environment: "jsdom",
          // Pin a real origin: jsdom disables localStorage/sessionStorage for
          // opaque origins, which the browser-facing lib helpers rely on.
          environmentOptions: {
            jsdom: { url: "http://localhost:3000" },
          },
          setupFiles: [path.join(root, "vitest.setup.ts")],
          // Everything that touches the DOM: components, hooks, browser-facing
          // lib helpers, and any component test colocated under features/.
          include: [
            "lib/**/*.test.{ts,tsx}",
            "hooks/**/*.test.{ts,tsx}",
            "components/**/*.test.{ts,tsx}",
            "app/**/*.test.{ts,tsx}",
            "features/**/*.test.tsx",
          ],
          exclude,
        },
      },
    ],
  },
})
