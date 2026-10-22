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
function deckingForLevel(config, rack, index) {
  if (index === 0) return 'none';
  const value = rack.levelDetails?.[index]?.decking ?? config.levelDetails?.[index]?.decking;
  return DECKING.has(value) ? value : (DECKING.has(config.decking) ? config.decking : 'none');
}
function rearProtectionForRack(config, rack) {
  return REAR_PROTECTION.has(rack.rearProtection)
    ? rack.rearProtection
    : (REAR_PROTECTION.has(config.rearProtection) ? config.rearProtection : 'none');
}

function levelsForRack(config, rack) {
  const levelCount = Math.max(1, Math.min(8, Math.round(Number(rack.levels ?? config.levels) || 1)));
  const details = rack.levelDetails ?? config.levelDetails ?? [];
  let previousLevel = null;
  return Array.from({ length: levelCount }, (_, index) => {
    const detail = details[index] ?? {};
    const loadHeight = Math.max(300, Number(detail.loadHeight) || config.palletHeight);
    const clearHeight = Math.max(300, Number(detail.clearHeight) || config.palletHeight + VERTICAL_CLEARANCE);
    const effectiveClear = Math.ceil(Math.max(clearHeight, loadHeight + VERTICAL_CLEARANCE) / LEVEL_STEP) * LEVEL_STEP;
    const beamElevation = previousLevel ? previousLevel.supportElevation + previousLevel.effectiveClear : null;
    const supportElevation = beamElevation === null ? 0 : beamElevation + BEAM_HEIGHT;
    const level = { index, isFloor: index === 0, beamElevation, supportElevation, loadHeight, clearHeight, effectiveClear, loadTop: supportElevation + loadHeight, decking: deckingForLevel(config, rack, index) };
    previousLevel = level;
    return level;
  });
}

function calculate(config) {
  const { palletWidth, palletDepth, palletHeight, levels, standard, truck, racks } = config;
  const frameDepth = config.frameDepth == null ? Math.max(100, palletDepth - 100) : Math.max(100, Number(config.frameDepth) || 100);
  const requiredFrameExtension = 300;
  const legacyExtension = config.frameHeight == null ? null : Number(config.frameHeight);
  const requestedExtension = config.frameExtension == null ? legacyExtension : Number(config.frameExtension);
  const extensionInput = Number.isFinite(requestedExtension) ? requestedExtension : requiredFrameExtension;
  const frameExtension = Math.max(requiredFrameExtension, requiredFrameExtension + Math.ceil(Math.max(0, extensionInput - requiredFrameExtension) / FRAME_HEIGHT_STEP) * FRAME_HEIGHT_STEP);
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
  // Loads are centered in the frame. When a load is deeper than the frame,
  // the rear protection must move by half of that difference to clear its edge.
  const rearProjection = Math.max(0, (palletDepth - frameDepth) / 2);
  const rows = rackCopies.map(rack => {
    const levelsData = levelsForRack(config, rack);
    const lastLevel = levelsData.at(-1);
    const lastLevelTop = (lastLevel?.supportElevation ?? 0) + (lastLevel?.effectiveClear ?? 0);
    const rackHeight = lastLevelTop + frameExtension;
    const rearProtection = rearProtectionForRack(config, rack);
    const extraGap = standard === 'nfpa' || rearProtection === 'backstops' ? 50 : 0;
    const minimumFrameGap = 200 + extraGap;
    const minimumLoadGap = 100 + extraGap;
    const frameGap = Math.max(minimumFrameGap, minimumLoadGap + palletDepth - frameDepth);
    const loadGap = frameGap + frameDepth - palletDepth;
    const sections = rack.sections.map((positions, sectionIndex) => {
      const automatic = selectBeam(palletWidth, positions, standard);
      const requestedLength = Number(rack.sectionLengths?.[sectionIndex]);
      const length = Number.isFinite(requestedLength) && requestedLength >= automatic.needed ? requestedLength : automatic.length;
      const clearance = length ? (length - positions * palletWidth) / (positions + 1) : automatic.clearance;
      return { positions, ...automatic, length, clearance, requestedLength: Number.isFinite(requestedLength) ? requestedLength : null };
    });
    const beamSum = sections.reduce((sum, s) => sum + (s.length ?? s.needed), 0);
    const minLength = beamSum + (sections.length + 1) * POST_OPTIONS[0];
    const nominalLength = beamSum + (sections.length + 1) * POST_OPTIONS[1];
    const maxLength = beamSum + (sections.length + 1) * POST_OPTIONS[2];
    const depth = rack.type === 'double' ? frameDepth * 2 + frameGap + Math.max(0, palletDepth - frameDepth) : Math.max(frameDepth, palletDepth);
    return { ...rack, rearProtection, decking: levelsData.map(level => level.decking), levelsData, lastLevelTop, rackHeight, requiredFrameHeight: Math.ceil((lastLevelTop + requiredFrameExtension) / FRAME_HEIGHT_STEP) * FRAME_HEIGHT_STEP, rearProjection, sections, beamSum, minLength, nominalLength, maxLength, depth, frameGap: rack.type === 'double' ? frameGap : null, loadGap: rack.type === 'double' ? loadGap : null, spots: sections.reduce((sum, s) => sum + s.positions, 0) * levelsData.length * (rack.type === 'double' ? 2 : 1) };
  });
  const valid = rows.every(row => row.sections.every(s => s.length));
  const longestMin = valid ? Math.max(...rows.map(row => row.minLength)) : null;
  const longestMax = valid ? Math.max(...rows.map(row => row.maxLength)) : null;
  const lastLevelTop = Math.max(0, ...rows.map(row => row.lastLevelTop));
  const rackHeight = Math.max(frameExtension, ...rows.map(row => row.rackHeight));
  const requiredFrameHeight = Math.max(requiredFrameExtension, ...rows.map(row => row.requiredFrameHeight));
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
  const expanded = rows.flatMap((row, rowIndex) => row.levelsData.filter(level => level.effectiveClear > level.clearHeight).map(level => `Regał ${rowIndex + 1}, Poziom ${level.index}`));
  if (expanded.length) warnings.push(`${expanded.join('; ')}: zadane światło jest za małe dla ładunku i 100 mm luzu lub nie mieści się w skoku 50 mm. Do obliczeń przyjęto większą wysokość.`);
  const supportRequired = frameDepth >= palletDepth;
  const unsupportedLevels = supportRequired ? rows.flatMap((row, rowIndex) => row.levelsData.filter(level => !level.isFloor && level.decking === 'none').map(level => `regał ${rowIndex + 1}, poziom ${level.index}`)) : [];
  const beamLevelCount = rows.reduce((sum, row) => sum + row.levelsData.filter(level => !level.isFloor).length, 0);
  if (unsupportedLevels.length) warnings.push(unsupportedLevels.length === beamLevelCount
    ? `Głębokość ramy ${frameDepth} mm jest równa lub większa od głębokości ładunku ${palletDepth} mm. Wymagane jest wypełnienie poziomów, np. poprzeczki lub krata; obecnie wybrano brak wypełnienia.`
    : `Głębokość ramy ${frameDepth} mm jest równa lub większa od głębokości ładunku ${palletDepth} mm. Wypełnienie jest wymagane na poziomach: ${unsupportedLevels.join(', ')}.`);
  if (config.frameExtension != null && Number(config.frameExtension) < requiredFrameExtension) warnings.push(`Przedłużenie ramy zwiększono do ${requiredFrameExtension} mm, aby zachować zapas nad ostatnim poziomem.`);
  return { rows, layoutRows, aisles, levelsData: rows[0]?.levelsData ?? levelsForRack(config, {levels, levelDetails:config.levelDetails}), valid, longestMin, longestMax, frameDepth, frameGap: rows[0]?.frameGap ?? defaultFrameGap, loadGap: rows[0]?.loadGap ?? defaultLoadGap, supportRequired, lastLevelTop, requiredFrameExtension, requiredFrameHeight, frameExtension, rackHeight, aisle, overallDepth, spots: rows.reduce((sum, row) => sum + row.spots, 0), warnings };
}

root.RackformCalculator = { BEAMS, CLEARANCE, POST_OPTIONS, BEAM_HEIGHT, LEVEL_STEP, FRAME_HEIGHT_STEP, VERTICAL_CLEARANCE, TRUCKS, selectBeam, calculate };
})(globalThis);
