/** Syntax-only check; does not substitute for npm run check or a production build. */
import ts from 'typescript';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
async function files(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?files(path.join(dir,e.name)):path.join(dir,e.name)))).flat();}
let count=0,errors=0;
for(const file of (await files('src')).filter(f=>/\.tsx?$/.test(f))){
 const source=await readFile(file,'utf8');
 const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
 const diagnostics=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 for(const d of diagnostics){console.error(file,ts.flattenDiagnosticMessageText(d.messageText,'\n'));errors++;}count++;
}
console.log(`Syntax check: ${count} TypeScript/TSX files; ${errors} errors. Not a full dependency-aware typecheck.`);
if(errors)process.exit(1);
