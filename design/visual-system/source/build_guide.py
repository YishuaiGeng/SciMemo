"""Package reviewed board renders into a portable eight-page review PDF.

Editable vector masters are delivered separately as AI and SVG. The guide uses
rendered pages for identical color/gradient appearance across PDF viewers.
"""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'exports'
def build():
    pages=json.loads((OUT/'boards/manifest.json').read_text())['pages']
    output=OUT/'scimemo-visual-system-guide-v01.pdf'
    c=canvas.Canvas(str(output),pagesize=(960,600),pageCompression=1)
    c.setTitle('SciMemo Visual System 1.0')
    c.setAuthor('SciMemo')
    c.setSubject('Identity, color, typography, symbols, states, illustrations and application concepts')
    for page in pages:
        image=OUT/'previews'/f'{page["name"]}.png'
        assert Image.open(image).size==(2400,1500)
        c.bookmarkPage(page['name'])
        c.addOutlineEntry(page['name'].replace('-',' ').title(),page['name'])
        c.drawImage(ImageReader(str(image)),0,0,width=960,height=600)
        c.showPage()
    c.save()
    print(output)
if __name__=='__main__':build()
