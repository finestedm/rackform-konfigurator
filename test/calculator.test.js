import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/calculator.js';
const { calculate, selectBeam } = globalThis.RackformCalculator;

test('dobiera wskazane długości dla palety 800 mm w obu trybach', () => {
  assert.deepEqual([1,2,3,4].map(n => selectBeam(800,n,'standard').length), [1000,1900,2700,3600]);
  assert.deepEqual([1,2,3,4].map(n => selectBeam(800,n,'nfpa').length), [1000,1900,2850,3800]);
});

test('liczy przedział długości, miejsca podwójne i ostrzeżenie dla długich trawersów', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:3,standard:'nfpa',truck:'reach',racks:[{id:1,type:'double',sections:[4,2]}]});
  assert.equal(result.rows[0].minLength, 3800+1900+3*85);
  assert.equal(result.rows[0].maxLength, 3800+1900+3*120);
  assert.equal(result.spots, 36);
  assert.equal(result.aisle, 2800);
  assert.equal(result.aisles.length, 2);
  assert.equal(result.overallDepth, 8150);
  assert.equal(result.frameDepth, 1100);
  assert.equal(result.rows[0].frameGap, 250);
  assert.equal(result.rows[0].loadGap, 150);
  assert.match(result.warnings.join(' '), /powyżej 2850 mm/);
});

test('plan pokazuje korytarz przed każdym rzędem i za ostatnim podwójnym', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:3,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]},{id:2,type:'double',sections:[2]}]});
  assert.equal(result.aisles.length, 3);
  assert.equal(result.overallDepth, 2800 + 1200 + 2800 + 2500 + 2800);
  assert.deepEqual(result.layoutRows.map(row => row.start), [2800, 6800]);
});

test('zgłasza brak trawersu gdy paleta nie mieści się w katalogu', () => {
  const result = calculate({palletWidth:1800,palletDepth:1200,palletHeight:1400,levels:2,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[4]}]});
  assert.equal(result.valid, false);
  assert.equal(result.rows[0].sections[0].length, null);
  assert.ok(result.rows[0].nominalLength >= result.rows[0].sections[0].needed);
});

test('paleta na posadzce, wysokości ładunków i światła wyznaczają kolejne belki', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:3,levelDetails:[
    {clearHeight:1600,loadHeight:1400},
    {clearHeight:1800,loadHeight:2300},
    {clearHeight:1200,loadHeight:900}
  ],standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]}]});
  assert.deepEqual(result.levelsData.map(level => level.beamElevation), [null,1600,4150]);
  assert.deepEqual(result.levelsData.map(level => level.supportElevation), [0,1750,4300]);
  assert.deepEqual(result.levelsData.map(level => level.effectiveClear), [1600,2400,1200]);
  assert.deepEqual(result.levelsData.map(level => level.loadTop), [1400,4050,5200]);
  assert.deepEqual(result.levelsData.map(level => level.index), [0,1,2]);
  assert.equal(result.rackHeight, 5800);
  assert.match(result.warnings.join(' '), /Poziom 1/);
});

test('jeden poziom oznacza składowanie na posadzce bez belki', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:1,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]}]});
  assert.equal(result.levelsData[0].isFloor, true);
  assert.equal(result.levelsData[0].beamElevation, null);
  assert.equal(result.levelsData[0].loadTop, 1400);
  assert.equal(result.rackHeight, 1800);
  assert.equal(result.spots, 2);
});

test('światło ma co najmniej 100 mm luzu, a położenia belek skok 50 mm', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:3,levelDetails:[
    {clearHeight:1490,loadHeight:1400},
    {clearHeight:1510,loadHeight:1420},
    {clearHeight:1500,loadHeight:1400}
  ],standard:'standard',truck:'reach',decking:'bars',racks:[{id:1,type:'single',sections:[2]}]});
  assert.deepEqual(result.levelsData.map(level => level.effectiveClear), [1500,1550,1500]);
  assert.deepEqual(result.levelsData.map(level => level.beamElevation), [null,1500,3200]);
  assert.equal(result.requiredFrameHeight, 5250);
  assert.equal(result.frameExtension, 300);
  assert.equal(result.rackHeight, 5150);
});

test('ręczna głębokość ramy zachowuje minimalne odstępy ładunków i ram', () => {
  const base = {palletWidth:800,palletDepth:1200,palletHeight:1400,levels:2,truck:'reach',decking:'none',racks:[{id:1,type:'double',sections:[2]}]};
  const standard = calculate({...base,standard:'standard'});
  assert.equal(standard.frameDepth, 1100);
  assert.equal(standard.rows[0].frameGap, 200);
  assert.equal(standard.rows[0].loadGap, 100);
  assert.equal(standard.rows[0].depth, 2500);
  assert.doesNotMatch(standard.warnings.join(' '), /Wymagane jest wypełnienie/);
  const shallow = calculate({...base,standard:'standard',frameDepth:1000});
  assert.equal(shallow.rows[0].frameGap, 300);
  assert.equal(shallow.rows[0].loadGap, 100);
  assert.equal(shallow.rows[0].depth, 2500);
  const withBoth = calculate({...base,standard:'nfpa',rearProtection:'backstops'});
  assert.equal(withBoth.rows[0].frameGap, 250);
  assert.equal(withBoth.rows[0].loadGap, 150);
  assert.equal(withBoth.rows[0].depth, 2550);
  const deep = calculate({...base,standard:'standard',frameDepth:1300,decking:'none'});
  assert.equal(deep.rows[0].frameGap, 200);
  assert.equal(deep.rows[0].loadGap, 300);
  assert.equal(deep.supportRequired, true);
  assert.match(deep.warnings.join(' '), /jest równa lub większa/);
});

test('przedłużenie ramy jest dobierane od 300 mm i zwiększane co 250 mm', () => {
  const base = {palletWidth:800,palletDepth:1200,palletHeight:1400,levels:2,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]}]};
  const automatic = calculate(base);
  assert.equal(automatic.frameExtension, 300);
  assert.equal(calculate({...base,frameExtension:automatic.frameExtension+260}).frameExtension, 800);
  assert.equal(calculate({...base,frameExtension:250}).frameExtension, 300);
});

test('ilość identycznych regałów rozwija się w planie bez powielania konfiguracji', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:2,standard:'standard',truck:'reach',racks:[{id:7,type:'single',quantity:3,sections:[2]}]});
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map(row => row.sourceId), [7, 7, 7]);
  assert.deepEqual(result.rows.map(row => row.id), [7, '7-2', '7-3']);
  assert.equal(result.spots, 12);
  assert.equal(result.layoutRows.length, 3);
});

test('grupowe długości trawersów zachowują liczbę sekcji', () => {
  const result = calculate({
    palletWidth: 800, palletDepth: 1200, palletHeight: 1400, levels: 2,
    standard: 'standard', truck: 'reach',
    racks: [{ id: 8, type: 'single', sections: [2, 2, 2, 2, 2, 3, 3, 3], sectionLengths: [1900, 1900, 1900, 1900, 1900, 2700, 2700, 2700] }]
  });
  assert.deepEqual(result.rows[0].sections.map(section => section.length), [1900, 1900, 1900, 1900, 1900, 2700, 2700, 2700]);
  assert.equal(result.rows[0].sections.length, 8);
});

test('wypełnienie poziomów i zabezpieczenie tyłu są niezależne dla konfiguracji regałów', () => {
  const result = calculate({
    palletWidth: 800,
    palletDepth: 1200,
    palletHeight: 1400,
    levels: 2,
    standard: 'standard',
    truck: 'reach',
    frameDepth: 1300,
    decking: 'none',
    rearProtection: 'none',
    levelDetails: [
      { clearHeight: 1500, loadHeight: 1400, decking: 'bars' },
      { clearHeight: 1500, loadHeight: 1400, decking: 'none' }
    ],
    racks: [
      { id: 1, type: 'single', sections: [2], rearProtection: 'mesh' },
      { id: 2, type: 'double', sections: [2], rearProtection: 'backstops' }
    ]
  });
  assert.deepEqual(result.levelsData.map(level => level.decking), ['none', 'none']);
  assert.deepEqual(result.rows.map(row => row.rearProtection), ['mesh', 'backstops']);
  assert.equal(result.rows[0].rearProjection, 0);
  assert.equal(result.rows[1].rearProjection, 0);
  assert.equal(result.rows[1].frameGap, 250);
  assert.match(result.warnings.join(' '), /poziomach: 1/);
  const projected = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:1,standard:'standard',truck:'reach',frameDepth:1100,racks:[{id:3,type:'single',sections:[2],rearProtection:'mesh'}]});
  assert.equal(projected.rows[0].rearProjection, 50);
  const projectedBackstop = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:1,standard:'standard',truck:'reach',frameDepth:1100,racks:[{id:4,type:'single',sections:[2],rearProtection:'backstops'}]});
  assert.equal(projectedBackstop.rows[0].rearProjection, 50);
});
