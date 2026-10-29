const fs=require('node:fs');
const path=require('node:path');
const { createRequire }=require('node:module');
const { Linter }=createRequire(path.join(process.cwd(),'package.json'))('eslint');
const source=fs.readFileSync(process.argv[2]||'src/App.jsx','utf8');
const rows=[],byFunction=new Map();
const isFunction=n=>/Function(?:Declaration|Expression)$/.test(n.type)||n.type==='ArrowFunctionExpression';
function after(node) {
  for(let cursor=node;cursor?.parent;cursor=cursor.parent) {
    const siblings=cursor.parent.body;
    if(Array.isArray(siblings)) { const index=siblings.indexOf(cursor);if(index>=0&&siblings[index+1]) return siblings[index+1]; }
    if(isFunction(cursor.parent)) return null;
  }
  return null;
}
const linter=new Linter();
const messages=linter.verify(source,[{languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}}},
  plugins:{audit:{rules:{callbacks:{create(context){const sc=context.sourceCode;return {
    VariableDeclarator(node) {
      const fn=isFunction(node.init||{})?node.init:node.init?.type==='CallExpression'&&isFunction(node.init.arguments[0]||{})?node.init.arguments[0]:null;
      if(!fn||node.id.type!=='Identifier') return;
      if(sc.getAncestors(node).filter(isFunction).length!==1) return;
      const text=sc.getText(fn);
      const name=node.id.name;
      if(!text.includes('beginClinicalOperation(')&&!['handleIdentityUpdated','commitPatientRows','syncPatientState','invalidateClinicalAccess','resetSessionState','handleUpdateAppointmentStatus'].includes(name)) return;
      const row={name,line:node.loc.start.line,awaits:[],revisionAdvances:(text.match(/advancePatientRevision\(/g)||[]).length,
        finallyChecks:[],commits:[]};
      rows.push(row);byFunction.set(fn,row);
    },
    AwaitExpression(node) {
      const owner=sc.getAncestors(node).reverse().find(isFunction),row=byFunction.get(owner);
      if(!row) return;
      const next=after(node),text=next?sc.getText(next):'';
      row.awaits.push({line:node.loc.start.line,operation:sc.getText(node.argument),nextLine:next?.loc.start.line,
        next:text.slice(0,160),guarded:next?.type==='IfStatement'&&/isCurrent\(|isAccessCurrent\(/.test(sc.getText(next.test))});
    },
    TryStatement(node) {
      const owner=sc.getAncestors(node).reverse().find(isFunction),row=byFunction.get(owner);
      if(row&&node.finalizer) row.finallyChecks.push(node.finalizer.body[0]?.type==='IfStatement'&&/isCurrent\(/.test(sc.getText(node.finalizer.body[0].test)));
    },
    CallExpression(node) {
      const owner=sc.getAncestors(node).reverse().find(isFunction),row=byFunction.get(owner);
      if(row&&node.callee.type==='Identifier'&&/^(set[A-Z]|sync|showSuccess|showError)/.test(node.callee.name)) row.commits.push(node.callee.name);
    },
  };}}}}},rules:{'audit/callbacks':'error'}}]);
if(messages.some(m=>m.fatal)) throw new Error(JSON.stringify(messages));
const unguarded=rows.flatMap(row=>row.awaits.filter(a=>!a.guarded).map(a=>({callback:row.name,...a})));
const result={callbacks:rows.length,awaits:rows.reduce((n,r)=>n+r.awaits.length,0),unguarded,rows};
if(process.argv[3]) fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2));
console.log(JSON.stringify({callbacks:result.callbacks,awaits:result.awaits,unguarded}));
