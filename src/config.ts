/**
 * ============================================================
 * TEMPORARY DEVELOPMENT SETTINGS
 * ============================================================
 *
 * To restore the normal daily game, set both values back:
 *
 *   export const DAILY_MODE = true;
 *   export const GUESS_LIMIT: number | null = 6;
 *
 * Nothing else needs to change. The daily rotation, six-guess cap, streaks
 * and stats are all still implemented and tested; these two flags just switch
 * them off.
 */

/**
 * false → free play: a random bird, replayable immediately, not tied to the
 * date. Streaks and the daily countdown are meaningless without a daily
 * puzzle, so they are hidden while this is off.
 */
export const DAILY_MODE = false;

/** null → unlimited guesses; a number caps them and ends the game on a loss. */
export const GUESS_LIMIT: number | null = null;
