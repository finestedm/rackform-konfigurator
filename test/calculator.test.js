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
  assert.equal(result.rackHeight, 6000);
  assert.match(result.warnings.join(' '), /Poziom 2/);
});

test('jeden poziom oznacza składowanie na posadzce bez belki', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:1,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]}]});
  assert.equal(result.levelsData[0].isFloor, true);
  assert.equal(result.levelsData[0].beamElevation, null);
  assert.equal(result.levelsData[0].loadTop, 1400);
  assert.equal(result.rackHeight, 2000);
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
  assert.equal(result.rackHeight, 5250);
});

test('ręczna głębokość ramy zachowuje minimalne odstępy ładunków i ram', () => {
  const base = {palletWidth:800,palletDepth:1200,palletHeight:1400,levels:2,truck:'reach',decking:'none',racks:[{id:1,type:'double',sections:[2]}]};
  const standard = calculate({...base,standard:'standard'});
  assert.equal(standard.frameDepth, 1100);
  assert.equal(standard.rows[0].frameGap, 200);
  assert.equal(standard.rows[0].loadGap, 100);
  assert.equal(standard.rows[0].depth, 2500);
  assert.match(standard.warnings.join(' '), /Wymagane jest wypełnienie/);
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
  assert.equal(deep.supportRequired, false);
});

test('wysokość ramy dobierana jest co 250 mm i nie może być niższa od wymaganej', () => {
  const base = {palletWidth:800,palletDepth:1200,palletHeight:1400,levels:2,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]}]};
  const automatic = calculate(base);
  assert.equal(automatic.requiredFrameHeight % 250, 0);
  assert.equal(calculate({...base,frameHeight:automatic.requiredFrameHeight+260}).rackHeight, automatic.requiredFrameHeight+500);
  assert.equal(calculate({...base,frameHeight:250}).rackHeight, automatic.requiredFrameHeight);
});
