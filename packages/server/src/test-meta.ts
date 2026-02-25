import { resolve } from 'path';
console.log('import.meta.dir:', import.meta.dir);
console.log('../../..:', resolve(import.meta.dir, '../../..'));
console.log('../..:', resolve(import.meta.dir, '../..'));
