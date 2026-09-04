import { moment } from "obsidian";

import type { TimestampFormatter } from "../core/naming";

export const formatObsidianTimestamp: TimestampFormatter = (date, format) =>
  (moment as unknown as (value: Date) => { format(pattern: string): string })(date).format(format);
