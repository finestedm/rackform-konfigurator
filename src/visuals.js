(function (root) {
'use strict';

const NS = 'http://www.w3.org/2000/svg';
// Screen previews of the requested RAL finishes; physical swatches define the final colours.
const COLORS = Object.freeze({ post: '#00558b', beam: '#e8a900', guard: '#d9a500', guardLight: '#f2d46f', galva: '#a9b4b8' });
function element(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}
function add(svg, name, attrs, text) { const node = element(name, attrs, text); svg.append(node); return node; }
function path(points) { return points.map((point, index) => `${index ? 'L' : 'M'} ${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ') + ' Z'; }

function drawPlan(svg, config, result, selectedId, onSelect, onAddSection) {
  svg.replaceChildren();
  const x0 = 45, width = 485, aisleHeight = 59;
  const rowHeights = result.rows.map(row => row.type === 'double' ? 73 : 49);
  const height = 78 + result.aisles.length * aisleHeight + rowHeights.reduce((a, b) => a + b, 0) + 63;
  svg.setAttribute('viewBox', `0 0 620 ${height}`);
  svg.setAttribute('aria-label', `Plan ${result.rows.length} regałów i ${result.aisles.length} korytarzy pracy o szerokości ${result.aisle} mm`);
  const defs = element('defs');
  const rearPattern = element('pattern', {id:'rear-mesh-grid',width:10,height:10,patternUnits:'userSpaceOnUse'});
  rearPattern.append(
    element('rect', {width:10, height:10, fill:'#7e898c', 'fill-opacity':0.28}),
    element('path', {d:'M 0 0 L 10 0 M 0 0 L 0 10', stroke:'#596568', 'stroke-width':1, fill:'none'})
  );
  defs.append(rearPattern); svg.append(defs);
  const maxLength = Math.max(1, ...result.rows.map(row => row.nominalLength));
  add(svg, 'text', {x:x0,y:24,fill:'#49625f','font-size':13,'font-family':'DM Sans','font-weight':700}, 'RZUT Z GÓRY / WSZYSTKIE REGAŁY');
  add(svg, 'text', {x:575,y:24,'text-anchor':'end',fill:'#81938e','font-size':11,'font-family':'DM Sans'}, `${result.rows.length} ${result.rows.length===1?'RZĄD':result.rows.length<5?'RZĘDY':'RZĘDÓW'} · ${result.aisles.length} ${result.aisles.length===1?'KORYTARZ':result.aisles.length<5?'KORYTARZE':'KORYTARZY'}`);
  add(svg, 'line', {x1:x0,y1:49,x2:x0+width,y2:49,stroke:'#7b9690','stroke-width':1});
  add(svg, 'path', {d:`M ${x0} 44 v 10 M ${x0+width} 44 v 10`,stroke:'#7b9690','stroke-width':1,fill:'none'});
  add(svg, 'text', {x:x0+width/2,y:43,'text-anchor':'middle',fill:'#47625b','font-size':12,'font-family':'Space Grotesk','font-weight':700}, result.valid ? `DŁUGOŚĆ ZABUDOWY ${Math.round(result.longestMin)}–${Math.round(result.longestMax)} mm*` : 'DŁUGOŚĆ: BRAK DOBORU');

  let y = 68;
  const drawAisle = (aisle, index) => {
    add(svg, 'rect', {x:x0,y,width,height:aisleHeight,fill:'#e2eeeb',stroke:'#b9d1cb','stroke-width':1});
    add(svg, 'line', {x1:x0+18,y1:y+aisleHeight/2,x2:x0+width-18,y2:y+aisleHeight/2,stroke:'#75a99d','stroke-width':1.5,'stroke-dasharray':'8 6'});
    add(svg, 'path', {d:`M ${x0+width-19} ${y+aisleHeight/2} l -9 -5 v 10 Z`,fill:'#75a99d'});
    add(svg, 'text', {x:x0+width/2,y:y+aisleHeight/2-7,'text-anchor':'middle',fill:'#426f65','font-size':13,'font-family':'Space Grotesk','font-weight':700}, `KORYTARZ PRACY ${Math.round(result.aisle)} mm`);
    add(svg, 'text', {x:9,y:y+aisleHeight/2+4,fill:'#8ba8a0','font-size':12,'font-family':'DM Sans','font-weight':700}, `K${index+1}`);
    y += aisleHeight;
  };

  result.rows.forEach((row, index) => {
    drawAisle(result.aisles[index], index);
    const rackWidth = row.nominalLength / maxLength * width;
    const rowHeight = rowHeights[index];
    const rowId = row.sourceId ?? row.id;
    const selected = rowId === selectedId;
    const rowValid = row.sections.every(section => section.length);
    add(svg, 'rect', {x:x0,y,width:rackWidth,height:rowHeight,fill:rowValid?(selected?'#d8e6d9':'#e5ece5'):'#f8e9e4',stroke:rowValid?(selected?'#5b8b68':'#8fa89a'):'#bf806b','stroke-width':selected?2:1});
    if (row.type === 'double') {
      add(svg, 'line', {x1:x0+3,y1:y+rowHeight/2,x2:x0+rackWidth-3,y2:y+rowHeight/2,stroke:'#9bb5a0','stroke-width':1,'stroke-dasharray':'5 4'});
    } else add(svg, 'text', {x:x0+rackWidth/2,y:y+rowHeight/2+4,'text-anchor':'middle',fill:'#668a70','font-size':12,'font-family':'DM Sans','font-weight':700}, 'REGAŁ POJEDYNCZY');
    let sectionX = x0;
    const postXs = [x0+3];
    row.sections.forEach((section, sectionIndex) => {
      const fraction = ((section.length ?? section.needed) + 100) / row.nominalLength;
      const sectionWidth = fraction * rackWidth;
      add(svg, 'line', {x1:sectionX+2,y1:y+5,x2:sectionX+2,y2:y+rowHeight-5,stroke:COLORS.post,'stroke-width':3,class:'post-plan'});
      if (section.length) {
        add(svg, 'line', {x1:sectionX+5,y1:y+7,x2:sectionX+sectionWidth-2,y2:y+7,stroke:COLORS.beam,'stroke-width':3,class:'beam-plan'});
        add(svg, 'line', {x1:sectionX+5,y1:y+rowHeight-7,x2:sectionX+sectionWidth-2,y2:y+rowHeight-7,stroke:COLORS.beam,'stroke-width':3,class:'beam-plan'});
      } else add(svg, 'line', {x1:sectionX+5,y1:y+7,x2:sectionX+sectionWidth-2,y2:y+7,stroke:'#bc775e','stroke-width':3,'stroke-dasharray':'6 4'});
      sectionX += sectionWidth;
      if (sectionIndex < row.sections.length-1) postXs.push(sectionX+2);
    });
    const rearProtection = row.rearProtection ?? config.rearProtection ?? 'none';
    if (rearProtection !== 'none') {
      const rearLines = row.type === 'double' ? [y+rowHeight/2-4,y+rowHeight/2+4] : [y+rowHeight-4];
      rearLines.forEach(rearY => {
        if (rearProtection === 'mesh') {
          add(svg, 'rect', {x:x0+5,y:rearY-6,width:Math.max(1,rackWidth-10),height:12,fill:'url(#rear-mesh-grid)',stroke:'#687477','stroke-width':1,class:'rear-plan-mesh'});
        } else {
          add(svg, 'line', {x1:x0+5,y1:rearY,x2:x0+rackWidth-5,y2:rearY,stroke:'#a66b3a','stroke-width':4,'stroke-dasharray':'12 7',class:'rear-plan-line'});
        }
      });
    }
    add(svg, 'line', {x1:x0+rackWidth-2,y1:y+5,x2:x0+rackWidth-2,y2:y+rowHeight-5,stroke:COLORS.post,'stroke-width':3,class:'post-plan'});
    if (config.protection === 'barrier' || config.protection === 'polymer') {
      postXs.push(x0+rackWidth-2);
      const guardYs = row.type === 'double' ? [y+7,y+rowHeight-7] : [y+7];
      postXs.forEach(postX => guardYs.forEach(guardY => {
        if (config.protection === 'barrier') add(svg, 'rect', {x:postX-5,y:guardY-5,width:10,height:10,fill:COLORS.guard,stroke:'#987500','stroke-width':1.2,class:'steel-post-guard-plan'});
        else add(svg, 'circle', {cx:postX,cy:guardY,r:5.5,fill:COLORS.guardLight,'fill-opacity':.92,stroke:COLORS.guard,'stroke-width':1.5,class:'post-guard-plan'});
      }));
    }
    if (row.type === 'double') {
      const labelWidth = Math.min(220, rackWidth - 12);
      add(svg, 'rect', {x:x0+(rackWidth-labelWidth)/2,y:y+20,width:labelWidth,height:34,rx:2,fill:selected?'#d8e6d9':'#e5ece5','fill-opacity':.96});
      add(svg, 'text', {x:x0+rackWidth/2,y:y+34,'text-anchor':'middle',fill:'#4f7860','font-size':11,'font-family':'DM Sans','font-weight':700}, 'PODWÓJNY · 2 STRONY');
      add(svg, 'text', {x:x0+rackWidth/2,y:y+48,'text-anchor':'middle',fill:'#4f7860','font-size':10,'font-family':'DM Sans','font-weight':700}, `ŁADUNKI ${Math.round(row.loadGap)} / RAMY ${Math.round(row.frameGap)} mm`);
    }
    add(svg, 'text', {x:9,y:y+rowHeight/2+4,fill:'#38554e','font-size':13,'font-family':'Space Grotesk','font-weight':700}, `R${String(index+1).padStart(2,'0')}`);
    add(svg, 'text', {x:583,y:y+rowHeight/2+4,fill:'#647e72','font-size':11,'font-family':'Space Grotesk','font-weight':700}, `${Math.round(row.depth)} mm`);
    const hit = add(svg, 'rect', {x:x0,y,width:rackWidth,height:rowHeight,fill:'transparent',class:'plan-hit',tabindex:0,role:'button','aria-label':`Pokaż widok frontowy regału ${index+1}`});
    hit.addEventListener('click', () => onSelect(rowId));
    hit.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(rowId); } });
    const handleX = x0 + rackWidth + 19, handleY = y + rowHeight/2;
    const handle = add(svg, 'g', {class:'plan-add',tabindex:0,role:'button','aria-label':`Dodaj sekcję do regału ${index+1}; przeciągnij lub kliknij`});
    handle.append(element('rect',{x:handleX-15,y:handleY-16,width:37,height:32,rx:5,fill:'#e7f1e8',stroke:'#79a185','stroke-dasharray':'4 3'}));
    handle.append(element('text',{x:handleX+3,y:handleY+6,'text-anchor':'middle',fill:'#437655','font-size':21,'font-family':'DM Sans','font-weight':700,'pointer-events':'none'},'+'));
    let startX = null;
    handle.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); startX = event.clientX; handle.setPointerCapture(event.pointerId); handle.classList.add('is-dragging'); });
    handle.addEventListener('pointermove', event => { if (startX === null) return; handle.setAttribute('transform', `translate(${Math.max(0,event.clientX-startX)},0)`); });
    handle.addEventListener('pointerup', event => { if (startX === null) return; event.stopPropagation(); startX = null; onAddSection(rowId); });
    handle.addEventListener('pointercancel', () => { startX = null; handle.removeAttribute('transform'); handle.classList.remove('is-dragging'); });
    handle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAddSection(rowId); } });
    y += rowHeight;
  });
  if (result.aisles.length > result.rows.length) drawAisle(result.aisles.at(-1), result.aisles.length-1);
  add(svg, 'text', {x:x0,y:y+24,fill:'#5f7770','font-size':12,'font-family':'DM Sans','font-weight':700}, `GŁĘBOKOŚĆ UKŁADU Z KORYTARZAMI: ${Math.round(result.overallDepth)} mm`);
  add(svg, 'text', {x:x0,y:y+42,fill:'#98a8a2','font-size':10,'font-family':'DM Sans'}, 'Przeciągnij + przy regale, aby dodać sekcję. Kliknij rząd: widok frontowy.');
}

root.RackformVisuals = { COLORS, drawPlan };
})(globalThis);
