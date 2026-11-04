import { pathToFileURL } from 'node:url';
import { explicitConnection, migrate } from './episode-migration.js';

export async function main(args = process.argv.slice(2)) {
  const expectedDatabase = args.find(a => a.startsWith('--database='))?.slice(11);
  const target = args.find(a => a.startsWith('--target='))?.slice(9);
  const accountReaderRole = args.find(a => a.startsWith('--account-reader='))?.slice(17);
  if ((args.length !== (accountReaderRole ? 3 : 2)) || !['003', '004', '005', '006', '007', '008', '009'].includes(target) ||
      (accountReaderRole && target !== '009')) {
    throw new Error('Usage: MIGRATION_DATABASE_URL=... npm run db:migrate -- --target=003|004|005|006|007|008|009 --database=NAME [--account-reader=ROLE]');
  }
  const client = explicitConnection(process.env.MIGRATION_DATABASE_URL, expectedDatabase);
  try {
    await client.connect();
    console.log(JSON.stringify(await migrate(client, { expectedDatabase, target, accountReaderRole })));
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
