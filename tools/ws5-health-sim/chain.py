import json, os, sys, statistics as st
N = os.path.dirname(os.path.abspath(__file__))
for v in sys.argv[1:]:
    G = json.load(open(f'{N}/{v}.json'))['games']
    rows = [r for g in G for r in g['rows']]
    inst = {}; seats = set(); prev = {}
    for g in G:
        prev = {}
        for r in g['rows']:
            w = r.get('eWorks') or {}
            for pid, n in w.items():
                d = n - prev.get(pid, 0)
                if d > 0: inst[r['month']] = inst.get(r['month'], 0) + d; seats.add(f"s{g['seed']}:{pid}")
            prev = w
    print(f'== {v}')
    print(' Electronics works installed by month:', inst or 'none', '| seats:', sorted(seats) or 'none')
    print(' Electronics works standing (seat-months):', sum(sum((r.get('eWorks') or {}).values()) for r in rows),
          '| Alloy works:', sum(sum((r.get('aWorks') or {}).values()) for r in rows),
          '| Rare-earth mines:', sum(sum((r.get('reMines') or {}).values()) for r in rows),
          '| Medicine works:', sum(sum((r.get('mWorks') or {}).values()) for r in rows))
    print(' months any Electronics works ran (made>0):', sum(r.get('eRan', 0) > 0 for r in rows), '| had a line:', sum(r.get('eLines', 0) > 0 for r in rows))
    for k in ['madeElectronics', 'madeRareEarth', 'madeAlloy', 'madeMedicine']:
        print(f' {k}/month: {st.mean(r.get(k, 0) for r in rows if k in r):.2f}')
    pm = []
    for m in range(1, 13):
        ps = [r['posted']['electronics'] for r in rows if r['month'] == m and 'posted' in r]
        pm.append(f'{st.median(ps):g}' if ps else '-')
    print(' Electronics price median by month 1..12:', ' '.join(pm), '| max', max(r['posted']['electronics'] for r in rows if 'posted' in r))
