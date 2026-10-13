#!/usr/bin/env python3
"""Repair the ribbon bends in the English-only logo, preserving earlier versions.

Replace fragmented edge strokes with continuous, tapered filled highlights.
Join the lower return silhouette to the front ribbon at its exact turn point.
"""
from pathlib import Path
import copy
import json
import subprocess
import xml.etree.ElementTree as ET
from build_english_logo import compose, wrapped, write_svg, SVG, SOURCE, EXPORTS

ROOT=Path(__file__).resolve().parents[1]
NS=f'{{{SVG}}}'

RETURN='M381 677 C426 673 485 665 538 657 C566 652 590 636 594 609 C597 590 590 576 581 563 L628 551 C650 577 666 607 657 635 C652 650 646 660 639 668 C619 686 595 691 567 693 C506 696 447 688 401 692 Z'
OUTER_HIGHLIGHT='M529 244 C552 237 570 247 576 274 C571 253 558 244 541 245 C537 245 533 246 530 247 L342 294 C333 296 326 299 319 305 C292 328 278 352 278 374 L278 425 C278 431 277 435 276 436 L276 373 C276 350 289 326 318 302 C325 296 331 293 340 291 L529 244 Z'
CURL_HIGHLIGHT='M332 564 C308 567 292 573 281 587 C279 590 277 593 276 596 C286 580 304 571 331 566 Z'

def path(d,fill,opacity=None):
    attrs={'d':d,'fill':fill}
    if opacity is not None:attrs['opacity']=str(opacity)
    return ET.Element(NS+'path',attrs)

def repair(root):
    for node in root.iter(NS+'g'):
        name=node.get('id','').removeprefix('small_')
        if name=='03_Ribbon_lower_return':
            node[:]=[path(RETURN,'url(#returnBlue)')]
        elif name=='04_Ribbon_lower_curl':
            base=copy.deepcopy(node[0])
            node[:]=[base,path(CURL_HIGHLIGHT,'#74DFFE',.45)]
        elif name=='05_Ribbon_upper_fold':
            node[:]=[copy.deepcopy(node[0])]
        elif name=='11_Ribbon_front':
            base=copy.deepcopy(node[0]);rim=copy.deepcopy(node[2])
            node[:]=[base,path(OUTER_HIGHLIGHT,'url(#backEdge)',.85),rim]
    root.find(NS+'title').text='SciMemo - continuous ribbon bends'
    root.find(NS+'desc').text='English-only SciMemo logo. Editable vector paths and gradients. Continuous tapered ribbon highlights and joined lower return; no embedded reference image.'
    return root

def build():
    master=repair(ET.parse(SOURCE/'scimemo-logo-master-v03.svg').getroot())
    icon=repair(ET.parse(SOURCE/'scimemo-icon-v03.svg').getroot())
    icon_layers=[n for n in master if n.get('id','').startswith(tuple(f'{i:02d}_' for i in range(1,13)))]
    words=[n for n in master if n.get('id','').startswith('wordmark-')]
    files={
        SOURCE/'scimemo-logo-master-v04.svg':master,
        SOURCE/'scimemo-icon-v04.svg':icon,
        EXPORTS/'scimemo-icon-v04.svg':icon,
        EXPORTS/'scimemo-wordmark-v04.svg':compose(master,words,'99 800 751 155',1502,310,'SciMemo - English wordmark'),
        EXPORTS/'scimemo-logo-stacked-v04.svg':compose(master,icon_layers+words,'90 155 765 810',1530,1620,'SciMemo - continuous ribbon stacked logo'),
        EXPORTS/'scimemo-logo-horizontal-v04.svg':compose(master,[wrapped('App_icon','translate(-112 -109) scale(.64)',icon_layers),wrapped('Wordmark','translate(312 -690) scale(1.01)',words)],'0 0 1180 380',2360,760,'SciMemo - continuous ribbon horizontal logo'),
    }
    for target,svg in files.items():
        # compose() retains v03 metadata by default; identify v04 accurately.
        svg.find(NS+'desc').text='English-only SciMemo logo. Editable vector paths and gradients. Continuous tapered ribbon highlights and joined lower return; no embedded reference image.'
        write_svg(target,svg)
    jobs=[
        (SOURCE/'scimemo-logo-master-v04.svg',EXPORTS/'scimemo-logo-preview-v04.png',1254),
        (EXPORTS/'scimemo-wordmark-v04.svg',EXPORTS/'scimemo-wordmark-v04.png',1502),
        (EXPORTS/'scimemo-logo-stacked-v04.svg',EXPORTS/'scimemo-logo-stacked-v04.png',1530),
        (EXPORTS/'scimemo-logo-horizontal-v04.svg',EXPORTS/'scimemo-logo-horizontal-v04.png',2360),
        (SOURCE/'scimemo-icon-v04.svg',EXPORTS/'scimemo-icon-1024-v04.png',1024),
        (SOURCE/'scimemo-icon-v04.svg',EXPORTS/'scimemo-icon-2048-v04.png',2048),
    ]
    runtime=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node'
    js="""const sharp=require(process.argv[1]);const jobs=JSON.parse(process.argv[2]);
(async()=>{for(const [input,output,width] of jobs){await sharp(input,{density:288}).resize({width,kernel:'lanczos3'}).png().toFile(output);console.log(output);}})().catch(e=>{console.error(e);process.exitCode=1;});"""
    subprocess.run([str(runtime/'bin/node'),'-e',js,str(runtime/'node_modules/sharp'),json.dumps([[str(a),str(b),w] for a,b,w in jobs])],check=True)

if __name__=='__main__':build()
