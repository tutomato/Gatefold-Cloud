const norm = s => String(s || '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');
export function rankResults(query, tracks) {
  const q=norm(query), words=String(query).trim().split(/\s+/).map(norm).filter(Boolean);
  return tracks.map((t,index)=>{
    const title=norm(t.title),artist=norm(t.artist),album=norm(t.album),both=title+artist;
    let score=title===q?1000:artist===q?800:0;
    if(both===q || artist+title===q)score+=950;
    if(title.includes(q))score+=250;if(artist.includes(q))score+=150;
    for(const w of words){if(title.includes(w))score+=100;if(artist.includes(w))score+=80;if(album.includes(w))score+=20;if(!both.includes(w)&&!album.includes(w))score-=150;}
    return {t,index,score};
  }).sort((a,b)=>b.score-a.score || (a.t.source==='local'?-1:0)-(b.t.source==='local'?-1:0) || a.index-b.index).map(x=>x.t);
}
