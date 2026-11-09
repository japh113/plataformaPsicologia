// Private, finite PostgreSQL wire proxy for real pg query_timeout regressions.
// Never imported by the app. No credentials, binds or query values are logged.
import net from 'node:net';
import {once} from 'node:events';

export async function contactTransactionProxy({command='BEGIN',occurrence=1,mode='delay',delayMs=250}={}) {
  let seen=0,armed=false,acceptedStatus=null,transportAtFault=false,settle;
  const settled=new Promise(resolve=>{settle=resolve;});
  const sockets=new Set(),timers=new Set(),queries=[];
  const server=net.createServer(front=>{
    const back=net.createConnection({host:'db',port:5432});
    front.setNoDelay(true);back.setNoDelay(true);
    sockets.add(front);sockets.add(back);
    let incoming=Buffer.alloc(0),outgoing=Buffer.alloc(0),startup=true,hold=false,held=[];
    const stop=()=>{front.destroy();back.destroy();sockets.delete(front);sockets.delete(back);if(hold)settle();};
    front.on('error',stop);back.on('error',stop);
    front.on('close',stop);back.on('close',stop);
    front.on('data',data=>{
      incoming=Buffer.concat([incoming,data]);
      while(incoming.length>=(startup?4:5)) {
        const length=startup?incoming.readInt32BE(0):incoming.readInt32BE(1)+1;
        if(length<(startup?8:5)||length>1048576){stop();return;}
        if(incoming.length<length)return;
        const frame=incoming.subarray(0,length);incoming=incoming.subarray(length);
        if(startup){startup=false;back.write(frame);continue;}
        if(frame[0]!==81){back.write(frame);continue;} // Q: simple query only.
        const sql=frame.subarray(5,-1).toString('utf8');
        const kind=sql.trim().split(/\s/,1)[0].toUpperCase();
        queries.push(kind); // Keywords only, never SQL or payload values.
        if(mode==='rollback-disconnect'&&armed&&kind==='ROLLBACK') {
          stop();settle();continue;
        }
        if(!armed&&kind===command&&++seen===occurrence) {
          armed=true;
          if(mode==='set-error'||mode==='rollback-disconnect') {
            // A real backend error AFTER an acknowledged BEGIN, not a mocked
            // client rejection. Only a SET LOCAL frame is eligible for rewrite.
            if(kind!=='SET'){stop();return;}
            const body=Buffer.from("SET LOCAL lock_timeout='not-a-duration'\0");
            const replacement=Buffer.alloc(5+body.length);replacement[0]=81;
            replacement.writeInt32BE(4+body.length,1);body.copy(replacement,5);
            back.write(replacement);continue;
          }
          hold=true;
        }
        back.write(frame);
      }
    });
    back.on('data',data=>{
      outgoing=Buffer.concat([outgoing,data]);
      while(outgoing.length>=5) {
        const length=outgoing.readInt32BE(1)+1;
        if(length<5||length>1048576){stop();return;}
        if(outgoing.length<length)return;
        const frame=outgoing.subarray(0,length);outgoing=outgoing.subarray(length);
        if(!hold){front.write(frame);continue;}
        held.push(frame);
        if(frame[0]===90) { // ReadyForQuery proves PostgreSQL completed command.
          acceptedStatus=String.fromCharCode(frame[5]);
          transportAtFault=!front.destroyed&&!back.destroyed;
          if(mode==='disconnect'){stop();settle();continue;}
          const timer=setTimeout(()=>{
            timers.delete(timer);hold=false;
            if(!front.destroyed)for(const item of held)front.write(item);
            held=[];settle();
          },delayMs);
          timers.add(timer);
        }
      }
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {
    port:server.address().port,settled,queries,
    observations:()=>({armed,acceptedStatus,transportAtFault}),
    transportOpen:()=>[...sockets].some(s=>!s.destroyed),
    async close(){
      for(const timer of timers)clearTimeout(timer);
      for(const socket of [...sockets])socket.destroy();
      await new Promise(resolve=>server.close(resolve));
    },
  };
}
