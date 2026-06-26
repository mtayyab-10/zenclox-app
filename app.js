'use strict';

/* ============================================================
 * CONSTANTS
 * ============================================================ */
const STORAGE_KEY = 'zenclox_history_v3';
const TODAY_KEY   = 'zenclox_day_v3';
const STATE_KEY   = 'zenclox_state_v3';
const HEATMAP_KEY = 'zenclox_heatmap_v3';
const STREAK_KEY  = 'zenclox_streak_v3';
const THEME_KEY   = 'zenclox_theme_v1';
const SOUND_KEY   = 'zenclox_sound_v1';
const BADGES_KEY  = 'zenclox_badges_v1';
const CIRCUMFERENCE = 2 * Math.PI * 130;

const MILESTONES = [
  { days:3,  icon:'🌱', name:'Growing Streak'  },
  { days:7,  icon:'⚡', name:'Week Warrior'    },
  { days:14, icon:'🔥', name:'Fortnight Focus' },
  { days:30, icon:'🏆', name:'Monthly Master'  },
];
const SUB_FOCUS = ['In the zone','Deep work','Full focus','Flow state','Locked in','Making moves'];
const SUB_BREAK = ['Recharge mode','Rest well','Breathe easy','Step away','Good work!','Refueling'];
const IDLE_MSGS = ['One session at a time.','Deep work starts here.','Make this one count.','Zero distractions.','Full presence mode.','Your best hour starts now.'];

/* ============================================================
 * STATE
 * ============================================================ */
let focusMins = 25, breakMins = 5;
let totalSecs = focusMins * 60, remaining = totalSecs;
let isRunning = false, isFocus = true, sessionNum = 1;
let timerInterval = null, startTime = null, startRemaining = 0;
let sessionFresh = true;
let history = [], interruptions = 0, currentIntention = '', currentTags = [];
let activeSounds = { rain: false, space: false, fire: false, binaural: false };
let rainSynth = null, spaceSynth = null, fireSynth = null, binauralSynth = null;
let audioCtx = null;
let mainFilterNode = null;

// Expose internal state variables to window for other scripts (e.g. features.js)
Object.defineProperty(window, 'isFocus', { get: () => isFocus, set: (v) => { isFocus = v; } });
Object.defineProperty(window, 'isRunning', { get: () => isRunning, set: (v) => { isRunning = v; } });
Object.defineProperty(window, 'totalSecs', { get: () => totalSecs, set: (v) => { totalSecs = v; } });
Object.defineProperty(window, 'remaining', { get: () => remaining, set: (v) => { remaining = v; } });
Object.defineProperty(window, 'focusHistory', { get: () => history, set: (v) => { history = v; } });
Object.defineProperty(window, 'activeSounds', { get: () => activeSounds, set: (v) => { activeSounds = v; } });
Object.defineProperty(window, 'currentTags', { get: () => currentTags, set: (v) => { currentTags = v; } });


// New upgrades state
let isBreathing = false;
let breathingInterval = null;
let breathingCycleSeconds = 0;
let breathToggleEnabled = false;

let isFlowShield = false;
let shieldCanvas = null;
let shieldCtx = null;
let shieldAnimId = null;
let particles = [];
let shieldMouseTimeout = null;
let driftsCount = 0;
let lastBlurTime = null;
let shieldMouseX = null;
let shieldMouseY = null;
let shieldMouseMoveHandler = null;
let shieldMouseLeaveHandler = null;

let currentChartType = 'tags'; // 'tags' or 'velocity'

/* ============================================================
 * DOM CACHE
 * ============================================================ */
const $ = id => document.getElementById(id);
const dom = {
  modeDot:          $('mode-dot'),
  modeLabel:        $('mode-label'),
  timerDisplay:     $('timer-display'),
  timerSub:         $('timer-sub'),
  ringProgress:     $('ring-progress'),
  startBtn:         $('start-btn'),
  resetBtn:         $('reset-btn'),
  skipBtn:          $('skip-btn'),
  iconPlay:         document.querySelector('.icon-play'),
  iconPause:        document.querySelector('.icon-pause'),
  settingsBtn:      $('settings-toggle-btn'),
  settingsPanel:    $('settings-panel'),
  focusVal:         $('focus-val'),
  breakVal:         $('break-val'),
  focusMinus:       $('focus-minus'),
  focusPlus:        $('focus-plus'),
  breakMinus:       $('break-minus'),
  breakPlus:        $('break-plus'),
  applyBtn:         $('apply-settings-btn'),
  historyList:      $('history-list'),
  historyEmpty:     $('history-empty'),
  historyCount:     $('history-count'),
  sessionFlash:     $('session-flash'),
  flashIconWrap:    $('flash-icon-wrap'),
  flashText:        $('flash-text'),
  interruptionRow:  $('interruption-row'),
  interruptBtn:     $('interrupt-btn'),
  interruptCount:   $('interrupt-count'),
  velocityScore:    $('velocity-score'),
  heatmapGrid:      $('heatmap-grid'),
  streakBadge:      $('streak-badge'),
  streakCount:      $('streak-count'),
  exportBtn:        $('export-btn'),
  notifBtn:         $('notif-btn'),
  notifText:        $('notif-text'),
  volumeSlider:     $('volume-slider'),
  soundRain:        $('sound-rain'),
  soundSpace:       $('sound-space'),
  soundFire:        $('sound-fire'),
  soundBinaural:    $('sound-binaural'),
  intentionOverlay: $('intention-overlay'),
  intentionInput:   $('intention-input'),
  intentionSubmit:  $('intention-submit-btn'),
  intentionSkip:    $('intention-skip-btn'),
  reflOverlay:      $('reflection-overlay'),
  reflGoal:         $('reflection-goal'),
  reflYes:          $('reflect-yes'),
  reflPartial:      $('reflect-partial'),
  reflNo:           $('reflect-no'),
  badgeToast:       $('badge-toast'),
  badgeToastIcon:   $('badge-toast-icon'),
  badgeToastName:   $('badge-toast-name'),
  badgeToastClose:  $('badge-toast-close'),
  faviconLink:      $('favicon-link'),
  intentionTagsInput: $('intention-tags-input'),
  intentionRecentTags: $('intention-recent-tags'),
  soundToggleBtn:   $('sound-toggle-btn'),
  soundPopover:     $('sound-popover'),
  popoverVolumeSlider: $('popover-volume-slider'),
  
  // Upgrades selectors
  breathToggle:     $('breath-toggle'),
  shieldToggleBtn:  $('shield-toggle-btn'),
  analyticsSection: $('analytics-section'),
  analyticsToggleBtn: $('analytics-toggle-btn'),
  tagsDonutChart:   $('tags-donut-chart'),
  tagsLegend:       $('tags-legend'),
  chartCenterVal:   $('chart-center-val'),
  velocityView:     $('analytics-velocity-view'),
  tagsView:         $('analytics-tags-view'),
  velocityTrendChart: $('velocity-trend-chart'),
  velocityLegend:   $('velocity-legend'),
  sliderRain:       $('slider-rain'),
  sliderSpace:      $('slider-space'),
  sliderFire:       $('slider-fire'),
  sliderBinaural:   $('slider-binaural')
};

/* ============================================================
 * AUDIO ENGINE
 * ============================================================ */
function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      mainFilterNode = audioCtx.createBiquadFilter();
      mainFilterNode.type = 'lowpass';
      // Start wide open (bypass muffle)
      mainFilterNode.frequency.setValueAtTime(20000, audioCtx.currentTime);
      mainFilterNode.connect(audioCtx.destination);
    } catch(e) {
      console.warn("Failed to initialize main muffle filter:", e);
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function updateFilterMode() {
  if (!audioCtx || !mainFilterNode) return;
  const targetFreq = isRunning ? 20000 : 350; // 20kHz when running, 350Hz when paused
  try {
    mainFilterNode.frequency.exponentialRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.6);
  } catch (e) {
    mainFilterNode.frequency.setValueAtTime(targetFreq, audioCtx.currentTime);
  }
}

function playTone(freq, dur, type = 'sine', vol = 0.38) {
  const ctx = getCtx(), osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(); osc.stop(ctx.currentTime + dur);
}
function playFocusComplete() { [523.25,659.25,783.99].forEach((f,i) => setTimeout(() => playTone(f,0.5,'sine',0.33), i*180)); }
function playBreakComplete()  { [440,523.25].forEach((f,i) => setTimeout(() => playTone(f,0.5,'triangle',0.26), i*200)); }

/* --- Rain on Glass --- */
function createRainSynth(ctx, vol) {
  const bufSize = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(2, bufSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1.2;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 700; hp.Q.value = 0.5;

  const ls = ctx.createBiquadFilter();
  ls.type = 'lowshelf'; ls.frequency.value = 300; ls.gain.value = -14;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2.5);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15;
  const lfoG = ctx.createGain(); lfoG.gain.value = 650;
  lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();

  noise.connect(bp); bp.connect(hp); hp.connect(ls); ls.connect(master);
  master.connect(mainFilterNode || ctx.destination); noise.start();

  return {
    setVolume(v) { master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.4); },
    stop() {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
      setTimeout(() => { try { noise.stop(); lfo.stop(); } catch(_) {} }, 2200);
    },
  };
}

/* --- Deep Space --- */
function createSpaceSynth(ctx, vol) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 5);

  const delay = ctx.createDelay(3); delay.delayTime.value = 1.1;
  const fb = ctx.createGain(); fb.gain.value = 0.42;
  const dlpf = ctx.createBiquadFilter(); dlpf.type = 'lowpass'; dlpf.frequency.value = 900;
  delay.connect(dlpf); dlpf.connect(fb); fb.connect(delay);
  delay.connect(mainFilterNode || ctx.destination);

  const layers = [
    { f:55,    t:'sine',     lr:0.04, ld:0.5, ar:0.06 },
    { f:82.41, t:'sine',     lr:0.06, ld:0.8, ar:0.09 },
    { f:110,   t:'triangle', lr:0.03, ld:1.0, ar:0.05 },
    { f:164.81,t:'triangle', lr:0.08, ld:0.6, ar:0.07 },
    { f:220,   t:'sine',     lr:0.05, ld:0.4, ar:0.08 },
  ];
  const oscs = [];
  layers.forEach(({ f, t, lr, ld, ar }, i) => {
    const osc = ctx.createOscillator(); osc.type = t; osc.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = 0.18 / layers.length;
    const pl = ctx.createOscillator(); pl.frequency.value = lr;
    const pg = ctx.createGain(); pg.gain.value = ld;
    pl.connect(pg); pg.connect(osc.frequency); pl.start(ctx.currentTime + i*0.3);
    const al = ctx.createOscillator(); al.frequency.value = ar;
    const ag = ctx.createGain(); ag.gain.value = 0.08;
    al.connect(ag); ag.connect(og.gain); al.start(ctx.currentTime + i*0.5);
    osc.connect(og); og.connect(master); og.connect(delay);
    osc.start(ctx.currentTime + i*0.2);
    oscs.push({ osc, pl, al });
  });
  master.connect(mainFilterNode || ctx.destination);

  return {
    setVolume(v) { master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.5); },
    stop() {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 4);
      setTimeout(() => oscs.forEach(({ osc, pl, al }) => { try { osc.stop(); pl.stop(); al.stop(); } catch(_) {} }), 4500);
    },
  };
}

/* --- Fireplace --- */
function createFireplaceSynth(ctx, vol) {
  const bufSize = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5;
  }
  const rumbleSource = ctx.createBufferSource();
  rumbleSource.buffer = buf; rumbleSource.loop = true;
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 180;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.6;
  const rumbleLFO = ctx.createOscillator();
  rumbleLFO.frequency.value = 0.2;
  const rumbleLFOGain = ctx.createGain();
  rumbleLFOGain.gain.value = 0.25;
  rumbleLFO.connect(rumbleLFOGain); rumbleLFOGain.connect(rumbleGain.gain);
  rumbleSource.connect(rumbleFilter); rumbleFilter.connect(rumbleGain);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 2.5);
  rumbleGain.connect(master); master.connect(mainFilterNode || ctx.destination);
  rumbleSource.start(); rumbleLFO.start();

  let crackleTimeout = setTimeout(scheduleCrackle, 50);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 8;
  bp.connect(master);

  function scheduleCrackle() {
    if (!crackleTimeout) return;
    const now = ctx.currentTime;
    const clickSize = ctx.sampleRate * 0.06;
    const clickBuf = ctx.createBuffer(1, clickSize, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickSize; i++) clickData[i] = Math.random() * 2 - 1;
    const clickSource = ctx.createBufferSource();
    clickSource.buffer = clickBuf;
    const clickGain = ctx.createGain();
    const peakVol = 0.25 + Math.random() * 0.55;
    clickGain.gain.setValueAtTime(0, now);
    clickGain.gain.linearRampToValueAtTime(peakVol, now + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01 + Math.random() * 0.04);
    clickSource.connect(clickGain); clickGain.connect(bp);
    clickSource.start(now);

    if (Math.random() < 0.15) {
      const popOsc = ctx.createOscillator();
      popOsc.type = 'sine'; popOsc.frequency.setValueAtTime(80 + Math.random() * 60, now);
      popOsc.frequency.exponentialRampToValueAtTime(20, now + 0.08);
      const popGain = ctx.createGain();
      popGain.gain.setValueAtTime(0.4, now); popGain.gain.linearRampToValueAtTime(0.001, now + 0.08);
      popOsc.connect(popGain); popGain.connect(master);
      popOsc.start(now); popOsc.stop(now + 0.1);
    }
    const nextDelay = 100 + Math.random() * 900;
    crackleTimeout = setTimeout(scheduleCrackle, nextDelay);
  }

  return {
    setVolume(v) { master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.4); },
    stop() {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
      if (crackleTimeout) { clearTimeout(crackleTimeout); crackleTimeout = null; }
      setTimeout(() => { try { rumbleSource.stop(); rumbleLFO.stop(); } catch(_) {} }, 2200);
    }
  };
}

/* --- Binaural Beats --- */
function createBinauralSynth(ctx, beatFreq, vol) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 3);

  const baseFreq = 140;
  const oscL = ctx.createOscillator(); oscL.type = 'sine'; oscL.frequency.value = baseFreq;
  const panL = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const gainL = ctx.createGain(); gainL.gain.value = 0.5;
  if (panL) {
    panL.pan.value = -1;
    oscL.connect(gainL); gainL.connect(panL); panL.connect(master);
  } else {
    oscL.connect(gainL); gainL.connect(master);
  }

  const oscR = ctx.createOscillator(); oscR.type = 'sine'; oscR.frequency.value = baseFreq + beatFreq;
  const panR = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const gainR = ctx.createGain(); gainR.gain.value = 0.5;
  if (panR) {
    panR.pan.value = 1;
    oscR.connect(gainR); gainR.connect(panR); panR.connect(master);
  } else {
    oscR.connect(gainR); gainR.connect(master);
  }

  const oscSub = ctx.createOscillator(); oscSub.type = 'sine'; oscSub.frequency.value = baseFreq / 2;
  const gainSub = ctx.createGain(); gainSub.gain.value = 0.3;
  oscSub.connect(gainSub); gainSub.connect(master);

  const bufSize = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    data[i] *= 0.11;
    b6 = white * 0.115926;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 100;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.25;
  noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(master);

  master.connect(mainFilterNode || ctx.destination);
  oscL.start(); oscR.start(); oscSub.start(); noise.start();

  return {
    setVolume(v) { master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.4); },
    stop() {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
      setTimeout(() => { try { oscL.stop(); oscR.stop(); oscSub.stop(); noise.stop(); } catch(_) {} }, 2200);
    }
  };
}

function ambientVol(track) {
  const sliderEl = $(`slider-${track}`);
  const trackVal = sliderEl ? parseInt(sliderEl.value) : 40;
  const masterVal = dom.volumeSlider ? parseInt(dom.volumeSlider.value) : 50;
  
  const trackVol = isNaN(trackVal) ? 0.4 : (trackVal / 100);
  const masterVol = isNaN(masterVal) ? 0.5 : (masterVal / 100);
  
  return trackVol * masterVol * 0.38;
}

function updateSoundUI() {
  ['rain', 'space', 'fire', 'binaural'].forEach(type => {
    const btn = $(`sound-${type}`);
    const popoverBtn = $(`popover-sound-${type}`);
    const isPlaying = activeSounds[type];
    if (btn) {
      btn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      btn.classList.toggle('sound-playing', isPlaying);
    }
    if (popoverBtn) {
      popoverBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      popoverBtn.classList.toggle('sound-playing', isPlaying);
    }
  });
}

function startAmbientSound(type) {
  const ctx = getCtx();
  if (activeSounds[type]) {
    activeSounds[type] = false;
    if (type === 'rain') { rainSynth?.stop(); rainSynth = null; }
    if (type === 'space') { spaceSynth?.stop(); spaceSynth = null; }
    if (type === 'fire') { fireSynth?.stop(); fireSynth = null; }
    if (type === 'binaural') { binauralSynth?.stop(); binauralSynth = null; }
  } else {
    activeSounds[type] = true;
    const v = ambientVol(type);
    if (type === 'rain')  rainSynth  = createRainSynth(ctx, v);
    if (type === 'space') spaceSynth = createSpaceSynth(ctx, v);
    if (type === 'fire')  fireSynth  = createFireplaceSynth(ctx, v);
    if (type === 'binaural') binauralSynth = createBinauralSynth(ctx, isFocus ? 15 : 8, v);
  }
  saveSoundPref();
  updateSoundUI();
}

function resumeAmbientIfNeeded() {
  const ctx = getCtx();
  ['rain', 'space', 'fire', 'binaural'].forEach(type => {
    if (activeSounds[type]) {
      const v = ambientVol(type);
      if (type === 'rain' && !rainSynth)  rainSynth  = createRainSynth(ctx, v);
      if (type === 'space' && !spaceSynth) spaceSynth = createSpaceSynth(ctx, v);
      if (type === 'fire' && !fireSynth)  fireSynth  = createFireplaceSynth(ctx, v);
      if (type === 'binaural' && !binauralSynth) binauralSynth = createBinauralSynth(ctx, isFocus ? 15 : 8, v);
    }
  });
  updateSoundUI();
}

function stopAllAmbient() {
  if (rainSynth) { rainSynth.stop(); rainSynth = null; }
  if (spaceSynth) { spaceSynth.stop(); spaceSynth = null; }
  if (fireSynth) { fireSynth.stop(); fireSynth = null; }
  if (binauralSynth) { binauralSynth.stop(); binauralSynth = null; }
}

function updateAmbientVolume() {
  ['rain', 'space', 'fire', 'binaural'].forEach(type => {
    if (activeSounds[type]) {
      const v = ambientVol(type);
      if (type === 'rain') rainSynth?.setVolume(v);
      if (type === 'space') spaceSynth?.setVolume(v);
      if (type === 'fire') fireSynth?.setVolume(v);
      if (type === 'binaural') binauralSynth?.setVolume(v);
    }
  });
}

function saveSoundPref() {
  const volumes = {};
  ['rain', 'space', 'fire', 'binaural'].forEach(t => {
    volumes[t] = $(`slider-${t}`).value;
  });
  localStorage.setItem(SOUND_KEY, JSON.stringify({
    activeSounds,
    soundVolumes: volumes,
    masterVolume: dom.volumeSlider.value
  }));
}

function loadSoundPref() {
  try {
    const p = JSON.parse(localStorage.getItem(SOUND_KEY));
    if (!p) return;
    if (p.masterVolume != null) {
      dom.volumeSlider.value = p.masterVolume;
      if (dom.popoverVolumeSlider) dom.popoverVolumeSlider.value = p.masterVolume;
    }
    if (p.soundVolumes) {
      Object.keys(p.soundVolumes).forEach(t => {
        const slider = $(`slider-${t}`);
        if (slider) slider.value = p.soundVolumes[t];
        const popoverSlider = $(`popover-slider-${t}`);
        if (popoverSlider) popoverSlider.value = p.soundVolumes[t];
      });
    }
    if (p.activeSounds) {
      activeSounds = p.activeSounds;
      updateSoundUI();
    }
  } catch(_) {}
}

/* ============================================================
 * UPGRADE FEATURES (BREATHING, MIXER, SHIELD, ANALYTICS)
 * ============================================================ */

// 1. Box Breathing
function startBreathingMode() {
  isBreathing = true;
  breathingCycleSeconds = 0;
  document.body.classList.add('breath-mode-active');
  dom.interruptionRow.hidden = true;
  dom.modeLabel.textContent = 'Prep';
  dom.timerDisplay.textContent = '01:00';
  
  const breathSteps = [
    { text: 'Breathe In', duration: 4 },
    { text: 'Hold (Full)', duration: 4 },
    { text: 'Breathe Out', duration: 4 },
    { text: 'Hold (Empty)', duration: 4 }
  ];
  
  let remainingBreathSeconds = 64; // 4 cycles
  
  let breathOsc = null;
  let breathGain = null;
  try {
    const ctx = getCtx();
    breathOsc = ctx.createOscillator();
    breathGain = ctx.createGain();
    breathOsc.type = 'sine';
    breathOsc.frequency.value = 110; // Low grounding frequency
    breathGain.gain.value = 0;
    breathOsc.connect(breathGain);
    breathGain.connect(ctx.destination);
    breathOsc.start();
  } catch(e) {}
  
  function tickBreathing() {
    if (!isBreathing) {
      cleanUpBreathing();
      return;
    }
    
    const cycleSec = (64 - remainingBreathSeconds) % 16;
    let stepIndex = 0;
    if (cycleSec < 4) {
      stepIndex = 0; // Inhale
    } else if (cycleSec < 8) {
      stepIndex = 1; // Hold Full
    } else if (cycleSec < 12) {
      stepIndex = 2; // Exhale
    } else {
      stepIndex = 3; // Hold Empty
    }
    
    const step = breathSteps[stepIndex];
    dom.timerSub.textContent = step.text;
    dom.timerDisplay.textContent = `00:${String(remainingBreathSeconds).padStart(2, '0')}`;
    
    // Auditory breath sweeps
    if (breathOsc && breathGain) {
      const now = audioCtx.currentTime;
      if (stepIndex === 0) { // Inhale
        breathGain.gain.linearRampToValueAtTime(0.18, now + 0.9);
        breathOsc.frequency.linearRampToValueAtTime(170, now + 0.9);
        document.body.style.setProperty('--breath-duration', '4s');
      } else if (stepIndex === 1) { // Hold Full
        breathGain.gain.linearRampToValueAtTime(0.18, now + 0.9);
        breathOsc.frequency.linearRampToValueAtTime(170, now + 0.9);
      } else if (stepIndex === 2) { // Exhale
        breathGain.gain.linearRampToValueAtTime(0.01, now + 0.9);
        breathOsc.frequency.linearRampToValueAtTime(110, now + 0.9);
      } else { // Hold Empty
        breathGain.gain.linearRampToValueAtTime(0, now + 0.9);
      }
    }
    
    const offset = CIRCUMFERENCE * (remainingBreathSeconds / 64);
    dom.ringProgress.style.strokeDashoffset = offset;
    
    remainingBreathSeconds--;
    if (remainingBreathSeconds < 0) {
      cleanUpBreathing();
      isBreathing = false;
      document.body.classList.remove('breath-mode-active');
      dom.modeLabel.textContent = 'Focus';
      setMode(true);
      startTimer();
    } else {
      breathingInterval = setTimeout(tickBreathing, 1000);
    }
  }
  
  function cleanUpBreathing() {
    if (breathingInterval) clearTimeout(breathingInterval);
    if (breathOsc) {
      try {
        breathOsc.stop();
        breathOsc.disconnect();
      } catch(e) {}
    }
    document.body.classList.remove('breath-mode-active');
    document.body.style.removeProperty('--breath-duration');
  }
  
  tickBreathing();
}

function cancelBreathingMode() {
  if (!isBreathing) return;
  isBreathing = false;
  if (breathingInterval) clearTimeout(breathingInterval);
  document.body.classList.remove('breath-mode-active');
  document.body.style.removeProperty('--breath-duration');
  setMode(true);
}

// 2. Flow Shield Cinema Mode
function toggleFlowShield() {
  isFlowShield = !isFlowShield;
  dom.shieldToggleBtn.setAttribute('aria-pressed', isFlowShield ? 'true' : 'false');
  document.body.classList.toggle('flow-shield-active', isFlowShield);
  
  if (isFlowShield) {
    initShieldCanvas();
    setupShieldMouseTracker();
  } else {
    stopShieldCanvas();
    removeShieldMouseTracker();
  }
}

function initShieldCanvas() {
  shieldCanvas = $('flow-shield-canvas');
  if (!shieldCanvas) return;
  shieldCtx = shieldCanvas.getContext('2d');
  
  resizeShieldCanvas();
  window.addEventListener('resize', resizeShieldCanvas);

  // Set up interactive physics mouse listeners
  shieldMouseMoveHandler = (e) => {
    shieldMouseX = e.clientX;
    shieldMouseY = e.clientY;
  };
  shieldMouseLeaveHandler = () => {
    shieldMouseX = null;
    shieldMouseY = null;
  };
  window.addEventListener('mousemove', shieldMouseMoveHandler);
  window.addEventListener('mouseleave', shieldMouseLeaveHandler);
  
  particles = [];
  const theme = document.documentElement.getAttribute('data-theme') || 'void';
  const particleCount = 40;
  
  let pColor = 'rgba(192,132,252,0.18)'; // Void
  if (theme === 'forge') pColor = 'rgba(251,146,60,0.18)';
  if (theme === 'ocean') pColor = 'rgba(56,189,248,0.18)';
  if (theme === 'light') pColor = 'rgba(0,0,0,0.08)';
  if (theme === 'dark') pColor = 'rgba(255,255,255,0.15)';
  
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * shieldCanvas.width,
      y: Math.random() * shieldCanvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3 - (theme === 'forge' ? 0.25 : 0),
      r: Math.random() * 3 + 1,
      color: pColor,
      alpha: Math.random() * 0.4 + 0.15
    });
  }
  
  function drawParticles() {
    if (!isFlowShield) return;
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'void';
    
    // Background gradient
    shieldCtx.clearRect(0, 0, shieldCanvas.width, shieldCanvas.height);
    const grad = shieldCtx.createRadialGradient(
      shieldCanvas.width / 2, shieldCanvas.height / 2, 50,
      shieldCanvas.width / 2, shieldCanvas.height / 2, shieldCanvas.width / 1.2
    );
    if (currentTheme === 'void') {
      grad.addColorStop(0, '#0f0f14');
      grad.addColorStop(1, '#050508');
    } else if (currentTheme === 'forge') {
      grad.addColorStop(0, '#100a05');
      grad.addColorStop(1, '#050301');
    } else if (currentTheme === 'ocean') {
      grad.addColorStop(0, '#05111b');
      grad.addColorStop(1, '#02070c');
    } else if (currentTheme === 'light') {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#f3f4f6');
    } else if (currentTheme === 'dark') {
      grad.addColorStop(0, '#000000');
      grad.addColorStop(1, '#0a0a0c');
    }
    shieldCtx.fillStyle = grad;
    shieldCtx.fillRect(0, 0, shieldCanvas.width, shieldCanvas.height);
    
    // Draw constellation proximity lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i];
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 100) {
          shieldCtx.beginPath();
          shieldCtx.moveTo(p1.x, p1.y);
          shieldCtx.lineTo(p2.x, p2.y);
          
          const opacity = ((100 - dist) / 100) * ((p1.alpha + p2.alpha) / 2) * 0.22;
          
          if (currentTheme === 'forge') {
            shieldCtx.strokeStyle = `rgba(251, 146, 60, ${opacity})`;
          } else if (currentTheme === 'ocean') {
            shieldCtx.strokeStyle = `rgba(56, 189, 248, ${opacity})`;
          } else if (currentTheme === 'light') {
            shieldCtx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.4})`;
          } else if (currentTheme === 'dark') {
            shieldCtx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
          } else {
            shieldCtx.strokeStyle = `rgba(192, 132, 252, ${opacity})`;
          }
          shieldCtx.lineWidth = 0.8;
          shieldCtx.stroke();
        }
      }
    }
    
    // Particles update
    particles.forEach(p => {
      // Repel particles from mouse cursor
      if (shieldMouseX !== null && shieldMouseY !== null) {
        const dx = p.x - shieldMouseX;
        const dy = p.y - shieldMouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120;
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * force * 1.5;
          p.y += Math.sin(angle) * force * 1.5;
        }
      }

      shieldCtx.beginPath();
      shieldCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      shieldCtx.fillStyle = p.color;
      shieldCtx.fill();
      
      p.x += p.vx;
      p.y += p.vy;
      
      if (p.x < -10) p.x = shieldCanvas.width + 10;
      if (p.x > shieldCanvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = shieldCanvas.height + 10;
      if (p.y > shieldCanvas.height + 10) p.y = -10;
      
      p.alpha += (Math.random() - 0.5) * 0.015;
      p.alpha = Math.max(0.1, Math.min(0.6, p.alpha));
      
      if (currentTheme === 'forge') {
        p.color = `rgba(251, 146, 60, ${p.alpha})`;
      } else if (currentTheme === 'ocean') {
        p.color = `rgba(56, 189, 248, ${p.alpha})`;
      } else if (currentTheme === 'light') {
        p.color = `rgba(0, 0, 0, ${p.alpha * 0.4})`;
      } else if (currentTheme === 'dark') {
        p.color = `rgba(255, 255, 255, ${p.alpha})`;
      } else {
        p.color = `rgba(192, 132, 252, ${p.alpha})`;
      }
    });
    
    shieldAnimId = requestAnimationFrame(drawParticles);
  }
  
  drawParticles();
}

function resizeShieldCanvas() {
  if (shieldCanvas) {
    shieldCanvas.width = window.innerWidth;
    shieldCanvas.height = window.innerHeight;
  }
}

function stopShieldCanvas() {
  if (shieldAnimId) cancelAnimationFrame(shieldAnimId);
  window.removeEventListener('resize', resizeShieldCanvas);
  if (shieldMouseMoveHandler) {
    window.removeEventListener('mousemove', shieldMouseMoveHandler);
    shieldMouseMoveHandler = null;
  }
  if (shieldMouseLeaveHandler) {
    window.removeEventListener('mouseleave', shieldMouseLeaveHandler);
    shieldMouseLeaveHandler = null;
  }
  shieldMouseX = null;
  shieldMouseY = null;
}

let shieldIdleHandler = null;
let shieldKeyHandler = null;

function setupShieldMouseTracker() {
  const timerControls = document.querySelector('.controls');
  shieldIdleHandler = () => {
    if (!isFlowShield) return;
    if (timerControls) timerControls.style.opacity = '1';
    document.body.style.cursor = 'default';
    
    clearTimeout(shieldMouseTimeout);
    shieldMouseTimeout = setTimeout(() => {
      if (isFlowShield && isRunning) {
        if (timerControls) timerControls.style.opacity = '0.05';
        document.body.style.cursor = 'none';
        shieldMouseX = null;
        shieldMouseY = null;
      }
    }, 4500);
  };
  
  shieldKeyHandler = () => {
    shieldIdleHandler();
  };

  document.addEventListener('mousemove', shieldIdleHandler);
  document.addEventListener('keydown', shieldKeyHandler);
  shieldIdleHandler();
}

function removeShieldMouseTracker() {
  clearTimeout(shieldMouseTimeout);
  document.body.style.cursor = 'default';
  const timerControls = document.querySelector('.controls');
  if (timerControls) timerControls.style.opacity = '1';
  
  if (shieldIdleHandler) {
    document.removeEventListener('mousemove', shieldIdleHandler);
    shieldIdleHandler = null;
  }
  if (shieldKeyHandler) {
    document.removeEventListener('keydown', shieldKeyHandler);
    shieldKeyHandler = null;
  }
}

function showShieldBreachAlert() {
  let breachDiv = $('shield-breach-alert');
  if (!breachDiv) {
    breachDiv = document.createElement('div');
    breachDiv.id = 'shield-breach-alert';
    breachDiv.className = 'shield-breach-overlay';
    breachDiv.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>Shield Breached</span>
      <span style="font-size: 0.85rem; font-weight: 500; text-transform: none; letter-spacing: 0; opacity: 0.85; margin-top: 6px; color: #fda4af;">Distraction logged. Move mouse to resume shield.</span>
    `;
    document.body.appendChild(breachDiv);
  }
  breachDiv.classList.add('active');
  
  // Play warning alerts
  try {
    playTone(180, 0.4, 'sawtooth', 0.25);
    setTimeout(() => playTone(120, 0.5, 'sawtooth', 0.25), 180);
  } catch(e) {}

  const dismissBreach = () => {
    breachDiv.classList.remove('active');
    document.removeEventListener('mousemove', dismissBreach);
    document.removeEventListener('click', dismissBreach);
  };
  // Dismiss on mouse move or click after 1s
  setTimeout(() => {
    document.addEventListener('mousemove', dismissBreach);
    document.addEventListener('click', dismissBreach);
  }, 1000);
}

function initDriftTracking() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (isRunning && isFocus) {
        lastBlurTime = Date.now();
      }
    } else {
      // Returning to document
      if (isRunning && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        remaining = Math.max(0, startRemaining - elapsed);
        updateDisplay();
        
        if (remaining <= 0) {
          if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
          isRunning = false;
          onCycleEnd();
        } else if (isFocus && lastBlurTime) {
          const offlineTime = (Date.now() - lastBlurTime) / 1000;
          if (offlineTime > 2.0) { // user left the tab for more than 2 seconds
            driftsCount++;
            
            // If in Cinema Mode (Flow Shield), show warning overlay and play sound
            if (isFlowShield) {
              showShieldBreachAlert();
            }
          }
        }
      }
      lastBlurTime = null;
    }
  });
}

// 3. Analytics & Tagging
function extractTags(text) {
  if (!text) return [];
  const matches = text.match(/#\w+/g);
  return matches ? matches.map(t => t.toLowerCase()) : [];
}

function calculateFlowVelocity(duration, interrupts, drifts, outcome) {
  let score = 100;
  score -= interrupts * 8;
  score -= drifts * 12;
  
  let coef = 1.0;
  if (outcome === 'partial') coef = 0.7;
  else if (outcome === 'no') coef = 0.35;
  else if (outcome === 'none') coef = 0.5;
  
  score = score * coef;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getDailyVelocityData() {
  try {
    return JSON.parse(localStorage.getItem('zenclox_daily_velocity_v1')) || {};
  } catch(_) { return {}; }
}

function updateDailyVelocity() {
  const velocities = history.filter(h => h.velocity !== undefined).map(h => h.velocity);
  if (velocities.length === 0) return;
  const avg = Math.round(velocities.reduce((a,b)=>a+b, 0) / velocities.length);
  const data = getDailyVelocityData();
  data[todayStr()] = avg;
  localStorage.setItem('zenclox_daily_velocity_v1', JSON.stringify(data));
}

function renderAnalytics() {
  if (history.length === 0) {
    dom.analyticsSection.hidden = true;
    return;
  }
  dom.analyticsSection.hidden = false;
  
  if (currentChartType === 'tags') {
    dom.tagsView.style.display = 'flex';
    dom.velocityView.style.display = 'none';
    renderTagsDonut();
  } else {
    dom.tagsView.style.display = 'none';
    dom.velocityView.style.display = 'block';
    renderVelocityTrend();
  }
}

function renderTagsDonut() {
  const tagCounts = {};
  let totalTaggedSessions = 0;
  
  history.forEach(h => {
    if (h.tags && h.tags.length > 0) {
      totalTaggedSessions++;
      h.tags.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    }
  });
  
  dom.chartCenterVal.textContent = history.length;
  
  const donut = dom.tagsDonutChart;
  Array.from(donut.querySelectorAll('.donut-segment')).forEach(el => el.remove());
  dom.tagsLegend.innerHTML = '';
  
  const entries = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]);
  if (entries.length === 0) {
    dom.tagsLegend.innerHTML = '<div class="legend-item" style="justify-content:center;width:100%;color:var(--sub)">Add #tags to your intentions to see category breakdown.</div>';
    return;
  }
  
  let currentAngle = -90;
  const COLORS = ['#38bdf8', '#c084fc', '#34d399', '#fb923c', '#fb7185', '#fcd34d'];
  const totalTags = entries.reduce((sum, e) => sum + e[1], 0);
  
  entries.forEach(([tag, count], index) => {
    const pct = count / totalTags;
    const color = COLORS[index % COLORS.length];
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'donut-segment');
    circle.setAttribute('cx', '100');
    circle.setAttribute('cy', '100');
    circle.setAttribute('r', '70');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '16');
    circle.setAttribute('stroke-dasharray', '439.8');
    circle.setAttribute('stroke-dashoffset', (439.8 * (1 - pct)).toString());
    circle.setAttribute('transform', `rotate(${currentAngle} 100 100)`);
    circle.style.transition = 'stroke-dashoffset 0.8s ease';
    donut.appendChild(circle);
    
    currentAngle += 360 * pct;
    
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-color-dot" style="background:${color}"></span>
      <span class="legend-tag-name">${tag}</span>
      <span class="legend-pct">${Math.round(pct * 100)}%</span>
    `;
    dom.tagsLegend.appendChild(legendItem);
  });
}

function renderVelocityTrend() {
  const trend = dom.velocityTrendChart;
  trend.innerHTML = '';
  dom.velocityLegend.innerHTML = '';
  
  const dailyData = getDailyVelocityData();
  const days = [];
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const score = dailyData[key] !== undefined ? dailyData[key] : null;
    days.push({
      dateStr: key,
      dayName: DAYS_SHORT[d.getDay()],
      score
    });
  }
  
  for (let i = 0; i <= 4; i++) {
    const gridY = 10 + i * 22;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'chart-grid');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', gridY.toString());
    line.setAttribute('x2', '340');
    line.setAttribute('y2', gridY.toString());
    trend.appendChild(line);
  }
  
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--active)" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="var(--active)" stop-opacity="0.0"/>
    </linearGradient>
  `;
  trend.appendChild(defs);
  
  const points = [];
  const dx = 340 / 6;
  
  days.forEach((day, index) => {
    const x = index * dx;
    const hasScore = day.score !== null;
    const scoreVal = hasScore ? day.score : 0;
    const y = 98 - scoreVal * 0.88;
    points.push({ x, y, hasScore, score: scoreVal, dayName: day.dayName });
  });
  
  const scoredPoints = points.filter(p => p.hasScore);
  if (scoredPoints.length > 0) {
    let areaPathD = '';
    let linePathD = '';
    
    points.forEach((p, idx) => {
      const command = idx === 0 ? 'M' : 'L';
      linePathD += `${command} ${p.x} ${p.y} `;
    });
    
    areaPathD = linePathD + `L ${points[points.length-1].x} 115 L ${points[0].x} 115 Z`;
    
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('class', 'chart-area');
    area.setAttribute('d', areaPathD);
    trend.appendChild(area);
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('class', 'chart-line');
    line.setAttribute('d', linePathD);
    trend.appendChild(line);
    
    points.forEach(p => {
      if (!p.hasScore) return;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'chart-point');
      circle.setAttribute('cx', p.x.toString());
      circle.setAttribute('cy', p.y.toString());
      circle.setAttribute('r', '4.5');
      circle.setAttribute('title', `${p.dayName}: ${p.score}%`);
      trend.appendChild(circle);
    });
  }
  
  days.forEach(day => {
    const lbl = document.createElement('span');
    lbl.style.width = `${100 / 7}%`;
    lbl.style.textAlign = 'center';
    lbl.textContent = day.dayName;
    if (day.dateStr === todayStr()) {
      lbl.style.color = 'var(--active)';
      lbl.style.fontWeight = '700';
    }
    dom.velocityLegend.appendChild(lbl);
  });
}

/* ============================================================
 * THEME
 * ============================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('.theme-dot').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/* ============================================================
 * FAVICON (dynamic canvas ring)
 * ============================================================ */
let faviconCanvas, faviconCtx2d;
function initFavicon() {
  faviconCanvas = document.createElement('canvas');
  faviconCanvas.width = faviconCanvas.height = 32;
  faviconCtx2d = faviconCanvas.getContext('2d');
}
function updateFavicon() {
  if (!faviconCtx2d) return;
  const ctx = faviconCtx2d, s = 32, cx = 16, cy = 16, r = 12;
  const progress = remaining / totalSecs;
  const col = getComputedStyle(document.documentElement).getPropertyValue('--active').trim() || '#c084fc';
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 3.5; ctx.stroke();
  if (progress > 0) {
    ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);
    ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2);
  ctx.fillStyle = col; ctx.fill();
  dom.faviconLink.href = faviconCanvas.toDataURL();
}

/* ============================================================
 * TIMER CORE (rAF-based, drift-free)
 * ============================================================ */
function fmt(secs) {
  return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
}

function updateDisplay() {
  dom.timerDisplay.textContent = fmt(remaining);
  document.title = `${fmt(remaining)} · ${isFocus ? 'Focus' : 'Break'} — Zenclox`;
  const offset = CIRCUMFERENCE * (1 - remaining / totalSecs);
  dom.ringProgress.style.strokeDashoffset = offset;
  updateFavicon();
  saveTimerState();
  if (window.updateZenColors) window.updateZenColors();
}

function saveTimerState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      remaining, totalSecs, isFocus, sessionNum, focusMins, breakMins,
      interruptions, currentIntention, savedAt: Date.now(), wasRunning: isRunning,
    }));
  } catch(_) {}
}

function restoreTimerState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (!s) return false;
    const age = Date.now() - s.savedAt;
    if (age > 2 * 3600 * 1000) return false;
    focusMins = s.focusMins || 25; breakMins = s.breakMins || 5;
    isFocus = s.isFocus !== undefined ? s.isFocus : true;
    sessionNum = s.sessionNum || 1;
    totalSecs = s.totalSecs || focusMins * 60;
    interruptions = s.interruptions || 0;
    currentIntention = s.currentIntention || '';
    const adj = s.wasRunning ? Math.max(0, s.remaining - Math.floor(age / 1000)) : s.remaining;
    if (adj <= 0) { localStorage.removeItem(STATE_KEY); return false; }
    remaining = adj;
    dom.focusVal.textContent = focusMins;
    dom.breakVal.textContent = breakMins;
    return s.wasRunning;
  } catch(_) { return false; }
}

function startTimer() {
  if (isRunning) return;
  isRunning = true; sessionFresh = false;
  resumeAmbientIfNeeded();
  updateFilterMode();
  dom.iconPlay.style.display  = 'none';
  dom.iconPause.style.display = '';
  dom.timerDisplay.classList.remove('paused');
  dom.modeDot.classList.add('pulsing');
  dom.startBtn.setAttribute('aria-label', 'Pause timer');
  if (isFocus) dom.interruptionRow.hidden = false;
  
  startTime = Date.now();
  startRemaining = remaining;
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const nr = Math.max(0, startRemaining - elapsed);
    if (nr !== remaining) {
      const prevRemaining = remaining;
      remaining = nr;
      updateDisplay();
      
      // Hook: Play singing bowl every 10 minutes in Zen Mode focus
      if (isFocus && isRunning && document.body.classList.contains('zen-mode-active')) {
        const prevElapsed = totalSecs - prevRemaining;
        const currElapsed = totalSecs - remaining;
        const prevTenMin = Math.floor(prevElapsed / 600);
        const currTenMin = Math.floor(currElapsed / 600);
        if (currTenMin > prevTenMin && currTenMin > 0) {
          if (window.playSingingBowl) window.playSingingBowl();
        }
      }
    }
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      isRunning = false;
      onCycleEnd();
    }
  }, 250);
}

function pauseTimer() {
  if (!isRunning) return;
  isRunning = false;
  updateFilterMode();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  startTime = null;
  dom.iconPlay.style.display  = '';
  dom.iconPause.style.display = 'none';
  dom.timerDisplay.classList.add('paused');
  dom.modeDot.classList.remove('pulsing');
  dom.startBtn.setAttribute('aria-label', 'Resume timer');
  saveTimerState();
}

function resetTimer() {
  if (isBreathing) {
    cancelBreathingMode();
  }
  pauseTimer();
  remaining = totalSecs; sessionFresh = true;
  interruptions = 0; driftsCount = 0; currentIntention = ''; currentTags = [];
  dom.timerDisplay.classList.remove('paused');
  dom.interruptionRow.hidden = true;
  dom.interruptCount.hidden = true;
  dom.interruptCount.textContent = '0';
  updateDisplay();
}

function setMode(focus) {
  isFocus = focus;
  totalSecs = (focus ? focusMins : breakMins) * 60;
  remaining = totalSecs; sessionFresh = true;
  interruptions = 0; driftsCount = 0; currentIntention = ''; currentTags = [];
  document.body.classList.toggle('mode-break', !focus);
  dom.modeLabel.textContent = focus ? 'Focus' : 'Break';
  const phrases = focus ? SUB_FOCUS : SUB_BREAK;
  dom.timerSub.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  dom.timerDisplay.classList.remove('paused');
  dom.interruptionRow.hidden = true;
  dom.interruptCount.hidden = true;
  dom.interruptCount.textContent = '0';
  updateDisplay();
  updateVelocity();
}

/* ============================================================
 * SESSION FLOW
 * ============================================================ */
function handleStart() {
  if (isBreathing) {
    cancelBreathingMode();
    return;
  }
  if (isRunning) { pauseTimer(); return; }
  if (isFocus && sessionFresh && remaining === totalSecs) {
    showIntentionModal();
  } else {
    startTimer();
  }
}

/* Flash */
const FOCUS_SVG = `<svg viewBox="0 0 40 40" width="44" height="44"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="2.5" class="flash-check-circle"/><polyline points="12,20 17,25 28,14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="flash-check-mark"/></svg>`;
const BREAK_SVG = `<svg viewBox="0 0 40 40" width="44" height="44"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="2.5" class="flash-check-circle"/><path d="M20,12 L20,20 L26,26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="flash-check-mark"/></svg>`;

function showFlash(text, isFocusFlash) {
  dom.flashIconWrap.innerHTML = isFocusFlash ? FOCUS_SVG : BREAK_SVG;
  dom.flashText.textContent = text;
  dom.sessionFlash.removeAttribute('hidden');
  requestAnimationFrame(() => dom.sessionFlash.classList.add('visible'));
}
function hideFlash() {
  dom.sessionFlash.classList.remove('visible');
  setTimeout(() => dom.sessionFlash.setAttribute('hidden', ''), 350);
}

/* Intention modal & Tags */
function updateTagsFromChips() {
  if (!dom.intentionRecentTags || !dom.intentionTagsInput) return;
  const selectedChips = Array.from(dom.intentionRecentTags.querySelectorAll('.tag-chip.selected'))
    .map(chip => chip.textContent.replace(/^#/, ''));
  
  const typedTags = dom.intentionTagsInput.value.split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').trim().toLowerCase())
    .filter(t => t && !selectedChips.includes(t));
  
  dom.intentionTagsInput.value = [...selectedChips, ...typedTags].join(', ');
}

function populateRecentTags() {
  if (!dom.intentionRecentTags) return;
  dom.intentionRecentTags.innerHTML = '';
  
  const allTags = new Set();
  
  history.forEach(item => {
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(tag => {
        if (tag) allTags.add(tag.replace(/^#/, '').trim().toLowerCase());
      });
    }
  });
  
  try {
    const allHistory = JSON.parse(localStorage.getItem('zenclox_all_history_v1')) || [];
    allHistory.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          if (tag) allTags.add(tag.replace(/^#/, '').trim().toLowerCase());
        });
      }
    });
  } catch (e) {}

  const tagArray = Array.from(allTags).slice(0, 5);
  if (tagArray.length === 0) {
    tagArray.push('coding', 'study', 'work');
  }
  
  tagArray.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag-chip';
    span.textContent = `#${tag}`;
    span.addEventListener('click', () => {
      span.classList.toggle('selected');
      updateTagsFromChips();
    });
    dom.intentionRecentTags.appendChild(span);
  });
}

function showIntentionModal() {
  dom.intentionInput.value = '';
  if (dom.intentionTagsInput) {
    dom.intentionTagsInput.value = '';
  }
  populateRecentTags();
  dom.intentionOverlay.hidden = false;
  setTimeout(() => dom.intentionInput.focus(), 50);
}
function hideIntentionModal() { dom.intentionOverlay.hidden = true; }
function submitIntention(val) {
  currentIntention = val.trim();
  
  const tagsInputVal = dom.intentionTagsInput ? dom.intentionTagsInput.value.trim() : '';
  const inputTags = tagsInputVal ? tagsInputVal.split(/[\s,]+/)
    .map(t => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean) : [];
  
  const textTags = extractTags(currentIntention);
  const allTagsSet = new Set([...inputTags, ...textTags]);
  currentTags = Array.from(allTagsSet).map(t => `#${t}`);
  
  hideIntentionModal();
  if (breathToggleEnabled) {
    startBreathingMode();
  } else {
    startTimer();
  }
}

/* Reflection modal */
function showReflectionModal() {
  if (currentIntention) {
    dom.reflGoal.textContent = `"${currentIntention}"`;
    dom.reflGoal.hidden = false;
  } else {
    dom.reflGoal.hidden = true;
  }
  dom.reflOverlay.hidden = false;
}
function hideReflectionModal() { dom.reflOverlay.hidden = true; }
function submitReflection(outcome) {
  if (history.length > 0 && history[0].outcome === undefined) {
    history[0].outcome = outcome;
    history[0].velocity = calculateFlowVelocity(history[0].duration, history[0].interrupts, history[0].drifts, outcome);
    saveHistory(); renderHistory();
    updateDailyVelocity();
    renderAnalytics();
  }
  hideReflectionModal();
  proceedToBreak();
}

function proceedToBreak() {
  sessionNum++;
  setMode(false);
  startTimer();
}

/* Interruption */
function logInterruption() {
  interruptions++;
  dom.interruptCount.textContent = interruptions;
  dom.interruptCount.hidden = false;
  dom.interruptBtn.animate(
    [{ transform:'scale(1)' }, { transform:'scale(1.12)', background:'rgba(239,68,68,0.2)' }, { transform:'scale(1)' }],
    { duration: 200, easing: 'ease-out' }
  );
}

/* Cycle end */
function onCycleEnd() {
  updateFilterMode();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  dom.modeDot.classList.remove('pulsing');
  dom.interruptionRow.hidden = true;
  dom.iconPlay.style.display = ''; dom.iconPause.style.display = 'none';
  dom.startBtn.setAttribute('aria-label', 'Start timer');

  if (isFocus) {
    playFocusComplete();
    addHistoryEntry(focusMins * 60);
    updateStreak(); updateHeatmap(); updateVelocity();
    showFlash('Focus session complete!', true);
    sendNotif('Focus complete!', 'Great work — ready for a break?');
    setTimeout(() => {
      hideFlash();
      if (currentIntention) { showReflectionModal(); }
      else { proceedToBreak(); }
    }, 1800);
  } else {
    playBreakComplete();
    showFlash('Break over — back to work!', false);
    sendNotif('Break over!', 'Ready to focus again?');
    setTimeout(() => {
      hideFlash();
      setMode(true);
      showIntentionModal();
    }, 1800);
  }
}

function skipToNext() {
  if (isBreathing) {
    cancelBreathingMode();
  }
  pauseTimer();
  setMode(!isFocus);
}

/* ============================================================
 * HISTORY
 * ============================================================ */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadHistory() {
  const saved = localStorage.getItem(TODAY_KEY), today = todayStr();
  if (saved !== today) {
    localStorage.setItem(TODAY_KEY, today);
    localStorage.setItem(STORAGE_KEY, '[]');
    history = [];
  } else {
    try { history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(_) { history = []; }
  }
  renderHistory();
  renderAnalytics();
}

function saveHistory() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch(_) {} }

function addHistoryEntry(durSecs) {
  const now = new Date();
  const h = now.getHours(), m = String(now.getMinutes()).padStart(2,'0');
  const ampm = h >= 12 ? 'pm' : 'am', h12 = h % 12 || 12;
  
  const tags = (currentTags && currentTags.length > 0) ? currentTags : extractTags(currentIntention);
  const initialVelocity = currentIntention ? 100 : calculateFlowVelocity(durSecs, interruptions, driftsCount, 'none');
  
  history.unshift({ 
    duration: durSecs, 
    time: `${h12}:${m}${ampm}`, 
    interrupts: interruptions, 
    drifts: driftsCount,
    intention: currentIntention, 
    outcome: currentIntention ? undefined : 'none', 
    velocity: initialVelocity,
    tags,
    sessionNum 
  });
  saveHistory(); renderHistory();
  if (window.ZenBgSystem && window.ZenBgSystem.addCompletedSessionStar) {
    window.ZenBgSystem.addCompletedSessionStar();
  }
  updateDailyVelocity();
  renderAnalytics();
}

function qualityPct(entry) {
  if (entry.interrupts === 0) return 100;
  return Math.round((1 - Math.min(entry.interrupts * 60, entry.duration * 0.5) / entry.duration) * 100);
}

function renderHistory() {
  Array.from(dom.historyList.children).forEach(li => { if (li !== dom.historyEmpty) li.remove(); });
  const count = history.length;
  dom.historyCount.textContent = count === 1 ? '1 session' : `${count} sessions`;
  if (count === 0) { dom.historyEmpty.style.display = ''; return; }
  dom.historyEmpty.style.display = 'none';

  history.forEach(e => {
    const mins = Math.floor(e.duration/60), secs = String(e.duration%60).padStart(2,'0');
    const q = qualityPct(e);
    const qClass = q >= 90 ? '' : q >= 70 ? 'medium' : 'low';
    const oc = e.outcome === 'yes' ? 'outcome-yes' : e.outcome === 'partial' ? 'outcome-partial' : e.outcome === 'no' ? 'outcome-no' : 'outcome-none';
    const li = document.createElement('li');
    li.className = 'history-item';
    li.setAttribute('aria-label', `${mins}:${secs} focus at ${e.time}`);
    
    // Strip tags from visible intention for clean reading, and render tags separately
    let cleanIntention = e.intention || '';
    let tagBadges = '';
    if (e.tags && e.tags.length > 0) {
      e.tags.forEach(tag => {
        tagBadges += `<span class="item-tag">${esc(tag)}</span>`;
        cleanIntention = cleanIntention.replace(new RegExp(tag, 'gi'), '').trim();
      });
      cleanIntention = cleanIntention.replace(/\s+/g, ' ');
    }
    
    li.innerHTML = `
      <span class="item-outcome-dot ${oc}" title="${e.outcome || 'no reflection'}"></span>
      <span class="item-info">
        <span class="item-row">
          <span class="item-duration">${mins}:${secs}</span>
          <span class="item-label">focus</span>
          ${q < 100 ? `<span class="item-quality ${qClass}">${q}% clean</span>` : ''}
        </span>
        ${cleanIntention ? `<span class="item-goal">${esc(cleanIntention)}</span>` : ''}
        ${tagBadges ? `<div class="item-tags-row">${tagBadges}</div>` : ''}
      </span>
      <span class="item-meta">
        ${e.drifts > 0 ? `<span class="item-drifts" title="${e.drifts} tab drifts">💤 ${e.drifts}</span>` : ''}
        ${e.interrupts > 0 ? `<span class="item-interrupts">⚡ ${e.interrupts}</span>` : ''}
        <span class="item-velocity" title="Flow velocity: ${e.velocity || 100}%">${e.velocity || 100} v</span>
        <span class="item-time">${e.time}</span>
      </span>`;
    dom.historyList.appendChild(li);
  });
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function exportCSV() {
  const rows = [['Session','Duration','Time','Intention','Outcome','Interrupts','Quality']];
  history.forEach((e, i) => {
    const mins = Math.floor(e.duration/60), secs = String(e.duration%60).padStart(2,'0');
    rows.push([i+1, `${mins}:${secs}`, e.time, e.intention||'', e.outcome||'', e.interrupts, `${qualityPct(e)}%`]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type:'text/csv' })), download: `zenclox-${todayStr()}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ============================================================
 * HEATMAP
 * ============================================================ */
function getHeatmap() { try { return JSON.parse(localStorage.getItem(HEATMAP_KEY)) || {}; } catch(_) { return {}; } }
function saveHeatmap(d) { try { localStorage.setItem(HEATMAP_KEY, JSON.stringify(d)); } catch(_) {} }

function updateHeatmap() {
  const d = getHeatmap(), t = todayStr();
  d[t] = (d[t] || 0) + 1;
  saveHeatmap(d); renderHeatmap();
}

function renderHeatmap() {
  const d = getHeatmap(), now = new Date();
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dom.heatmapGrid.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(now); dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const cnt = d[key] || 0;
    const lvl = cnt === 0 ? 0 : cnt === 1 ? 1 : cnt <= 3 ? 2 : cnt <= 5 ? 3 : 4;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell' + (i === 0 ? ' heatmap-today' : '');
    cell.setAttribute('data-level', lvl);
    cell.setAttribute('title', `${DAYS[dt.getDay()]}: ${cnt} session${cnt!==1?'s':''}`);
    cell.innerHTML = `<span class="heatmap-cell-day">${DAYS[dt.getDay()]}</span><span class="heatmap-cell-count">${cnt || '·'}</span>`;
    dom.heatmapGrid.appendChild(cell);
  }
}

/* ============================================================
 * STREAK & BADGES
 * ============================================================ */
function getStreak() { try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { lastDate:null, count:0, longest:0 }; } catch(_) { return { lastDate:null, count:0, longest:0 }; } }

function updateStreak() {
  const s = getStreak(), today = todayStr();
  if (s.lastDate !== today) {
    const yd = new Date(); yd.setDate(yd.getDate()-1);
    const yds = `${yd.getFullYear()}-${String(yd.getMonth()+1).padStart(2,'0')}-${String(yd.getDate()).padStart(2,'0')}`;
    s.count = s.lastDate === yds ? s.count + 1 : 1;
    s.lastDate = today; s.longest = Math.max(s.longest, s.count);
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch(_) {}
  }
  renderStreakUI(s.count);
  checkMilestones(s.count);
}

function renderStreakUI(count) {
  if (count >= 2) {
    dom.streakBadge.hidden = false;
    dom.streakCount.textContent = count;
  }
}

function checkMilestones(count) {
  const unlocked = JSON.parse(localStorage.getItem(BADGES_KEY) || '[]');
  const m = MILESTONES.find(x => x.days === count && !unlocked.includes(x.days));
  if (!m) return;
  unlocked.push(m.days);
  try { localStorage.setItem(BADGES_KEY, JSON.stringify(unlocked)); } catch(_) {}
  showBadgeToast(m.icon, m.name);
}

function showBadgeToast(icon, name) {
  dom.badgeToastIcon.textContent = icon;
  dom.badgeToastName.textContent = name;
  dom.badgeToast.hidden = false;
  clearTimeout(dom.badgeToast._t);
  dom.badgeToast._t = setTimeout(hideBadgeToast, 5500);
}
function hideBadgeToast() { dom.badgeToast.hidden = true; }

/* ============================================================
 * VELOCITY
 * ============================================================ */
function updateVelocity() {
  const data = getHeatmap(), today = todayStr();
  const todayCount = data[today] || 0;
  const past = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    past.push(data[k] || 0);
  }
  const avg  = past.reduce((a,b)=>a+b,0) / past.length;
  const best = Math.max(...past, 0);
  let txt = '', fire = false;
  if (todayCount === 0) {
    txt = IDLE_MSGS[Math.floor(Math.random()*IDLE_MSGS.length)];
  } else if (todayCount > best && best > 0) {
    txt = `🏆 New personal best! ${todayCount} sessions today`; fire = true;
  } else if (avg > 0 && todayCount >= Math.round(avg)) {
    txt = `🔥 On pace — ${todayCount} session${todayCount!==1?'s':''} today`; fire = true;
  } else {
    txt = `${todayCount} session${todayCount!==1?'s':''} today${avg>0?' · avg '+avg.toFixed(1)+'/day':''}`;
  }
  dom.velocityScore.textContent = txt;
  dom.velocityScore.classList.toggle('fire', fire);
}

/* ============================================================
 * NOTIFICATIONS
 * ============================================================ */
function updateNotifBtn() {
  const p = Notification.permission;
  dom.notifBtn.className = 'notif-btn' + (p==='granted'?' granted':p==='denied'?' denied':'');
  dom.notifText.textContent = p==='granted' ? '✓ Notifications enabled' : p==='denied' ? 'Notifications blocked' : 'Enable Notifications';
  dom.notifBtn.disabled = p !== 'default';
}

async function requestNotif() {
  if (Notification.permission === 'default') { await Notification.requestPermission(); updateNotifBtn(); }
}

function sendNotif(title, body) {
  if (Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon:'favicon.png', tag:'zenclox', renotify:true }); } catch(_) {}
}

/* ============================================================
 * SETTINGS, PRESETS, STEPPERS
 * ============================================================ */
function initPresets() {
  const chips = document.querySelectorAll('.presets .preset-chip');
  function markActive(f, b) { chips.forEach(c => c.classList.toggle('active', +c.dataset.focus===f && +c.dataset.break===b)); }
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const f = +chip.dataset.focus, b = +chip.dataset.break;
      if (isNaN(f) || isNaN(b)) return;
      dom.focusVal.textContent = f; dom.breakVal.textContent = b;
      if (isRunning) pauseTimer();
      focusMins = f; breakMins = b;
      setMode(isFocus); markActive(f, b);
    });
  });
  markActive(focusMins, breakMins);
  dom.applyBtn.addEventListener('click', () => {
    const f = +dom.focusVal.textContent, b = +dom.breakVal.textContent;
    if (f<1||f>180||b<1||b>60) return;
    if (isRunning) pauseTimer();
    focusMins = f; breakMins = b;
    setMode(isFocus);
    document.querySelectorAll('.presets .preset-chip').forEach(c => c.classList.toggle('active', +c.dataset.focus===f && +c.dataset.break===b));
    dom.settingsPanel.hidden = true;
    dom.settingsBtn.setAttribute('aria-expanded','false');
  });
}

function initSteppers() {
  function addHold(btn, valEl, dir, min, max) {
    function step() { const v = +valEl.textContent; const nv = Math.max(min, Math.min(max, v+dir)); if(nv!==v) valEl.textContent = nv; }
    let hold;
    const start = () => { step(); hold = setTimeout(() => { hold = setInterval(step, 80); }, 380); };
    const stop  = () => { clearTimeout(hold); clearInterval(hold); };
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive:true });
    ['mouseup','mouseleave','touchend'].forEach(e => btn.addEventListener(e, stop));
  }
  addHold(dom.focusMinus, dom.focusVal, -1, 1, 180);
  addHold(dom.focusPlus,  dom.focusVal,  1, 1, 180);
  addHold(dom.breakMinus, dom.breakVal, -1, 1, 60);
  addHold(dom.breakPlus,  dom.breakVal,  1, 1, 60);
}

/* ============================================================
 * EVENT LISTENERS
 * ============================================================ */
function initEvents() {
  dom.settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !dom.settingsPanel.hidden;
    dom.settingsPanel.hidden = open;
    dom.settingsBtn.setAttribute('aria-expanded', String(!open));

    if (!open && dom.soundPopover && !dom.soundPopover.hidden) {
      dom.soundPopover.hidden = true;
      dom.soundToggleBtn.classList.remove('active');
    }
  });

  dom.startBtn.addEventListener('click', handleStart);
  dom.resetBtn.addEventListener('click', resetTimer);
  dom.skipBtn.addEventListener('click', skipToNext);
  dom.interruptBtn.addEventListener('click', logInterruption);
  dom.exportBtn.addEventListener('click', exportCSV);
  dom.notifBtn.addEventListener('click', requestNotif);

  dom.intentionSubmit.addEventListener('click', () => submitIntention(dom.intentionInput.value));
  dom.intentionSkip.addEventListener('click', () => { currentIntention=''; currentTags=[]; hideIntentionModal(); if(breathToggleEnabled){startBreathingMode();}else{startTimer();} });
  dom.intentionInput.addEventListener('keydown', e => { if (e.key==='Enter') submitIntention(dom.intentionInput.value); });
  if (dom.intentionTagsInput) {
    dom.intentionTagsInput.addEventListener('keydown', e => { if (e.key==='Enter') submitIntention(dom.intentionInput.value); });
    dom.intentionTagsInput.addEventListener('input', () => {
      const typed = dom.intentionTagsInput.value.split(/[\s,]+/)
        .map(t => t.replace(/^#/, '').trim().toLowerCase());
      if (dom.intentionRecentTags) {
        dom.intentionRecentTags.querySelectorAll('.tag-chip').forEach(chip => {
          const cleanTag = chip.textContent.replace(/^#/, '').toLowerCase();
          chip.classList.toggle('selected', typed.includes(cleanTag));
        });
      }
    });
  }

  dom.reflYes.addEventListener('click', () => submitReflection('yes'));
  dom.reflPartial.addEventListener('click', () => submitReflection('partial'));
  dom.reflNo.addEventListener('click', () => submitReflection('no'));

  dom.badgeToastClose.addEventListener('click', hideBadgeToast);

  // Soundscape mixer events
  dom.soundRain.addEventListener('click', () => startAmbientSound('rain'));
  dom.soundSpace.addEventListener('click', () => startAmbientSound('space'));
  dom.soundFire.addEventListener('click', () => startAmbientSound('fire'));
  dom.soundBinaural.addEventListener('click', () => startAmbientSound('binaural'));

  // Sound Popover Mixer Toggle
  if (dom.soundToggleBtn && dom.soundPopover) {
    dom.soundToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !dom.soundPopover.hidden;
      dom.soundPopover.hidden = open;
      dom.soundToggleBtn.classList.toggle('active', !open);
      
      if (!dom.settingsPanel.hidden) {
        dom.settingsPanel.hidden = true;
        dom.settingsBtn.setAttribute('aria-expanded', 'false');
      }
    });
    
    document.addEventListener('click', (e) => {
      if (!dom.soundPopover.hidden) {
        // Only close if click is outside both popover and the toggle button
        if (!dom.soundPopover.contains(e.target) && !dom.soundToggleBtn.contains(e.target)) {
          dom.soundPopover.hidden = true;
          dom.soundToggleBtn.classList.remove('active');
        }
      }
      if (!dom.settingsPanel.hidden) {
        // Only close if click is outside both settings panel and settings button
        if (!dom.settingsPanel.contains(e.target) && !dom.settingsBtn.contains(e.target)) {
          dom.settingsPanel.hidden = true;
          dom.settingsBtn.setAttribute('aria-expanded', 'false');
        }
      }
    });
  } else {
    document.addEventListener('click', (e) => {
      if (!dom.settingsPanel.hidden) {
        if (!dom.settingsPanel.contains(e.target) && !dom.settingsBtn.contains(e.target)) {
          dom.settingsPanel.hidden = true;
          dom.settingsBtn.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }

  // Popover mixer tracks toggle
  ['rain', 'space', 'fire', 'binaural'].forEach(type => {
    const popBtn = $(`popover-sound-${type}`);
    if (popBtn) {
      popBtn.addEventListener('click', () => startAmbientSound(type));
    }
    
    const popSlider = $(`popover-slider-${type}`);
    const settingsSlider = $(`slider-${type}`);
    if (popSlider && settingsSlider) {
      popSlider.addEventListener('input', () => {
        settingsSlider.value = popSlider.value;
        if (!activeSounds[type]) {
          startAmbientSound(type);
        } else {
          updateAmbientVolume();
        }
      });
      popSlider.addEventListener('change', saveSoundPref);
      
      settingsSlider.addEventListener('input', () => {
        popSlider.value = settingsSlider.value;
      });
    }
  });

  // Popover master volume sync
  if (dom.popoverVolumeSlider) {
    dom.popoverVolumeSlider.addEventListener('input', () => {
      dom.volumeSlider.value = dom.popoverVolumeSlider.value;
      updateAmbientVolume();
    });
    dom.popoverVolumeSlider.addEventListener('change', saveSoundPref);
    
    dom.volumeSlider.addEventListener('input', () => {
      dom.popoverVolumeSlider.value = dom.volumeSlider.value;
    });
  }

  ['rain', 'space', 'fire', 'binaural'].forEach(type => {
    const slider = $(`slider-${type}`);
    if (slider) {
      slider.addEventListener('input', () => {
        if (!activeSounds[type]) {
          startAmbientSound(type);
        } else {
          updateAmbientVolume();
        }
      });
      slider.addEventListener('change', saveSoundPref);
    }
  });

  dom.volumeSlider.addEventListener('input', updateAmbientVolume);
  dom.volumeSlider.addEventListener('change', saveSoundPref);

  dom.breathToggle.addEventListener('change', () => {
    breathToggleEnabled = dom.breathToggle.checked;
    localStorage.setItem('zenclox_breath_toggle_v1', breathToggleEnabled);
  });

  dom.shieldToggleBtn.addEventListener('click', toggleFlowShield);

  dom.analyticsToggleBtn.addEventListener('click', () => {
    currentChartType = currentChartType === 'tags' ? 'velocity' : 'tags';
    dom.analyticsToggleBtn.textContent = currentChartType === 'tags' ? 'Show Velocity' : 'Show Tags';
    renderAnalytics();
  });

  document.querySelectorAll('.theme-dot').forEach(b => b.addEventListener('click', () => {
    applyTheme(b.dataset.theme);
    if (isFlowShield) {
      initShieldCanvas(); // Reset particles color
    }
  }));

  // Ambient presets selector
  const presetContainer = $('sound-presets-container');
  if (presetContainer) {
    presetContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.sound-preset-chip');
      if (!btn) return;
      
      const targets = {
        rain: parseInt(btn.dataset.rain) || 0,
        space: parseInt(btn.dataset.space) || 0,
        fire: parseInt(btn.dataset.fire) || 0,
        binaural: parseInt(btn.dataset.binaural) || 0
      };
      
      Object.keys(targets).forEach(type => {
        const val = targets[type];
        const settingsSlider = $(`slider-${type}`);
        const popoverSlider = $(`popover-slider-${type}`);
        
        if (settingsSlider) settingsSlider.value = val;
        if (popoverSlider) popoverSlider.value = val;
        
        const isPlaying = activeSounds[type];
        if (val > 0 && !isPlaying) {
          startAmbientSound(type);
        } else if (val === 0 && isPlaying) {
          startAmbientSound(type);
        } else if (val > 0 && isPlaying) {
          const synth = type === 'rain' ? rainSynth : type === 'space' ? spaceSynth : type === 'fire' ? fireSynth : binauralSynth;
          if (synth) synth.setVolume(ambientVol(type));
        }
      });
      saveSoundPref();
      updateSoundUI();
    });
  }

  // Social Share & GitHub badge clipboard actions
  const twitterBtn = $('share-twitter-btn');
  const linkedinBtn = $('share-linkedin-btn');
  const badgeInput = $('github-badge-code');
  
  if (twitterBtn) {
    twitterBtn.addEventListener('click', () => {
      const sessions = window.focusHistory || [];
      const count = sessions.length;
      let totalMins = 0;
      let avgVel = 0;
      sessions.forEach(s => {
        totalMins += Math.floor(s.duration / 60);
        avgVel += (s.velocity || 100);
      });
      avgVel = count > 0 ? Math.round(avgVel / count) : 100;
      
      const shareText = encodeURIComponent(`Locked in a deep work block on Zenclox! 🧬\n\n🔥 Total focused time: ${Math.floor(totalMins/60)}h ${totalMins%60}m\n⚡ Average Flow Score: ${avgVel}%\n\nBoost your productivity at zenclox.app #Zenclox #Pomodoro`);
      window.open(`https://twitter.com/intent/tweet?text=${shareText}`, '_blank');
    });
  }
  
  if (linkedinBtn) {
    linkedinBtn.addEventListener('click', () => {
      const shareUrl = encodeURIComponent('https://zenclox.app');
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`, '_blank');
    });
  }
  
  if (badgeInput) {
    badgeInput.addEventListener('click', () => {
      badgeInput.select();
      navigator.clipboard.writeText(badgeInput.value).then(() => {
        const toast = $('badge-copy-toast');
        if (toast) {
          toast.style.opacity = '1';
          setTimeout(() => { toast.style.opacity = '0'; }, 2000);
        }
      }).catch(err => {
        console.warn("Clipboard write failed:", err);
      });
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const modalOpen = !dom.intentionOverlay.hidden || !dom.reflOverlay.hidden;
    if (e.target.tagName === 'INPUT' || modalOpen) return;
    switch(e.code) {
      case 'Space':   e.preventDefault(); handleStart(); break;
      case 'KeyR':    e.preventDefault(); resetTimer(); break;
      case 'KeyS':    e.preventDefault(); skipToNext(); break;
      case 'KeyI':    e.preventDefault(); if(isRunning && isFocus) logInterruption(); break;
      case 'KeyF':    e.preventDefault(); toggleFlowShield(); break;
      case 'Digit1':  e.preventDefault(); document.querySelector('.preset-chip[data-focus="25"]')?.click(); break;
      case 'Digit2':  e.preventDefault(); document.querySelector('.preset-chip[data-focus="50"]')?.click(); break;
      case 'Digit3':  e.preventDefault(); document.querySelector('.preset-chip[data-focus="90"]')?.click(); break;
      case 'Escape':
        let exitedAny = false;
        if (!dom.settingsPanel.hidden) {
          dom.settingsPanel.hidden = true;
          dom.settingsBtn.setAttribute('aria-expanded', 'false');
          dom.settingsBtn.focus();
          exitedAny = true;
        }
        if (dom.soundPopover && !dom.soundPopover.hidden) {
          dom.soundPopover.hidden = true;
          dom.soundToggleBtn.classList.remove('active');
          exitedAny = true;
        }
        if (isFlowShield) {
          toggleFlowShield();
          exitedAny = true;
        }
        if (document.body.classList.contains('zen-mode-active')) {
          const zenToggleBtn = $('zen-toggle-btn');
          if (zenToggleBtn) {
            zenToggleBtn.click();
          }
          exitedAny = true;
        }
        if (isBreathing) {
          cancelBreathingMode();
          exitedAny = true;
        }
        if (exitedAny) {
          e.preventDefault();
        }
        break;
    }
  });

  // Focus Back Button click listener
  const focusBackBtn = $('focus-back-btn');
  if (focusBackBtn) {
    focusBackBtn.addEventListener('click', () => {
      if (isFlowShield) {
        toggleFlowShield();
      }
      if (document.body.classList.contains('zen-mode-active')) {
        const zenToggleBtn = $('zen-toggle-btn');
        if (zenToggleBtn) {
          zenToggleBtn.click();
        }
      }
      if (isBreathing) {
        cancelBreathingMode();
      }
    });
  }
}

/* ============================================================
 * SERVICE WORKER
 * ============================================================ */
function initSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ============================================================
 * INIT
 * ============================================================ */
function init() {
  // Theme
  applyTheme('void');

  initFavicon();
  loadHistory();
  renderHeatmap();
  updateVelocity();

  // Streak UI (read existing)
  const s = getStreak();
  if (s.count >= 2) { dom.streakBadge.hidden = false; dom.streakCount.textContent = s.count; }

  // Load breath toggle preference
  breathToggleEnabled = localStorage.getItem('zenclox_breath_toggle_v1') === 'true';
  dom.breathToggle.checked = breathToggleEnabled;

  loadSoundPref();
  updateNotifBtn();
  initPresets();
  initSteppers();
  initEvents();
  initDriftTracking();
  initSW();

  // Restore state from refresh
  const shouldResume = restoreTimerState();

  // Sync UI to restored/default state
  document.body.classList.toggle('mode-break', !isFocus);
  dom.modeLabel.textContent = isFocus ? 'Focus' : 'Break';
  dom.focusVal.textContent  = focusMins;
  dom.breakVal.textContent  = breakMins;
  document.querySelectorAll('.presets .preset-chip').forEach(c => c.classList.toggle('active', +c.dataset.focus===focusMins && +c.dataset.break===breakMins));

  updateDisplay();

  if (shouldResume) {
    dom.timerSub.textContent = 'Resuming session…';
    setTimeout(() => startTimer(), 300);
  } else {
    dom.timerSub.textContent = isFocus ? 'Ready to focus' : 'Take a break';
  }
}

init();
