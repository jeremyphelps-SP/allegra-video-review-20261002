from pathlib import Path
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor
import argparse, hashlib, json

def file_hash(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser(description='Download verified Allegra Dental Center assets.')
    p.add_argument('--all',action='store_true',help='Download all 19 assets instead of the updated five.')
    p.add_argument('--directory',default='ADC-Video-Assets')
    p.add_argument('--plan-only',action='store_true',help='List files without downloading.')
    args=p.parse_args();here=Path(__file__).resolve().parent
    m=json.loads((here/'Handoff.json').read_text(encoding='utf-8-sig'))
    selected=[r for r in m['films'] if args.all or r['id'] in m['updated_asset_ids']]
    jobs=[]
    for r in selected:
        name=f"{r['id']:02}" if isinstance(r['id'],int) else r['id']
        for key,ext in [('video','.mp4'),('cover','.jpg'),('captions_vtt','.vtt'),('captions_srt','.srt'),('transcript','.txt')]:
            info=r.get(key)
            if info:jobs.append((info,Path(args.directory)/key/(name+ext)))
    if args.plan_only:
        print(json.dumps({'assets':len(selected),'files':len(jobs),'master_bytes':sum(r['video']['bytes'] for r in selected)},indent=2));return
    def fetch(job):
        info,dest=job;dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists() and dest.stat().st_size==info['bytes'] and file_hash(dest)==info['sha256']:return str(dest)+' already verified'
        urls=list(dict.fromkeys([info.get('immutable_url'),info['url']]))
        error=None;tmp=dest.with_suffix(dest.suffix+'.part')
        for url in [u for u in urls if u]:
            try:
                h=hashlib.sha256();size=0
                with urlopen(Request(url,headers={'User-Agent':'ADC-Cloud-Handoff/1.0'}),timeout=90) as response,tmp.open('wb') as out:
                    for b in iter(lambda:response.read(1048576),b''):out.write(b);h.update(b);size+=len(b)
                if size!=info['bytes'] or h.hexdigest()!=info['sha256']:raise RuntimeError('Size or SHA-256 mismatch')
                tmp.replace(dest);return str(dest)+' verified'
            except Exception as e:error=e
        raise RuntimeError(str(dest)+': '+str(error))
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(fetch,jobs):print(result,flush=True)
    print(f'Complete: {len(selected)} assets and {len(jobs)} files verified.')

if __name__=='__main__':main()
