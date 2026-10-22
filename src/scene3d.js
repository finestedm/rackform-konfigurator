import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const M = value => value / 1000;
const color = value => new THREE.Color(value);

function create(container, onAddSection) {
  const scene = new THREE.Scene();
  scene.background = color('#e9f0ed');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    container.textContent = 'Ta przeglądarka nie udostępnia WebGL potrzebnego do widoku 3D.';
    return { update() {}, rotateBy() {}, reset() {}, resize() {}, destroy() { container.replaceChildren(); } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Model 3D regałów. Przeciągnij, aby obrócić. Kółkiem przybliż.');
  container.replaceChildren(renderer.domElement);

  const overlay = document.createElement('div');
  overlay.className = 'scene3d-overlay';
  container.append(overlay);
  const floorLabel = document.createElement('div');
  floorLabel.className = 'scene3d-floor-label';
  floorLabel.textContent = 'PALETA 01 NA POSADZCE · KOLEJNE NA BELKACH';
  container.append(floorLabel);

  scene.add(new THREE.HemisphereLight('#ffffff', '#9baaa4', 1.8));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.position.set(-9, 22, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 100;
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = 0.14;
  controls.enablePan = true;
  controls.screenSpacePanning = true;

  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: '#d9e1dd', roughness: 0.98 }),
    aisle: new THREE.MeshStandardMaterial({ color: '#b9ded2', roughness: 1 }),
    aisleEdge: new THREE.MeshStandardMaterial({ color: '#75aa98', roughness: 1 }),
    post: new THREE.MeshStandardMaterial({ color: '#00558b', metalness: 0.34, roughness: 0.42 }),
    postTop: new THREE.MeshStandardMaterial({ color: '#003d69', metalness: 0.28, roughness: 0.48 }),
    beam: new THREE.MeshStandardMaterial({ color: '#e8a900', metalness: 0.26, roughness: 0.42 }),
    invalidBeam: new THREE.MeshStandardMaterial({ color: '#bd624c', metalness: 0.1, roughness: 0.65 }),
    galva: new THREE.MeshStandardMaterial({ color: '#abb9ba', metalness: 0.72, roughness: 0.34 }),
    wood: new THREE.MeshStandardMaterial({ color: '#a77a4f', roughness: 0.87 }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#c09564', roughness: 0.84 }),
    load: new THREE.MeshStandardMaterial({ color: '#a4bfa9', roughness: 0.84 }),
    loadAlt: new THREE.MeshStandardMaterial({ color: '#b7c8ac', roughness: 0.84 }),
    loadEdge: new THREE.MeshStandardMaterial({ color: '#7c9f88', roughness: 0.9 }),
    guard: new THREE.MeshStandardMaterial({ color: '#e6b900', metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide }),
    guardRim: new THREE.MeshStandardMaterial({ color: '#a67e00', roughness: 0.62 }),
    mesh: new THREE.MeshStandardMaterial({ color: '#6dada8', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    meshFrame: new THREE.MeshStandardMaterial({ color: '#368a87', metalness: 0.35, roughness: 0.55 }),
    rearMesh: new THREE.MeshStandardMaterial({ color: '#8b9598', transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
    rearMeshFrame: new THREE.MeshStandardMaterial({ color: '#687477', metalness: 0.35, roughness: 0.62 }),
    grate: new THREE.MeshStandardMaterial({ color: '#82999b', metalness: 0.65, roughness: 0.4 }),
    board: new THREE.MeshStandardMaterial({ color: '#c2aa85', roughness: 0.88 })
  };
  const model = new THREE.Group();
  scene.add(model);
  const markers = [];
  let frame = 0;
  let isDestroyed = false;
  let hasModel = false;
  let initialCamera = new THREE.Vector3();
  let initialTarget = new THREE.Vector3();

  function box(x, y, z, width, height, depth, material, castShadow = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(width, 0.005), Math.max(height, 0.005), Math.max(depth, 0.005)), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    model.add(mesh);
    return mesh;
  }
  function rod(a, b, radius, material) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = false;
    model.add(mesh);
  }
  function pallet(x, z, supportY, level, width, depth, alternate) {
    const palletHeight = 0.115;
    box(x, supportY + 0.04, z, width * 0.94, 0.08, depth * 0.98, materials.wood, true);
    for (const offset of [-0.28, 0, 0.28]) box(x, supportY + 0.09, z + depth * offset, width * 0.94, 0.03, depth * 0.18, materials.woodLight);
    const cargoHeight = Math.max(0.1, M(level.loadHeight) - palletHeight);
    box(x, supportY + palletHeight + cargoHeight / 2, z, width * 0.88, cargoHeight, depth * 0.96, alternate ? materials.loadAlt : materials.load, true);
    box(x, supportY + palletHeight + cargoHeight / 2, z + depth * 0.482, width * 0.88, cargoHeight, 0.014, materials.loadEdge);
  }
  function decking(type, x1, x2, z1, z2, y) {
    if (type === 'none') return;
    const width = x2 - x1;
    const depth = z2 - z1;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    if (type === 'board') {
      box(cx, y + 0.02, cz, width, 0.04, depth, materials.board);
      return;
    }
    const railMaterial = type === 'mesh' ? materials.meshFrame : materials.grate;
    if (type === 'mesh') box(cx, y + 0.018, cz, width, 0.015, depth, materials.mesh);
    box(cx, y + 0.028, z1 + 0.025, width, 0.035, 0.035, railMaterial);
    box(cx, y + 0.028, z2 - 0.025, width, 0.035, 0.035, railMaterial);
    const bars = type === 'bars' ? 3 : Math.min(9, Math.max(4, Math.round(width / (type === 'mesh' ? 0.5 : 0.36))));
    for (let i = 1; i <= bars; i++) {
      const x = x1 + width * i / (bars + 1);
      box(x, y + 0.035, cz, type === 'mesh' ? 0.02 : 0.04, 0.04, depth, railMaterial);
    }
  }
  function plasticTube(x, z) {
    const height = 0.72;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, height, 16, 1, true), materials.guard);
    shell.position.set(x, height / 2 + 0.02, z);
    shell.castShadow = true;
    model.add(shell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 16), materials.guardRim);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, height + 0.02, z);
    model.add(rim);
  }
  function addMarker(position, className, text, title, onClick) {
    const element = document.createElement(onClick ? 'button' : 'span');
    element.className = className;
    element.textContent = text;
    if (title) element.setAttribute('aria-label', title);
    if (onClick) { element.type = 'button'; element.addEventListener('click', onClick); }
    overlay.append(element);
    markers.push({ element, position: new THREE.Vector3(...position) });
  }
  function clearModel() {
    model.traverse(object => { if (object.geometry) object.geometry.dispose(); });
    model.clear();
    overlay.replaceChildren();
    markers.length = 0;
  }
  function fitCamera(maxLength, totalDepth, rackHeight) {
    const center = new THREE.Vector3(maxLength / 2, rackHeight * 0.42, totalDepth / 2);
    const radius = Math.sqrt(maxLength ** 2 + totalDepth ** 2 + rackHeight ** 2) / 2;
    const aspect = Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
    const distance = Math.max(5, radius / (Math.sin(THREE.MathUtils.degToRad(21)) * Math.min(1, aspect)) * 0.72);
    const direction = hasModel ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(-0.82, 0.68, 1.1).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.minDistance = Math.max(1, radius * 0.4);
    controls.maxDistance = Math.max(30, distance * 2.5);
    camera.far = Math.max(100, distance * 6);
    camera.updateProjectionMatrix();
    controls.update();
    initialCamera.copy(camera.position);
    initialTarget.copy(center);
    sun.position.copy(center).add(new THREE.Vector3(-maxLength * 0.5, rackHeight * 2.5, totalDepth * 0.5));
    sun.target.position.copy(center);
    scene.add(sun.target);
    const shadowSpan = Math.max(maxLength, totalDepth, rackHeight) * 1.5;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.updateProjectionMatrix();
  }
  function update(config, result) {
    clearModel();
    const maxLength = M(Math.max(1, ...result.rows.map(row => row.nominalLength)));
    const totalDepth = M(Math.max(1, result.overallDepth));
    const height = M(result.rackHeight);
    box(maxLength / 2, -0.035, totalDepth / 2, maxLength + 1.4, 0.07, totalDepth + 1.4, materials.floor);
    result.aisles.forEach((aisle, index) => {
      const start = M(aisle.start), end = M(aisle.end);
      box(maxLength / 2, 0.006, (start + end) / 2, maxLength, 0.012, end - start, materials.aisle);
      box(maxLength / 2, 0.014, start, maxLength, 0.018, 0.022, materials.aisleEdge);
      box(maxLength / 2, 0.014, end, maxLength, 0.018, 0.022, materials.aisleEdge);
      addMarker([maxLength * 0.48, 0.04, (start + end) / 2], 'scene3d-aisle', `K${index + 1} · ${Math.round(result.aisle)} mm`);
    });

    result.layoutRows.forEach((row, rowIndex) => {
      const length = M(row.nominalLength);
      const start = M(row.start), end = M(row.end);
      const laneDepth = M(result.frameDepth);
      const loadDepth = M(config.palletDepth);
      const outerOverhang = Math.max(0, (loadDepth - laneDepth) / 2);
      const firstFront = start + outerOverhang;
      const firstBack = firstFront + laneDepth;
      const secondFront = firstBack + M(row.frameGap || 0);
      const lanes = row.type === 'double' ? [[firstFront, firstBack], [secondFront, secondFront + laneDepth]] : [[firstFront, firstBack]];
      const xPosts = [0.05];
      const sections = [];
      let x = 0.1;
      row.sections.forEach(section => {
        const width = M(section.length ?? section.needed);
        sections.push({ section, x1: x, x2: x + width });
        x += width + 0.1;
        xPosts.push(x - 0.05);
      });
      lanes.forEach(([front, back], laneIndex) => {
        xPosts.forEach(postX => {
          [front, back].forEach(z => {
            box(postX, height / 2, z, 0.1, height, 0.1, materials.post, true);
            box(postX, height - 0.018, z, 0.105, 0.035, 0.105, materials.postTop);
          });
          for (let y = 0.42, segment = 0; y < height - 0.4; y += 1.1, segment++) {
            const top = Math.min(y + 1.1, height - 0.35);
            rod([postX, y, segment % 2 ? back : front], [postX, top, segment % 2 ? front : back], 0.018, materials.galva);
            rod([postX, top, front], [postX, top, back], 0.013, materials.galva);
          }
        });
        sections.forEach(({ section, x1, x2 }, sectionIndex) => {
          result.levelsData.forEach((level, levelIndex) => {
            if (!level.isFloor) {
              const beamY = M(level.beamElevation) + 0.075;
              const beamMaterial = section.length ? materials.beam : materials.invalidBeam;
              box((x1 + x2) / 2, beamY, front, x2 - x1, 0.15, 0.085, beamMaterial, true);
              box((x1 + x2) / 2, beamY, back, x2 - x1, 0.15, 0.085, beamMaterial, true);
              decking(level.decking ?? config.decking, x1, x2, front, back, M(level.supportElevation));
            }
            if (!section.length) return;
            const palletWidth = M(config.palletWidth);
            const clearance = M(section.clearance);
            const z = (front + back) / 2;
            const supportY = M(level.supportElevation);
            for (let position = 0; position < section.positions; position++) {
              const centerX = x1 + clearance + palletWidth * 0.5 + position * (palletWidth + clearance);
              if (centerX + palletWidth / 2 > x2 + 0.002) continue;
              pallet(centerX, z, supportY, level, palletWidth, loadDepth, (position + levelIndex + sectionIndex) % 2);
            }
          });
        });
        const rear = row.type === 'single' ? back : laneIndex === 0 ? back : front;
        const rearProtection = row.rearProtection ?? config.rearProtection ?? 'none';
        if (rearProtection === 'mesh') {
          box(length / 2, height / 2, rear, length, height, 0.016, materials.rearMesh);
          for (const postX of xPosts) box(postX, height / 2, rear, 0.025, height, 0.025, materials.rearMeshFrame);
          for (let y = 0.5; y < height; y += 1.3) box(length / 2, y, rear, length, 0.025, 0.025, materials.rearMeshFrame);
          for (let meshX = 0.35; meshX < length; meshX += 0.55) box(meshX, height / 2, rear, 0.018, height, 0.018, materials.rearMeshFrame);
        } else if (rearProtection === 'backstops') {
          result.levelsData.forEach(level => box(length / 2, M(level.supportElevation) + 0.35, rear, length, 0.07, 0.08, materials.galva));
        }
        const aisleSide = laneIndex === 0 ? front : back;
        if (config.protection === 'polymer') xPosts.forEach(postX => plasticTube(postX, aisleSide));
        if (config.protection === 'barrier') box(length / 2, 0.28, aisleSide + (laneIndex === 0 ? -0.16 : 0.16), length, 0.15, 0.1, materials.guard, true);
      });
      addMarker([length + 0.15, height * 0.55, (start + end) / 2], 'scene3d-add', '+', `Dodaj sekcję do regału ${rowIndex + 1}`, () => onAddSection(row.sourceId ?? row.id));
    });
    fitCamera(maxLength, totalDepth, height);
    hasModel = true;
    resize();
  }
  function positionMarkers() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    for (const marker of markers) {
      const p = marker.position.clone().project(camera);
      const visible = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15;
      marker.element.hidden = !visible;
      if (visible) {
        marker.element.style.left = `${(p.x * 0.5 + 0.5) * width}px`;
        marker.element.style.top = `${(-p.y * 0.5 + 0.5) * height}px`;
      }
    }
  }
  function resize() {
    if (isDestroyed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    positionMarkers();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  function animate() {
    if (isDestroyed) return;
    frame = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    positionMarkers();
  }
  animate();
  return {
    update,
    resize,
    rotateBy(angle) {
      camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target);
      controls.update();
    },
    reset() {
      camera.position.copy(initialCamera);
      controls.target.copy(initialTarget);
      controls.update();
    },
    destroy() {
      isDestroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      clearModel();
      Object.values(materials).forEach(material => material.dispose());
      renderer.dispose();
      container.replaceChildren();
    }
  };
}

globalThis.RackformThreeD = { create };
