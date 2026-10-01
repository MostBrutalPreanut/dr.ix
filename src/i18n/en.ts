import { CONTENT } from './en-content';
import { UI } from './en-ui';

/** Hebrew text -> English text (see lib/i18n.tsx). */
export const EN: Record<string, string> = { ...CONTENT, ...UI };
