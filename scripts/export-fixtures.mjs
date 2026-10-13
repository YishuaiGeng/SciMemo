import {mkdir,writeFile} from 'node:fs/promises';
import {demoDocs} from '../.test-build/core/demo.js';
await mkdir('tests/fixtures',{recursive:true});
await writeFile('tests/fixtures/demo.json',JSON.stringify(demoDocs(),null,2)+'\n');
