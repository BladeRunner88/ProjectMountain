/** Vite used `import.meta.env.DEV`; Next inlines `NODE_ENV` the same way in client and server bundles. */
export const IS_DEV: boolean = process.env.NODE_ENV !== "production"
