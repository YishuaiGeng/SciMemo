import {safeUrl} from '../core/domain.js';

const native=()=>typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window;

/**
 * Open an external link.
 *
 * In the Tauri webview, `<a target="_blank">` does not reliably reach the system
 * browser, so links go through the opener plugin instead. The capability only allows
 * http(s); `safeUrl` enforces the same rule here so an unsafe scheme never reaches
 * either path.
 */
export async function openExternal(url:string):Promise<void> {
  const safe=safeUrl(url);
  if(!safe)return;
  if(native()){
    const {openUrl}=await import('@tauri-apps/plugin-opener');
    await openUrl(safe);
    return;
  }
  window.open(safe,'_blank','noopener,noreferrer');
}
