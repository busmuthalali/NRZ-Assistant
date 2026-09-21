export async function getFiveMInfo(base:string) {
  if (!base) return null;
  const root = base.replace(/\/$/,"");
  try {
    const [infoRes, playersRes] = await Promise.all([
      fetch(`${root}/info.json`), fetch(`${root}/players.json`)
    ]);
    if (!infoRes.ok || !playersRes.ok) return null;
    const info:any = await infoRes.json();
    const players:any[] = await playersRes.json();
    return { info, players, count: players.length };
  } catch { return null; }
}
