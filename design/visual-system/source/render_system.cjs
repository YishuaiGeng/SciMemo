const fs=require('fs');
const path=require('path');
// Rendering needs sharp, which is not a project dependency. Install it once with
// `npm install --no-save sharp`, or point SHARP_PATH at an existing installation.
const sharp = require(process.env.SHARP_PATH || 'sharp');
const root=path.resolve(__dirname,'..');
async function main(){
  for(const item of JSON.parse(fs.readFileSync(path.join(root,'exports/boards/manifest.json'),'utf8')).pages){
    const input=path.join(root,'exports/boards',item.file);
    await sharp(input,{density:144}).resize({width:2400,kernel:'lanczos3'}).png().toFile(path.join(root,'exports/previews',item.name+'.png'));
    await sharp(input,{density:96}).resize({width:800,kernel:'lanczos3'}).png().toFile(path.join(root,'exports/previews',item.name+'-thumbnail.png'));
    console.log(item.name);
  }
  for(const name of fs.readdirSync(path.join(root,'exports/patterns')).filter(n=>n.endsWith('.svg'))){
    await sharp(path.join(root,'exports/patterns',name),{density:144}).resize({width:1920}).png().toFile(path.join(root,'exports/patterns',name.replace('.svg','.png')));
  }
  await sharp(path.join(root,'source/scimemo-visual-system-master-v01.svg'),{density:72}).resize({width:1720}).png().toFile(path.join(root,'exports/scimemo-visual-system-overview-v01.png'));
}
main().catch(e=>{console.error(e);process.exitCode=1});
