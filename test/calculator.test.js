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
  assert.equal(result.overallDepth, 8200);
  assert.match(result.warnings.join(' '), /powyżej 2850 mm/);
});

test('plan pokazuje korytarz przed każdym rzędem i za ostatnim podwójnym', () => {
  const result = calculate({palletWidth:800,palletDepth:1200,palletHeight:1400,levels:3,standard:'standard',truck:'reach',racks:[{id:1,type:'single',sections:[2]},{id:2,type:'double',sections:[2]}]});
  assert.equal(result.aisles.length, 3);
  assert.equal(result.overallDepth, 2800 + 1200 + 2800 + 2600 + 2800);
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
  assert.deepEqual(result.levelsData.map(level => level.beamElevation), [null,1600,4250]);
  assert.deepEqual(result.levelsData.map(level => level.supportElevation), [0,1750,4400]);
  assert.deepEqual(result.levelsData.map(level => level.effectiveClear), [1600,2500,1200]);
  assert.deepEqual(result.levelsData.map(level => level.loadTop), [1400,4050,5300]);
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
