// Private integration process: instrument bcrypt in THIS instance, never expose
// this app/endpoint from production. Fixed finite requests are sent by the test.
import bcrypt from 'bcryptjs';
import app from '../../src/app.js';
import db from '../../src/config/db.js';
const compare=bcrypt.compare;
let calls=0;
bcrypt.compare=(...args)=>{calls++;return compare(...args);};
const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{if(message==='calls')process.send({calls});});
process.on('SIGTERM',()=>server.close(async()=>{await db.close();process.exit(0);}));
