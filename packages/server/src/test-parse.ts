import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dir, '../../..');
loadDotenv({ path: resolve(rootDir, '.env.local') });
loadDotenv({ path: resolve(rootDir, '.env') });

console.log('About to parse with:');
console.log('secretKey:', process.env.SECRET_KEY);
console.log('s3.source0.endpoint:', process.env.S3_SOURCE_0_ENDPOINT);

const testSchema = z.object({
  secretKey: z.string().min(1),
  s3Endpoint: z.string().url(),
});

try {
  const result = testSchema.parse({
    secretKey: process.env.SECRET_KEY,
    s3Endpoint: process.env.S3_SOURCE_0_ENDPOINT,
  });
  console.log('Parse succeeded!', result);
} catch (e) {
  console.log('Parse failed:', e);
}
