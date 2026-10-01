import json, re, time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE="https://dragonball.center"
COLLECTION=BASE+"/catalogo/coleccion/1285/dragon-ball-daima---trading-card-collection"
OUT=Path("site"); IMG=OUT/"images"; IMG.mkdir(parents=True,exist_ok=True)
s=requests.Session(); s.headers.update({"User-Agent":"Mozilla/5.0"})

def get(url,tries=4):
    err=None
    for i in range(tries):
        try:
            r=s.get(url,timeout=35); r.raise_for_status(); return r
        except Exception as e:
            err=e; time.sleep(1.5*(i+1))
    raise err

def category(n):
    if n<=100:return "Base Cards"
    if n<=135:return "Puzzle Cards"
    if n<=198:return "Episode / Highlight Cards"
    return "Lenticular Cards"

def score(tag,page,n):
    src=tag.get("src") or tag.get("data-src") or tag.get("data-lazy-src") or ""
    if not src:return None
    u=urljoin(page,src); low=((tag.get("alt") or "")+" "+u).lower(); sc=0
    if str(n) in low: sc+=2
    if any(x in low for x in ["objeto","catalog","card","imagen","image","foto"]): sc+=2
    if any(x in low for x in ["logo","avatar","icon","flag","sprite"]): sc-=8
    return sc,u

def image_from_page(url,n):
    soup=BeautifulSoup(get(url).text,"html.parser")
    for k,v in [("property","og:image"),("name","twitter:image"),("property","twitter:image")]:
        m=soup.find("meta",attrs={k:v})
        if m and m.get("content"):
            u=urljoin(url,m["content"])
            if not any(x in u.lower() for x in ["logo","avatar"]):
                try:
                    r=get(u)
                    if r.headers.get("content-type","").startswith("image/") and len(r.content)>6000:return u,r
                except: pass
    cand=[q for q in (score(t,url,n) for t in soup.find_all("img")) if q]
    cand.sort(reverse=True)
    for _,u in cand[:12]:
        try:
            r=get(u)
            if r.headers.get("content-type","").startswith("image/") and len(r.content)>6000:return u,r
        except: pass
    raise RuntimeError(f"No image found for card {n}: {url}")

soup=BeautifulSoup(get(COLLECTION).text,"html.parser")
links={}
for a in soup.find_all("a",href=True):
    m=re.fullmatch(r"Card\s+(\d+)"," ".join(a.stripped_strings),flags=re.I)
    if m:
        n=int(m.group(1))
        if 1<=n<=207 and n not in links: links[n]=urljoin(COLLECTION,a["href"])
missing=[n for n in range(1,208) if n not in links]
if missing: raise RuntimeError(f"Missing links: {missing[:20]}")

catalog=[]
for n in range(1,208):
    url=links[n]; print(f"[{n:03}/207] {url}",flush=True)
    img_url,r=image_from_page(url,n)
    ctype=r.headers.get("content-type","image/jpeg").split(";")[0]
    ext={"image/webp":"webp","image/png":"png","image/gif":"gif","image/jpeg":"jpg","image/jpg":"jpg"}.get(ctype,"jpg")
    dest=IMG/f"{n}.{ext}"; dest.write_bytes(r.content)
    catalog.append({"number":n,"category":category(n),"image":f"images/{n}.{ext}","landscape":136<=n<=198,"source":url,"imageSource":img_url})
    time.sleep(.08)
(OUT/"catalog.json").write_text(json.dumps(catalog,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
print("OK")
