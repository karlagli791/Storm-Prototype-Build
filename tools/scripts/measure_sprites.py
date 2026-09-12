from PIL import Image
import json, numpy as np
def bbox_in(a, x0, y0, x1, y1, thresh=40):
    sub = a[y0:y1, x0:x1]; ys, xs = np.where(sub > thresh)
    if len(xs) == 0: return None
    return [int(x0 + xs.min()), int(y0 + ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
def segments(profile, thresh=40, minlen=4):
    on = profile > thresh; segs = []; start = None
    for i, v in enumerate(on):
        if v and start is None: start = i
        if not v and start is not None:
            if i - start >= minlen: segs.append((start, i))
            start = None
    if start is not None and len(on) - start >= minlen: segs.append((start, len(on)))
    return segs
sprites = {}
im = np.array(Image.open('public/assets/ui/xbattle_count.png').convert('RGBA')); a = im[:,:,3]
rows = segments(a.max(axis=1)); print('count rows', rows)
digits = ['0','1','2','3','4','5','6','7','8','9','inf']; k = 0
for (y0,y1) in rows:
    for (x0,x1) in segments(a[y0:y1].max(axis=0), minlen=6):
        if k < len(digits): sprites['count_'+digits[k]] = {'img':'xbattle_count.png','rect':bbox_in(a,x0,y0,x1,y1)}; k += 1
print('count found', k)
im = np.array(Image.open('public/assets/ui/xbattle_combo00.png').convert('RGB')).astype(int); nonwhite = (765 - im.sum(axis=2)) // 3; a = np.clip(nonwhite, 0, 255).astype(np.uint8); a[:, 580:] = 0
rows = segments(a.max(axis=1), thresh=60); print('combo rows', rows)
order = ['1','2','3','4','5','0','6','7','8','9']; k = 0
for (y0,y1) in rows:
    for (x0,x1) in segments(a[y0:y1].max(axis=0), thresh=60, minlen=8):
        if k < len(order): sprites['combo_'+order[k]] = {'img':'xbattle_combo00.png','rect':bbox_in(a,x0,y0,x1,y1,60),'chroma':'white'}; k += 1
print('combo found', k)
im = np.array(Image.open('public/assets/ui/xbattle_signal_fd00.png').convert('RGBA')); a = im[:,:,3].copy(); a[760:, :] = 0
rows = segments(a.max(axis=1), minlen=10); print('signal00 rows', rows)
for name,(y0,y1) in zip(['go','draw','timeup'], rows[:3]): sprites['banner_'+name] = {'img':'xbattle_signal_fd00.png','rect':bbox_in(a,0,y0,a.shape[1],y1)}
im = np.array(Image.open('public/assets/ui/xbattle_signal_fd01.png').convert('RGBA')); a = im[:,:,3]
left = a.copy(); left[:, 200:] = 0; right = a.copy(); right[:, :200] = 0
lr = segments(left.max(axis=1), minlen=10); rr = segments(right.max(axis=1), minlen=10); print('signal01', lr, rr)
for name,(y0,y1) in zip(['p1','p2'], lr[:2]): sprites['tag_'+name] = {'img':'xbattle_signal_fd01.png','rect':bbox_in(left,0,y0,200,y1)}
for name,(y0,y1) in zip(['won','defeated'], rr[:2]): sprites['banner_'+name] = {'img':'xbattle_signal_fd01.png','rect':bbox_in(right,200,y0,a.shape[1],y1)}
json.dump(sprites, open('public/assets/ui/sprites.json','w'), indent=1)
print({k: v['rect'] for k, v in sprites.items()})
