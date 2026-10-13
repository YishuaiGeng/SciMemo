import {toDomainError,type ErrorCode} from '../core/errors.js';

/**
 * How a failure should be presented.
 *
 * `sticky` means the notice must stay until the user dismisses it or a later save
 * succeeds. Everything else is transient. `unsaved` drives the wording, because
 * telling someone their edit is unsaved when it was actually saved (or vice versa)
 * is worse than saying nothing.
 */
export interface ErrorPresentation {
  /** False for a successful action's notice. */
  ok: boolean;
  /** Null for success, since success has no error code. */
  code: ErrorCode | null;
  title: string;
  detail: string;
  sticky: boolean;
  unsaved: boolean;
  retryable: boolean;
  /** Suggested next step, when there is an actionable one. */
  action: string | null;
}

/**
 * Fallback titles. The error's own message carries the specifics; this only labels
 * the category, so one code never produces two different headlines.
 */
const titles:Record<ErrorCode,string>={
  VALIDATION:'输入需要修改',
  IMMUTABLE:'这条记录不能这样改',
  STALE_EDITOR:'记录已在别处更新',
  LOCAL_CONFLICT:'另一处正在写入',
  UNRESOLVED_CONFLICT:'存在未解决的同步冲突',
  STORAGE:'未能保存到本机',
  SYNC_PROTOCOL:'同步已停止',
  SYNC_NETWORK:'无法连接同步服务',
  IMPORT_FORMAT:'备份文件无法读取',
  PRECONDITION:'当前状态下不能执行',
  NOT_FOUND:'记录不存在',
};

const actions:Partial<Record<ErrorCode,string>>={
  STALE_EDITOR:'重新打开这条记录再编辑，或先导出备份保留当前内容。',
  LOCAL_CONFLICT:'先重新加载，再重做刚才的修改。',
  UNRESOLVED_CONFLICT:'到“设置与数据”里处理这条冲突后再编辑。',
  STORAGE:'先导出备份保住当前内容，然后重试保存。',
  SYNC_PROTOCOL:'本地记录未受影响。核对服务端工作区后重试，不要直接更换服务器。',
  SYNC_NETWORK:'本地记录未受影响，网络恢复后再次同步即可。',
  PRECONDITION:'按提示调整当前工作区的状态后重试。',
};

/** Map an unknown thrown value onto a presentation for the notice bar. */
export function presentError(error:unknown):ErrorPresentation {
  const domain=toDomainError(error);
  return {
    ok:false,
    code:domain.code,
    title:titles[domain.code],
    // The thrown message is the specific part; keep it verbatim.
    detail:domain.message,
    sticky:domain.sticky,
    unsaved:domain.unsaved,
    retryable:domain.retryable,
    action:actions[domain.code]??null,
  };
}

/** A successful action's notice. Always transient. */
export function presentSuccess(message:string):ErrorPresentation {
  return {ok:true,code:null,title:'已保存',detail:message,sticky:false,unsaved:false,retryable:false,action:null};
}
