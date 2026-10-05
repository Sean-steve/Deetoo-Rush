import { tokens } from "./tokens";

/** Install variables from one token source; no domain state or API dependencies. */
export function installTheme(root: HTMLElement) {
  for (const [name, value] of Object.entries(tokens.palette))
    root.style.setProperty(`--deetoo-${name}`, value);
  root.style.setProperty("--deetoo-font-body", tokens.typography.body);
  root.style.setProperty("--deetoo-font-heading", tokens.typography.heading);
  for (const [name, value] of Object.entries(tokens.shadows))
    root.style.setProperty(`--deetoo-shadow-${name}`, value);
  for (const [name, value] of Object.entries(tokens.radius))
    root.style.setProperty(`--deetoo-radius-${name}`, value);
  for (const [name, value] of Object.entries(tokens.motion))
    root.style.setProperty(`--deetoo-motion-${name}`, value);
}
