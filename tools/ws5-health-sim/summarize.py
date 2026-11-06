import json, os, sys, statistics as st
N = os.path.dirname(os.path.abspath(__file__))
V = sys.argv[1:] or ['base', 'health', 'healthE', 'stress', 'stressT']
res = {}
def recover_months(hs):
    # months from leaving the ceiling (or >0.2) back under 0.1; list of spells
    out = []; i = 0
    while i < len(hs):
        if hs[i] > 0.2:
            j = i
            while j < len(hs) and hs[j] > 0.2: j += 1
            k = j
            while k < len(hs) and hs[k] >= 0.1: k += 1
            out.append(k - j + 1 if k < len(hs) else None); i = k
        else: i += 1
    return out
for v in V:
    d = json.load(open(f'{N}/{v}.json')); G = d['games']; rows = [r for g in G for r in g['rows'] if r.get('health')]
    hs = [r['health']['h'] for r in rows]
    bands = [r['band'] for r in rows]
    spells = [x for g in G for x in recover_months([r['health']['h'] for r in g['rows'] if r.get('health')])]
    med = [r['posted']['medicine'] for r in rows if 'posted' in r]; ele = [r['posted']['electronics'] for r in rows if 'posted' in r]
    res[v] = {
     'months': len(rows),
     'Medicine short months /120': sum(r['health']['sM'] > 1e-9 for r in rows),
     ' of which >10% short': sum(r['health']['sM'] > 0.1 for r in rows),
     'mean Medicine need / taken': f"{st.mean(r['health']['medNeed'] for r in rows):.2f} / {st.mean(r['health']['medTaken'] for r in rows):.2f}",
     'Electronics met months': sum(r['health']['eMet'] for r in rows),
     'h mean / max': f"{st.mean(hs):.3f} / {max(hs):.2f}",
     'h months >0.2 / at max': f"{sum(h > 0.2 for h in hs)} / {sum(h >= 0.4 - 1e-9 for h in hs)}",
     'games ending at max': sum(1 for g in G if g['rows'][-1].get('health') and g['rows'][-1]['health']['h'] >= 0.4 - 1e-9),
     'spells >0.2 back <0.1 (months)': ','.join('-' if x is None else str(x) for x in spells) or 'none',
     'player sick seat-months /480': sum(r.get('playerSick', 0) for r in rows),
     'sickness rolls expected /480': f"{sum(sum(r.get('sickChance', [])) for r in rows):.1f}",
     'crew-sick plot-months': sum(r.get('sickLines', 0) for r in rows),
     'units lost to sick crews': sum(r.get('sickLost', 0) for r in rows),
     'crew cures (seat-months)': sum(r.get('crewCured', 0) for r in rows),
     'colonists at end (mean)': f"{st.mean(g['colonistsEnd'] for g in G):.1f}",
     'mood thriv/cont/restl/unh/unrest': '/'.join(str(bands.count(b)) for b in ['thriving','content','restless','unhappy','unrest']),
     'happiness mean': f"{st.mean(r['happiness'] for r in rows):.1f}",
     'Medicine made / month': f"{st.mean(r['madeMedicine'] for r in rows):.2f}",
     'Electronics made / month': f"{st.mean(r['madeElectronics'] for r in rows):.2f}",
     'Medicine price med/max': f"{st.median(med):g} / {max(med)}",
     'Electronics price med/max': f"{st.median(ele):g} / {max(ele)}",
     'colonists short F/W months': f"{sum('food' in r['shortages'] for r in rows)} / {sum('water' in r['shortages'] for r in rows)}",
     'Food made / month': f"{st.mean(r['madeFood'] for r in rows):.2f}",
     'player Medicine held at auction': f"{st.mean(r.get('playerMedicine',0) for r in rows):.2f}",
    }
keys = list(res[V[0]].keys())
print(f"{'metric':34s}" + ''.join(f'{v:>16s}' for v in V))
for k in keys:
    print(f'{k:34s}' + ''.join(f'{str(res[v][k]):>16s}' for v in V))
