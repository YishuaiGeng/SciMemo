

/**
 * Machine-readable error codes.
 * The UI previously received only a Chinese string and a boolean, so it could not
 * tell "retrying may work" apart from "retrying will never work", nor "your data is
 * fine" apart from "your data may be at risk". Code decides behaviour; message is
 * for people.
 */
export type ErrorCode =
  /** Input violates a domain rule or invariant. Not retryable; the user must fix it. */
  | 'VALIDATION'
  /** Tried to change an immutable identity field (kind / createdAt). */
  | 'IMMUTABLE'
  /** Editor was opened against an older snapshot of the document. */
  | 'STALE_EDITOR'
  /** Another window or tab committed first (local compare-and-swap failed). */
  | 'LOCAL_CONFLICT'
  /** The document has an unresolved sync conflict and must not be overwritten. */
  | 'UNRESOLVED_CONFLICT'
  /** Persistence failed: quota, blocked upgrade, I/O. The edit was NOT saved. */
  | 'STORAGE'
  /** Server identity, protocol version, acknowledgement or cursor was rejected. */
  | 'SYNC_PROTOCOL'
  /** Transport failed before the server confirmed anything. */
  | 'SYNC_NETWORK'
  /** Portable backup is in an unsupported or malformed shape. */
  | 'IMPORT_FORMAT'
  /** A precondition is not met (for example restoring into a non-empty workspace). */
  | 'PRECONDITION'
  | 'NOT_FOUND';

/**
 * Whether repeating the same operation could succeed without the user changing input.
 *
 * STORAGE is retryable in this sense (a transient quota or lock failure may clear),
 * but the UI must still make clear that the edit is currently unsaved.
 */
const retryable:ReadonlySet<ErrorCode>=new Set<ErrorCode>(['LOCAL_CONFLICT','STORAGE','SYNC_NETWORK']);

/**
 * Whether the failure means local data was NOT written.
 *
 * Every entry is true except the ones raised after state is known to be intact and
 * committed. Callers use this to decide whether to say "not saved" to the user.
 */
const unsavedCodes:ReadonlySet<ErrorCode>=new Set<ErrorCode>([
  'VALIDATION','IMMUTABLE','STALE_EDITOR','LOCAL_CONFLICT','UNRESOLVED_CONFLICT',
  'STORAGE','IMPORT_FORMAT','PRECONDITION','NOT_FOUND',
]);

/**
 * Whether the user must be told even after the next successful action.
 *
 * STORAGE is the important one: an unsaved edit cannot be dismissed by time, only by
 * a later successful save.
 */
const stickyCodes:ReadonlySet<ErrorCode>=new Set<ErrorCode>(['STORAGE','SYNC_PROTOCOL','UNRESOLVED_CONFLICT']);

export class DomainError extends Error {
  constructor(readonly code:ErrorCode,message:string,readonly context?:Record<string,unknown>){
    super(message);
    this.name='DomainError';
  }
  get retryable():boolean{return retryable.has(this.code);}
  get unsaved():boolean{return unsavedCodes.has(this.code);}
  get sticky():boolean{return stickyCodes.has(this.code);}
}

export const isDomainError=(value:unknown):value is DomainError => value instanceof DomainError;

/**
 * Normalize anything thrown into a DomainError.
 *
 * Unknown values default to VALIDATION rather than STORAGE: claiming a storage
 * failure when we do not actually know would push the UI into a misleading alarm,
 * and VALIDATION still reports the edit as unsaved.
 */
export function toDomainError(value:unknown):DomainError {
  if(isDomainError(value))return value;
  if(value instanceof Error)return new DomainError('VALIDATION',value.message||'操作未能完成。',{cause:value.name});
  return new DomainError('VALIDATION',String(value),{});
}

/**
 * Detect a transport-level failure.
 *
 * A fetch rejection surfaces as a TypeError with a browser-specific message, so the
 * name is the only portable signal. Anything the server actually answered with is a
 * protocol problem, not a network one, and must not be retried blindly.
 */
export function transportFailure(error:unknown):DomainError {
  const name=error instanceof Error?error.name:'';
  const message=error instanceof Error?error.message:'';
  if(name==='TypeError'||name==='AbortError'||/network|fetch|timeout|timed out/i.test(message)){
    return new DomainError('SYNC_NETWORK',`无法连接同步服务：${message||'网络请求失败'}`,{retryHint:'检查地址、网络与令牌后重试。本地记录未受影响。'});
  }
  return new DomainError('SYNC_PROTOCOL',message||'同步响应无法处理。',{});
}

/** Raise a VALIDATION error. Keeps call sites short in hot domain paths. */
export const invalid=(message:string):never => {throw new DomainError('VALIDATION',message);};

/** Error codes that must never be presented as a soft, auto-dismissing notice. */
export const mustBePersistent=(error:unknown):boolean => toDomainError(error).sticky;
