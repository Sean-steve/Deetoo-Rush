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
  for (const [name, value] of Object.entries(tokens.easing))
    root.style.setProperty(`--deetoo-easing-${name}`, value);
  for (const [density, values] of Object.entries(tokens.density)) {
    root.style.setProperty(`--deetoo-density-${density}-control-height`, values.controlHeight);
    root.style.setProperty(`--deetoo-density-${density}-gap`, values.gap);
    root.style.setProperty(`--deetoo-density-${density}-padding`, values.padding);
  }
  for (const [name, value] of Object.entries(tokens.layout))
    root.style.setProperty(`--deetoo-layout-${name}`, value);
  for (const [name, value] of Object.entries(tokens.zIndex))
    root.style.setProperty(`--deetoo-z-${name}`, String(value));
}
