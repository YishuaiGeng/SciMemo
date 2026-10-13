import {makeDoc,uid,type Doc} from './types.js';
import {addSubmission,addSubmissionEvent} from './domain.js';
export function demoDocs():Doc[]{
  const journal=makeDoc('venue',{name:'示例：Journal of Research Methods',abbreviation:'JRM (demo)',venueType:'journal',website:'https://example.org',submissionUrl:'',notes:'虚构示例，不代表真实期刊或投稿建议。',checkedOn:null,editions:[]});
  const conference=makeDoc('venue',{name:'示例：Research Systems Conference',abbreviation:'RSC (demo)',venueType:'conference',website:'https://example.org',submissionUrl:'',notes:'虚构会议；仅用于演示届次与截稿日期。',checkedOn:null,editions:[{id:uid(),label:'RSC 2027 (demo)',year:2027,website:'https://example.org',notes:'虚构届次'}]});
  const paper=makeDoc('paper',{title:'示例：从失败案例中提炼可复用的方法',summary:'这是演示条目。记录关键实验、修改原因与每轮投稿，不代表任何真实研究进度。',stage:'revising',nextAction:'补充两个对照实验，然后整理回复提纲。',tags:['演示','方法研究'],archived:false,targets:[{venueId:journal.id,reason:'演示：范围匹配，需要检查篇幅要求。',priority:1}],submissions:[]});
  paper.data=addSubmission(paper.data,{venueName:journal.data.name,venueId:journal.id,submittedOn:null});
  paper.data=addSubmissionEvent(paper.data,paper.data.submissions[0].id,'major_revision',null,'演示：审稿人建议增加跨任务验证。');
  const paper2=makeDoc('paper',{title:'示例：一个还没有正式题名的工作',summary:'允许先使用暂定名称。',stage:'experiments',nextAction:'先验证核心假设，不急于扩大实验规模。',tags:['演示'],archived:false,targets:[],submissions:[]});
  const note=makeDoc('note',{title:'失败经验是否也能帮助下一次尝试？',body:'如果系统只记住成功方案，会不会失去有价值的失败信息？\n\n一个值得验证的创新点：把失败原因整理成可检查的约束，再考察它是否能减少后续重复错误。\n\n这是虚构示例，可直接删除。',noteType:'idea',paperIds:[paper.id],tags:['灵感','演示'],pinned:true});
  const date=new Date();date.setDate(date.getDate()+14);
  const dateKey=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const deadline=makeDoc('deadline',{title:'示例：修回计划日期（非真实截止）',deadlineType:'revision',timing:{precision:'date',date:dateKey},paperId:paper.id,venueId:journal.id,editionId:null,sourceUrl:'',checkedOn:null,notes:'这是个人演示计划，不是期刊给出的截止日期。',completed:false});
  return [journal,conference,paper,paper2,note,deadline];
}
