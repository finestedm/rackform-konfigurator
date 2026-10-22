const { calculate, CLEARANCE, BEAM_HEIGHT, LEVEL_STEP, FRAME_HEIGHT_STEP, VERTICAL_CLEARANCE, TRUCKS } = globalThis.RackformCalculator;
const { COLORS, drawPlan } = globalThis.RackformVisuals;

const $ = selector => document.querySelector(selector);
const format = value => `${Math.round(value).toLocaleString('pl-PL')} mm`;
const formatRange = (min, max) => `${Math.round(min).toLocaleString('pl-PL')}–${Math.round(max).toLocaleString('pl-PL')} mm`;
const state = loadState();
let selectedRack = state.racks[0].id;
let viewMode = 'plan';
let scene3d = null;
let currentResult;
let levelModalRackId = null;
let levelModalDraft = null;

function defaultLevelDetails(palletHeight, count = 3, decking = 'none') {
  return Array.from({length:count}, (_, index) => ({clearHeight:palletHeight + VERTICAL_CLEARANCE, loadHeight:palletHeight, decking:index === 0 ? 'none' : decking}));
}
function defaultState() {
  const palletHeight = 1400, levels = 3;
  return { schemaVersion: 6, palletWidth: 800, palletDepth: 1200, palletHeight, frameDepth: null, frameExtension: null, levels, levelDetails: defaultLevelDetails(palletHeight, levels), standard: 'standard', truck: 'reach', decking: 'none', protection: 'none', rearProtection: 'none', racks: [{ id: 1, type: 'single', quantity: 1, rearProtection: 'none', sections: [3, 2], levels, levelDetails: defaultLevelDetails(palletHeight, levels) }] };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('rackform-v1'));
    if (saved && Array.isArray(saved.racks) && saved.racks.length && saved.racks.every(r => Array.isArray(r.sections) && r.sections.length)) {
      const legacyLevels = Math.max(1, Math.min(8, Math.round(Number(saved.levels) || 3)));
      saved.levelDetails = Array.from({length:legacyLevels}, (_, index) => saved.levelDetails?.[index] ?? {clearHeight:saved.palletHeight+VERTICAL_CLEARANCE,loadHeight:saved.palletHeight});
      if (!saved.schemaVersion) saved.levelDetails.forEach(detail => { if (detail.clearHeight === detail.loadHeight + 200) detail.clearHeight = detail.loadHeight + VERTICAL_CLEARANCE; });
      saved.racks = saved.racks.map(rack => ({ ...rack, quantity: Math.max(1, Math.min(50, Math.round(Number(rack.quantity) || 1))) }));
      saved.schemaVersion = 6;
      saved.frameDepth = saved.frameDepth == null || !Number.isFinite(Number(saved.frameDepth)) ? null : Number(saved.frameDepth);
      saved.frameExtension = saved.frameExtension == null || !Number.isFinite(Number(saved.frameExtension)) ? null : Number(saved.frameExtension);
      if (['polymer-asafe','polymer-ampere'].includes(saved.protection)) saved.protection = 'polymer';
      saved.protection = ['none','barrier','polymer'].includes(saved.protection) ? saved.protection : 'none';
      saved.decking = ['none','mesh','grate','bars','board'].includes(saved.decking) ? saved.decking : 'none';
      saved.rearProtection = ['none','mesh','backstops'].includes(saved.rearProtection) ? saved.rearProtection : 'none';
      saved.levelDetails = saved.levelDetails.map((detail, index) => ({ ...detail, decking: index === 0 ? 'none' : ['none','mesh','grate','bars','board'].includes(detail.decking) ? detail.decking : saved.decking }));
      saved.racks = saved.racks.map(rack => {
        const levels = Math.max(1, Math.min(8, Math.round(Number(rack.levels) || legacyLevels)));
        const sourceDetails = rack.levelDetails ?? saved.levelDetails;
        const levelDetails = Array.from({length:levels}, (_, index) => {
          const detail = sourceDetails[index] ?? {clearHeight:saved.palletHeight + VERTICAL_CLEARANCE,loadHeight:saved.palletHeight};
          return {...detail, decking:index === 0 ? 'none' : ['none','mesh','grate','bars','board'].includes(detail.decking) ? detail.decking : saved.decking};
        });
        return { ...rack, levels, levelDetails, rearProtection: ['none','mesh','backstops'].includes(rack.rearProtection) ? rack.rearProtection : saved.rearProtection };
      });
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
  $('#truck').value = state.truck;
  $('#decking').value = state.decking;
  $('#protection').value = state.protection;
  $('#rear-protection').value = state.rearProtection;
}
function updateFromInputs(event) {
  const previousHeight = state.palletHeight;
  state.palletWidth = number('#pallet-width', 400, 1800);
  state.palletDepth = number('#pallet-depth', 400, 2000);
  state.palletHeight = number('#pallet-height', 300, 2500);
  if (state.palletHeight !== previousHeight) state.racks.forEach(rack => rack.levelDetails.forEach(detail => {
    if (detail.loadHeight === previousHeight) detail.loadHeight = state.palletHeight;
    if (detail.clearHeight === previousHeight + VERTICAL_CLEARANCE) detail.clearHeight = state.palletHeight + VERTICAL_CLEARANCE;
  }));
  state.truck = $('#truck').value;
  state.decking = $('#decking').value;
  state.protection = $('#protection').value;
  state.rearProtection = $('#rear-protection').value;
  if (event?.target?.id === 'decking') state.racks.forEach(rack => rack.levelDetails.forEach((detail, index) => { detail.decking = index === 0 ? 'none' : state.decking; }));
  if (event?.target?.id === 'rear-protection') state.racks.forEach(rack => { rack.rearProtection = state.rearProtection; });
  render();
}
function rowName(index, type) { return `Regał ${String(index + 1).padStart(2, '0')} · ${type === 'double' ? 'podwójny' : 'pojedynczy'}`; }
function rackGroupName(index, type) { return `Konfiguracja ${String(index + 1).padStart(2, '0')} · ${type === 'double' ? 'podwójna' : 'pojedyncza'}`; }
function countWord(count, one, few, many) { return count === 1 ? one : count < 5 ? few : many; }

function renderLevelCards(result) {
  const list = $('#level-list'); list.replaceChildren();
  const table = document.createElement('table'); table.className = 'data-table level-table';
  table.innerHTML = '<thead><tr><th>Poziom</th><th>Światło</th><th>Ładunek</th><th>Wypełnienie</th><th>Położenie</th></tr></thead>';
  const body = document.createElement('tbody');
  result.levelsData.forEach((level, index) => {
    const row = document.createElement('tr');
    const number = document.createElement('th'); number.scope = 'row'; number.textContent = String(index);
    const numberInput = (key, value, step) => { const unit = document.createElement('div'); unit.className = 'input-unit'; const input = document.createElement('input'); input.type = 'number'; input.min = '300'; input.max = '4000'; input.step = String(step); input.value = value; input.setAttribute('aria-label', `${key === 'clearHeight' ? 'Światło poziomu' : 'Wysokość ładunku'}, poziom ${index}`); input.addEventListener('change', () => { const raw = Number(input.value); const bounded = Number.isFinite(raw) ? Math.max(300, Math.min(4000, raw)) : 300; state.levelDetails[index][key] = key === 'clearHeight' ? Math.round(bounded / LEVEL_STEP) * LEVEL_STEP : bounded; render(); }); const suffix = document.createElement('b'); suffix.textContent = 'mm'; unit.append(input, suffix); return unit; };
    const clear = document.createElement('td'); clear.append(numberInput('clearHeight', level.clearHeight, LEVEL_STEP));
    const load = document.createElement('td'); load.append(numberInput('loadHeight', level.loadHeight, 10));
    const decking = document.createElement('td');
    if (level.isFloor) decking.textContent = 'Posadzka';
    else { const select = document.createElement('select'); select.setAttribute('aria-label', `Wypełnienie poziomu ${index}`); [['none','Brak'],['mesh','Panel siatkowy'],['grate','Krata'],['bars','Poprzeczki'],['board','Płyta wiórowa']].forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }); select.value = level.decking ?? state.levelDetails[index].decking ?? state.decking; select.addEventListener('change', () => { state.levelDetails[index].decking = select.value; render(); }); decking.append(select); }
    const position = document.createElement('td'); position.className = 'level-position'; position.textContent = level.isFloor ? 'Paleta na posadzce' : `Belka ${format(level.beamElevation)} · światło ${format(level.effectiveClear)}`;
    row.append(number, clear, load, decking, position); body.append(row);
  });
  table.append(body); list.append(table);
}

function addSection(id) { const rack = state.racks.find(row => row.id === id); if (!rack) return; rack.sections.push(2); if (Array.isArray(rack.sectionLengths)) rack.sectionLengths.push(null); selectedRack = id; render(); }

function nextRackId() { return Math.max(0, ...state.racks.map(rack => Number(rack.id) || 0)) + 1; }
function duplicateRack(id) {
  const source = state.racks.find(rack => rack.id === id);
  if (!source) return;
  const copy = { ...source, id: nextRackId(), quantity: 1, rearProtection: source.rearProtection ?? state.rearProtection, sections: [...source.sections], sectionLengths: Array.isArray(source.sectionLengths) ? [...source.sectionLengths] : undefined, levelDetails: source.levelDetails.map(detail => ({...detail})) };
  state.racks.push(copy);
  selectedRack = copy.id;
  render();
}
function moveRack(id, direction) {
  const index = state.racks.findIndex(rack => rack.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.racks.length) return;
  [state.racks[index], state.racks[target]] = [state.racks[target], state.racks[index]];
  selectedRack = id;
  render();
}

function renderRackCards(result) {
  const list = $('#rack-list');
  list.replaceChildren();
  state.racks.forEach((rack, groupIndex) => {
    const row = result.rows.find(candidate => candidate.sourceId === rack.id || candidate.id === rack.id);
    if (!row) return;
    const card = document.createElement('div');
    const active = selectedRack === rack.id;
    card.className = `rack-card${active ? ' selected' : ' collapsed'}`;
    const head = document.createElement('div'); head.className = 'rack-card-head';
    const title = document.createElement('button'); title.type = 'button'; title.className = 'rack-name rack-select'; title.innerHTML = `<span class="rack-icon">▥</span><span>${rackGroupName(groupIndex, row.type)} <small>×${rack.quantity}</small></span>`; title.setAttribute('aria-expanded', String(active)); title.setAttribute('aria-label', `Pokaż konfigurację: ${rackGroupName(groupIndex, row.type)}`); title.addEventListener('click', () => { selectedRack = rack.id; viewMode = 'front'; render(); });
    const right = document.createElement('div'); right.className = 'rack-head-actions';
    const type = document.createElement('span'); type.className = 'rack-type'; type.textContent = row.type === 'double' ? '2 STRONY' : '1 STRONA';
    const tools = document.createElement('div'); tools.className = 'rack-card-tools';
    const up = document.createElement('button'); up.type = 'button'; up.className = 'icon-button'; up.textContent = '↑'; up.title = 'Przenieś konfigurację wyżej'; up.disabled = groupIndex === 0; up.addEventListener('click', () => moveRack(rack.id, -1));
    const down = document.createElement('button'); down.type = 'button'; down.className = 'icon-button'; down.textContent = '↓'; down.title = 'Przenieś konfigurację niżej'; down.disabled = groupIndex === state.racks.length - 1; down.addEventListener('click', () => moveRack(rack.id, 1));
    const duplicate = document.createElement('button'); duplicate.type = 'button'; duplicate.className = 'rack-action'; duplicate.textContent = 'Duplikuj'; duplicate.title = 'Duplikuj konfigurację'; duplicate.addEventListener('click', () => duplicateRack(rack.id));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button'; remove.textContent = '×'; remove.title = 'Usuń regał'; remove.disabled = state.racks.length === 1; remove.addEventListener('click', () => { state.racks = state.racks.filter(r => r.id !== rack.id); if (selectedRack === rack.id) selectedRack = state.racks[0].id; render(); });
    tools.append(up, down, duplicate, remove); right.append(type, tools); head.append(title, right); card.append(head);
    const body = document.createElement('div'); body.className = 'rack-card-body';
    const quantityField = document.createElement('label'); quantityField.className = 'field rack-quantity-field';
    const quantityCaption = document.createElement('span'); quantityCaption.textContent = 'Ilość identycznych regałów';
    const quantityUnit = document.createElement('div'); quantityUnit.className = 'input-unit';
    const quantityInput = document.createElement('input'); quantityInput.type = 'number'; quantityInput.min = '1'; quantityInput.max = '50'; quantityInput.step = '1'; quantityInput.value = rack.quantity; quantityInput.setAttribute('aria-label', `Ilość identycznych regałów w ${rackGroupName(groupIndex, row.type)}`);
    quantityInput.addEventListener('change', () => { rack.quantity = numberValue(quantityInput.value, 1, 50); selectedRack = rack.id; render(); });
    const quantitySuffix = document.createElement('b'); quantitySuffix.textContent = 'szt.'; quantityUnit.append(quantityInput, quantitySuffix); quantityField.append(quantityCaption, quantityUnit); body.append(quantityField);
    const rearField = document.createElement('label'); rearField.className = 'field rack-rear-field';
    const rearCaption = document.createElement('span'); rearCaption.textContent = 'Zabezpieczenie tyłu regału';
    const rearSelect = document.createElement('select'); rearSelect.setAttribute('aria-label', `Zabezpieczenie tyłu ${rackGroupName(groupIndex, row.type)}`);
    [['none','Brak'],['mesh','Wygrodzenie siatkowe pleców'],['backstops','Backstopy']].forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; rearSelect.append(option); });
    rearSelect.value = rack.rearProtection ?? state.rearProtection;
    rearSelect.addEventListener('change', () => { rack.rearProtection = rearSelect.value; selectedRack = rack.id; render(); });
    rearField.append(rearCaption, rearSelect); body.append(rearField);
    const sections = document.createElement('div'); sections.className = 'rack-sections';
    rack.sections.forEach((positions, sectionIndex) => {
      const section = row.sections[sectionIndex];
      const sectionRow = document.createElement('div'); sectionRow.className = 'section-row';
      const number = document.createElement('span'); number.className = 'section-number'; number.textContent = String(sectionIndex + 1).padStart(2, '0');
      const select = document.createElement('select'); select.setAttribute('aria-label', `Liczba palet w sekcji ${sectionIndex + 1}, ${rackGroupName(groupIndex, row.type)}`);
      for (let count = 1; count <= 4; count++) { const option = document.createElement('option'); option.value = count; option.textContent = `${count} ${count === 1 ? 'paleta' : count < 5 ? 'palety' : 'palet'}`; select.append(option); }
      select.value = positions;
      select.addEventListener('change', () => { rack.sections[sectionIndex] = Number(select.value); selectedRack = rack.id; render(); });
      const beam = document.createElement('span'); beam.className = `section-beam${section.length ? '' : ' invalid'}`;
      if (section.length) { const length = document.createElement('b'); length.textContent = format(section.length); const clearance = document.createElement('small'); clearance.textContent = `luz ${Math.round(section.clearance * 10) / 10} mm`; beam.append(length, clearance); }
      else beam.textContent = 'Brak trawersu';
      const removeSection = document.createElement('button'); removeSection.type = 'button'; removeSection.className = 'icon-button section-delete'; removeSection.textContent = '×'; removeSection.title = 'Usuń sekcję'; removeSection.disabled = rack.sections.length === 1; removeSection.addEventListener('click', () => { rack.sections.splice(sectionIndex, 1); selectedRack = rack.id; render(); });
      sectionRow.append(number, select, beam, removeSection); sections.append(sectionRow);
    });
    const foot = document.createElement('div'); foot.className = 'rack-card-foot';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'small-add'; add.textContent = '＋ Dodaj sekcję'; add.addEventListener('click', () => addSection(rack.id));
    foot.append(add); body.append(sections, foot); card.append(body); list.append(card);
  });
}

function renderRackTable(result) {
  const list = $('#rack-list'); list.replaceChildren();
  const table = document.createElement('table'); table.className = 'data-table rack-table';
  table.innerHTML = '<thead><tr><th>Konfiguracja</th><th>Typ</th><th>Ilość regałów</th><th>Sekcje · długość / ilość</th><th>Tył</th><th>Akcje</th></tr></thead>';
  const body = document.createElement('tbody');
  state.racks.forEach((rack, groupIndex) => {
    const row = result.rows.find(candidate => candidate.sourceId === rack.id || candidate.id === rack.id);
    if (!row) return;
    const active = selectedRack === rack.id;
    const tr = document.createElement('tr'); tr.className = active ? 'rack-table-row selected' : 'rack-table-row';
    const titleCell = document.createElement('th'); titleCell.scope = 'row'; const title = document.createElement('button'); title.type = 'button'; title.className = 'rack-select'; title.textContent = `${String(groupIndex + 1).padStart(2,'0')} · ${row.type === 'double' ? 'Podwójny' : 'Pojedynczy'}`; title.setAttribute('aria-expanded', String(active)); title.addEventListener('click', () => { selectedRack = rack.id; render(); }); titleCell.append(title);
    const typeCell = document.createElement('td');
    const typeSelect = document.createElement('select'); typeSelect.setAttribute('aria-label', `Typ regału w konfiguracji ${groupIndex}`);
    [['single','Pojedynczy'],['double','Podwójny']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; typeSelect.append(option); });
    typeSelect.value = rack.type; typeSelect.addEventListener('change', () => { rack.type = typeSelect.value; selectedRack = rack.id; render(); }); typeCell.append(typeSelect);
    const qtyCell = document.createElement('td'); const qty = document.createElement('input'); qty.type = 'number'; qty.min = '1'; qty.max = '50'; qty.step = '1'; qty.value = rack.quantity; qty.setAttribute('aria-label', `Ilość regałów w konfiguracji ${groupIndex}`); qty.addEventListener('change', () => { rack.quantity = numberValue(qty.value, 1, 50); selectedRack = rack.id; render(); }); qtyCell.append(qty);
    const sectionsCell = document.createElement('td'); sectionsCell.className = 'rack-sections-cell';
    const groups = sectionGroups(rack, row);
    if (active) {
      groups.forEach((group, groupSectionIndex) => {
        const wrap = document.createElement('div'); wrap.className = 'rack-section-inline';
        const length = document.createElement('select'); length.setAttribute('aria-label', `Długość trawersu grupy ${groupSectionIndex + 1}, konfiguracja ${groupIndex}`);
        beamCatalog().filter(value => positionsForBeamLength(value) > 0).forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = `${value} mm`; length.append(option); });
        length.value = group.length;
        const count = document.createElement('input'); count.type = 'number'; count.min = '1'; count.max = '50'; count.step = '1'; count.value = group.count; count.setAttribute('aria-label', `Ilość sekcji ${group.length} mm, konfiguracja ${groupIndex}`);
        const apply = () => { groups[groupSectionIndex].length = Number(length.value); groups[groupSectionIndex].count = numberValue(count.value, 1, 50); applySectionGroups(rack, groups); selectedRack = rack.id; render(); };
        length.addEventListener('change', apply); count.addEventListener('change', apply);
        const info = document.createElement('small'); info.textContent = `${group.count} × ${group.length} mm`;
        const removeGroup = document.createElement('button'); removeGroup.type = 'button'; removeGroup.className = 'icon-button section-group-delete'; removeGroup.textContent = '×'; removeGroup.title = 'Usuń grupę sekcji'; removeGroup.setAttribute('aria-label', `Usuń grupę ${group.length} mm z konfiguracji ${groupIndex + 1}`); removeGroup.disabled = groups.length === 1;
        removeGroup.addEventListener('click', () => { groups.splice(groupSectionIndex, 1); applySectionGroups(rack, groups); selectedRack = rack.id; render(); });
        wrap.append(length, count, info, removeGroup); sectionsCell.append(wrap);
      });
      const add = document.createElement('button'); add.type = 'button'; add.className = 'small-add'; add.textContent = '＋ Grupa sekcji'; add.addEventListener('click', () => { groups.push({ length: beamCatalog().find(value => positionsForBeamLength(value) > 0) ?? beamCatalog()[0], count: 1 }); applySectionGroups(rack, groups); selectedRack = rack.id; render(); }); sectionsCell.append(add);
    } else { sectionsCell.textContent = groups.map(group => `${group.length} mm: ${group.count} sekcji`).join(' · '); }
    const rearCell = document.createElement('td'); const rear = document.createElement('select'); rear.setAttribute('aria-label', `Zabezpieczenie tyłu konfiguracji ${groupIndex}`); [['none','Brak'],['mesh','Siatka'],['backstops','Backstopy']].forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; rear.append(option); }); rear.value = rack.rearProtection ?? state.rearProtection; rear.addEventListener('change', () => { rack.rearProtection = rear.value; selectedRack = rack.id; render(); }); rearCell.append(rear);
    const actions = document.createElement('td'); actions.className = 'rack-table-actions'; const levels = document.createElement('button'); levels.type = 'button'; levels.className = 'rack-action rack-levels-action'; levels.textContent = `Poziomy: ${row.levelsData.length}`; levels.title = 'Ustaw poziomy składowania'; levels.addEventListener('click', () => openLevelModal(rack.id)); const up = document.createElement('button'); up.type = 'button'; up.className = 'icon-button'; up.textContent = '↑'; up.title = 'Przenieś wyżej'; up.disabled = groupIndex === 0; up.addEventListener('click', () => moveRack(rack.id, -1)); const down = document.createElement('button'); down.type = 'button'; down.className = 'icon-button'; down.textContent = '↓'; down.title = 'Przenieś niżej'; down.disabled = groupIndex === state.racks.length - 1; down.addEventListener('click', () => moveRack(rack.id, 1)); const duplicate = document.createElement('button'); duplicate.type = 'button'; duplicate.className = 'rack-action'; duplicate.textContent = 'Duplikuj'; duplicate.addEventListener('click', () => duplicateRack(rack.id)); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button'; remove.textContent = '×'; remove.title = 'Usuń konfigurację'; remove.disabled = state.racks.length === 1; remove.addEventListener('click', () => { state.racks = state.racks.filter(item => item.id !== rack.id); selectedRack = state.racks[0].id; render(); }); actions.append(levels, up, down, duplicate, remove);
    tr.append(titleCell, typeCell, qtyCell, sectionsCell, rearCell, actions); body.append(tr);
  });
  table.append(body); list.append(table);
}

function renderLevelModalRows() {
  const list = $('#modal-level-list'); list.replaceChildren();
  const table = document.createElement('table'); table.className = 'data-table modal-level-table';
  table.innerHTML = '<thead><tr><th>Poziom</th><th>Światło</th><th>Ładunek</th><th>Wypełnienie</th></tr></thead>';
  const body = document.createElement('tbody');
  levelModalDraft.levelDetails.forEach((detail, index) => {
    const row = document.createElement('tr');
    const number = document.createElement('th'); number.scope = 'row'; number.textContent = String(index);
    const inputCell = (key, step) => { const cell = document.createElement('td'); const unit = document.createElement('div'); unit.className = 'input-unit'; const input = document.createElement('input'); input.type = 'number'; input.min = '300'; input.max = '4000'; input.step = String(step); input.value = detail[key]; input.setAttribute('aria-label', `${key === 'clearHeight' ? 'Światło' : 'Ładunek'}, poziom ${index}`); input.addEventListener('change', () => { const value = numberValue(input.value, 300, 4000); detail[key] = key === 'clearHeight' ? Math.round(value / LEVEL_STEP) * LEVEL_STEP : value; input.value = detail[key]; }); const suffix = document.createElement('b'); suffix.textContent = 'mm'; unit.append(input, suffix); cell.append(unit); return cell; };
    const clear = inputCell('clearHeight', LEVEL_STEP); const load = inputCell('loadHeight', 10);
    const decking = document.createElement('td');
    if (index === 0) decking.textContent = 'Posadzka';
    else { const select = document.createElement('select'); [['none','Brak'],['mesh','Panel siatkowy'],['grate','Krata'],['bars','Poprzeczki'],['board','Płyta wiórowa']].forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }); select.value = detail.decking; select.addEventListener('change', () => { detail.decking = select.value; }); decking.append(select); }
    row.append(number, clear, load, decking); body.append(row);
  });
  table.append(body); list.append(table);
}

function openLevelModal(rackId) {
  const rack = state.racks.find(item => item.id === rackId); if (!rack) return;
  levelModalRackId = rackId;
  levelModalDraft = { levels:rack.levels, levelDetails:rack.levelDetails.map(detail => ({...detail})) };
  $('#level-modal-title').textContent = `Poziomy · ${rackGroupName(state.racks.findIndex(item => item.id === rackId), rack.type)}`;
  $('#modal-level-count').value = levelModalDraft.levels;
  renderLevelModalRows();
  $('#level-modal').showModal();
}

function numberValue(value, min, max) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : min; }

function beamCatalog() { return state.standard === 'nfpa' ? [1000, 1900, 2850, 3800] : [1000, 1900, 2700, 3600]; }
function positionsForBeamLength(length) {
  const clearance = state.standard === 'nfpa' ? 100 : 75;
  let positions = 0;
  for (let count = 1; count <= 20; count += 1) {
    if (count * state.palletWidth + (count + 1) * clearance <= length) positions = count;
    else break;
  }
  return positions;
}
function sectionGroups(rack, row) {
  const groups = [];
  rack.sections.forEach((positions, index) => {
    const section = row.sections[index];
    const length = section?.length ?? beamCatalog()[0];
    const existing = groups.find(group => group.length === length);
    if (existing) existing.count += 1;
    else groups.push({ length, count: 1, positions });
  });
  return groups;
}
function applySectionGroups(rack, groups) {
  rack.sections = groups.flatMap(group => Array.from({ length: Math.max(1, Math.min(50, Math.round(group.count) || 1)) }, () => positionsForBeamLength(group.length)));
  rack.sectionLengths = groups.flatMap(group => Array.from({ length: Math.max(1, Math.min(50, Math.round(group.count) || 1)) }, () => Number(group.length)));
}

function svgEl(name, attrs = {}) { const el = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; }
function addSvg(svg, name, attrs, text) { const el = svgEl(name, attrs); if (text != null) el.textContent = text; svg.append(el); return el; }
function drawFront(result, rowOverride, svgOverride) {
  const row = rowOverride ?? result.rows.find(r => r.sourceId === selectedRack || r.id === selectedRack) ?? result.rows[0];
  const svg = svgOverride ?? $('#rack-drawing'); svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 760 260');
  const sections = row.sections;
  const baseX = 40, baseY = 208, totalWidth = 680;
  const lengths = sections.map(s => s.length ?? s.needed);
  const sum = lengths.reduce((a,b) => a+b, 0) + (sections.length+1)*100;
  const scale = totalWidth / sum;
  const post = Math.max(3, 100*scale);
  const heightScale = 155 / row.rackHeight;
  const topY = baseY - row.rackHeight*heightScale;
  let x = baseX;
  if (row.rearProtection === 'mesh') {
    addSvg(svg,'rect',{x:baseX+post,y:topY+5,width:totalWidth-2*post,height:baseY-topY-10,fill:'#7f898c','fill-opacity':.16,stroke:'#737d80','stroke-width':1,class:'rear-mesh-front'});
    for (let gx=baseX+post+18;gx<baseX+totalWidth-post;gx+=22) addSvg(svg,'line',{x1:gx,y1:topY+5,x2:gx,y2:baseY-5,stroke:'#737d80','stroke-width':.7,'stroke-opacity':.62});
    for (let gy=topY+17;gy<baseY-5;gy+=18) addSvg(svg,'line',{x1:baseX+post,y1:gy,x2:baseX+totalWidth-post,y2:gy,stroke:'#737d80','stroke-width':.7,'stroke-opacity':.62});
  }
  const drawPost = xPos => {
    addSvg(svg,'rect',{x:xPos,y:topY,width:post,height:baseY-topY,fill:COLORS.post,class:'post-front'});
    for(let y=topY+10;y<baseY;y+=12)addSvg(svg,'rect',{x:xPos+post/2-1,y,width:2,height:3,fill:'#a6b8b5'});
    if (state.protection === 'polymer') addSvg(svg,'rect',{x:xPos-4,y:baseY-19,width:post+8,height:19,rx:3,fill:COLORS.guardLight,'fill-opacity':.95,stroke:COLORS.guard,'stroke-width':1.5,class:'post-guard-front'});
  };
  sections.forEach((section, i) => {
    drawPost(x);
    const usableX = x + post;
    const beamW = lengths[i]*scale;
    row.levelsData.forEach(level => {
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
  addSvg(svg,'text',{x:baseX,y:24,fill:'#3d575c','font-size':10,'font-family':'DM Sans','font-weight':700},`RZĄD ${result.rows.findIndex(r=>(r.sourceId ?? r.id)===(row.sourceId ?? row.id))+1} / ${row.type==='double'?'REGAŁ PODWÓJNY':'REGAŁ POJEDYNCZY'}`);
  addSvg(svg,'text',{x:720,y:24,'text-anchor':'end',fill:'#83938f','font-size':9,'font-family':'DM Sans'},`${row.levelsData.length} ${countWord(row.levelsData.length,'POZIOM','POZIOMY','POZIOMÓW')} · ${row.sections.length} ${countWord(row.sections.length,'SEKCJA','SEKCJE','SEKCJI')}`);
  addSvg(svg,'text',{x:baseX,y:42,fill:'#7d918e','font-size':9,'font-family':'DM Sans'},'SŁUPY: 85 / 100 / 120 mm');
  if(row.type==='double') addSvg(svg,'text',{x:720,y:42,'text-anchor':'end',fill:'#7d918e','font-size':9,'font-family':'DM Sans'},'DRUGA STRONA ZA WIDOKIEM');
  svg.setAttribute('aria-label',`Rysunek rzędu ${result.rows.findIndex(r=>(r.sourceId ?? r.id)===(row.sourceId ?? row.id))+1}: ${row.sections.length} ${countWord(row.sections.length,'sekcja','sekcje','sekcji')}, ${row.levelsData.length} ${countWord(row.levelsData.length,'poziom','poziomy','poziomów')}, wysokość ${row.rackHeight} mm, słupy 85, 100 lub 120 mm`);
}

function printText(label, value) {
  const item = document.createElement('div'); item.className = 'print-spec';
  const name = document.createElement('dt'); name.textContent = label;
  const detail = document.createElement('dd'); detail.textContent = value;
  item.append(name, detail);
  return item;
}

function renderPrintSheets(result) {
  const container = $('#print-sheets');
  if (!container) return;
  container.replaceChildren();
  const deckingNames = {none:'Brak wypełnienia',mesh:'Panel siatkowy',grate:'Krata',bars:'Poprzeczki',board:'Płyta wiórowa'};
  const rearNames = {none:'Brak',mesh:'Wygrodzenie siatkowe pleców',backstops:'Backstopy'};
  const protectionNames = {none:'Brak osłon',barrier:'Odbojnica',polymer:'Odbojnica z tworzywa'};
  result.rows.forEach((row, rowIndex) => {
    const copies = Math.max(1, Number(row.quantity) || 1);
    for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
      const sheet = document.createElement('article'); sheet.className = 'print-rack-sheet';
      const heading = document.createElement('header'); heading.className = 'print-rack-heading';
      const title = document.createElement('div');
      const eyebrow = document.createElement('p'); eyebrow.textContent = 'RACKFORM · KARTA KONFIGURACJI';
      const sourceIndex = Math.max(0, state.racks.findIndex(rack => rack.id === row.sourceId)) + 1;
      const itemIndex = (row.copyIndex ?? copyIndex) + 1;
      const h1 = document.createElement('h1'); h1.textContent = `Regał ${String(sourceIndex).padStart(2, '0')}.${String(itemIndex).padStart(2, '0')} · widok od frontu`;
      title.append(eyebrow, h1);
      const type = document.createElement('strong'); type.textContent = row.type === 'double' ? 'REGAŁ PODWÓJNY' : 'REGAŁ POJEDYNCZY';
      heading.append(title, type);
      const body = document.createElement('div'); body.className = 'print-rack-body';
      const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); drawing.classList.add('print-front-drawing');
      drawFront(result, row, drawing);
      const description = document.createElement('section'); description.className = 'print-rack-description';
      const descriptionTitle = document.createElement('h2'); descriptionTitle.textContent = 'Opis konfiguracji'; description.append(descriptionTitle);
      const specs = document.createElement('dl'); specs.className = 'print-specs';
      specs.append(
        printText('Paleta / ładunek', `${format(state.palletWidth)} × ${format(state.palletDepth)} × ${format(state.palletHeight)}`),
        printText('Wysokość regału', format(row.rackHeight)),
        printText('Rama', `${format(result.frameDepth)} głębokości · ${format(result.frameExtension)} ponad ostatnim poziomem`),
        printText('Słupy / belki', '85 / 100 / 120 mm · belka 150 mm'),
        printText('Sekcje', row.sections.map(section => `${format(section.length ?? section.needed)} / ${section.positions} pal.`).join(' · ')),
        printText('Wypełnienie', [...new Set(row.levelsData.filter(level => !level.isFloor).map(level => deckingNames[level.decking] ?? deckingNames.none))].join(' / ') || 'Brak'),
        printText('Zabezpieczenia', `${protectionNames[state.protection]} · tył: ${rearNames[row.rearProtection] ?? rearNames.none}`)
      );
      if (row.type === 'double') specs.append(printText('Odstęp między rzędami', `${format(row.loadGap)} między ładunkami · ${format(row.frameGap)} między ramami`));
      description.append(specs);
      const levelsTitle = document.createElement('h2'); levelsTitle.textContent = 'Poziomy składowania'; description.append(levelsTitle);
      const levelTable = document.createElement('table'); levelTable.className = 'print-level-table';
      levelTable.innerHTML = '<thead><tr><th>Poziom</th><th>Ładunek</th><th>Światło</th><th>Belka</th><th>Wypełnienie</th></tr></thead>';
      const levelBody = document.createElement('tbody');
      row.levelsData.forEach((level, levelIndex) => {
        const tr = document.createElement('tr');
        [String(levelIndex), format(level.loadHeight), format(level.effectiveClear), level.isFloor ? 'Posadzka' : format(level.beamElevation), level.isFloor ? 'Posadzka' : deckingNames[level.decking] ?? deckingNames.none].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; tr.append(cell); });
        levelBody.append(tr);
      });
      levelTable.append(levelBody); description.append(levelTable);
      body.append(drawing, description); sheet.append(heading, body); container.append(sheet);
    }
  });
}

function renderPalletPreview() {
  const svg = $('#pallet-preview-svg'); if (!svg) return;
  svg.replaceChildren();
  const width = Math.max(1, state.palletWidth), depth = Math.max(1, state.palletDepth), height = Math.max(1, state.palletHeight);
  const scale = Math.min(0.18, 260 / (width + depth * 0.6), 112 / height);
  const dx = width * scale, dy = depth * scale * 0.5, cargoH = height * scale, palletH = Math.max(7, 140 * scale);
  const x = 92, y = 148;
  const A = [x, y], B = [x + dx, y], D = [x + dy, y - dy * 0.55], C = [B[0] + dy, B[1] - dy * 0.55];
  const lower = point => [point[0], point[1] + palletH];
  const lift = point => [point[0], point[1] - cargoH];
  const PA = lower(A), PB = lower(B), PC = lower(C), PD = lower(D);
  const LA = lift(A), LB = lift(B), LC = lift(C), LD = lift(D);
  const polygon = (points, attrs) => { const p = svgEl('polygon', {...attrs, points: points.map(point => point.join(',')).join(' ')}); svg.append(p); return p; };
  polygon([A,B,C,D], {fill:'#c0d0c4', stroke:'#668577','stroke-width':1});
  polygon([A,B,PB,PA], {fill:'#9d7953', stroke:'#735a40','stroke-width':1});
  polygon([B,C,PC,PB], {fill:'#876344', stroke:'#735a40','stroke-width':1});
  polygon([LA,LB,LC,LD], {fill:'#c4d3c8', stroke:'#668577','stroke-width':1});
  polygon([LA,LB,B,A], {fill:'#aec3b4', stroke:'#668577','stroke-width':1});
  polygon([LB,LC,C,B], {fill:'#99b1a1', stroke:'#668577','stroke-width':1});
  for (let i = 1; i < 5; i++) { const px = A[0] + dx * i / 5; svg.append(svgEl('line',{x1:px,y1:y-1,x2:px,y2:y+7,stroke:'#f0dfbd','stroke-width':1.5})); }
  for (let i = 1; i < 5; i++) { const px = A[0] + (dx + dy) * i / 5; const py = y - dy * 0.55 * i / 5; svg.append(svgEl('line',{x1:px,y1:py,x2:px,y2:py+palletH,stroke:'#d4ae7c','stroke-width':1})); }
  for (let i = 0; i < 3; i++) { const bx = A[0] + dx * (0.18 + i * 0.32); polygon([[bx,y+2],[bx+dx*.12,y+2],[bx+dx*.12,y+palletH],[bx,y+palletH]], {fill:'#75563e',stroke:'#604832','stroke-width':.5}); }
  for (let i = 1; i < 4; i++) { const px = LA[0] + dx * i / 4; svg.append(svgEl('line',{x1:px,y1:LA[1]+4,x2:px+dy,y2:LD[1]+4,stroke:'#e8f0e8','stroke-width':1,'stroke-opacity':.72})); }
  for (let i = 1; i < 4; i++) { const py = LA[1] + cargoH * i / 4; svg.append(svgEl('line',{x1:LA[0]+2,y1:py,x2:LB[0]-2,y2:py,stroke:'#e8f0e8','stroke-width':.8,'stroke-opacity':.55})); }
  const line = (a,b,attrs={}) => svg.append(svgEl('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],...attrs}));
  const text = (point,value,attrs={}) => { const node=svgEl('text',{x:point[0],y:point[1],...attrs}); node.textContent=value; svg.append(node); };
  line([PA[0], PA[1]+14], [PB[0], PB[1]+14], {stroke:'#496c63','stroke-width':1}); line([PA[0],PA[1]+9],[PA[0],PA[1]+19],{stroke:'#496c63'}); line([PB[0],PB[1]+9],[PB[0],PB[1]+19],{stroke:'#496c63'}); text([(PA[0]+PB[0])/2,PA[1]+29],`SZER. ${width} mm`,{'text-anchor':'middle',fill:'#496c63','font-size':11,'font-family':'DM Sans','font-weight':700});
  line([A[0]-8,A[1]],[D[0]-8,D[1]],{stroke:'#496c63','stroke-width':1}); line([A[0]-12,A[1]+2],[A[0]-4,A[1]-2],{stroke:'#496c63'}); line([D[0]-12,D[1]+2],[D[0]-4,D[1]-2],{stroke:'#496c63'}); text([D[0]-22,(A[1]+D[1])/2],`GŁ. ${depth} mm`,{'text-anchor':'middle',fill:'#496c63','font-size':11,'font-family':'DM Sans','transform':`rotate(-24 ${D[0]-22} ${(A[1]+D[1])/2})`});
  line([C[0]+13,C[1]],[LC[0]+13,LC[1]],{stroke:'#496c63','stroke-width':1}); line([C[0]+9,C[1]],[C[0]+17,C[1]],{stroke:'#496c63'}); line([LC[0]+9,LC[1]],[LC[0]+17,LC[1]],{stroke:'#496c63'}); text([C[0]+24,(C[1]+LC[1])/2+4],`WYS. ${height} mm`,{fill:'#496c63','font-size':11,'font-family':'DM Sans'});
  text([18,25],'PALETA / ŁADUNEK · RZUT IZOMETRYCZNY',{fill:'#49625b','font-size':11,'font-family':'DM Sans','font-weight':700});
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
    const selectedRow = result.rows.find(row => (row.sourceId ?? row.id) === selectedRack) ?? result.rows[0];
    $('#drawing-scale').textContent = selectedRow?.rearProtection === 'none' ? 'WYBRANY REGAŁ' : `TYŁ: ${selectedRow?.rearProtection === 'mesh' ? 'SIATKA' : 'BACKSTOPY'}`;
    drawFront(result);
  }
}

function render() {
  let result = calculate(state);
  if (state.frameExtension != null && state.frameExtension < result.requiredFrameExtension) { state.frameExtension = result.requiredFrameExtension; result = calculate(state); }
  currentResult = result;
  save();
  $('#frame-depth').value = result.frameDepth;
  $('#frame-extension').value = result.frameExtension;
  $('#frame-depth-auto').hidden = state.frameDepth == null;
  $('#frame-extension-auto').hidden = state.frameExtension == null;
  $('#frame-extension').min = result.requiredFrameExtension;
  $('#frame-note').textContent = `Głębokość zewnętrzna ramy ${format(result.frameDepth)}; domyślnie 100 mm mniej niż ładunek. Przedłużenie nad ostatnim poziomem co ${FRAME_HEIGHT_STEP} mm (minimum ${format(result.requiredFrameExtension)}). ${result.supportRequired ? 'Gdy rama jest równa lub głębsza od ładunku, wymagane jest wypełnienie, np. poprzeczki lub krata.' : ''}`;
  renderPalletPreview();
  document.querySelectorAll('[data-standard]').forEach(button => button.classList.toggle('active', button.dataset.standard === state.standard));
  $('#clearance-note').textContent = `Założony minimalny luz boczny i między paletami: ${CLEARANCE[state.standard]} mm. Dobór z długości ${state.standard === 'standard' ? '1000 / 1900 / 2700 / 3600' : '1000 / 1900 / 2850 / 3800'} mm.`;
  renderRackTable(result); renderDrawing(result); renderPrintSheets(result);
  $('#total-length').textContent = result.valid ? formatRange(result.longestMin, result.longestMax) : 'Brak doboru';
  $('#aisle').textContent = format(result.aisle);
  $('#aisle-note').textContent = `${TRUCKS[state.truck].label}, orientacyjnie`;
  $('#pallet-spots').textContent = result.valid ? result.spots.toLocaleString('pl-PL') : '—';
  $('#rack-height').textContent = format(result.rackHeight);
  const beamResults = $('#beam-results'); beamResults.replaceChildren();
  const heading = document.createElement('div'); heading.className = 'beam-title'; heading.textContent = 'DOBÓR TRAWERSÓW / WYMIARY RZĘDÓW'; beamResults.append(heading);
  result.rows.forEach((row,index) => { const line = document.createElement('div'); line.className = 'beam-result-row'; const label = document.createElement('span'); label.textContent = `${rowName(index,row.type)} · ${row.sections.map(s => s.length ? `${s.length}` : '—').join(' + ')} mm`; const value = document.createElement('strong'); value.textContent = row.sections.every(s=>s.length) ? `${formatRange(row.minLength,row.maxLength)}*` : 'Brak doboru'; line.append(label,value); beamResults.append(line); });
  const frame = document.createElement('div'); frame.className = 'beam-result-row'; frame.innerHTML = `<span>Rama · głębokość zewnętrzna / przedłużenie</span><strong>${format(result.frameDepth)} / ${format(result.frameExtension)}</strong>`; beamResults.append(frame);
  result.rows.filter(row => row.type === 'double').forEach((row,index) => { const gap = document.createElement('div'); gap.className = 'beam-result-row'; const label = document.createElement('span'); label.textContent = `Regał podwójny ${index + 1} · odstęp ładunków / ram`; const value = document.createElement('strong'); value.textContent = `${format(row.loadGap)} / ${format(row.frameGap)}`; gap.append(label,value); beamResults.append(gap); });
  const depth = document.createElement('div'); depth.className = 'beam-result-row'; depth.innerHTML = `<span>Głębokość układu z korytarzami</span><strong>${format(result.overallDepth)}</strong>`; beamResults.append(depth);
  const deckingNames = {none:'Brak wypełnienia',mesh:'Panel siatkowy',grate:'Krata',bars:'Poprzeczki',board:'Płyta wiórowa'};
  const protectionNames = {none:'brak osłon',barrier:'odbojnica',polymer:'odbojnica z tworzywa'};
  const deckingSummary = [...new Set(result.rows.flatMap(row => row.levelsData.map(level => deckingNames[level.decking] ?? deckingNames.none)))].join(' / ');
  const rearSummary = [...new Set(result.rows.map(row => row.rearProtection).map(value => value === 'mesh' ? 'wygrodzenie siatkowe' : value === 'backstops' ? 'backstopy' : 'brak'))].join(' / ');
  const equipment = document.createElement('div'); equipment.className = 'beam-result-row'; const equipmentLabel = document.createElement('span'); equipmentLabel.textContent = 'Wypełnienie / ochrona'; const equipmentValue = document.createElement('strong'); equipmentValue.textContent = `${deckingSummary} / ${protectionNames[state.protection]} / tył: ${rearSummary}`; equipment.append(equipmentLabel,equipmentValue); beamResults.append(equipment);
  $('#post-guard-legend').hidden = state.protection === 'none';
  const finish = document.createElement('div'); finish.className = 'beam-result-row'; const finishLabel = document.createElement('span'); finishLabel.textContent = 'Kolorystyka konstrukcji'; const finishValue = document.createElement('strong'); finishValue.textContent = 'Słupy RAL 5010 · belki RAL 1007 · odbojnice RAL 1004 · diagonale galva'; finish.append(finishLabel,finishValue); beamResults.append(finish);
  const rearNames = {none:'Brak',mesh:'Wygrodzenie siatkowe pleców',backstops:'Backstopy'};
  const selectedResultRow = result.rows.find(row => (row.sourceId ?? row.id) === selectedRack) ?? result.rows[0];
  const rear = document.createElement('div'); rear.className = 'beam-result-row'; const rearLabel = document.createElement('span'); rearLabel.textContent = 'Zabezpieczenie tyłu'; const rearValue = document.createElement('strong'); rearValue.textContent = rearSummary; rear.append(rearLabel,rearValue); beamResults.append(rear);
  if (result.rows.some(row => row.rearProtection !== 'none')) {
    const projection = Math.max(...result.rows.filter(row => row.rearProtection !== 'none').map(row => row.rearProjection ?? 0));
    const rearDistance = document.createElement('div'); rearDistance.className = 'beam-result-row'; const distanceLabel = document.createElement('span'); distanceLabel.textContent = 'Odsunięcie zabezpieczenia od ramy'; const distanceValue = document.createElement('strong'); distanceValue.textContent = `${format(projection)} · różnica głębokości / 2`; rearDistance.append(distanceLabel, distanceValue); beamResults.append(rearDistance);
  }
  $('#rear-legend').hidden = !result.rows.some(row => row.rearProtection !== 'none');
  $('#rear-legend').dataset.type = selectedResultRow?.rearProtection ?? 'none';
  $('#rear-legend-label').textContent = selectedResultRow?.rearProtection ? rearNames[selectedResultRow.rearProtection] : 'Zabezpieczenie tyłu';
  const notices = $('#notices'); notices.replaceChildren();
  result.warnings.forEach((warning,index) => { const div = document.createElement('div'); div.className = `notice${(index === 0 && !result.valid) || warning.includes('obecnie wybrano brak wypełnienia') ? ' error' : ''}`; div.textContent = warning; notices.append(div); });
  if(state.protection === 'barrier') { const div = document.createElement('div'); div.className = 'notice'; div.textContent = 'Uwzględniono odbojnicę. Jej dokładny obrys i wymagane odstępy trzeba dobrać do ruchu wózka.'; notices.append(div); }
  if(state.protection === 'polymer') { const div = document.createElement('div'); div.className = 'notice'; div.textContent = 'Odbojnica z tworzywa jest tubą zakładaną na słup. Wymiary i sposób montażu należy dobrać do konkretnego produktu oraz ruchu wózka.'; notices.append(div); }
}

syncInputs();
document.querySelectorAll('#pallet-width,#pallet-depth,#pallet-height,#truck,#decking,#protection,#rear-protection').forEach(input => input.addEventListener('input', event => updateFromInputs(event)));
$('#frame-depth').addEventListener('change', () => { state.frameDepth = number('#frame-depth', 100, 3000); render(); });
$('#frame-depth-auto').addEventListener('click', () => { state.frameDepth = null; render(); });
$('#frame-extension').addEventListener('change', () => { const extension = number('#frame-extension', currentResult.requiredFrameExtension, 5000); state.frameExtension = Math.max(currentResult.requiredFrameExtension, Math.round(extension / FRAME_HEIGHT_STEP) * FRAME_HEIGHT_STEP); render(); });
$('#frame-extension-auto').addEventListener('click', () => { state.frameExtension = null; render(); });
document.querySelectorAll('[data-standard]').forEach(button => button.addEventListener('click', () => { state.standard = button.dataset.standard; render(); }));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { viewMode = button.dataset.view; renderDrawing(currentResult); }));
$('#rotate-left').addEventListener('click', () => scene3d?.rotateBy(-Math.PI / 8));
$('#rotate-right').addEventListener('click', () => scene3d?.rotateBy(Math.PI / 8));
$('#rotate-reset').addEventListener('click', () => scene3d?.reset());
$('#expand-3d').addEventListener('click', () => { const expanded = $('#drawing-wrap').classList.toggle('expanded'); $('#expand-3d').textContent = expanded ? 'Zamknij' : 'Powiększ'; scene3d?.resize(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#drawing-wrap').classList.contains('expanded')) { $('#drawing-wrap').classList.remove('expanded'); $('#expand-3d').textContent = 'Powiększ'; scene3d?.resize(); } });
$('#add-single').addEventListener('click', () => addRack('single', numberValue($('#single-quantity').value, 1, 50)));
$('#add-double').addEventListener('click', () => addRack('double', numberValue($('#double-quantity').value, 1, 50)));
function addRack(type, quantity = 1) { const id = nextRackId(), levels = 3; state.racks.push({id,type,quantity:numberValue(quantity, 1, 50),rearProtection:state.rearProtection,sections:[2],levels,levelDetails:defaultLevelDetails(state.palletHeight, levels, state.decking)}); selectedRack = id; render(); }
$('#modal-level-count').addEventListener('change', () => {
  if (!levelModalDraft) return;
  const count = numberValue($('#modal-level-count').value, 1, 8);
  while (levelModalDraft.levelDetails.length < count) levelModalDraft.levelDetails.push({clearHeight:state.palletHeight + VERTICAL_CLEARANCE,loadHeight:state.palletHeight,decking:state.decking});
  levelModalDraft.levelDetails.length = count;
  levelModalDraft.levelDetails.forEach((detail, index) => { if (index === 0) detail.decking = 'none'; });
  levelModalDraft.levels = count; $('#modal-level-count').value = count; renderLevelModalRows();
});
$('#level-modal-close').addEventListener('click', () => $('#level-modal').close());
$('#level-modal-cancel').addEventListener('click', () => $('#level-modal').close());
$('#level-modal-save').addEventListener('click', () => {
  const rack = state.racks.find(item => item.id === levelModalRackId);
  if (rack && levelModalDraft) { rack.levels = levelModalDraft.levels; rack.levelDetails = levelModalDraft.levelDetails.map(detail => ({...detail})); selectedRack = rack.id; render(); }
  $('#level-modal').close();
});
$('#reset-button').addEventListener('click', () => { Object.assign(state, defaultState()); selectedRack = state.racks[0].id; viewMode = 'plan'; syncInputs(); render(); });
$('#print-button').addEventListener('click', () => window.print());
render();
