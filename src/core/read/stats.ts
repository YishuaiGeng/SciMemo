import type {Workspace} from '../types.js';
import {currentStatus,latestSubmission,visible} from '../domain.js';
import {awaitingDecisionStatuses,inReviewStatuses} from './context.js';

export interface PaperStats {
  /** Not archived. */
  active:number;
  archived:number;
  /** In-flight submission whose current status is submitted/editorial/under_review/resubmitted. */
  underReview:number;
  /** Latest submission is waiting on the author (major or minor revision). */
  awaitingRevision:number;
  /** Active manuscripts with no submission yet. */
  notYetSubmitted:number;
}

export interface KindCounts {
  paper:number;
  note:number;
  venue:number;
  deadline:number;
  /** Unfinished deadlines only. */
  openDeadlines:number;
}

/**
 * Headline numbers.
 *
 * Deliberately no completion percentage: a research stage is a position, not progress
 * toward a known finish line, and a fabricated percentage misleads.
 */
export function paperStats(ws:Workspace):PaperStats {
  const papers=visible(ws,'paper');
  let active=0,archived=0,underReview=0,awaitingRevision=0,notYetSubmitted=0;
  for(const paper of papers){
    if(paper.data.archived)archived++;
    else active++;
    const submission=latestSubmission(paper.data);
    if(!submission){
      if(!paper.data.archived)notYetSubmitted++;
      continue;
    }
    const status=currentStatus(submission);
    if((inReviewStatuses as readonly string[]).includes(status))underReview++;
    else if((awaitingDecisionStatuses as readonly string[]).includes(status))awaitingRevision++;
  }
  return {active,archived,underReview,awaitingRevision,notYetSubmitted};
}

/** Counts per record type. Mixing all kinds into one number told the user nothing. */
export function kindCounts(ws:Workspace):KindCounts {
  const deadlines=visible(ws,'deadline');
  return {
    paper:visible(ws,'paper').length,
    note:visible(ws,'note').length,
    venue:visible(ws,'venue').length,
    deadline:deadlines.length,
    openDeadlines:deadlines.filter(d=>!d.data.completed).length,
  };
}
