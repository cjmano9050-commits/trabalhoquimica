import * as THREE from 'https://esm.sh/three@0.177.0';
import { GLTFLoader } from 'https://esm.sh/three@0.177.0/examples/jsm/loaders/GLTFLoader.js';
import './styles.css';

const canvas = document.querySelector('#car3d');
const stage = document.querySelector('#carStage');
const shadow = document.querySelector('#shadow');
const site = document.querySelector('#site');
const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24,1,.01,100);

const hemi = new THREE.HemisphereLight(0xf5f7f8, 0x161a1d, 1.15); scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(4,5,5); scene.add(key);
const fill = new THREE.DirectionalLight(0xa9bfd0, .55); fill.position.set(-5,2,4); scene.add(fill);
const rim = new THREE.DirectionalLight(0xe33b32, .75); rim.position.set(-4,2,-6); scene.add(rim);
const top = new THREE.DirectionalLight(0xffffff, 1.0); top.position.set(0,7,-2); scene.add(top);

let model = null;
let carPivot = null;
let baseScale = 1;
let currentProgress = 0;
let targetProgress = 0;
let activeSection = 0;
let lastScrollY = 0;
let navAnimating = false;
let navRaf = 0;
let motionFromProgress = 0;
let motionToProgress = 0;
const TIMINGS = [1700, 1500, 1550, 1650];
const CAR_FRAME_SCALE = 0.88;

// Deliberately different hero poses. They are the visual rhythm of the future scroll timeline.
const poses = [
  {x: 0.45, y:-0.42, z:0.00, rx:0.00, ry:0.38, rz:0.00, s:1.00, camX:1.15, camY:.72, camZ:10.35, lookX:.15, lookY:-.05, opacity:1},
  {x:-0.55, y:-0.48, z:0.05, rx:0.00, ry:-0.18, rz:0.00, s:.93, camX:-.85, camY:.68, camZ:10.10, lookX:-.05, lookY:-.06, opacity:.96},
  {x:0.72, y:-0.36, z:0.12, rx:0.02, ry:0.92, rz:-0.015, s:.86, camX:1.35, camY:.95, camZ:10.45, lookX:.15, lookY:.02, opacity:.92},
  {x:-0.62, y:-0.38, z:0.05, rx:-0.015, ry:1.48, rz:0.00, s:.82, camX:-1.2, camY:.82, camZ:10.75, lookX:-.08, lookY:-.02, opacity:.9},
  {x:0.05, y:-0.46, z:0.00, rx:0.00, ry:2.15, rz:0.00, s:.9, camX:.25, camY:.7, camZ:10.25, lookX:.0, lookY:-.04, opacity:1}
];

const ease = t => 1 - Math.pow(1 - Math.max(0,Math.min(1,t)), 4);
const lerp = (a,b,t) => a + (b-a)*t;
const smooth = t => t*t*(3-2*t);

const loader = new GLTFLoader();
loader.load('/car.glb', gltf => {
  model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x,size.y,size.z);
  baseScale = (5.95 / longest) * CAR_FRAME_SCALE;

  // Real anchor: the GLB is centered once inside a dedicated pivot.
  // All scene motion/rotation is applied to the pivot, so the car never
  // walks sideways when its heading changes.
  carPivot = new THREE.Group();
  carPivot.position.set(0, -.46, 0);
  model.scale.setScalar(baseScale);
  // Apply the centering offset in scaled local units so the pivot remains
  // at the car's true center during every rotation.
  model.position.copy(center).multiplyScalar(-baseScale);
  carPivot.add(model);
  scene.add(carPivot);

  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      if (!m) return;
      m.roughness = Math.max(m.roughness ?? .55, .58);
      m.metalness = Math.min((m.metalness ?? .55) + .02, .88);
      m.envMapIntensity = .42;
    });
  });
  resize();
  applyCarPose(0, true);
}, undefined, e => console.error('car.glb',e));

function resize(){
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width,r.height,false);
  camera.aspect = r.width/r.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function applyCarPose(progress, immediate=false){
  if (!model) return;
  const p = Math.max(0,Math.min(1,progress));
  const raw = p * (poses.length-1);
  const i = Math.min(poses.length-2,Math.floor(raw));
  const local = poses.length === 1 ? 0 : smooth(raw-i);
  const a = poses[i];
  const b = poses[Math.min(i+1,poses.length-1)];
  const t = immediate ? 0 : ease(local);

  if(!carPivot) return;
  const poseX = lerp(a.x,b.x,t);
  const poseY = lerp(a.y,b.y,t);
  const poseZ = lerp(a.z,b.z,t);
  carPivot.position.x = poseX;
  carPivot.position.y = -.46 + poseY;
  carPivot.position.z = poseZ;
  carPivot.rotation.x = lerp(a.rx,b.rx,t);
  carPivot.rotation.y = lerp(a.ry,b.ry,t);
  carPivot.rotation.z = lerp(a.rz,b.rz,t);
  carPivot.scale.setScalar(lerp(a.s,b.s,t));

  camera.position.x = lerp(a.camX,b.camX,t);
  camera.position.y = lerp(a.camY,b.camY,t);
  camera.position.z = lerp(a.camZ,b.camZ,t);
  camera.lookAt(lerp(a.lookX,b.lookX,t),lerp(a.lookY,b.lookY,t),0);

  // No extra camera sway: rotation stays visually anchored to the pivot.

  const sectionFade = p < .04 ? p/.04 : p > .96 ? (1-p)/.04 : 1;
  const desiredOpacity = lerp(a.opacity,b.opacity,t) * (.78 + sectionFade*.22);
  model.traverse(o => { if(o.isMesh && o.material){ const mats=Array.isArray(o.material)?o.material:[o.material]; mats.forEach(m=>{m.transparent=true;m.opacity=desiredOpacity;}); }});

  shadow.style.opacity = String(.25 + desiredOpacity*.42);
  const followX = lerp(a.x,b.x,t);
  const followPct = followX * 7;
  shadow.style.transform = `translate(calc(-50% + ${followPct}%), 0) scale(${lerp(1.02,.82,p)})`;
  const bandX = followX * 5;
  const bandY = lerp(a.y,b.y,t) * 2;
  document.querySelector('.light-band')?.style.setProperty('transform', `translate(${bandX}%, ${bandY}%) rotate(-4deg)`);
  site.style.setProperty('--car-progress', p.toFixed(4));
}

function scrollProgress(){
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  return Math.max(0,Math.min(1,scrollY/max));
}

function sceneProgress(){
  const sections = [...document.querySelectorAll('main section')];
  if(!sections.length) return {index:0, progress:0};
  let best=0, bestD=Infinity;
  sections.forEach((s,i)=>{
    const d=Math.abs(s.getBoundingClientRect().top);
    if(d<bestD){bestD=d;best=i;}
  });
  const raw = scrollProgress() * (sections.length-1);
  const index = Math.max(0,Math.min(sections.length-1,Math.floor(raw)));
  return {index, progress:raw, nearest:best};
}

function updateMotionNav(index, progress){
  const nav=document.querySelector('#motionNav');
  if(!nav) return;
  const count=document.querySelectorAll('main section').length;
  nav.querySelectorAll('.motion-dot').forEach((d,i)=>d.classList.toggle('active',i===index));
  const label=nav.querySelector('.motion-scene');
  if(label) label.textContent=`SCENE / ${String(index+1).padStart(2,'0')}`;
  const fill=nav.querySelector('.motion-fill');
  if(fill) fill.style.width=`${Math.max(0,Math.min(100,progress/(count-1)*100))}%`;
  nav.querySelector('[data-motion="prev"]').disabled=index<=0;
  nav.querySelector('[data-motion="next"]').disabled=index>=count-1;
}

function getSceneCount(){
  return document.querySelectorAll('main section').length;
}

function getCurrentScene(){
  const count=getSceneCount();
  if(!count) return 0;
  const raw=scrollProgress()*(count-1);
  const nearest=Math.round(raw);
  return Math.max(0,Math.min(count-1,nearest));
}

function setSceneVisualState(index){
  const sections=[...document.querySelectorAll('main section')];
  sections.forEach((s,i)=>{
    const active=i===index;
    s.classList.toggle('scene-active',active);
    if(active) s.classList.add('seen');
  });
  site.dataset.scene=String(index+1).padStart(2,'0');
}

function animateToSection(target){
  const sections=[...document.querySelectorAll('main section')];
  if(!sections.length) return;
  const clamped=Math.max(0,Math.min(sections.length-1,target));
  const count=sections.length;
  motionFromProgress = scrollProgress();
  motionToProgress = count > 1 ? clamped/(count-1) : 0;
  setSceneVisualState(clamped);
  const start=window.scrollY;
  const end=Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight, sections[clamped].offsetTop));
  const distance=end-start;

  cancelAnimationFrame(navRaf);
  navAnimating=true;
  activeSection=clamped;
  site.dataset.scene=String(clamped+1).padStart(2,'0');
  updateMotionNav(clamped, clamped/(sections.length-1));

  const duration=TIMINGS[Math.min(clamped, TIMINGS.length-1)] || 1500;
  const t0=performance.now();
  const easeOut=t=>1-Math.pow(1-t,4);

  const tick=now=>{
    const t=Math.min(1,(now-t0)/duration);
    window.scrollTo(0,start+distance*easeOut(t));
    if(t<1){
      navRaf=requestAnimationFrame(tick);
    }else{
      window.scrollTo(0,end);
      navAnimating=false;
      activeSection=clamped;
      site.dataset.scene=String(clamped+1).padStart(2,'0');
      updateMotionNav(clamped,clamped/(sections.length-1));
    }
  };
  navRaf=requestAnimationFrame(tick);
}

function setupMotionNav(){
  const nav=document.querySelector('#motionNav');
  if(!nav) return;

  nav.querySelector('[data-motion="prev"]').onclick=()=>{
    const current=navAnimating ? activeSection : getCurrentScene();
    animateToSection(current-1);
  };
  nav.querySelector('[data-motion="next"]').onclick=()=>{
    const current=navAnimating ? activeSection : getCurrentScene();
    animateToSection(current+1);
  };
  nav.querySelectorAll('.motion-dot').forEach((d,i)=>d.onclick=()=>animateToSection(i));
  setSceneVisualState(0);
  updateMotionNav(0,0);
}

function updateSceneState(){
  const sections = [...document.querySelectorAll('main section')];
  let closest = 0, best = Infinity;
  sections.forEach((s,i)=>{
    const d = Math.abs(s.getBoundingClientRect().top - innerHeight*.32);
    if(d < best){best=d;closest=i;}
    s.classList.toggle('is-near', Math.abs(s.getBoundingClientRect().top-innerHeight*.45)<innerHeight*.55);
  });
  if(!navAnimating && closest !== activeSection){
    activeSection = closest;
    setSceneVisualState(activeSection);
  }
}

function render(){
  requestAnimationFrame(render);
  targetProgress = scrollProgress();
  if(navAnimating){
    currentProgress = targetProgress;
  }else{
    currentProgress += (targetProgress-currentProgress) * .11;
  }
  applyCarPose(currentProgress);
  updateSceneState();
  const count=document.querySelectorAll('main section').length;
  const raw = scrollProgress() * (count-1);
  const navIndex = navAnimating ? activeSection : Math.max(0,Math.min(count-1,Math.round(raw)));
  updateMotionNav(navIndex, raw);
  const direction = scrollY >= lastScrollY ? 1 : -1;
  lastScrollY = scrollY;
  site.style.setProperty('--scroll-dir', direction);
  renderer.render(scene,camera);
}
render();

window.addEventListener('scroll',()=>{
  site.classList.add('has-scrolled');
},{passive:true});

const menu=document.querySelector('#menu'), panel=document.querySelector('#menuPanel'), close=document.querySelector('#closeMenu');
menu.onclick=()=>{panel.classList.add('open');panel.setAttribute('aria-hidden','false')};
close.onclick=()=>{panel.classList.remove('open');panel.setAttribute('aria-hidden','true')};
panel.querySelectorAll('a').forEach(a=>a.onclick=()=>{panel.classList.remove('open');panel.setAttribute('aria-hidden','true')});
const links=[...document.querySelectorAll('.nav a')];
const sections=[...document.querySelectorAll('main section')];
const obs=new IntersectionObserver(entries=>entries.forEach(e=>{
  if(e.isIntersecting){
    links.forEach(l=>l.classList.toggle('active',l.getAttribute('href')===`#${e.target.id}`));
    e.target.classList.add('seen');
  }
}),{threshold:.45});
sections.forEach(s=>obs.observe(s));

setupMotionNav();

/* Scroll and keyboard use the exact same scene timeline as the arrows. */
window.addEventListener('wheel',e=>{
  if(Math.abs(e.deltaY)<8) return;
  e.preventDefault();
  const current=navAnimating ? activeSection : getCurrentScene();
  const direction=e.deltaY>0 ? 1 : -1;
  animateToSection(current+direction);
},{passive:false});

window.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown' || e.key==='PageDown'){
    e.preventDefault();
    animateToSection((navAnimating ? activeSection : getCurrentScene())+1);
  }
  if(e.key==='ArrowUp' || e.key==='PageUp'){
    e.preventDefault();
    animateToSection((navAnimating ? activeSection : getCurrentScene())-1);
  }
});
