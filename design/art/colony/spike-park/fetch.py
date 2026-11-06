"""The one record of what the Park spike downloads. All CC0: Poly Haven and ambientCG.
Run: python3 -I fetch.py <spike-dir>/assets   (re-runs skip files already present)"""
import io, json, os, sys, urllib.request, zipfile

opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'colony-spike/1.0')]  # Poly Haven's API answers 403 without one
urllib.request.install_opener(opener)
out = sys.argv[1]


def get(u, p):
    if os.path.exists(p):
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    urllib.request.urlretrieve(u, p)


# Models (Poly Haven, 1k glTF).
for a in ['island_tree_01', 'painted_wooden_bench', 'shrub_01', 'moon_rock_03', 'flower_gazania']:
    d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{a}'))
    g = d['gltf']['1k']['gltf']
    base = os.path.join(out, a)
    get(g['url'], os.path.join(base, os.path.basename(g['url'])))
    for rel, v in g.get('include', {}).items():
        get(v['url'], os.path.join(base, rel))
    print('ok', a, flush=True)

# Sky (Poly Haven HDRI).
h = json.load(urllib.request.urlopen('https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky'))
get(h['hdri']['2k']['hdr']['url'], os.path.join(out, 'sky_2k.hdr'))
print('ok hdri', flush=True)

# Ground textures (Poly Haven, 1k JPG): gravel for plaza and paths, pale stone for the rim, pebbles for the pond bed.
# The colony's buildings (colony.py): facade concrete and plaster, metal cladding and roof plant, forecourt pavers, launch pad.
for t in ['gravel_floor_02', 'sandstone_blocks_08', 'clean_pebbles', 'concrete_panels', 'white_plaster_02', 'metal_plate_02',
          'box_profile_metal_sheet', 'square_concrete_pavers', 'hangar_concrete_floor']:
    d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{t}'))
    for k in ['Diffuse', 'nor_gl', 'arm', 'Displacement']:
        u = d[k]['1k']['jpg']['url']
        get(u, os.path.join(out, 'tex', t, os.path.basename(u)))
    print('ok', t, flush=True)

# Lawn (ambientCG, 1k JPG): Poly Haven has no mown lawn. Zips hold more than we need; keep only the maps, by basename.
for t in ['Grass001', 'Grass004']:
    base = os.path.join(out, 'tex', t)
    if os.path.isdir(base):
        continue
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(f'https://ambientcg.com/get?file={t}_1K-JPG.zip').read()))
    os.makedirs(base)
    for n in z.namelist():
        b = os.path.basename(n)
        if b.endswith('.jpg') and any(s in b for s in ['_Color', '_NormalGL', '_Roughness', '_AmbientOcclusion']):
            with open(os.path.join(base, b), 'wb') as f:
                f.write(z.read(n))
    print('ok', t, flush=True)
