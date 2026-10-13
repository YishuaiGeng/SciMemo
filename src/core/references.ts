import type {Doc,Kind,Workspace} from './types.js';
import {titleOf} from './domain.js';

export interface ReferenceIssue {
  sourceId:string;
  sourceTitle:string;
  relation:string;
  targetId:string;
  reason:'missing'|'deleted'|'wrong_kind'|'missing_edition'|'missing_parent';
}

/** A derived read model, never a cascade or a reason to reject out-of-order sync. */
export function auditReferences(ws:Workspace):ReferenceIssue[]{
  const issues:ReferenceIssue[]=[];
  for(const source of Object.values(ws.docs)){
    if(source.deleted)continue;
    const report=(relation:string,targetId:string,reason:ReferenceIssue['reason'])=>{
      issues.push({sourceId:source.id,sourceTitle:titleOf(source),relation,targetId,reason});
    };
    const check=(id:string|null,kind:Kind,relation:string):Doc|undefined=>{
      if(!id)return;
      const target=ws.docs[id];
      if(!target)report(relation,id,'missing');
      else if(target.kind!==kind)report(relation,id,'wrong_kind');
      else if(target.deleted)report(relation,id,'deleted');
      return target;
    };
    const checkEdition=(venueId:string|null,editionId:string|null,relation:string)=>{
      if(!editionId)return;
      if(!venueId){report(relation,editionId,'missing_parent');return;}
      const venue=ws.docs[venueId];
      if(venue?.kind==='venue'&&!venue.deleted&&!venue.data.editions.some(e=>e.id===editionId))report(relation,editionId,'missing_edition');
    };
    if(source.kind==='note')for(const id of source.data.paperIds)check(id,'paper','关联稿件');
    if(source.kind==='paper'){
      for(const target of source.data.targets)check(target.venueId,'venue','候选目标');
      for(const submission of source.data.submissions){
        check(submission.venueId,'venue',`投稿目标：${submission.venueNameSnapshot}`);
        checkEdition(submission.venueId,submission.editionId,`投稿届次：${submission.venueNameSnapshot}`);
      }
    }
    if(source.kind==='deadline'){
      check(source.data.paperId,'paper','日程关联稿件');
      check(source.data.venueId,'venue','日程关联目标');
      checkEdition(source.data.venueId,source.data.editionId,'日程关联届次');
    }
  }
  return issues;
}
