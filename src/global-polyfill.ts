// Some dependencies probe for a Node-style `global` object at module-eval time. This used to be
// an inline <script> in index.html, but that violates the strict `script-src 'self'` CSP the
// server sends in production (Vite's build preserves inline <script> tags as-is; it does not
// extract them into external bundles), so it would have silently failed there. Importing this as
// the very first line of main.tsx runs it before any other module's top-level code, matching what
// the inline script guaranteed, while keeping it inside the bundled, CSP-compliant script.
(window as unknown as { global: Window }).global = window;
