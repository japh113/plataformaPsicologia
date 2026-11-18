import { pathToFileURL } from 'node:url';
import { explicitConnection, migrate } from './episode-migration.js';

export async function main(args = process.argv.slice(2)) {
  const expectedDatabase = args.find(a => a.startsWith('--database='))?.slice(11);
  const bilateralClientRole=args.find(a=>a.startsWith('--bilateral-client='))?.slice(19);
  const admissionClientRole=args.find(a=>a.startsWith('--admission-client='))?.slice('--admission-client='.length);
  const target = args.find(a => a.startsWith('--target='))?.slice(9);
  const accountReaderRole = args.find(a => a.startsWith('--account-reader='))?.slice(17);
  const privateNoteCreatorRole = args.find(a => a.startsWith('--private-note-creator='))?.slice('--private-note-creator='.length);
  if ((args.length !== (2 + (accountReaderRole ? 1 : 0) + (privateNoteCreatorRole ? 1 : 0) + (bilateralClientRole ? 1 : 0) + (admissionClientRole ? 1 : 0))) || !['003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014'].includes(target) ||
      (admissionClientRole && target!=='014') ||
      (bilateralClientRole && !['013','014'].includes(target)) ||
      (accountReaderRole && !['009','010','011','012','013','014'].includes(target)) || (privateNoteCreatorRole && !['010','011','012','013','014'].includes(target))) {
    throw new Error('Usage: MIGRATION_DATABASE_URL=... npm run db:migrate -- --target=003|004|005|006|007|008|009|010|011|012|013|014 --database=NAME [--account-reader=ROLE] [--private-note-creator=ROLE] [--bilateral-client=ROLE] [--admission-client=ROLE]');
  }
  const client = explicitConnection(process.env.MIGRATION_DATABASE_URL, expectedDatabase);
  try {
    await client.connect();
    console.log(JSON.stringify(await migrate(client, { expectedDatabase, target, accountReaderRole, privateNoteCreatorRole, bilateralClientRole, admissionClientRole })));
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
