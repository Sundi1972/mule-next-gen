import json, os, sys, urllib.request
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'colony-spike/1.0')]
urllib.request.install_opener(opener)
out = sys.argv[1]
def get(u, p):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    urllib.request.urlretrieve(u, p)
for a in ['island_tree_01', 'painted_wooden_bench', 'shrub_01', 'moon_rock_03', 'flower_gazania']:
    d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{a}'))
    g = d['gltf']['1k']['gltf']
    base = os.path.join(out, a)
    get(g['url'], os.path.join(base, os.path.basename(g['url'])))
    for rel, v in g.get('include', {}).items():
        get(v['url'], os.path.join(base, rel))
    print('ok', a, flush=True)
h = json.load(urllib.request.urlopen('https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky'))
get(h['hdri']['2k']['hdr']['url'], os.path.join(out, 'sky_2k.hdr'))
print('ok hdri', flush=True)
