// import { neon } from '@neondatabase/serverless';
// import { drizzle } from 'drizzle-orm/neon-http';
// import { classes, users, tasks, submissions } from './schema';
// import { config as loadEnv } from 'dotenv';
// import { parseEnv } from '@neon/env';
// import neonConfig from '../../neon';

// loadEnv({ path: '.env.local' });

// export async function resetDatabase() {
//   let databaseUrl: string | undefined;

//   try {
//     const env = parseEnv(neonConfig);
//     databaseUrl = env.postgres.databaseUrl;
//   } catch {
//     databaseUrl = process.env.DATABASE_URL;
//   }

//   if (!databaseUrl) {
//     throw new Error('DATABASE_URL tidak ditemukan');
//   }

//   const sql = neon(databaseUrl);
//   const db = drizzle(sql);

//   console.log('🧹 Memulai pembersihan seluruh data tabel...');

//   try {
//     // Delete in reverse foreign-key dependency order
//     await db.delete(submissions);
//     await db.delete(tasks);
//     await db.delete(users);
//     await db.delete(classes);

//     console.log('✅ Berhasil mengosongkan seluruh tabel (submissions, tasks, users, classes)!');
//   } catch (error) {
//     console.error('❌ Gagal mengosongkan tabel:', error);
//     throw error;
//   }
// }

// // Execute if run directly
// if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('reset.ts')) {
//   resetDatabase();
// }
