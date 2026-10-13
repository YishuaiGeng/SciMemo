import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDoc} from '../.test-build/core/types.js';
import {addSubmission,addSubmissionEvent,searchDocs} from '../.test-build/core/domain.js';
import {
  agenda,agendaByBucket,bucketLabels,daysBetween,inReviewStatuses,localCalendarDate,
  paperStats,kindCounts,readContext,stalled,timeline,undatedEntries,auditReferences,
} from '../.test-build/core/read/index.js';

/** Deterministic clock and ID source: a counter keeps IDs unique and sortable. */
function testContext(start='2026-03-10T09:00:00.000Z'){
  let current=Date.parse(start), n=0;
  return {
    now:()=>new Date(current).toISOString(),
    uid:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,
    tick(ms=1000){current+=ms;},
    get today(){return localCalendarDate(new Date(current));},
  };
}

const at=(ctx,today) => ({today,nowIso:ctx.now()});

const paper=(ctx,title='Manuscript')=>makeDoc('paper',{title,summary:'',stage:'writing',nextAction:'',tags:[],archived:false,targets:[],submissions:[]},ctx);

const deadline=(ctx,date,extra={})=>
  makeDoc('deadline',{title:`D ${date}`,deadlineType:extra.deadlineType??'submission',timing:{precision:'date',date},paperId:extra.paperId??null,venueId:null,editionId:null,sourceUrl:'',checkedOn:null,notes:'',completed:extra.completed??false},ctx);

const instant=(ctx,iso)=>makeDoc('deadline',{title:'Precise',deadlineType:'submission',timing:{precision:'instant',at:iso,timezone:'Etc/GMT+12',original:iso},paperId:null,venueId:null,editionId:null,sourceUrl:'',checkedOn:null,notes:'',completed:false},ctx);

const workspace=(docs)=>({schemaVersion:1,localRevision:0,docs:Object.fromEntries(docs.map(d=>[d.id,d])),outbox:[],conflicts:[],cursor:0,serverId:null});

/* ── Context and date primitives ─────────────────────────────────────────── */

test('read context must be supplied by the caller, so tests can fix today',()=>{
  const ctx=testContext();
  const rc=readContext(new Date('2026-03-10T23:30:00.000Z'));
  assert.equal(typeof rc.today,'string');
  assert.match(rc.today,/^\d{4}-\d{2}-\d{2}$/);
  void ctx;
});

test('local calendar date uses local getters, not UTC',()=>{
  // 23:30 UTC on the 10th is already the 11th in UTC+13.
  const d=new Date(2026,2,11,12,0,0);
  assert.equal(localCalendarDate(d),'2026-03-11');
});

test('calendar-day distance crosses month and leap boundaries',()=>{
  assert.equal(daysBetween('2026-02-27','2026-03-02'),3);
  assert.equal(daysBetween('2028-02-28','2028-03-01'),2); // 2028 is a leap year
  assert.equal(daysBetween('2026-03-10','2026-03-10'),0);
});

/* ── Agenda ──────────────────────────────────────────────────────────────── */

test('empty workspace yields an empty agenda instead of throwing',()=>{
  const ctx=testContext();
  assert.deepEqual(agenda(workspace([]),at(ctx,'2026-03-10')),[]);
  assert.deepEqual(agendaByBucket(workspace([]),at(ctx,'2026-03-10')),[]);
});

test('a date-only deadline due today is not overdue',()=>{
  const ctx=testContext();
  const ws=workspace([deadline(ctx,'2026-03-10')]);
  const items=agenda(ws,at(ctx,'2026-03-10'));
  assert.equal(items[0].bucket,'today');
  assert.equal(items[0].dueOn,'2026-03-10');
});

test('agenda buckets sort by urgency and group without losing order',()=>{
  const ctx=testContext();
  const ws=workspace([
    deadline(ctx,'2026-04-20'), // later
    deadline(ctx,'2026-03-20'), // next30
    deadline(ctx,'2026-03-14'), // next7
    deadline(ctx,'2026-03-10'), // today
    deadline(ctx,'2026-03-01'), // overdue
  ]);
  const items=agenda(ws,at(ctx,'2026-03-10'));
  assert.deepEqual(items.map(i=>i.bucket),['overdue','today','next7','next30','later']);
  const grouped=agendaByBucket(ws,at(ctx,'2026-03-10'));
  assert.deepEqual(grouped.map(g=>g.bucket),['overdue','today','next7','next30','later']);
  assert.ok(grouped.every(g=>g.items.length===1));
  assert.equal(bucketLabels.overdue,'已过期');
});

test('completed deadlines stay out of the agenda',()=>{
  const ctx=testContext();
  const ws=workspace([deadline(ctx,'2026-03-01',{completed:true})]);
  assert.equal(agenda(ws,at(ctx,'2026-03-10')).length,0);
});

test('agenda resolves paper and venue titles and flags dangling references',()=>{
  const ctx=testContext();
  const p=paper(ctx,'Live paper');
  const gone={...paper(ctx,'Deleted paper'),deleted:true};
  const live=deadline(ctx,'2026-03-20',{paperId:p.id});
  const dangling=deadline(ctx,'2026-03-21',{paperId:gone.id});
  const missing=deadline(ctx,'2026-03-22',{paperId:'11111111-1111-4111-8111-111111111111'});
  const items=agenda(workspace([p,gone,live,dangling,missing]),at(ctx,'2026-03-10'));
  const byId=Object.fromEntries(items.map(i=>[i.doc.id,i]));
  assert.equal(byId[live.id].paperTitle,'Live paper');
  assert.equal(byId[live.id].danglingRef,false);
  assert.equal(byId[dangling.id].paperTitle,null);
  assert.equal(byId[dangling.id].danglingRef,true);
  assert.equal(byId[missing.id].paperTitle,null);
  assert.equal(byId[missing.id].danglingRef,true);
});

test('an instant deadline keeps its absolute time and reports passing separately',()=>{
  const ctx=testContext('2026-03-10T09:00:00.000Z');
  // 2026-03-10T11:59:00-12:00 is 2026-03-10T23:59:00Z — still ahead of the context clock.
  const future=instant(ctx,'2026-03-10T11:59:00-12:00');
  const ws=workspace([future]);
  const ahead=agenda(ws,at(ctx,'2026-03-10'))[0];
  assert.equal(ahead.instantPassed,false);
  // Advance the clock past the absolute instant; the same record is now in the past.
  const later={today:'2026-03-11',nowIso:'2026-03-11T00:00:01.000Z'};
  assert.equal(agenda(ws,later)[0].instantPassed,true);
  // dueOn is a local calendar day, never a fabricated end-of-day time.
  assert.match(ahead.dueOn,/^\d{4}-\d{2}-\d{2}$/);
});

test('a date-only deadline is never reported as an already-passed instant',()=>{
  const ctx=testContext();
  const ws=workspace([deadline(ctx,'2026-03-01')]);
  const item=agenda(ws,at(ctx,'2026-03-10'))[0];
  assert.equal(item.bucket,'overdue');
  // Date-only precision has no time of day, so there is nothing to be "passed".
  assert.equal(item.instantPassed,false);
});

/* ── Stalled ─────────────────────────────────────────────────────────────── */

test('stalled ignores finished submissions',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data=addSubmission(doc.data,{venueName:'Journal A'},ctx);
  doc.data=addSubmissionEvent(doc.data,doc.data.submissions[0].id,'accepted','2026-01-01','',ctx);
  assert.equal(stalled(workspace([doc]),{},at(ctx,'2026-06-01')).length,0);
});

test('stalled reports elapsed days and never guesses an unknown date as zero',()=>{
  const ctx=testContext();
  const dated=paper(ctx,'Dated');
  dated.data=addSubmission(dated.data,{venueName:'Journal A',submittedOn:'2026-01-01'},ctx);
  // A submission whose event history carries no usable date at all.
  const undated=paper(ctx,'Undated');
  undated.data={...undated.data,submissions:[{
    id:'00000000-0000-4000-8000-0000000000ff',venueId:null,editionId:null,
    venueNameSnapshot:'Journal B',titleSnapshot:'Undated',manuscriptNumber:'',
    submittedOn:null,events:[],
  }]};
  const items=stalled(workspace([dated,undated]),{quietDays:21},at(ctx,'2026-03-10'));
  const datedItem=items.find(i=>i.paper.data.title==='Dated');
  const unknownItem=items.find(i=>i.paper.data.title==='Undated');
  assert.equal(datedItem.daysSinceChange,68); // 2026-01-01 → 2026-03-10
  // Unknown stays null rather than being reported as "0 days" or as overdue.
  assert.equal(unknownItem.daysSinceChange,null);
  assert.equal(unknownItem.lastChangeOn,null);
  // Unknown sorts last, not as maximally overdue.
  assert.equal(items.at(-1).paper.data.title,'Undated');
});

test('a freshly recorded submission is not reported as stalled',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  // recordedAt is the context clock, i.e. today, so silence is zero days.
  doc.data=addSubmission(doc.data,{venueName:'Journal A'},ctx);
  assert.equal(stalled(workspace([doc]),{quietDays:21},at(ctx,'2026-03-10')).length,0);
});

test('stalled honours the configurable quiet period',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data=addSubmission(doc.data,{venueName:'Journal A',submittedOn:'2026-03-01'},ctx);
  assert.equal(stalled(workspace([doc]),{quietDays:21},at(ctx,'2026-03-10')).length,0);
  assert.equal(stalled(workspace([doc]),{quietDays:5},at(ctx,'2026-03-10')).length,1);
});

test('a scheduled follow-up suppresses repeated stalled prompting',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data=addSubmission(doc.data,{venueName:'Journal A',submittedOn:'2026-01-01'},ctx);
  const follow=deadline(ctx,'2026-03-20',{paperId:doc.id,deadlineType:'followup'});
  const items=stalled(workspace([doc,follow]),{quietDays:21},at(ctx,'2026-03-10'));
  assert.equal(items.length,1);
  assert.equal(items[0].hasUpcomingDeadline,true);
});

/* ── Timeline ────────────────────────────────────────────────────────────── */

test('timeline orders by recording time, so a backfilled date does not jump position',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data=addSubmission(doc.data,{venueName:'Journal A',submittedOn:'2026-02-01'},ctx);
  const submissionId=doc.data.submissions[0].id;
  ctx.tick();
  doc.data=addSubmissionEvent(doc.data,submissionId,'under_review','2026-02-10','',ctx);
  ctx.tick();
  // Backfilled with a much older occurrence date, but recorded later.
  doc.data=addSubmissionEvent(doc.data,submissionId,'editorial','2026-01-15','补录',ctx);
  const entries=timeline(doc,workspace([]),at(ctx,'2026-03-10'));
  const events=entries.filter(e=>e.kind==='event');
  // Recording order is preserved even though the backfilled date is the earliest.
  assert.deepEqual(events.map(e=>e.status),['submitted','under_review','editorial']);
  assert.deepEqual(events.map(e=>e.occurredOn),['2026-02-01','2026-02-10','2026-01-15']);
  // Both dates are exposed so the UI can label them apart.
  assert.ok(events.every(e=>e.recordedAt));
  assert.deepEqual(undatedEntries(entries).map(e=>e.kind),['created']);
});

test('timeline keeps every submission after a transfer and names the candidate target',()=>{
  const ctx=testContext();
  const venue=makeDoc('venue',{name:'Journal B',abbreviation:'JB',venueType:'journal',website:'',submissionUrl:'',notes:'',checkedOn:null,editions:[]},ctx);
  const doc=paper(ctx,'Original title');
  doc.data.targets=[{venueId:venue.id,reason:'scope match',priority:1}];
  doc.data=addSubmission(doc.data,{venueName:'Journal A'},ctx);
  doc.data=addSubmissionEvent(doc.data,doc.data.submissions[0].id,'rejected',null,'',ctx);
  doc.data=addSubmission(doc.data,{venueName:'Journal B'},ctx);
  assert.equal(doc.data.submissions.length,2);
  const entries=timeline(doc,workspace([venue]),at(ctx,'2026-03-10'));
  const submissions=entries.filter(e=>e.kind==='submission');
  assert.equal(submissions.length,2);
  assert.match(submissions[0].label,/Journal A/);
  assert.match(submissions[1].label,/Journal B/);
  const candidate=entries.find(e=>e.kind==='candidate');
  assert.equal(candidate.detail,'JB · scope match');
});

test('timeline shows a deleted candidate target without crashing',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data.targets=[{venueId:'22222222-2222-4222-8222-222222222222',reason:'',priority:1}];
  const entries=timeline(doc,workspace([]),at(ctx,'2026-03-10'));
  assert.match(entries.find(e=>e.kind==='candidate').detail,/已删除的目标/);
});

/* ── Stats ───────────────────────────────────────────────────────────────── */

test('paper stats separate review, revision and not-yet-submitted work',()=>{
  const ctx=testContext();
  const review=paper(ctx,'In review');
  review.data=addSubmission(review.data,{venueName:'A'},ctx);
  const revision=paper(ctx,'Needs revision');
  revision.data=addSubmission(revision.data,{venueName:'B'},ctx);
  revision.data=addSubmissionEvent(revision.data,revision.data.submissions[0].id,'major_revision',null,'',ctx);
  const notSubmitted=paper(ctx,'Just an idea');
  const archived=paper(ctx,'Archived');
  archived.data={...archived.data,archived:true};
  const stats=paperStats(workspace([review,revision,notSubmitted,archived]));
  assert.equal(stats.active,3);
  assert.equal(stats.archived,1);
  assert.equal(stats.underReview,1);
  assert.equal(stats.awaitingRevision,1);
  assert.equal(stats.notYetSubmitted,1);
});

test('stats share one status grouping instead of hardcoding it in the UI',()=>{
  assert.deepEqual([...inReviewStatuses],['submitted','editorial','under_review','resubmitted']);
});

test('kind counts never mix record types into one number',()=>{
  const ctx=testContext();
  const ws=workspace([
    paper(ctx),paper(ctx,'Second'),
    makeDoc('note',{title:'',body:'idea',noteType:'idea',paperIds:[],tags:[],pinned:false},ctx),
    makeDoc('venue',{name:'V',abbreviation:'',venueType:'journal',website:'',submissionUrl:'',notes:'',checkedOn:null,editions:[]},ctx),
    deadline(ctx,'2026-03-01'),
    deadline(ctx,'2026-03-05',{completed:true}),
  ]);
  const counts=kindCounts(ws);
  assert.equal(counts.paper,2);
  assert.equal(counts.note,1);
  assert.equal(counts.venue,1);
  assert.equal(counts.deadline,2);
  assert.equal(counts.openDeadlines,1);
});

test('kind counts exclude deleted records',()=>{
  const ctx=testContext();
  const p=paper(ctx);
  assert.equal(kindCounts(workspace([{...p,deleted:true}])).paper,0);
});

/* ── Search ──────────────────────────────────────────────────────────────── */

test('search matches values only, so a field name is not a hit',()=>{
  const ctx=testContext();
  const ws=workspace([paper(ctx,'Quantum annealing')]);
  // "title" used to match every record because JSON.stringify included the key.
  assert.equal(searchDocs(ws,'title').length,0);
  assert.equal(searchDocs(ws,'quantum').length,1);
});

test('search is case-insensitive and spans nested submission history',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data=addSubmission(doc.data,{venueName:'Journal of Methods',manuscriptNumber:'ABC-123'},ctx);
  const ws=workspace([doc]);
  assert.equal(searchDocs(ws,'JOURNAL OF METHODS').length,1);
  assert.equal(searchDocs(ws,'abc-123').length,1);
});

test('search skips deleted records and honours a kind filter',()=>{
  const ctx=testContext();
  const p=paper(ctx,'Shared keyword');
  const n=makeDoc('note',{title:'Shared keyword',body:'Shared keyword',noteType:'idea',paperIds:[],tags:[],pinned:false},ctx);
  const ws=workspace([p,n,{...paper(ctx,'Shared keyword'),deleted:true}]);
  assert.equal(searchDocs(ws,'shared keyword').length,2);
  assert.equal(searchDocs(ws,'shared keyword',{kinds:['note']}).length,1);
  assert.equal(searchDocs(ws,'   ').length,0);
});

/* ── Purity ──────────────────────────────────────────────────────────────── */

test('read models do not mutate the workspace they are given',()=>{
  const ctx=testContext();
  const doc=paper(ctx);
  doc.data=addSubmission(doc.data,{venueName:'A',submittedOn:'2026-01-01'},ctx);
  const ws=workspace([doc,deadline(ctx,'2026-03-20'),deadline(ctx,'2026-03-01')]);
  const before=structuredClone(ws);
  agenda(ws,at(ctx,'2026-03-10'));
  agendaByBucket(ws,at(ctx,'2026-03-10'));
  stalled(ws,{},at(ctx,'2026-03-10'));
  timeline(doc,ws,at(ctx,'2026-03-10'));
  paperStats(ws);
  kindCounts(ws);
  searchDocs(ws,'a');
  auditReferences(ws);
  assert.deepEqual(ws,before);
});

test('the same inputs always produce the same view, regardless of system time',()=>{
  const ctx=testContext();
  const ws=workspace([deadline(ctx,'2026-03-20'),deadline(ctx,'2026-03-01')]);
  const first=agenda(ws,at(ctx,'2026-03-10')).map(i=>[i.doc.id,i.bucket,i.dueOn]);
  const second=agenda(ws,at(ctx,'2026-03-10')).map(i=>[i.doc.id,i.bucket,i.dueOn]);
  assert.deepEqual(first,second);
  // readContext is the only bridge from a real Date; read models never call it themselves.
  const rc=readContext(new Date('2026-03-10T09:00:00.000Z'));
  assert.deepEqual(agenda(ws,rc).map(i=>i.bucket),agenda(ws,at(ctx,rc.today)).map(i=>i.bucket));
});
