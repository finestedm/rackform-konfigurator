const { calculate, CLEARANCE, BEAM_HEIGHT, TRUCKS } = globalThis.RackformCalculator;
const { COLORS, drawPlan } = globalThis.RackformVisuals;

const $ = selector => document.querySelector(selector);
const format = value => `${Math.round(value).toLocaleString('pl-PL')} mm`;
const formatRange = (min, max) => `${Math.round(min).toLocaleString('pl-PL')}–${Math.round(max).toLocaleString('pl-PL')} mm`;
const state = loadState();
let selectedRack = state.racks[0].id;
let viewMode = 'plan';
let scene3d = null;
let currentResult;

function defaultState() {
  return { palletWidth: 800, palletDepth: 1200, palletHeight: 1400, levels: 3, levelDetails: Array.from({length:3}, () => ({clearHeight:1600,loadHeight:1400})), standard: 'standard', truck: 'reach', decking: 'none', protection: 'none', rearProtection: 'none', racks: [{ id: 1, type: 'single', sections: [3, 2] }] };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('rackform-v1'));
    if (saved && Array.isArray(saved.racks) && saved.racks.length && saved.racks.every(r => Array.isArray(r.sections) && r.sections.length)) {
      saved.levelDetails = Array.from({length:saved.levels}, (_, index) => saved.levelDetails?.[index] ?? {clearHeight:saved.palletHeight+200,loadHeight:saved.palletHeight});
      if (['polymer-asafe','polymer-ampere'].includes(saved.protection)) saved.protection = 'polymer';
      saved.protection = ['none','barrier','polymer'].includes(saved.protection) ? saved.protection : 'none';
      saved.decking = ['none','mesh','grate','bars','board'].includes(saved.decking) ? saved.decking : 'none';
      saved.rearProtection = ['none','mesh','backstops'].includes(saved.rearProtection) ? saved.rearProtection : 'none';
      return saved;
    }
  } catch {}
  return defaultState();
}
function save() { try { localStorage.setItem('rackform-v1', JSON.stringify(state)); } catch {} }
function number(id, min, max) {
  const parsed = Number($(id).value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}
function syncInputs() {
  $('#pallet-width').value = state.palletWidth;
  $('#pallet-depth').value = state.palletDepth;
  $('#pallet-height').value = state.palletHeight;
  $('#levels').value = state.levels;
  $('#truck').value = state.truck;
  $('#decking').value = state.decking;
  $('#protection').value = state.protection;
  $('#rear-protection').value = state.rearProtection;
}
function updateFromInputs() {
  const previousHeight = state.palletHeight;
  state.palletWidth = number('#pallet-width', 400, 1800);
  state.palletDepth = number('#pallet-depth', 400, 2000);
  state.palletHeight = number('#pallet-height', 300, 2500);
  state.levels = number('#levels', 1, 8);
  if (state.palletHeight !== previousHeight) state.levelDetails.forEach(detail => {
    if (detail.loadHeight === previousHeight) detail.loadHeight = state.palletHeight;
    if (detail.clearHeight === previousHeight + 200) detail.clearHeight = state.palletHeight + 200;
  });
  while (state.levelDetails.length < state.levels) state.levelDetails.push({clearHeight:state.palletHeight+200,loadHeight:state.palletHeight});
  state.levelDetails.length = state.levels;
  state.truck = $('#truck').value;
  state.decking = $('#decking').value;
  state.protection = $('#protection').value;
  state.rearProtection = $('#rear-protection').value;
  render();
}
function rowName(index, type) { return `Regał ${String(index + 1).padStart(2, '0')} · ${type === 'double' ? 'podwójny' : 'pojedynczy'}`; }
function countWord(count, one, few, many) { return count === 1 ? one : count < 5 ? few : many; }

function renderLevelCards(result) {
  const list = $('#level-list'); list.replaceChildren();
  result.levelsData.forEach((level, index) => {
    const card = document.createElement('div'); card.className = 'level-card';
    const name = document.createElement('strong'); name.textContent = `POZIOM ${String(index+1).padStart(2,'0')}`;
    const createField = (label, key, value) => {
      const field = document.createElement('label'); field.className = 'field';
      const caption = document.createElement('span'); caption.textContent = label;
      const unit = document.createElement('div'); unit.className = 'input-unit';
      const input = document.createElement('input'); input.type = 'number'; input.min = '300'; input.max = '4000'; input.step = '10'; input.value = value; input.setAttribute('aria-label', `${label}, poziom ${index+1}`);
      input.addEventListener('change', () => { const value = Number(input.value); state.levelDetails[index][key] = Number.isFinite(value) ? Math.max(300, Math.min(4000, value)) : 300; render(); });
      const suffix = document.createElement('b'); suffix.textContent = 'mm'; unit.append(input, suffix); field.append(caption, unit); return field;
    };
    const fields = document.createElement('div'); fields.className = 'level-fields';
    fields.append(createField('Światło poziomu', 'clearHeight', level.clearHeight), createField('Wysokość ładunku', 'loadHeight', level.loadHeight));
    const computed = document.createElement('small'); computed.className = 'level-computed'; computed.textContent = level.isFloor ? `Paleta na posadzce · pierwsza belka nad nią na ${format(level.effectiveClear)}` : `Belka na ${format(level.beamElevation)} · wymagane światło ${format(level.effectiveClear)}`;
    card.append(name, fields, computed); list.append(card);
  });
}

function addSection(id) { const rack = state.racks.find(row => row.id === id); if (!rack) return; rack.sections.push(2); selectedRack = id; render(); }

function renderRackCards(result) {
  const list = $('#rack-list');
  list.replaceChildren();
  result.rows.forEach((row, index) => {
    const card = document.createElement('div');
    card.className = `rack-card${selectedRack === row.id ? ' selected' : ''}`;
    const head = document.createElement('div'); head.className = 'rack-card-head';
    const title = document.createElement('button'); title.type = 'button'; title.className = 'rack-name rack-select'; title.innerHTML = `<span class="rack-icon">▥</span><span>${rowName(index, row.type)}</span>`; title.setAttribute('aria-label', `Pokaż rysunek: ${rowName(index, row.type)}`); title.addEventListener('click', () => { selectedRack = row.id; viewMode = 'front'; render(); });
    const right = document.createElement('div'); right.className = 'rack-head-actions';
    const type = document.createElement('span'); type.className = 'rack-type'; type.textContent = row.type === 'double' ? '2 STRONY' : '1 STRONA';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button'; remove.textContent = '×'; remove.title = 'Usuń regał'; remove.disabled = state.racks.length === 1; remove.addEventListener('click', () => { state.racks = state.racks.filter(r => r.id !== row.id); if (selectedRack === row.id) selectedRack = state.racks[0].id; render(); });
    right.append(type, remove); head.append(title, right); card.append(head);
    const sections = document.createElement('div'); sections.className = 'rack-sections';
    row.sections.forEach((section, sectionIndex) => {
      const sectionRow = document.createElement('div'); sectionRow.className = 'section-row';
      const number = document.createElement('span'); number.className = 'section-number'; number.textContent = String(sectionIndex + 1).padStart(2, '0');
      const select = document.createElement('select'); select.setAttribute('aria-label', `Liczba palet w sekcji ${sectionIndex + 1}, regał ${index + 1}`);
      for (let count = 1; count <= 4; count++) { const option = document.createElement('option'); option.value = count; option.textContent = `${count} ${count === 1 ? 'paleta' : count < 5 ? 'palety' : 'palet'}`; select.append(option); }
      select.value = section.positions;
      select.addEventListener('change', () => { state.racks[index].sections[sectionIndex] = Number(select.value); selectedRack = row.id; render(); });
      const beam = document.createElement('span'); beam.className = `section-beam${section.length ? '' : ' invalid'}`;
      if (section.length) { const length = document.createElement('b'); length.textContent = format(section.length); const clearance = document.createElement('small'); clearance.textContent = `luz ${Math.round(section.clearance * 10) / 10} mm`; beam.append(length, clearance); }
      else beam.textContent = 'Brak trawersu';
      const removeSection = document.createElement('button'); removeSection.type = 'button'; removeSection.className = 'icon-button section-delete'; removeSection.textContent = '×'; removeSection.title = 'Usuń sekcję'; removeSection.disabled = row.sections.length === 1; removeSection.addEventListener('click', () => { state.racks[index].sections.splice(sectionIndex, 1); selectedRack = row.id; render(); });
      sectionRow.append(number, select, beam, removeSection); sections.append(sectionRow);
    });
    card.append(sections);
    const foot = document.createElement('div'); foot.className = 'rack-card-foot';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'small-add'; add.textContent = '＋ Dodaj sekcję'; add.addEventListener('click', () => addSection(row.id));
    foot.append(add); card.append(foot); list.append(card);
  });
}

function svgEl(name, attrs = {}) { const el = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; }
function addSvg(svg, name, attrs, text) { const el = svgEl(name, attrs); if (text != null) el.textContent = text; svg.append(el); return el; }
function drawFront(result) {
  const row = result.rows.find(r => r.id === selectedRack) ?? result.rows[0];
  const svg = $('#rack-drawing'); svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 760 260');
  const sections = row.sections;
  const baseX = 40, baseY = 208, totalWidth = 680;
  const lengths = sections.map(s => s.length ?? s.needed);
  const sum = lengths.reduce((a,b) => a+b, 0) + (sections.length+1)*100;
  const scale = totalWidth / sum;
  const post = Math.max(3, 100*scale);
  const heightScale = 155 / result.rackHeight;
  const topY = baseY - result.rackHeight*heightScale;
  let x = baseX;
  const drawPost = xPos => {
    addSvg(svg,'rect',{x:xPos,y:topY,width:post,height:baseY-topY,fill:COLORS.post,class:'post-front'});
    for(let y=topY+10;y<baseY;y+=12)addSvg(svg,'rect',{x:xPos+post/2-1,y,width:2,height:3,fill:'#a6b8b5'});
    if (state.protection === 'polymer') addSvg(svg,'rect',{x:xPos-4,y:baseY-19,width:post+8,height:19,rx:3,fill:COLORS.guardLight,'fill-opacity':.95,stroke:COLORS.guard,'stroke-width':1.5,class:'post-guard-front'});
  };
  sections.forEach((section, i) => {
    drawPost(x);
    const usableX = x + post;
    const beamW = lengths[i]*scale;
    result.levelsData.forEach(level => {
      const beamThickness = Math.max(3,BEAM_HEIGHT*heightScale);
      const y = baseY - level.supportElevation*heightScale;
      if (!level.isFloor && section.length) addSvg(svg,'rect',{x:usableX,y,width:beamW,height:beamThickness,fill:COLORS.beam,class:'beam-front'});
      else if (!level.isFloor) addSvg(svg,'line',{x1:usableX,y1:y+2,x2:usableX+beamW,y2:y+2,stroke:'#ba7459','stroke-width':3,'stroke-dasharray':'7 5'});
      const count = section.positions;
      const clearance = section.length ? section.clearance : 75;
      const palletW = state.palletWidth*scale;
      const clearW = clearance*scale;
      for(let p=0;p<count && section.length;p++){
        const px = usableX + clearW + p*(palletW+clearW);
        if(px+palletW>usableX+beamW+2)continue;
        addSvg(svg,'rect',{x:px,y:y-level.loadHeight*heightScale,width:palletW,height:level.loadHeight*heightScale,rx:1,fill:'#b2c4b5',stroke:'#86a290','stroke-width':.6});
        addSvg(svg,'rect',{x:px,y:y-3,width:palletW,height:3,fill:'#9b7652'});
      }
    });
    const center = usableX+beamW/2;
    addSvg(svg,'line',{x1:usableX,y1:232,x2:usableX+beamW,y2:232,stroke:'#839694','stroke-width':1});
    addSvg(svg,'path',{d:`M ${usableX} 228 v 8 M ${usableX+beamW} 228 v 8`,stroke:'#839694','stroke-width':1,fill:'none'});
    addSvg(svg,'text',{x:center,y:246,'text-anchor':'middle',fill:section.length?'#435b60':'#b66d4f','font-size':Math.max(8,Math.min(11,150/sections.length)),'font-family':'Space Grotesk','font-weight':700},section.length ? `${section.length} mm` : 'brak trawersu');
    x = usableX + beamW;
  });
  drawPost(x);
  if (state.protection === 'barrier') addSvg(svg,'line',{x1:baseX,y1:baseY-7,x2:x+post,y2:baseY-7,stroke:COLORS.guard,'stroke-width':5,class:'barrier-front'});
  addSvg(svg,'line',{x1:baseX-12,y1:baseY+1,x2:x+post+12,y2:baseY+1,stroke:'#698077','stroke-width':2});
  addSvg(svg,'text',{x:baseX,y:24,fill:'#3d575c','font-size':10,'font-family':'DM Sans','font-weight':700},`RZĄD ${result.rows.findIndex(r=>r.id===row.id)+1} / ${row.type==='double'?'REGAŁ PODWÓJNY':'REGAŁ POJEDYNCZY'}`);
  addSvg(svg,'text',{x:720,y:24,'text-anchor':'end',fill:'#83938f','font-size':9,'font-family':'DM Sans'},`${state.levels} ${countWord(state.levels,'POZIOM','POZIOMY','POZIOMÓW')} · ${row.sections.length} ${countWord(row.sections.length,'SEKCJA','SEKCJE','SEKCJI')}`);
  addSvg(svg,'text',{x:baseX,y:42,fill:'#7d918e','font-size':9,'font-family':'DM Sans'},'SŁUPY: 85 / 100 / 120 mm');
  if(row.type==='double') addSvg(svg,'text',{x:720,y:42,'text-anchor':'end',fill:'#7d918e','font-size':9,'font-family':'DM Sans'},'DRUGA STRONA ZA WIDOKIEM');
  svg.setAttribute('aria-label',`Rysunek rzędu ${result.rows.findIndex(r=>r.id===row.id)+1}: ${row.sections.length} ${countWord(row.sections.length,'sekcja','sekcje','sekcji')}, ${state.levels} ${countWord(state.levels,'poziom','poziomy','poziomów')}, wysokość ${result.rackHeight} mm, słupy 85, 100 lub 120 mm`);
}

function renderDrawing(result) {
  const svg = $('#rack-drawing');
  svg.setAttribute('role', viewMode === 'front' ? 'img' : 'group');
  const wrap = $('#drawing-wrap');
  const expanded = viewMode === 'threeD' && wrap.classList.contains('expanded');
  wrap.className = `drawing-wrap ${viewMode}${expanded ? ' expanded' : ''}`;
  $('#expand-3d').textContent = expanded ? 'Zamknij' : 'Powiększ';
  svg.style.display = viewMode === 'threeD' ? 'none' : '';
  $('#scene3d').hidden = viewMode !== 'threeD';
  document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === viewMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#view-controls').hidden = viewMode !== 'threeD';
  if (viewMode !== 'threeD' && scene3d) { scene3d.destroy(); scene3d = null; }
  if (viewMode === 'plan') {
    $('#drawing-title').textContent = 'PLAN WSZYSTKICH REGAŁÓW';
    $('#drawing-scale').textContent = 'PRZECIĄGNIJ +, ABY DODAĆ SEKCJĘ';
    drawPlan(svg, state, result, selectedRack, id => { selectedRack = id; viewMode = 'front'; render(); }, addSection);
  } else if (viewMode === 'threeD') {
    $('#drawing-title').textContent = 'WIDOK 3D / CAŁY UKŁAD';
    $('#drawing-scale').textContent = 'OBRÓĆ · PRZYBLIŻ · DODAJ SEKCJĘ';
    if (!scene3d) scene3d = globalThis.RackformThreeD.create($('#scene3d'), addSection);
    scene3d.update(state, result);
  } else {
    $('#drawing-title').textContent = 'WIDOK OD FRONTU';
    $('#drawing-scale').textContent = state.rearProtection === 'none' ? 'WYBRANY REGAŁ' : `TYŁ: ${state.rearProtection === 'mesh' ? 'SIATKA' : 'BACKSTOPY'}`;
    drawFront(result);
  }
}

function render() {
  const result = calculate(state);
  currentResult = result;
  save();
  document.querySelectorAll('[data-standard]').forEach(button => button.classList.toggle('active', button.dataset.standard === state.standard));
  $('#clearance-note').textContent = `Założony minimalny luz boczny i między paletami: ${CLEARANCE[state.standard]} mm. Dobór z długości ${state.standard === 'standard' ? '1000 / 1900 / 2700 / 3600' : '1000 / 1900 / 2850 / 3800'} mm.`;
  renderLevelCards(result); renderRackCards(result); renderDrawing(result);
  $('#total-length').textContent = result.valid ? formatRange(result.longestMin, result.longestMax) : 'Brak doboru';
  $('#aisle').textContent = format(result.aisle);
  $('#aisle-note').textContent = `${TRUCKS[state.truck].label}, orientacyjnie`;
  $('#pallet-spots').textContent = result.valid ? result.spots.toLocaleString('pl-PL') : '—';
  $('#rack-height').textContent = format(result.rackHeight);
  const beamResults = $('#beam-results'); beamResults.replaceChildren();
  const heading = document.createElement('div'); heading.className = 'beam-title'; heading.textContent = 'DOBÓR TRAWERSÓW / WYMIARY RZĘDÓW'; beamResults.append(heading);
  result.rows.forEach((row,index) => { const line = document.createElement('div'); line.className = 'beam-result-row'; const label = document.createElement('span'); label.textContent = `${rowName(index,row.type)} · ${row.sections.map(s => s.length ? `${s.length}` : '—').join(' + ')} mm`; const value = document.createElement('strong'); value.textContent = row.sections.every(s=>s.length) ? `${formatRange(row.minLength,row.maxLength)}*` : 'Brak doboru'; line.append(label,value); beamResults.append(line); });
  const depth = document.createElement('div'); depth.className = 'beam-result-row'; depth.innerHTML = `<span>Głębokość układu z korytarzami</span><strong>${format(result.overallDepth)}</strong>`; beamResults.append(depth);
  const deckingNames = {none:'Brak wypełnienia',mesh:'Panel siatkowy',grate:'Krata',bars:'Poprzeczki',board:'Płyta wiórowa'};
  const protectionNames = {none:'brak osłon',barrier:'odbojnica',polymer:'odbojnica z tworzywa'};
  const equipment = document.createElement('div'); equipment.className = 'beam-result-row'; const equipmentLabel = document.createElement('span'); equipmentLabel.textContent = 'Wypełnienie / ochrona'; const equipmentValue = document.createElement('strong'); equipmentValue.textContent = `${deckingNames[state.decking]} / ${protectionNames[state.protection]}`; equipment.append(equipmentLabel,equipmentValue); beamResults.append(equipment);
  $('#post-guard-legend').hidden = state.protection === 'none';
  const finish = document.createElement('div'); finish.className = 'beam-result-row'; const finishLabel = document.createElement('span'); finishLabel.textContent = 'Kolorystyka konstrukcji'; const finishValue = document.createElement('strong'); finishValue.textContent = 'Słupy RAL 5010 · belki RAL 1007 · odbojnice RAL 1004 · diagonale galva'; finish.append(finishLabel,finishValue); beamResults.append(finish);
  const rearNames = {none:'Brak',mesh:'Wygrodzenie siatkowe pleców',backstops:'Backstopy'};
  const rear = document.createElement('div'); rear.className = 'beam-result-row'; const rearLabel = document.createElement('span'); rearLabel.textContent = 'Zabezpieczenie tyłu'; const rearValue = document.createElement('strong'); rearValue.textContent = rearNames[state.rearProtection]; rear.append(rearLabel,rearValue); beamResults.append(rear);
  $('#rear-legend').hidden = state.rearProtection === 'none';
  $('#rear-legend').dataset.type = state.rearProtection;
  $('#rear-legend-label').textContent = rearNames[state.rearProtection];
  const notices = $('#notices'); notices.replaceChildren();
  result.warnings.forEach((warning,index) => { const div = document.createElement('div'); div.className = `notice${index === 0 && !result.valid ? ' error' : ''}`; div.textContent = warning; notices.append(div); });
  if(state.protection === 'barrier') { const div = document.createElement('div'); div.className = 'notice'; div.textContent = 'Uwzględniono odbojnicę. Jej dokładny obrys i wymagane odstępy trzeba dobrać do ruchu wózka.'; notices.append(div); }
  if(state.protection === 'polymer') { const div = document.createElement('div'); div.className = 'notice'; div.textContent = 'Odbojnica z tworzywa jest tubą zakładaną na słup. Wymiary i sposób montażu należy dobrać do konkretnego produktu oraz ruchu wózka.'; notices.append(div); }
}

syncInputs();
document.querySelectorAll('#pallet-width,#pallet-depth,#pallet-height,#levels,#truck,#decking,#protection,#rear-protection').forEach(input => input.addEventListener('input', updateFromInputs));
document.querySelectorAll('[data-standard]').forEach(button => button.addEventListener('click', () => { state.standard = button.dataset.standard; render(); }));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { viewMode = button.dataset.view; renderDrawing(currentResult); }));
$('#rotate-left').addEventListener('click', () => scene3d?.rotateBy(-Math.PI / 8));
$('#rotate-right').addEventListener('click', () => scene3d?.rotateBy(Math.PI / 8));
$('#rotate-reset').addEventListener('click', () => scene3d?.reset());
$('#expand-3d').addEventListener('click', () => { const expanded = $('#drawing-wrap').classList.toggle('expanded'); $('#expand-3d').textContent = expanded ? 'Zamknij' : 'Powiększ'; scene3d?.resize(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#drawing-wrap').classList.contains('expanded')) { $('#drawing-wrap').classList.remove('expanded'); $('#expand-3d').textContent = 'Powiększ'; scene3d?.resize(); } });
$('#add-single').addEventListener('click', () => addRack('single'));
$('#add-double').addEventListener('click', () => addRack('double'));
function addRack(type) { const id = Math.max(...state.racks.map(r=>r.id))+1; state.racks.push({id,type,sections:[2]}); selectedRack = id; render(); }
$('#reset-button').addEventListener('click', () => { Object.assign(state, defaultState()); selectedRack = state.racks[0].id; viewMode = 'plan'; syncInputs(); render(); });
$('#print-button').addEventListener('click', () => window.print());
render();
