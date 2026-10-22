(function (root) {
'use strict';

const BEAMS = {
  standard: [1000, 1900, 2700, 3600],
  nfpa: [1000, 1900, 2850, 3800]
};

const CLEARANCE = { standard: 75, nfpa: 100 };
const POST_OPTIONS = [85, 100, 120];
const BEAM_HEIGHT = 150;
const LEVEL_STEP = 50;
const FRAME_HEIGHT_STEP = 250;
const VERTICAL_CLEARANCE = 100;
const TRUCKS = {
  counterbalance: { label: 'Wózek czołowy', aisle: 3500 },
  reach: { label: 'Reach truck', aisle: 2800 },
  vna: { label: 'Wózek systemowy VNA', aisle: 1800 }
};

function selectBeam(palletWidth, positions, standard) {
  const minClearance = CLEARANCE[standard];
  const needed = positions * palletWidth + (positions + 1) * minClearance;
  const length = BEAMS[standard].find(value => value >= needed) ?? null;
  return { needed, length, clearance: length ? (length - positions * palletWidth) / (positions + 1) : null };
}

const DECKING = new Set(['none', 'mesh', 'grate', 'bars', 'board']);
const REAR_PROTECTION = new Set(['none', 'mesh', 'backstops']);
function deckingForLevel(config, index) {
  const value = config.levelDetails?.[index]?.decking;
  return DECKING.has(value) ? value : (DECKING.has(config.decking) ? config.decking : 'none');
}
function rearProtectionForRack(config, rack) {
  return REAR_PROTECTION.has(rack.rearProtection)
    ? rack.rearProtection
    : (REAR_PROTECTION.has(config.rearProtection) ? config.rearProtection : 'none');
}

function calculate(config) {
  const { palletWidth, palletDepth, palletHeight, levels, standard, truck, racks } = config;
  const frameDepth = config.frameDepth == null ? Math.max(100, palletDepth - 100) : Math.max(100, Number(config.frameDepth) || 100);
  let previousLevel = null;
  const levelsData = Array.from({ length: levels }, (_, index) => {
    const detail = config.levelDetails?.[index] ?? {};
    const loadHeight = Math.max(300, Number(detail.loadHeight) || palletHeight);
    const clearHeight = Math.max(300, Number(detail.clearHeight) || palletHeight + VERTICAL_CLEARANCE);
    const effectiveClear = Math.ceil(Math.max(clearHeight, loadHeight + VERTICAL_CLEARANCE) / LEVEL_STEP) * LEVEL_STEP;
    const beamElevation = previousLevel ? previousLevel.supportElevation + previousLevel.effectiveClear : null;
    const supportElevation = beamElevation === null ? 0 : beamElevation + BEAM_HEIGHT;
    const level = { index: index + 1, isFloor: index === 0, beamElevation, supportElevation, loadHeight, clearHeight, effectiveClear, loadTop: supportElevation + loadHeight, decking: deckingForLevel(config, index) };
    previousLevel = level;
    return level;
  });
  const rackCopies = racks.flatMap(rack => {
    const quantity = Math.max(1, Math.min(50, Math.round(Number(rack.quantity) || 1)));
    return Array.from({ length: quantity }, (_, copyIndex) => ({
      ...rack,
      id: copyIndex === 0 ? rack.id : `${rack.id}-${copyIndex + 1}`,
      sourceId: rack.id,
      copyIndex,
      quantity: 1
    }));
  });
  const defaultExtraGap = standard === 'nfpa' || config.rearProtection === 'backstops' ? 50 : 0;
  const defaultFrameGap = Math.max(200 + defaultExtraGap, 100 + defaultExtraGap + palletDepth - frameDepth);
  const defaultLoadGap = defaultFrameGap + frameDepth - palletDepth;
  const rows = rackCopies.map(rack => {
    const rearProtection = rearProtectionForRack(config, rack);
    const extraGap = standard === 'nfpa' || rearProtection === 'backstops' ? 50 : 0;
    const minimumFrameGap = 200 + extraGap;
    const minimumLoadGap = 100 + extraGap;
    const frameGap = Math.max(minimumFrameGap, minimumLoadGap + palletDepth - frameDepth);
    const loadGap = frameGap + frameDepth - palletDepth;
    const sections = rack.sections.map(positions => ({ positions, ...selectBeam(palletWidth, positions, standard) }));
    const beamSum = sections.reduce((sum, s) => sum + (s.length ?? s.needed), 0);
    const minLength = beamSum + (sections.length + 1) * POST_OPTIONS[0];
    const nominalLength = beamSum + (sections.length + 1) * POST_OPTIONS[1];
    const maxLength = beamSum + (sections.length + 1) * POST_OPTIONS[2];
    const depth = rack.type === 'double' ? frameDepth * 2 + frameGap + Math.max(0, palletDepth - frameDepth) : Math.max(frameDepth, palletDepth);
    return { ...rack, rearProtection, decking: levelsData.map(level => level.decking), sections, beamSum, minLength, nominalLength, maxLength, depth, frameGap: rack.type === 'double' ? frameGap : null, loadGap: rack.type === 'double' ? loadGap : null, spots: sections.reduce((sum, s) => sum + s.positions, 0) * levels * (rack.type === 'double' ? 2 : 1) };
  });
  const valid = rows.every(row => row.sections.every(s => s.length));
  const longestMin = valid ? Math.max(...rows.map(row => row.minLength)) : null;
  const longestMax = valid ? Math.max(...rows.map(row => row.maxLength)) : null;
  const requiredFrameHeight = Math.ceil(((previousLevel?.supportElevation ?? 0) + (previousLevel?.effectiveClear ?? 0) + 300) / FRAME_HEIGHT_STEP) * FRAME_HEIGHT_STEP;
  const rackHeight = config.frameHeight == null ? requiredFrameHeight : Math.max(requiredFrameHeight, Math.ceil(Number(config.frameHeight) / FRAME_HEIGHT_STEP) * FRAME_HEIGHT_STEP);
  const aisle = TRUCKS[truck].aisle;
  const layoutRows = [];
  const aisles = [];
  let cursor = 0;
  rows.forEach((row, index) => {
    aisles.push({ start: cursor, end: cursor + aisle, beforeRow: index });
    cursor += aisle;
    layoutRows.push({ ...row, start: cursor, end: cursor + row.depth });
    cursor += row.depth;
  });
  if (rows.at(-1)?.type === 'double') {
    aisles.push({ start: cursor, end: cursor + aisle, beforeRow: null });
    cursor += aisle;
  }
  const overallDepth = cursor;
  const warnings = [];
  if (!valid) warnings.push('Nie ma odpowiedniego trawersu dla co najmniej jednej sekcji. Zmniejsz szerokość palety albo liczbę palet w sekcji.');
  if (rows.some(row => row.sections.some(section => section.length > 2850))) warnings.push('Trawers powyżej 2850 mm może być nieoptymalny zależnie od masy ładunku. Zweryfikuj nośność z projektantem.');
  const expanded = levelsData.filter(level => level.effectiveClear > level.clearHeight).map(level => level.index);
  if (expanded.length) warnings.push(`Poziom ${expanded.join(', ')}: zadane światło jest za małe dla ładunku i 100 mm luzu lub nie mieści się w skoku 50 mm. Do obliczeń przyjęto większą wysokość.`);
  const supportRequired = frameDepth >= palletDepth;
  const unsupportedLevels = supportRequired ? levelsData.filter(level => level.decking === 'none').map(level => level.index) : [];
  if (unsupportedLevels.length) warnings.push(unsupportedLevels.length === levelsData.length
    ? `Głębokość ramy ${frameDepth} mm jest równa lub większa od głębokości ładunku ${palletDepth} mm. Wymagane jest wypełnienie poziomów, np. poprzeczki lub krata; obecnie wybrano brak wypełnienia.`
    : `Głębokość ramy ${frameDepth} mm jest równa lub większa od głębokości ładunku ${palletDepth} mm. Wypełnienie jest wymagane na poziomach: ${unsupportedLevels.join(', ')}.`);
  if (config.frameHeight != null && Number(config.frameHeight) < requiredFrameHeight) warnings.push(`Wysokość ramy została zwiększona do ${requiredFrameHeight} mm, aby pomieścić poziomy i ładunki.`);
  return { rows, layoutRows, aisles, levelsData, valid, longestMin, longestMax, frameDepth, frameGap: rows[0]?.frameGap ?? defaultFrameGap, loadGap: rows[0]?.loadGap ?? defaultLoadGap, supportRequired, requiredFrameHeight, rackHeight, aisle, overallDepth, spots: rows.reduce((sum, row) => sum + row.spots, 0), warnings };
}

root.RackformCalculator = { BEAMS, CLEARANCE, POST_OPTIONS, BEAM_HEIGHT, LEVEL_STEP, FRAME_HEIGHT_STEP, VERTICAL_CLEARANCE, TRUCKS, selectBeam, calculate };
})(globalThis);
