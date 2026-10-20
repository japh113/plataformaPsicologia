"""Offline repository documentation contracts; no network, database or Docker."""
import hashlib,json,re,subprocess,urllib.parse
from pathlib import Path

def git(*args):
    return subprocess.check_output(['git',*args],text=True).strip()

def anchors(text):
    result=set(); seen={}
    for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*$',text,re.M):
        slug=re.sub(r'[^\w\- ]','',heading.lower().replace('`','')).replace(' ','-')
        n=seen.get(slug,0);seen[slug]=n+1
        result.add(slug+(f'-{n}' if n else ''))
    result.update(re.findall(r'<a\s+(?:name|id)=["\']([^"\']+)',text))
    return result

def check_link(source, target):
    target=urllib.parse.unquote(target.split(' "')[0].strip('<>'))
    if not target or re.match(r'^[a-zA-Z][\w+.-]*:',target):return
    path,_,fragment=target.partition('#')
    dest=(source.parent/path).resolve() if path else source.resolve()
    root=Path.cwd().resolve()
    if not dest.is_relative_to(root) or not dest.exists():raise ValueError(f'{source}: missing local link {target}')
    if fragment and dest.suffix=='.md' and fragment not in anchors(dest.read_text()):
        raise ValueError(f'{source}: missing fragment {target}')

def protect(old,new,identifier):
    pattern=(r'(?m)^\| '+identifier+r' \|.*$' if identifier.startswith('RN') else r'(?ms)^#{2,6} [^\n]*\b'+identifier+r'\b.*?(?=^#{2,6} |\Z)')
    if len(re.findall(pattern,old))!=1 or re.findall(pattern,old)!=re.findall(pattern,new):raise ValueError('Protected decision changed: '+identifier)

def run(base):
    files=git('ls-files','*.md').splitlines();links=0
    for name in files:
        source=Path(name);text=source.read_text(encoding='utf-8',errors='strict')
        if '\ufffd' in text:raise ValueError(f'{name}: invalid UTF-8 replacement')
        text=re.sub(r'```.*?```','',text,flags=re.S)
        for target in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)',text):check_link(source,target);links+=1
    definitions={}
    for prefix,doc in [('ADR','docs/product/decisions.md'),('AB','docs/product/decisions.md'),('RN','docs/product/business-rules.md')]:
        definitions[prefix]=set(re.findall((r'^#{2,6} [^\n]*?\b('+prefix+r'-\d+)\b' if prefix=='ADR' else r'^\| ('+prefix+r'-\d+) \|'),Path(doc).read_text(),re.M))
    for name in files:
        for prefix,num in re.findall(r'\b(ADR|RN|AB)-(\d+)\b',Path(name).read_text()):
            if f'{prefix}-{num}' not in definitions[prefix]:raise ValueError(f'{name}: undefined {prefix}-{num}')
    changed=git('diff','--name-only',base,'HEAD').splitlines()
    old_manifest=json.loads(git('show',base+':backend/sql/migrations/manifest.json'))
    manifest=json.loads(Path('backend/sql/migrations/manifest.json').read_text())
    if manifest[:len(old_manifest)]!=old_manifest:raise ValueError('Historical migration manifest entries changed')
    for item in manifest:
        path=Path('backend/sql/migrations')/item['file']
        if path.name!=item['file'] or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Migration checksum mismatch')
    for item in old_manifest:
        path='backend/sql/migrations/'+item['file']
        if git('show',base+':'+path)!=Path(path).read_text().strip():raise ValueError('Historical SQL changed: '+path)
    for doc,ids in [('docs/product/decisions.md',['ADR-029','AB-25']),('docs/product/business-rules.md',['RN-59','RN-60','RN-61'])]:
        old=git('show',base+':'+doc);new=Path(doc).read_text()
        for identifier in ids:
            protect(old,new,identifier)
    subprocess.run(['git','diff','--check',base,'HEAD'],check=True)
    return {'markdownFiles':len(files),'localLinks':links,'changedFiles':changed,'protectedDecisions':'unchanged','migrations':'unchanged'}
