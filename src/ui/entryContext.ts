import { createContext } from 'react';
import { dayKey } from '../core/dates';

/** Tag (YYYY-MM-DD), zu dem der gerade bearbeitete Eintrag gehört. */
export const EntryDayContext = createContext<string>(dayKey(new Date()));
