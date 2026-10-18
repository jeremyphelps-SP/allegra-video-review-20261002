/* Key-protected media review. The access key is never sent or persisted. */
(() => {
  'use strict';
  const manifest = JSON.parse(document.getElementById('protected-review-data').textContent);
  const urls = new Map();
  const mediaBase = new URL('.', document.currentScript.src);
  const status = document.getElementById('review-status');
  const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
  const digest = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
  document.getElementById('unlock-review').addEventListener('submit', async event => {
    event.preventDefault();
    const field = document.getElementById('review-key');
    const button = document.getElementById('unlock-button');
    const raw = field.value.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) { status.textContent = 'Paste the complete review key supplied in the chat.'; return; }
    button.disabled = true; status.textContent = 'Unlocking the two corrected review files. Please wait for the downloads.';
    try {
      const key = await crypto.subtle.importKey('raw', decode(raw), {name:'AES-GCM'}, false, ['decrypt']);
      field.value = '';
      const fresh = [];
      for (const asset of manifest.assets) {
        if (!/^office-broll-20261018\/Protected\/(choosing|intro)-R5\.mp4\.enc$/.test(asset.cipher_path)) throw new Error('Unexpected review path');
        const response = await fetch(new URL(asset.cipher_path.replace('office-broll-20261018/',''), mediaBase), {credentials:'omit', cache:'force-cache', referrerPolicy:'no-referrer'});
        if (!response.ok) throw new Error('Download unavailable');
        const ciphertext = await response.arrayBuffer();
        if (ciphertext.byteLength !== asset.cipher_bytes || await digest(ciphertext) !== asset.cipher_sha256) throw new Error('Encrypted file integrity mismatch');
        const clear = await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(asset.iv), tagLength:128}, key, ciphertext);
        if (clear.byteLength !== asset.bytes || await digest(clear) !== asset.sha256) throw new Error('Review file integrity mismatch');
        fresh.push([asset.id, URL.createObjectURL(new Blob([clear], {type:'video/mp4'}))]);
      }
      for (const [id, url] of fresh) {
        if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
        urls.set(id, url);
        document.querySelectorAll('video[data-private="'+id+'"]').forEach(v => { v.src=url; v.load(); });
      }
      document.querySelectorAll('[data-review-download]').forEach(b => b.disabled=false);
      status.textContent = 'Unlocked. Both exact file hashes verified. Play the corrected films below, or download them for a local player. Playback acceptance is still pending.';
    } catch (error) {
      status.textContent = 'Unable to unlock. Check the key and connection, then try again. No review key was sent to a server.';
    } finally { button.disabled = false; }
  });
  document.querySelectorAll('[data-review-download]').forEach(button => button.addEventListener('click', () => {
    const url = urls.get(button.dataset.reviewDownload);
    if (!url) { status.textContent='Unlock the corrected files first.'; return; }
    const asset=manifest.assets.find(a => a.id===button.dataset.reviewDownload);
    const a=document.createElement('a');a.href=url;a.download=asset.filename;a.click();
  }));
  document.querySelectorAll('button[data-player]').forEach(button => button.addEventListener('click', () => {
    const v=document.getElementById(button.dataset.player);const next=button.dataset.privateSource ? urls.get(button.dataset.privateSource) : button.dataset.src;
    if (!next) {status.textContent='Unlock the corrected files first.';return;}
    const time=v.currentTime;const play=!v.paused;v.pause();
    document.querySelectorAll('button[data-player="'+v.id+'"]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    v.src=next;v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(time,Math.max(0,v.duration-.05));if(play)v.play().catch(()=>{});},{once:true});v.load();
  }));
  document.querySelectorAll('button[data-jump]').forEach(button=>button.addEventListener('click',()=>{
    const v=document.getElementById(button.dataset.target);
    if (!v.currentSrc && v.dataset.private) {status.textContent='Unlock the corrected files first.';return;}
    const go=()=>{v.currentTime=Number(button.dataset.jump);v.play().catch(()=>{});};
    if(v.readyState>=1)go();else v.addEventListener('loadedmetadata',go,{once:true});
  }));
  window.addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url);});
})();
