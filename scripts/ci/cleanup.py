"""Final always() cleanup; only registry paths/UUIDs owned by this runner job."""
import json,os,re,sys
from pathlib import Path
from common import PRIVATE
from sandbox import Sandbox,episode_images
for state in PRIVATE.glob('*/state.json'):
    data=json.loads(state.read_text())
    assert re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',data['run'])
    assert data['project']=='psicopanel-episodes-'+data['run']
    assert state.parent.resolve()==(PRIVATE/data['run']).resolve()
    if not episode_images.state_path(data['project']).exists():continue
    box=object.__new__(Sandbox)
    box.run=data['run'];box.project=data['project'];box.path=state.parent
    box.args=['docker','compose','-p',box.project,'-f','compose.episodes-test.yaml','-f',str(box.path/'compose.json')]
    box.env=dict(os.environ,**data['env']);box.browser_tags=data['browser_tags'];box.prepared=True;box.isolation={}
    box.cleanup()
