import { pathToFileURL } from 'node:url';
import { explicitConnection, migrate } from './episode-migration.js';

export async function main(args = process.argv.slice(2)) {
  const expectedDatabase = args.find(a => a.startsWith('--database='))?.slice(11);
  if (args.length !== 2 || !args.includes('--target=003')) {
    throw new Error('Usage: MIGRATION_DATABASE_URL=... npm run db:migrate -- --target=003 --database=NAME');
  }
  const client = explicitConnection(process.env.MIGRATION_DATABASE_URL, expectedDatabase);
  try {
    await client.connect();
    console.log(JSON.stringify(await migrate(client, { expectedDatabase })));
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
