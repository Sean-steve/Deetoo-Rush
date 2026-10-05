/** Test-only clock: keep time advancing, but start during the seeded kitchens' Nairobi opening hours.
 * Opt in explicitly; never import this from application code.
 */
const SystemDate = Date;
const now = SystemDate.now();
const reference = new SystemDate(now);
reference.setUTCHours(10, 0, 0, 0); // 13:00 Africa/Nairobi
const shift = reference.getTime() - now;
class BusinessHoursDate extends SystemDate {
  constructor(...args) {
    super(...(args.length ? args : [SystemDate.now() + shift]));
  }
  static now() {
    return SystemDate.now() + shift;
  }
}
globalThis.Date = BusinessHoursDate;
