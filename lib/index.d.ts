import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
type Mode = 'off' | 'lite' | 'full' | 'ultra';
export declare function modeFromEvents(events: readonly SessionEvent[], initial?: Mode): Mode;
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export {};
