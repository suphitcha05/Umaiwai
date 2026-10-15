"""รวม shell.html + rules.js + engine.js + app.js เป็นไฟล์เดียว: dist/index.html
รัน: python3 build.py   (ห้ามแก้ dist/index.html ตรงๆ ให้แก้ไฟล์ต้นทางแล้ว build ใหม่)"""
import pathlib
p = pathlib.Path(__file__).parent
sh = (p / 'shell.html').read_text(encoding='utf-8')
eng = (p / 'rules.js').read_text(encoding='utf-8') + '\n' + (p / 'engine.js').read_text(encoding='utf-8')
app = (p / 'app.js').read_text(encoding='utf-8')
page = sh.replace('/*ENGINE*/', eng).replace('/*APP*/', app)
html = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
        + page + '\n</body>\n</html>\n')
d = p / 'dist'; d.mkdir(exist_ok=True)
(d / 'index.html').write_text(html, encoding='utf-8')
print('built dist/index.html', len(html), 'chars')
