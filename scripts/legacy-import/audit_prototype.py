#!/usr/bin/env python3
"""Read-only inventory audit of the HTML prototype. No database writes."""
import hashlib
import json
import os
from html.parser import HTMLParser
from pathlib import Path

class Frames(HTMLParser):
    def __init__(self):
        super().__init__(); self.frames=[]
    def handle_starttag(self,tag,attrs):
        if tag=='iframe': self.frames.append(dict(attrs).get('srcdoc',''))

def read_seed(s):
    marker='const SEED='
    if marker not in s: raise ValueError('Missing seed array')
    data, _ = json.JSONDecoder().raw_decode(s.split(marker,1)[1])
    return data

candidate=os.getenv('PROTOTYPE_HTML')
files=[Path(candidate)] if candidate else list(Path('/mnt/data').glob('Combined_Grocery_Gas_Tracker_Clear_Gas_Prices*.html'))
if not files:
    print('No prototype found. Set PROTOTYPE_HTML=/path/to/file.html')
else:
    p=files[0]; html=p.read_text(encoding='utf8'); parser=Frames();parser.feed(html)
    if len(parser.frames)!=2: raise ValueError('Expected grocery and gas iframe sections')
    grocery,gas=map(read_seed,parser.frames)
    print(json.dumps({
       'filename':p.name,
       'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
       'grocery_rows':len(grocery), 'gas_rows':len(gas),
       'grocery_dates':[min(x['date'] for x in grocery), max(x['date'] for x in grocery)],
       'gas_dates':[min(x['date'] for x in gas),max(x['date'] for x in gas)],
       'gas_discount_rows':sum(x.get('discount') is not None for x in gas),
       'grocery_repeated_description_records':len(grocery)-len(set((x['date'],x['source'],x['name'],x['price'],x['quantity']) for x in grocery))
    },indent=2))
