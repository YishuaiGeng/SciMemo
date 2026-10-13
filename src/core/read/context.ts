import type {Doc,Workspace} from '../types.js';
import {titleOf} from '../domain.js';

/**
 * Shared read-model inputs.
 *
 * `today` and `nowIso` are supplied by the caller. Read models must not read the
 * clock: crossing midnight would otherwise be unassertable, and "is this overdue"
 * would depend on when the page happened to render.
 *
 * `today` is display semantics only. It must never be used to compare versions or
 * decide sync outcomes.
 */
export interface ReadContext { today:string; nowIso:string }

/** Build a ReadContext from a Date; UI passes `new Date()`, tests pass a fixed date. */
export function readContext(at=new Date()):ReadContext {
  return {today:localCalendarDate(at),nowIso:at.toISOString()};
}

/**
 * Local calendar date as YYYY-MM-DD. Uses local getters on purpose: "today" for a
 * user in UTC+13 is their local day, not UTC's.
 */
export function localCalendarDate(d:Date):string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Compare two YYYY-MM-DD strings. Lexicographic order is correct for this format,
 * so no Date parsing (and no timezone accident) is involved.
 */
export const compareCalendarDates = (a:string,b:string) => a<b?-1:a>b?1:0;

/**
 * Calendar day of an instant, in the *local* timezone. Calendar-day arithmetic on
 * `Date` handles month, year and leap boundaries; DST shifts still land on the
 * intended local day.
 */
export function instantToLocalDate(iso:string):string|null {
  const parsed=Date.parse(iso);
  return Number.isNaN(parsed)?null:localCalendarDate(new Date(parsed));
}

/**
 * The single list of "in flight" statuses. UI code previously hardcoded this array
 * inline, which drifts from the domain enum. Keep one definition.
 */
export const inReviewStatuses = ['submitted','editorial','under_review','resubmitted'] as const;
export const awaitingDecisionStatuses = ['major_revision','minor_revision'] as const;

/** Index helper: look up a live document by id, ignoring deleted or wrong-kind hits. */
export function liveDoc<K extends Doc['kind']>(ws:Workspace,id:string|null,kind:K):Extract<Doc,{kind:K}>|null {
  if(!id)return null;
  const doc=ws.docs[id];
  if(!doc||doc.deleted||doc.kind!==kind)return null;
  return doc as Extract<Doc,{kind:K}>;
}

/** Title of a referenced document, or null when it is missing or deleted. */
export function referenceTitle(ws:Workspace,id:string|null,kind:Doc['kind']):string|null {
  const doc=liveDoc(ws,id,kind);
  return doc?titleOf(doc):null;
}
