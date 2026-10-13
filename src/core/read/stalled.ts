import type {Doc,Paper,Submission,Workspace} from '../types.js';
import {currentStatus,latestSubmission} from '../domain.js';
import {instantToLocalDate,type ReadContext} from './context.js';
import {agenda} from './agenda.js';

export interface StalledItem {
  paper:Doc<'paper'>;
  submission:Submission;
  venueNameSnapshot:string;
  /** Latest known fact date of this submission, or null when nothing is dated. */
  lastChangeOn:string|null;
  /** Days of silence, or null when no date is known. Never guessed as zero. */
  daysSinceChange:number|null;
  manuscriptNumber:string;
  /** A follow-up or revision deadline is already scheduled, so do not prompt again. */
  hasUpcomingDeadline:boolean;
}

export interface StalledOptions {
  /**
   * Days of silence before an in-flight submission is surfaced. Defaults to 21 and
   * must stay user-configurable: review cycles differ by orders of magnitude between
   * fields (weeks at some venues, the better part of a year in some mathematics
   * journals), so any fixed threshold is wrong for somebody.
   */
  quietDays?:number;
}

export const defaultQuietDays=21;
export const terminalStatusList=['accepted','rejected','withdrawn'] as const;

const daysBetween=(from:string,to:string):number =>
  Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86_400_000);

/**
 * The most recent date this submission is known to have changed.
 *
 * Prefers the occurrence date of the last recorded event and falls back to when it
 * was recorded. Returns null when neither yields a usable calendar day.
 */
export function lastChangeDate(submission:Submission):string|null {
  const last=submission.events.at(-1);
  if(!last)return null;
  return last.occurredOn??instantToLocalDate(last.recordedAt);
}

/**
 * In-flight submissions that have been silent for longer than `quietDays`.
 *
 * Deliberately descriptive: it reports elapsed time since the last recorded fact. It
 * does not conclude that a venue forgot the manuscript, and finished submissions are
 * excluded because a decision is not a problem to chase.
 *
 * `ctx` is required — the caller decides what "today" is.
 */
export function stalled(ws:Workspace,opts:StalledOptions,ctx:ReadContext):StalledItem[] {
  const quietDays=opts.quietDays??defaultQuietDays;
  // A paper with a scheduled follow-up or revision deadline is already being tracked,
  // so nagging about it again would be noise.
  const tracked=new Set<string>();
  for(const item of agenda(ws,ctx))if(item.doc.data.paperId)tracked.add(item.doc.data.paperId);
  const items:StalledItem[]=[];
  for(const doc of Object.values(ws.docs)){
    if(doc.kind!=='paper'||doc.deleted)continue;
    const submission=latestSubmission(doc.data as Paper);
    if(!submission)continue;
    if((terminalStatusList as readonly string[]).includes(currentStatus(submission)))continue;
    const lastChangeOn=lastChangeDate(submission);
    const daysSinceChange=lastChangeOn?daysBetween(lastChangeOn,ctx.today):null;
    // Undated in-flight submissions are surfaced too: something is running with no
    // known history, which is itself worth noticing.
    if(daysSinceChange!==null&&daysSinceChange<quietDays)continue;
    items.push({
      paper:doc as Doc<'paper'>,
      submission,
      venueNameSnapshot:submission.venueNameSnapshot,
      lastChangeOn,
      daysSinceChange,
      manuscriptNumber:submission.manuscriptNumber,
      hasUpcomingDeadline:tracked.has(doc.id),
    });
  }
  // Undated items sort last: unknown is not the same as maximally overdue.
  return items.sort((a,b)=>issueRank(b)-issueRank(a));
}

const issueRank=(item:StalledItem)=>item.daysSinceChange??-1;
