import {useEffect,useRef,useState,type ReactNode} from 'react';
import {safeUrl} from '../core/domain.js';
import {openExternal} from '../platform/external.js';

/**
 * Modal dialog built on the native element.
 *
 * Closing with unsaved input is confirmed, but not via `window.confirm`: the browser
 * dialog is inconsistent across platforms, cannot be styled, and blocks the event
 * loop. Instead the same element switches to a confirm view, so no nested dialog and
 * no portal is needed.
 */
export function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),[dirty,setDirty]=useState(false),[confirming,setConfirming]=useState(false);
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
 const requestClose=()=>{if(dirty){setConfirming(true);return;}onClose();};
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();requestClose();}} onInput={()=>setDirty(true)}>
 {confirming
  ? <div className="confirm-view">
     <h2>放弃尚未保存的输入？</h2>
     <p className="hint">关闭后本次填写的内容会丢失，已经保存的记录不受影响。</p>
     <div className="form-actions">
      <button onClick={()=>setConfirming(false)}>继续编辑</button>
      <button className="danger-button" onClick={onClose}>放弃输入并关闭</button>
     </div>
    </div>
  : <><div className="modal-top"><h2>{title}</h2><button className="icon-button" onClick={requestClose} aria-label="关闭">×</button></div>{children}</>}
 </dialog>;
}

/**
 * Confirmation for destructive actions.
 *
 * Replaces `window.confirm`, which cannot be styled, blocks the event loop, and
 * reports its result differently across platforms and in embedded webviews.
 */
export function ConfirmDialog({title,body,confirmLabel='确认',tone='danger',onConfirm,onCancel}:{
 title:string;body:string;confirmLabel?:string;tone?:'danger'|'normal';onConfirm:()=>void;onCancel:()=>void;
}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
 // Focus the safe option so an accidental Enter does not destroy anything.
 const cancelRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{cancelRef.current?.focus();},[]);
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();onCancel();}} aria-labelledby="confirm-title">
  <div className="confirm-view">
   <h2 id="confirm-title">{title}</h2>
   <p className="hint">{body}</p>
   <div className="form-actions">
    <button ref={cancelRef} className="confirm-cancel" onClick={onCancel}>取消</button>
    <button className={tone==='danger'?'danger-button':'primary'} onClick={onConfirm}>{confirmLabel}</button>
   </div>
  </div>
 </dialog>;
}

export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
/** External link. The href keeps it inspectable; the click goes through the opener so it
 *  reaches the system browser inside the native webview too. */
export function Link({url,label}:{url:string;label?:string}){const safe=safeUrl(url);return safe?<a href={safe} target="_blank" rel="noreferrer noopener" onClick={e=>{e.preventDefault();void openExternal(safe);}}>{label??'打开来源'} ↗</a>:null;}
export function Empty({title,body,action}:{title:string;body:string;action?:ReactNode}){return <div className="empty"><div className="empty-mark">＋</div><h3>{title}</h3><p>{body}</p>{action}</div>;}
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:string}){return <span className={`badge ${tone}`}>{children}</span>;}
export const readText=(f:FormData,key:string)=>String(f.get(key)??'').trim();
export const readBody=(f:FormData,key:string)=>String(f.get(key)??'');
export const tagsFrom=(s:string)=>[...new Set(s.split(/[,，]/).map(x=>x.trim()).filter(Boolean))];
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const fileStamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
