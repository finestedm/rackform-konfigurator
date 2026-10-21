(function (root) {
'use strict';

const BEAMS = {
  standard: [1000, 1900, 2700, 3600],
  nfpa: [1000, 1900, 2850, 3800]
};

const CLEARANCE = { standard: 75, nfpa: 100 };
const POST_OPTIONS = [85, 100, 120];
const BEAM_HEIGHT = 150;
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

function calculate(config) {
  const { palletWidth, palletDepth, palletHeight, levels, standard, truck, racks } = config;
  let supportElevation = 0;
  let previousLevel = null;
  const levelsData = Array.from({ length: levels }, (_, index) => {
    const detail = config.levelDetails?.[index] ?? {};
    const loadHeight = Math.max(300, Number(detail.loadHeight) || palletHeight);
    const clearHeight = Math.max(300, Number(detail.clearHeight) || palletHeight + 200);
    const effectiveClear = Math.max(clearHeight, loadHeight + 200);
    const beamElevation = previousLevel ? previousLevel.supportElevation + previousLevel.effectiveClear : null;
    if (beamElevation !== null) supportElevation = beamElevation + BEAM_HEIGHT;
    const level = { index: index + 1, isFloor: index === 0, beamElevation, supportElevation, loadHeight, clearHeight, effectiveClear, loadTop: supportElevation + loadHeight };
    previousLevel = level;
    return level;
  });
  const rows = racks.map(rack => {
    const sections = rack.sections.map(positions => ({ positions, ...selectBeam(palletWidth, positions, standard) }));
    const beamSum = sections.reduce((sum, s) => sum + (s.length ?? s.needed), 0);
    const minLength = beamSum + (sections.length + 1) * POST_OPTIONS[0];
    const nominalLength = beamSum + (sections.length + 1) * POST_OPTIONS[1];
    const maxLength = beamSum + (sections.length + 1) * POST_OPTIONS[2];
    const depth = rack.type === 'double' ? palletDepth * 2 + 200 : palletDepth;
    return { ...rack, sections, beamSum, minLength, nominalLength, maxLength, depth, spots: sections.reduce((sum, s) => sum + s.positions, 0) * levels * (rack.type === 'double' ? 2 : 1) };
  });
  const valid = rows.every(row => row.sections.every(s => s.length));
  const longestMin = valid ? Math.max(...rows.map(row => row.minLength)) : null;
  const longestMax = valid ? Math.max(...rows.map(row => row.maxLength)) : null;
  const rackHeight = Math.ceil(((previousLevel?.supportElevation ?? 0) + (previousLevel?.effectiveClear ?? 0) + 300) / 500) * 500;
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
  if (expanded.length) warnings.push(`Poziom ${expanded.join(', ')}: zadana wysokość poziomu jest za mała dla ładunku i 200 mm luzu. Do obliczeń przyjęto większą wysokość.`);
  return { rows, layoutRows, aisles, levelsData, valid, longestMin, longestMax, rackHeight, aisle, overallDepth, spots: rows.reduce((sum, row) => sum + row.spots, 0), warnings };
}

root.RackformCalculator = { BEAMS, CLEARANCE, POST_OPTIONS, BEAM_HEIGHT, TRUCKS, selectBeam, calculate };
})(globalThis);
