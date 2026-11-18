// The Films page's to-do list (films to rate, Audience Award votes to cast) and the tab's count.
// Server only: reads the database.

import { buildTodo, screeningsToRate, toAgendaScreening, type TodoItem } from './agenda';
import { getRatingsForYear, getScreeningsForYear } from './db';
import type { AgendaScreening, Rating } from './types';
import { getPendingVoteLinks, type PendingVoteLink } from './vote-links';

export type Todo = TodoItem<PendingVoteLink>;

type Viewer = { email: string; visibleEmails: string[] };

/** The viewer's unused voting links; none when they can't be read (e.g. before migration 011) */
export function getPendingVoteLinksOrNone(viewer: Viewer, year: number): Promise<PendingVoteLink[]> {
  return getPendingVoteLinks(viewer, year).catch((voteError) => {
    console.warn('Could not load voting links for the to-do list:', voteError instanceof Error ? voteError.message : voteError);
    return [];
  });
}

/** The to-do list from data the caller already has (the Films page loads it anyway) */
export function todoFrom(input: {
  viewer: Viewer;
  agenda: AgendaScreening[];
  ratings: Rating[];
  keysByTitle: Map<string, string>;
  voteLinks: PendingVoteLink[];
  now: Date;
}): Todo[] {
  const { viewer, agenda, ratings, keysByTitle, voteLinks, now } = input;
  const myRatings = ratings.filter((rating) => rating.userEmail === viewer.email);
  return buildTodo({
    toRate: screeningsToRate(agenda, myRatings, keysByTitle, viewer.email, now),
    voteLinks,
    screenings: agenda,
    keysByTitle,
    me: viewer.email,
    now,
  });
}

/** The viewer's to-do list for a festival year, most recent first */
export async function getTodo(viewer: Viewer, year: number, now: Date): Promise<Todo[]> {
  const [screenings, { keysByTitle, ratings }, voteLinks] = await Promise.all([
    getScreeningsForYear(viewer.visibleEmails, year),
    getRatingsForYear(viewer.visibleEmails, year),
    getPendingVoteLinksOrNone(viewer, year),
  ]);
  return todoFrom({ viewer, agenda: screenings.map(toAgendaScreening), ratings, keysByTitle, voteLinks, now });
}
