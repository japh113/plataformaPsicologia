import db from '../src/config/db.js';
import { assertDeliveryConfigured, readSimulatedMailbox } from '../src/modules/auth/verification.delivery.js';
try {
  assertDeliveryConfigured();
  const email = process.argv[2];
  if (!email) throw new Error('Provide the intended fictional account email');
  const user = (await db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email])).rows[0];
  if (!user) throw new Error('No mailbox for this demo account');
  for (const message of await readSimulatedMailbox(user.id)) {
    console.log(JSON.stringify(message.channel === 'email' && message.secret
      ? { ...message, linkFragment: (message.purpose==='contact_change'?'#changeEmail='+message.requestId+'.':'#verifyEmail=') + message.secret } : message));
  }
} finally { await db.close(); }
