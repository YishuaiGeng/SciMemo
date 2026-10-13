// Render with the locally bundled sharp package, without network services.
const fs = require('fs');
const path = require('path');
// Rendering needs sharp, which is not a project dependency. Install it once with
// `npm install --no-save sharp`, or point SHARP_PATH at an existing installation.
const sharp = require(process.env.SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
async function main() {
  for (const [input, output, width] of [
    ['source/scimemo-icon-v02.svg', 'exports/scimemo-icon-1024-v02.png', 1024],
    ['source/scimemo-icon-v02.svg', 'exports/scimemo-icon-2048-v02.png', 2048],
    ['source/scimemo-icon-v02.svg', 'exports/scimemo-icon-512-v02.png', 512],
    ['source/scimemo-icon-v02.svg', 'exports/scimemo-icon-256-v02.png', 256],
    ['source/scimemo-logo-master-v02.svg', 'exports/scimemo-logo-preview-v02.png', 1254],
    ['exports/scimemo-logo-stacked-v02.svg', 'exports/scimemo-logo-stacked-v02.png', 1530],
    ['exports/scimemo-wordmark-v02.svg', 'exports/scimemo-wordmark-v02.png', 1502],
    ['exports/scimemo-logo-horizontal-v02.svg', 'exports/scimemo-logo-horizontal-v02.png', 2360],
  ]) {
    if (fs.existsSync(path.join(root,input))) {
      await sharp(path.join(root,input), {density: 288}).resize({width, kernel: 'lanczos3'}).png().toFile(path.join(root,output));
      console.log(output);
    }
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
