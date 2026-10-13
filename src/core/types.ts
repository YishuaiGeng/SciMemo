/** Domain types. No React, native IPC or HTTP dependency belongs here. */
export const stages = ['idea','experiments','writing','revising','paused','finished'] as const;
export type Stage = typeof stages[number];
export const statuses = ['submitted','editorial','under_review','major_revision','minor_revision','resubmitted','accepted','rejected','withdrawn'] as const;
export type SubmissionStatus = typeof statuses[number];
export const terminalStatuses = new Set<SubmissionStatus>(['accepted','rejected','withdrawn']);
export interface SubmissionEvent {
  id: string; status: SubmissionStatus; occurredOn: string | null;
  recordedAt: string; note: string;
}
export interface Submission {
  id: string; venueId: string | null; editionId: string | null;
  venueNameSnapshot: string; titleSnapshot: string; manuscriptNumber: string;
  submittedOn: string | null; events: SubmissionEvent[];
}
export interface Paper {
  title: string; summary: string; stage: Stage; nextAction: string; tags: string[];
  archived: boolean; targets: { venueId: string; reason: string; priority: number }[];
  submissions: Submission[];
}
export interface Note {
  title: string; body: string; noteType: 'idea'|'note'|'progress';
  paperIds: string[]; tags: string[]; pinned: boolean;
}
export interface Venue {
  name: string; abbreviation: string; venueType: 'journal'|'conference';
  website: string; submissionUrl: string; notes: string; checkedOn: string | null;
  editions: { id: string; label: string; year: number; website: string; notes: string }[];
}
export type Timing = { precision:'date'; date:string } |
  { precision:'instant'; at:string; timezone:string; original:string };
export interface Deadline {
  title:string; deadlineType:'submission'|'revision'|'followup'|'conference'|'other';
  timing:Timing; paperId:string|null; venueId:string|null; editionId:string|null;
  sourceUrl:string; checkedOn:string|null; notes:string; completed:boolean;
}
export interface DataByKind { paper:Paper; note:Note; venue:Venue; deadline:Deadline }
export type Kind = keyof DataByKind;
export type Doc<K extends Kind = Kind> = K extends Kind ? {
  id:string; kind:K; data:DataByKind[K]; createdAt:string; updatedAt:string;
  version:number; deleted:boolean;
} : never;
export interface Operation { opId:string; baseVersion:number; doc:Doc }
export interface Conflict { id:string; local:Doc; remote:Doc|null; detectedAt:string; resolved:boolean }
export interface Workspace {
  schemaVersion:1; localRevision:number; docs:Record<string,Doc>; outbox:Operation[];
  conflicts:Conflict[]; cursor:number; serverId:string|null;
}
export interface Driver {
  readonly name:string;
  load():Promise<Workspace>;
  /** Compare-and-swap. Entire state + outbox must commit atomically. */
  save(expectedRevision:number, next:Workspace):Promise<void>;
}
export interface PushResult { opId:string; status:'accepted'|'conflict'; doc:Doc|null }
export interface PullResult { serverId:string; changes:{seq:number;doc:Doc}[]; cursor:number; hasMore:boolean }
export interface SyncTransport {
  info():Promise<{serverId:string;protocol:1}>;
  push(operations:Operation[], serverId:string):Promise<{results:PushResult[]}>;
  pull(cursor:number, serverId:string):Promise<PullResult>;
}
export const emptyWorkspace = ():Workspace => ({schemaVersion:1,localRevision:0,docs:{},outbox:[],conflicts:[],cursor:0,serverId:null});
/**
 * Ambient inputs to domain rules. Domain functions must not read the clock or the
 * random source directly: without injection, "backfilling an old date does not
 * change the current status" cannot be asserted at a fixed time.
 */
export interface Context { now:()=>string; uid:()=>string }
export const systemContext:Context = { now:()=>new Date().toISOString(), uid:()=>crypto.randomUUID() };
export const now = () => systemContext.now();
export const uid = () => systemContext.uid();
export function makeDoc<K extends Kind>(kind:K,data:DataByKind[K],ctx:Context=systemContext):Doc<K> {
  const time=ctx.now(); return {id:ctx.uid(),kind,data,createdAt:time,updatedAt:time,version:0,deleted:false} as Doc<K>;
}
export const stageLabels:Record<Stage,string>={idea:'构思中',experiments:'实验中',writing:'写作中',revising:'修改中',paused:'已暂停',finished:'已完成'};
export const statusLabels:Record<SubmissionStatus,string>={submitted:'已投稿',editorial:'编辑处理中',under_review:'审稿中',major_revision:'需要大修',minor_revision:'需要小修',resubmitted:'已提交修订',accepted:'已接收',rejected:'已拒稿',withdrawn:'已撤稿'};
