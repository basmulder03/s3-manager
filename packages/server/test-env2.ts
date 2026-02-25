import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '../../');
console.log('Root dir:', rootDir);
console.log('Looking for:', resolve(rootDir, '.env.local'));

const result1 = loadDotenv({ path: resolve(rootDir, '.env.local') });
const result2 = loadDotenv({ path: resolve(rootDir, '.env') });

console.log('Result 1:', result1.error ? result1.error.message : 'OK');
console.log('Result 2:', result2.error ? result2.error.message : 'OK');
console.log('S3_ENDPOINT:', process.env.S3_ENDPOINT);
console.log('SECRET_KEY:', process.env.SECRET_KEY);
