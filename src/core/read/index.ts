/**
 * Derived read models.
 *
 * Every export here is a pure function over a Workspace. Two rules hold for the whole
 * directory:
 *
 *  1. Nothing reads the clock. Callers pass a ReadContext.
 *  2. Nothing writes. No output is persisted, and no output is part of the sync
 *     protocol — an index or a grouping must always be recomputable from `docs`.
 *
 * See docs/READ_MODEL.md for the rules each view must satisfy.
 */
export {agenda,agendaByBucket,bucketLabels,daysBetween,type AgendaBucket,type AgendaItem} from './agenda.js';
export {defaultQuietDays,lastChangeDate,stalled,terminalStatusList,type StalledItem,type StalledOptions} from './stalled.js';
export {timeline,undatedEntries,type TimelineEntry,type TimelineKind} from './timeline.js';
export {kindCounts,paperStats,type KindCounts,type PaperStats} from './stats.js';
export {
  awaitingDecisionStatuses,compareCalendarDates,inReviewStatuses,instantToLocalDate,
  liveDoc,localCalendarDate,readContext,referenceTitle,type ReadContext,
} from './context.js';
export {auditReferences,type ReferenceIssue} from '../references.js';
