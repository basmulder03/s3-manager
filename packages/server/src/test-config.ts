import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '../../..');
console.log('Loading from:', rootDir);
loadDotenv({ path: resolve(rootDir, '.env.local') });
loadDotenv({ path: resolve(rootDir, '.env') });

console.log('Env vars loaded:');
console.log('SECRET_KEY:', process.env.SECRET_KEY);
console.log('S3_ENDPOINT:', process.env.S3_ENDPOINT);
console.log('S3_ACCESS_KEY:', process.env.S3_ACCESS_KEY);
console.log('S3_SECRET_KEY:', process.env.S3_SECRET_KEY);
