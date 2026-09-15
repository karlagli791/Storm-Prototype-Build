"""Session 10 follow-up: awakened bodies (2nrv / 2ssv) name their chakra-dash clips `<code>awa_cdsh0s /
_cdsh0l`; add those to the dash bindings so awakened dashes do not fall back to the common bank."""
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = os.path.join(root, 'src', 'combat', 'StormStates.ts')
s = open(p, encoding='utf-8').read()
if "_cdsh0s" in s:
    print('already'); raise SystemExit
old1 = "clips: [O('{c}dsh0s', '{c}dsh0l'), L('{c}dsh0l'), L('1cmndsh0l')] };"
new1 = "clips: [O('{c}dsh0s', '{c}dsh0l'), O('{c}_cdsh0s', '{c}_cdsh0l'), L('{c}dsh0l'), L('{c}_cdsh0l'), L('1cmndsh0l')] };"
old2 = "clips: [L('{c}dsh0l'), L('1cmndsh0l'), L('{c}run1')] };"
new2 = "clips: [L('{c}dsh0l'), L('{c}_cdsh0l'), L('1cmndsh0l'), L('{c}run1')] };"
assert old1 in s and old2 in s
s = s.replace(old1, new1).replace(old2, new2)
open(p, 'w', encoding='utf-8').write(s)
print('awakened dash clips bound')
