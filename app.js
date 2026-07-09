'use strict';

// Safe localStorage proxy for Private Browsing support
const localStorage = (() => {
  try {
    window.localStorage.setItem('__test_storage_active__', '1');
    window.localStorage.removeItem('__test_storage_active__');
    return window.localStorage;
  } catch (e) {
    console.warn("localStorage is blocked or unavailable. Falling back to in-memory storage.");
    const memStore = {};
    return {
      getItem: (k) => memStore[k] || null,
      setItem: (k, v) => { memStore[k] = String(v); },
      removeItem: (k) => { delete memStore[k]; },
      clear: () => { for (const k in memStore) delete memStore[k]; }
    };
  }
})();


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
let fadingSynths = { rain: null, space: null, fire: null, binaural: null };
let audioCtx = null;
let mainFilterNode = null;

let wakeLock = null;
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } catch (err) {
      console.warn(`Wake Lock request failed: ${err.name}, ${err.message}`);
    }
  }
}
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
    }).catch(err => {
      console.warn(`Wake Lock release failed: ${err.name}, ${err.message}`);
    });
  }
}

// Expose internal state variables to window for other scripts (e.g. features.js)
Object.defineProperty(window, 'isFocus', { get: () => isFocus, set: (v) => { isFocus = v; } });
Object.defineProperty(window, 'isRunning', { get: () => isRunning, set: (v) => { isRunning = v; } });
Object.defineProperty(window, 'totalSecs', { get: () => totalSecs, set: (v) => { totalSecs = v; } });
Object.defineProperty(window, 'remaining', { get: () => remaining, set: (v) => { remaining = v; } });
Object.defineProperty(window, 'focusHistory', { get: () => history, set: (v) => { history = v; } });
Object.defineProperty(window, 'activeSounds', { get: () => activeSounds, set: (v) => { activeSounds = v; } });
Object.defineProperty(window, 'currentTags', { get: () => currentTags, set: (v) => { currentTags = v; } });
Object.defineProperty(window, 'focusMins', { get: () => focusMins, set: (v) => { focusMins = v; } });
Object.defineProperty(window, 'breakMins', { get: () => breakMins, set: (v) => { breakMins = v; } });


// New upgrades state
let isBreathing = false;
let breathingInterval = null;
let breathingCycleSeconds = 0;
let breathToggleEnabled = false;
// BUG-H02 FIX: Module-scope references for breathing audio so cancelBreathingMode can stop them
let _breathOsc = null;
let _breathGain = null;

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

// BUG-C01 FIX: Guard flag to prevent double onCycleEnd from visibility+interval race
let _cycleEndFired = false;

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
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(err => {
      console.warn("AudioContext resume failed (user interaction required):", err);
    });
  }
  return audioCtx;
}
// BUG-C03 FIX: Export getCtx to window for features.js access
window.getCtx = getCtx;

// BUG-M18 FIX: Unified robust HTML escaping utility
function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.esc = esc;

function updateFilterMode() {
  if (!audioCtx || !mainFilterNode) return;
  // BUG-M02 FIX: Skip filter updates if no sounds are active and we are paused
  const hasActiveSounds = Object.values(activeSounds).some(Boolean);
  if (!hasActiveSounds && !isRunning) return;
  
  // BUG-H03 FIX: Changed from 350Hz to 1200Hz — less aggressive muffle that still signals "paused" without making sounds inaudible
  const targetFreq = isRunning ? 20000 : 1200;
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
  setTimeout(() => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch(_) {}
  }, (dur + 0.1) * 1000);
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
    stop(instant = false) {
      if (instant) {
        try {
          noise.stop();
          lfo.stop();
          noise.disconnect();
          lfo.disconnect();
          lfoG.disconnect();
          bp.disconnect();
          hp.disconnect();
          ls.disconnect();
          master.disconnect();
        } catch(_) {}
      } else {
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
        setTimeout(() => {
          try {
            noise.stop();
            lfo.stop();
            noise.disconnect();
            lfo.disconnect();
            lfoG.disconnect();
            bp.disconnect();
            hp.disconnect();
            ls.disconnect();
            master.disconnect();
          } catch(_) {}
        }, 2200);
      }
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
    oscs.push({ osc, pl, al, og, pg, ag });
  });
  master.connect(mainFilterNode || ctx.destination);

  return {
    setVolume(v) { master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.5); },
    stop(instant = false) {
      if (instant) {
        oscs.forEach(({ osc, pl, al, og, pg, ag }) => {
          try {
            osc.stop(); pl.stop(); al.stop();
            osc.disconnect(); pl.disconnect(); al.disconnect();
            og.disconnect(); pg.disconnect(); ag.disconnect();
          } catch(_) {}
        });
        try {
          delay.disconnect();
          fb.disconnect();
          dlpf.disconnect();
          master.disconnect();
        } catch(_) {}
      } else {
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 4);
        setTimeout(() => {
          oscs.forEach(({ osc, pl, al, og, pg, ag }) => {
            try {
              osc.stop(); pl.stop(); al.stop();
              osc.disconnect(); pl.disconnect(); al.disconnect();
              og.disconnect(); pg.disconnect(); ag.disconnect();
            } catch(_) {}
          });
          try {
            delay.disconnect();
            fb.disconnect();
            dlpf.disconnect();
            master.disconnect();
          } catch(_) {}
        }, 4500);
      }
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
    stop(instant = false) {
      if (crackleTimeout) { clearTimeout(crackleTimeout); crackleTimeout = null; }
      if (instant) {
        try {
          rumbleSource.stop(); rumbleLFO.stop();
          rumbleSource.disconnect();
          rumbleFilter.disconnect();
          rumbleGain.disconnect();
          rumbleLFO.disconnect();
          rumbleLFOGain.disconnect();
          bp.disconnect();
          master.disconnect();
        } catch(_) {}
      } else {
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
        setTimeout(() => {
          try {
            rumbleSource.stop(); rumbleLFO.stop();
            rumbleSource.disconnect();
            rumbleFilter.disconnect();
            rumbleGain.disconnect();
            rumbleLFO.disconnect();
            rumbleLFOGain.disconnect();
            bp.disconnect();
            master.disconnect();
          } catch(_) {}
        }, 2200);
      }
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
    stop(instant = false) {
      if (instant) {
        try {
          oscL.stop(); oscR.stop(); oscSub.stop(); noise.stop();
          oscL.disconnect(); oscR.disconnect(); oscSub.disconnect(); noise.disconnect();
          if (panL) panL.disconnect();
          gainL.disconnect();
          if (panR) panR.disconnect();
          gainR.disconnect();
          gainSub.disconnect();
          noiseFilter.disconnect();
          noiseGain.disconnect();
          master.disconnect();
        } catch(_) {}
      } else {
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
        setTimeout(() => {
          try {
            oscL.stop(); oscR.stop(); oscSub.stop(); noise.stop();
            oscL.disconnect(); oscR.disconnect(); oscSub.disconnect(); noise.disconnect();
            if (panL) panL.disconnect();
            gainL.disconnect();
            if (panR) panR.disconnect();
            gainR.disconnect();
            gainSub.disconnect();
            noiseFilter.disconnect();
            noiseGain.disconnect();
            master.disconnect();
          } catch(_) {}
        }, 2200);
      }
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
      // BUG-024: JS fallback for :has() — toggle active class on parent mixer-row
      const row = btn.closest('.mixer-row');
      if (row) row.classList.toggle('mixer-row-active', isPlaying);
    }
    if (popoverBtn) {
      popoverBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      popoverBtn.classList.toggle('sound-playing', isPlaying);
      const popRow = popoverBtn.closest('.popover-row');
      if (popRow) popRow.classList.toggle('mixer-row-active', isPlaying);
    }
  });
}

function startAmbientSound(type) {
  const ctx = getCtx();
  if (activeSounds[type]) {
    activeSounds[type] = false;
    if (type === 'rain') { if (rainSynth) { rainSynth.stop(); fadingSynths.rain = rainSynth; rainSynth = null; } }
    if (type === 'space') { if (spaceSynth) { spaceSynth.stop(); fadingSynths.space = spaceSynth; spaceSynth = null; } }
    if (type === 'fire') { if (fireSynth) { fireSynth.stop(); fadingSynths.fire = fireSynth; fireSynth = null; } }
    if (type === 'binaural') { if (binauralSynth) { binauralSynth.stop(); fadingSynths.binaural = binauralSynth; binauralSynth = null; } }
  } else {
    activeSounds[type] = true;
    const v = ambientVol(type);
    if (type === 'rain') {
      if (fadingSynths.rain) { fadingSynths.rain.stop(true); fadingSynths.rain = null; }
      rainSynth = createRainSynth(ctx, v);
    }
    if (type === 'space') {
      if (fadingSynths.space) { fadingSynths.space.stop(true); fadingSynths.space = null; }
      spaceSynth = createSpaceSynth(ctx, v);
    }
    if (type === 'fire') {
      if (fadingSynths.fire) { fadingSynths.fire.stop(true); fadingSynths.fire = null; }
      fireSynth = createFireplaceSynth(ctx, v);
    }
    if (type === 'binaural') {
      if (fadingSynths.binaural) { fadingSynths.binaural.stop(true); fadingSynths.binaural = null; }
      binauralSynth = createBinauralSynth(ctx, isFocus ? 15 : 8, v);
    }
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
      if (type === 'binaural') {
        // BUG-M04 FIX: Recreate binaural beat frequency when mode changes (15 for focus, 8 for break)
        const targetFreq = isFocus ? 15 : 8;
        if (!binauralSynth) {
          binauralSynth = createBinauralSynth(ctx, targetFreq, v);
        } else {
          binauralSynth.stop(true);
          binauralSynth = createBinauralSynth(ctx, targetFreq, v);
        }
      }
    }
  });
  updateSoundUI();
}

function stopAllAmbient() {
  if (rainSynth) { rainSynth.stop(); fadingSynths.rain = rainSynth; rainSynth = null; }
  if (spaceSynth) { spaceSynth.stop(); fadingSynths.space = spaceSynth; spaceSynth = null; }
  if (fireSynth) { fireSynth.stop(); fadingSynths.fire = fireSynth; fireSynth = null; }
  if (binauralSynth) { binauralSynth.stop(); fadingSynths.binaural = binauralSynth; binauralSynth = null; }
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
  // BUG-C02 FIX: Add null guards before accessing slider.value
  const volumes = {};
  ['rain', 'space', 'fire', 'binaural'].forEach(t => {
    const el = $(`slider-${t}`);
    volumes[t] = el ? el.value : '40';
  });
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify({
      activeSounds,
      soundVolumes: volumes,
      masterVolume: dom.volumeSlider ? dom.volumeSlider.value : '50'
    }));
  } catch(_) {}
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
  } catch(e) {
    // BUG-M20 FIX: log warning and clear corrupted sound preferences key
    console.warn("Failed to load sound preferences (potential corruption):", e);
    try { localStorage.removeItem(SOUND_KEY); } catch(_) {}
  }
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
  dom.timerDisplay.textContent = '01:04';
  requestWakeLock();
  
  const breathSteps = [
    { text: 'Breathe In', duration: 4 },
    { text: 'Hold (Full)', duration: 4 },
    { text: 'Breathe Out', duration: 4 },
    { text: 'Hold (Empty)', duration: 4 }
  ];
  
  const breathStartTime = Date.now();
  const breathDuration = 64; // 4 cycles
  
  // BUG-H02 FIX: Use module-scope _breathOsc/_breathGain so cancelBreathingMode can stop them
  _breathOsc = null;
  _breathGain = null;
  try {
    const ctx = getCtx();
    _breathOsc = ctx.createOscillator();
    _breathGain = ctx.createGain();
    _breathOsc.type = 'sine';
    _breathOsc.frequency.value = 110; // Low grounding frequency
    _breathGain.gain.value = 0;
    _breathOsc.connect(_breathGain);
    _breathGain.connect(ctx.destination);
    _breathOsc.start();
  } catch(e) {}
  
  function tickBreathing() {
    if (!isBreathing) {
      cleanUpBreathing();
      return;
    }
    
    const elapsed = Math.floor((Date.now() - breathStartTime) / 1000);
    const remainingBreathSeconds = Math.max(0, breathDuration - elapsed);
    
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
    // BUG-H01 FIX: Use fmt() for proper MM:SS display instead of raw seconds
    dom.timerDisplay.textContent = fmt(remainingBreathSeconds);
    
    // Auditory breath sweeps
    if (_breathOsc && _breathGain) {
      const now = audioCtx.currentTime;
      if (stepIndex === 0) { // Inhale
        _breathGain.gain.linearRampToValueAtTime(0.18, now + 0.9);
        _breathOsc.frequency.linearRampToValueAtTime(170, now + 0.9);
        document.body.style.setProperty('--breath-duration', '4s');
      } else if (stepIndex === 1) { // Hold Full
        _breathGain.gain.linearRampToValueAtTime(0.18, now + 0.9);
        _breathOsc.frequency.linearRampToValueAtTime(170, now + 0.9);
      } else if (stepIndex === 2) { // Exhale
        _breathGain.gain.linearRampToValueAtTime(0.01, now + 0.9);
        _breathOsc.frequency.linearRampToValueAtTime(110, now + 0.9);
      } else { // Hold Empty
        _breathGain.gain.linearRampToValueAtTime(0, now + 0.9);
      }
    }
    
    const offset = CIRCUMFERENCE * (1 - remainingBreathSeconds / 64);
    dom.ringProgress.style.strokeDashoffset = offset;
    
    if (remainingBreathSeconds <= 0) {
      cleanUpBreathing();
      isBreathing = false;
      document.body.classList.remove('breath-mode-active');
      dom.modeLabel.textContent = 'Focus';
      const savedIntention = currentIntention;
      const savedTags = [...currentTags];
      setMode(true);
      currentIntention = savedIntention;
      currentTags = savedTags;
      startTimer();
    } else {
      const nextTickDelay = 1000 - ((Date.now() - breathStartTime) % 1000);
      breathingInterval = setTimeout(tickBreathing, nextTickDelay);
    }
  }
  
  function cleanUpBreathing() {
    if (breathingInterval) { clearTimeout(breathingInterval); breathingInterval = null; }
    // BUG-H02 FIX: Clean up module-scope breath oscillator
    if (_breathOsc) {
      try {
        _breathOsc.stop();
        _breathOsc.disconnect();
      } catch(e) {}
      _breathOsc = null;
    }
    if (_breathGain) {
      try { _breathGain.disconnect(); } catch(e) {}
      _breathGain = null;
    }
    document.body.classList.remove('breath-mode-active');
    document.body.style.removeProperty('--breath-duration');
    releaseWakeLock();
  }
  
  tickBreathing();
}

function cancelBreathingMode() {
  if (!isBreathing) return;
  isBreathing = false;
  if (breathingInterval) { clearTimeout(breathingInterval); breathingInterval = null; }
  // BUG-H02 FIX: Stop the breathing oscillator that was previously leaked
  if (_breathOsc) {
    try {
      _breathOsc.stop();
      _breathOsc.disconnect();
    } catch(e) {}
    _breathOsc = null;
  }
  if (_breathGain) {
    try { _breathGain.disconnect(); } catch(e) {}
    _breathGain = null;
  }
  document.body.classList.remove('breath-mode-active');
  document.body.style.removeProperty('--breath-duration');
  releaseWakeLock();
  const savedIntention = currentIntention;
  const savedTags = [...currentTags];
  setMode(true);
  currentIntention = savedIntention;
  currentTags = savedTags;
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
  // BUG-H04/H14 FIX: Clean up existing animation loop and listeners before re-init
  if (shieldAnimId) { cancelAnimationFrame(shieldAnimId); shieldAnimId = null; }
  window.removeEventListener('resize', resizeShieldCanvas);
  if (shieldMouseMoveHandler) {
    window.removeEventListener('mousemove', shieldMouseMoveHandler);
    shieldMouseMoveHandler = null;
  }
  if (shieldMouseLeaveHandler) {
    window.removeEventListener('mouseleave', shieldMouseLeaveHandler);
    shieldMouseLeaveHandler = null;
  }

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
  // BUG-L06 FIX: Clear pending shieldMouseTimeout to avoid background leaks
  if (window.shieldMouseTimeout) {
    clearTimeout(window.shieldMouseTimeout);
    window.shieldMouseTimeout = null;
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
      if (isRunning || isBreathing) {
        requestWakeLock();
      }
      if (isRunning && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        remaining = Math.max(0, startRemaining - elapsed);
        updateDisplay();
        
        // BUG-C01 FIX: Check _cycleEndFired guard to prevent double onCycleEnd
        if (remaining <= 0 && !_cycleEndFired) {
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
  // BUG-L07 FIX/Mitigation: Make sure defs is added cleanly
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
  
  let scoredPoints = points.filter(p => p.hasScore);
  if (scoredPoints.length === 0) {
    // If no history exists, default to flat 0 line instead of leaving blank
    points.forEach(p => {
      p.hasScore = true;
      p.score = 0;
      p.y = 98;
    });
    scoredPoints = points;
  }
  
  if (scoredPoints.length > 0) {
    let areaPathD = '';
    let linePathD = '';
    
    // BUG-M06 FIX: Connect only valid scoredPoints instead of all points
    scoredPoints.forEach((p, idx) => {
      const command = idx === 0 ? 'M' : 'L';
      linePathD += `${command} ${p.x} ${p.y} `;
    });
    
    areaPathD = linePathD + `L ${scoredPoints[scoredPoints.length-1].x} 115 L ${scoredPoints[0].x} 115 Z`;
    
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
  document.querySelectorAll('.theme-dot').forEach(b => {
    const isActive = b.dataset.theme === theme;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/* ============================================================
 * FAVICON (dynamic canvas ring)
 * ============================================================ */
let faviconCanvas, faviconCtx2d;
function initFavicon() {
  faviconCanvas = document.createElement('canvas');
  faviconCanvas.width = faviconCanvas.height = 64;
  faviconCtx2d = faviconCanvas.getContext('2d');
}
function updateFavicon() {
  if (!faviconCtx2d) return;
  const ctx = faviconCtx2d, s = 64, cx = 32, cy = 32, r = 24;
  const progress = remaining / totalSecs;
  const col = getComputedStyle(document.documentElement).getPropertyValue('--active').trim() || '#c084fc';
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 7; ctx.stroke();
  if (progress > 0) {
    ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);
    ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2);
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

function saveTimerState(force = false) {
  const now = Date.now();
  // BUG-M31 FIX: Throttle localStorage writes to at most once per 950ms unless forced
  if (!force && (now - _lastStateSaveTime < 950)) return;
  _lastStateSaveTime = now;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      remaining, totalSecs, isFocus, sessionNum, focusMins, breakMins,
      interruptions, currentIntention, savedAt: now, wasRunning: isRunning,
      driftsCount // BUG-L02 FIX: Save driftsCount in state
    }));
  } catch(_) {}
}
let _lastStateSaveTime = 0;

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
    driftsCount = s.driftsCount || 0; // BUG-L02 FIX: Restore driftsCount in state recovery
    currentIntention = s.currentIntention || '';
    const adj = s.wasRunning ? Math.max(0, s.remaining - Math.floor(age / 1000)) : s.remaining;
    
    // BUG-038 & BUG-033: Handle offline completed focus session recovery
    if (adj <= 0) {
      if (s.isFocus) {
        const durSecs = s.focusMins * 60;
        const completedTime = new Date(s.savedAt + s.remaining * 1000);
        const h = completedTime.getHours(), m = String(completedTime.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'pm' : 'am', h12 = h % 12 || 12;
        const timeStr = `${h12}:${m}${ampm}`;
        
        // BUG-C04 FIX: extractTags already returns tags WITH '#' prefix (e.g. '#coding'),
        // so do NOT wrap again with '#${t}' — just use them directly
        const extractedTags = extractTags(s.currentIntention);
        const initialVelocity = s.currentIntention ? 100 : calculateFlowVelocity(durSecs, s.interruptions, 0, 'none');
        
        const newEntry = {
          duration: durSecs,
          time: timeStr,
          interrupts: s.interruptions,
          drifts: s.driftsCount || 0, // BUG-L02 FIX: Restore recovered drifts
          intention: s.currentIntention,
          outcome: s.currentIntention ? undefined : 'none',
          velocity: initialVelocity,
          tags: extractedTags,
          sessionNum: s.sessionNum
        };
        
        if (!history || history.length === 0) {
          try { history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(_) { history = []; }
        }
        
        // BUG-H12 FIX: Use savedAt timestamp for stronger deduplication across day boundaries
        const duplicate = history.some(item =>
          item.sessionNum === s.sessionNum && item.time === timeStr
        ) || (s.savedAt && history.some(item => item._savedAt === s.savedAt));
        if (!duplicate) {
          newEntry._savedAt = s.savedAt; // Attach for future dedup
          newEntry.date = todayStr();
          history.unshift(newEntry);
          saveHistory();
          renderHistory();
          renderAnalytics();
          try {
            const allHist = JSON.parse(localStorage.getItem('zenclox_all_history_v1')) || [];
            // Dedup by savedAt timestamp which is unique per session
            const existingTimestamps = new Set(allHist.map(h => h._savedAt).filter(Boolean));
            if (!existingTimestamps.has(s.savedAt)) {
              newEntry.mood = 'good';
              allHist.unshift(newEntry);
              try { localStorage.setItem('zenclox_all_history_v1', JSON.stringify(allHist)); } catch(_) {}
            }
          } catch(_) {}
        }
        
        isFocus = false;
        sessionNum = s.sessionNum + 1;
        totalSecs = breakMins * 60;
        remaining = totalSecs;
        interruptions = 0;
        driftsCount = 0;
        currentIntention = '';
        currentTags = [];
        saveTimerState();
      } else {
        isFocus = true;
        totalSecs = focusMins * 60;
        remaining = totalSecs;
        interruptions = 0;
        driftsCount = 0;
        currentIntention = '';
        currentTags = [];
        saveTimerState();
      }
      return false;
    }
    
    remaining = adj;
    dom.focusVal.value = focusMins;
    dom.breakVal.value = breakMins;
    return s.wasRunning;
  } catch(_) { return false; }
}

function startTimer() {
  if (isRunning) return;
  isRunning = true; sessionFresh = false;
  // BUG-C01 FIX: Reset cycle-end guard at the start of every new timer run
  _cycleEndFired = false;
  resumeAmbientIfNeeded();
  updateFilterMode();
  dom.iconPlay.style.display  = 'none';
  dom.iconPause.style.display = '';
  dom.timerDisplay.classList.remove('paused');
  dom.modeDot.classList.add('pulsing');
  dom.startBtn.setAttribute('aria-label', 'Pause timer');
  if (isFocus) dom.interruptionRow.hidden = false;
  requestWakeLock();
  
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
    // BUG-C01 FIX: Guard interval path too — only fire once
    if (remaining <= 0 && !_cycleEndFired) {
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
  saveTimerState(true); // force save
  releaseWakeLock();
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
  // BUG-013/014: Hide stale break suggestion and quote when switching modes
  const bsCard = document.getElementById('break-suggestion-card');
  if (bsCard) bsCard.setAttribute('hidden', '');
  const quoteEl = document.getElementById('quote-display');
  if (quoteEl) quoteEl.style.display = 'none';
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
    span.setAttribute('tabindex', '0');
    span.setAttribute('role', 'button');
    span.addEventListener('click', () => {
      span.classList.toggle('selected');
      updateTagsFromChips();
    });
    span.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        span.click();
      }
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
  // Focus the first button in reflection modal for accessibility
  setTimeout(() => {
    const defaultBtn = document.getElementById('reflect-yes');
    if (defaultBtn) defaultBtn.focus();
  }, 50);
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
  // BUG-C01 FIX: Set guard flag so the second caller (visibility or interval) is blocked
  if (_cycleEndFired) return;
  _cycleEndFired = true;
  updateFilterMode();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  dom.modeDot.classList.remove('pulsing');
  dom.interruptionRow.hidden = true;
  dom.iconPlay.style.display = ''; dom.iconPause.style.display = 'none';
  dom.startBtn.setAttribute('aria-label', 'Start timer');
  releaseWakeLock();

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
// BUG-M17 FIX: Export todayStr to window for features.js
window.todayStr = todayStr;

function loadHistory() {
  const saved = localStorage.getItem(TODAY_KEY), today = todayStr();
  if (saved !== today) {
    // BUG-003: Archive previous day's sessions before wiping
    try {
      const prevSessions = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      if (prevSessions.length > 0) {
        const allHist = JSON.parse(localStorage.getItem('zenclox_all_history_v1')) || [];
        const existingKeys = new Set(allHist.map(h => (h.time || '') + (h.date || '')));
        prevSessions.forEach(s => {
          if (!s.date) s.date = saved || today;
          const key = (s.time || '') + s.date;
          if (!existingKeys.has(key)) allHist.unshift(s);
        });
        localStorage.setItem('zenclox_all_history_v1', JSON.stringify(allHist));
      }
    } catch(_) {}
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
    sessionNum,
    _savedAt: Date.now() // BUG-M30 FIX: Store unique timestamp for robust deduplication
  });
  saveHistory(); renderHistory();
  if (window.ZenBgSystem && window.ZenBgSystem.addCompletedSessionStar) {
    window.ZenBgSystem.addCompletedSessionStar();
  }
  updateDailyVelocity();
  renderAnalytics();
}

function qualityPct(entry) {
  let score = 100;
  score -= (entry.interrupts || 0) * 8;
  score -= (entry.drifts || 0) * 12;
  
  let coef = 1.0;
  if (entry.outcome === 'partial') coef = 0.7;
  else if (entry.outcome === 'no') coef = 0.35;
  else if (entry.outcome === 'none') coef = 0.5;
  
  score = score * coef;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function renderHistory() {
  Array.from(dom.historyList.children).forEach(li => { if (li !== dom.historyEmpty) li.remove(); });
  const count = history.length;
  dom.historyCount.textContent = count === 1 ? '1 session' : `${count} sessions`;
  // BUG-M21 FIX: Use hidden attribute for history empty state
  if (count === 0) { dom.historyEmpty.removeAttribute('hidden'); return; }
  dom.historyEmpty.setAttribute('hidden', '');

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
        // BUG-001.2: Escape tag name characters to prevent RegExp injection syntax crashes
        cleanIntention = cleanIntention.replace(new RegExp(escRegExp(tag), 'gi'), '').trim();
      });
      cleanIntention = cleanIntention.replace(/\s+/g, ' ');
    }
    
    li.innerHTML = `
      <span class="item-outcome-dot ${oc}" title="${esc(e.outcome || 'no reflection')}"></span>
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

function escRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function exportCSV() {
  // BUG-019: Guard against empty export
  if (history.length === 0) { alert('No sessions to export yet.'); return; }
  const rows = [['Session','Duration','Time','Intention','Outcome','Interrupts','Quality']];
  history.forEach((e, i) => {
    const mins = Math.floor(e.duration/60), secs = String(e.duration%60).padStart(2,'0');
    rows.push([i+1, `${mins}:${secs}`, e.time, e.intention||'', e.outcome||'', e.interrupts, `${qualityPct(e)}%`]);
  });
  const csv = rows.map(r => r.map(c => {
    let val = String(c);
    const lines = val.split(/\r?\n|\r/);
    const sanitizedLines = lines.map(line => {
      if (line.startsWith('=') || line.startsWith('+') || line.startsWith('-') || line.startsWith('@') || line.startsWith('\t') || line.startsWith('\r')) {
        return "'" + line;
      }
      return line;
    });
    val = sanitizedLines.join('\n');
    return `"${val.replace(/"/g,'""')}"`;
  }).join(',')).join('\n');
  // BUG-H09 FIX: Append <a> to DOM for cross-browser click() support, and delay revokeObjectURL
  const blobUrl = URL.createObjectURL(new Blob([csv], { type:'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: blobUrl, download: `zenclox-${todayStr()}.csv` });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
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
// BUG-C03 FIX: Export getStreak to window for features.js (WallpaperExport, QuoteOracle)
window.getStreak = getStreak;

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
  // BUG-L03 FIX: Show streak badge for 1+ days, and properly manage singular/plural labels
  if (count >= 1) {
    dom.streakBadge.hidden = false;
    dom.streakCount.textContent = count;
    const label = dom.streakBadge.querySelector('.streak-label');
    if (label) label.textContent = count === 1 ? 'day' : 'days';
  } else {
    dom.streakBadge.hidden = true;
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
  // BUG-M19 FIX: Safely check if Notification is defined
  if (typeof Notification === 'undefined') {
    dom.notifBtn.className = 'notif-btn disabled';
    dom.notifText.textContent = 'Notifications unsupported';
    dom.notifBtn.disabled = true;
    return;
  }
  const p = Notification.permission;
  dom.notifBtn.className = 'notif-btn' + (p==='granted'?' granted':p==='denied'?' denied':'');
  dom.notifText.textContent = p==='granted' ? '✓ Notifications enabled' : p==='denied' ? 'Notifications blocked' : 'Enable Notifications';
  dom.notifBtn.disabled = p !== 'default';
}

async function requestNotif() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') { await Notification.requestPermission(); updateNotifBtn(); }
}

function sendNotif(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
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
      // BUG-L04 FIX: Ignore click if it targets the already active values to prevent pausing running timers
      if (focusMins === f && breakMins === b) return;
      dom.focusVal.value = f; dom.breakVal.value = b;
      if (isBreathing) cancelBreathingMode();
      if (isRunning) pauseTimer();
      focusMins = f; breakMins = b;
      setMode(isFocus); markActive(f, b);
    });
  });
  markActive(focusMins, breakMins);
  dom.applyBtn.addEventListener('click', () => {
    const f = +dom.focusVal.value, b = +dom.breakVal.value;
    if (f<1||f>180||b<1||b>60) return;
    if (isBreathing) cancelBreathingMode();
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
    function step() { const v = +valEl.value; const nv = Math.max(min, Math.min(max, v+dir)); if(nv!==v) valEl.value = nv; }
    // BUG-015: Separate variables for timeout and interval
    let holdTimeout, holdInterval;
    const start = () => { step(); holdTimeout = setTimeout(() => { holdInterval = setInterval(step, 80); }, 380); };
    const stop  = () => { clearTimeout(holdTimeout); clearInterval(holdInterval); holdTimeout = null; holdInterval = null; };
    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive:true });
    ['mouseup','mouseleave','touchend'].forEach(e => btn.addEventListener(e, stop));
  }
  addHold(dom.focusMinus, dom.focusVal, -1, 1, 180);
  addHold(dom.focusPlus,  dom.focusVal,  1, 1, 180);
  addHold(dom.breakMinus, dom.breakVal, -1, 1, 60);
  addHold(dom.breakPlus,  dom.breakVal,  1, 1, 60);

  // Direct manual entry validations
  dom.focusVal.addEventListener('input', () => {
    let v = parseInt(dom.focusVal.value);
    if (isNaN(v)) return;
    if (v > 180) dom.focusVal.value = 180;
    if (v < 1) dom.focusVal.value = 1;
  });
  dom.focusVal.addEventListener('blur', () => {
    let v = parseInt(dom.focusVal.value);
    if (isNaN(v) || v < 1) dom.focusVal.value = 25;
  });

  dom.breakVal.addEventListener('input', () => {
    let v = parseInt(dom.breakVal.value);
    if (isNaN(v)) return;
    if (v > 60) dom.breakVal.value = 60;
    if (v < 1) dom.breakVal.value = 1;
  });
  dom.breakVal.addEventListener('blur', () => {
    let v = parseInt(dom.breakVal.value);
    if (isNaN(v) || v < 1) dom.breakVal.value = 5;
  });
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
      // BUG-M10 FIX: Manage ARIA attributes on sound mixer popover toggle
      dom.soundToggleBtn.setAttribute('aria-expanded', (!open).toString());
      
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
          // BUG-M10 FIX: Set aria-expanded to false on click outside
          dom.soundToggleBtn.setAttribute('aria-expanded', 'false');
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
    // BUG-H14 FIX: initShieldCanvas now internally cleans up before re-init,
    // so duplicate animation loops are prevented
    if (isFlowShield) {
      initShieldCanvas();
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
        const synth = type === 'rain' ? rainSynth : type === 'space' ? spaceSynth : type === 'fire' ? fireSynth : binauralSynth;
        
        // BUG-M16 FIX: Handle preset loading properly if sounds are active in UI but synths are null
        if (val > 0) {
          if (!isPlaying || !synth) {
            activeSounds[type] = false; // Reset to force start
            startAmbientSound(type);
          } else {
            synth.setVolume(ambientVol(type));
          }
        } else if (val === 0 && isPlaying) {
          startAmbientSound(type);
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
      
      // BUG-L16 FIX: Point Twitter share text to active GitHub repository url
      const shareText = encodeURIComponent(`Locked in a deep work block on Zenclox! 🧬\n\n🔥 Total focused time: ${Math.floor(totalMins/60)}h ${totalMins%60}m\n⚡ Average Flow Score: ${avgVel}%\n\nBoost your productivity at https://github.com/mtayyab-10/zenclox-app #Zenclox #Pomodoro`);
      window.open(`https://twitter.com/intent/tweet?text=${shareText}`, '_blank');
    });
  }
  
  if (linkedinBtn) {
    linkedinBtn.addEventListener('click', () => {
      // BUG-L17 FIX: Point LinkedIn share button to active GitHub repository url
      const shareUrl = encodeURIComponent('https://github.com/mtayyab-10/zenclox-app');
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
    const palette = $('command-palette-overlay');
    const aiReport = $('ai-report-overlay');
    const onboarding = $('onboarding-overlay');
    const isPaletteOpen = palette && !palette.hidden;
    const isAiReportOpen = aiReport && !aiReport.hidden;
    // BUG-L14 FIX: Ignore shortcut keys if the onboarding modal overlay is currently visible
    const isOnboardingOpen = onboarding && !onboarding.hasAttribute('hidden');
    const modalOpen = !dom.intentionOverlay.hidden || !dom.reflOverlay.hidden || isPaletteOpen || isAiReportOpen || isOnboardingOpen;
    const isTyping = e.target.tagName === 'INPUT' || 
                     e.target.tagName === 'TEXTAREA' || 
                     e.target.tagName === 'SELECT' || 
                     e.target.isContentEditable;
    if (isTyping || modalOpen) return;
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
      // BUG-M27 FIX: Exit modes sequentially/hierarchically instead of all at once
      if (isBreathing) {
        cancelBreathingMode();
      } else if (isFlowShield) {
        toggleFlowShield();
      } else if (document.body.classList.contains('zen-mode-active')) {
        const zenToggleBtn = $('zen-toggle-btn');
        if (zenToggleBtn) {
          zenToggleBtn.click();
        }
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
  // BUG-002: Load persisted theme instead of hardcoding 'void'
  applyTheme(localStorage.getItem(THEME_KEY) || 'void');

  initFavicon();
  loadHistory();
  renderHeatmap();
  updateVelocity();

  // Streak UI (read existing & check if expired - BUG-032)
  const s = getStreak();
  if (s.lastDate) {
    const today = todayStr();
    const yd = new Date(); yd.setDate(yd.getDate()-1);
    const yds = `${yd.getFullYear()}-${String(yd.getMonth()+1).padStart(2,'0')}-${String(yd.getDate()).padStart(2,'0')}`;
    if (s.lastDate !== today && s.lastDate !== yds) {
      s.count = 0;
      try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch(_) {}
    }
  }
  // BUG-L03 FIX: Call renderStreakUI to setup initial streak badge
  renderStreakUI(s.count);

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
  dom.focusVal.value  = focusMins;
  dom.breakVal.value  = breakMins;
  document.querySelectorAll('.presets .preset-chip').forEach(c => c.classList.toggle('active', +c.dataset.focus===focusMins && +c.dataset.break===breakMins));

  updateDisplay();

  // BUG-033: Show reflection modal if session outcome is undefined and there is an intention
  if (history.length > 0 && history[0].outcome === undefined && history[0].intention) {
    showReflectionModal();
  }

  // BUG-H15 FIX: Use a single atomic flag checked by features.js.
  // features.js will call startTimer() and clear the flag.
  // The fallback timeout (3s) only fires if features.js never loaded.
  if (shouldResume) {
    dom.timerSub.textContent = 'Resuming session…';
    window._zencloxPendingResume = true;
    window._zencloxResumeTimeout = setTimeout(() => {
      if (window._zencloxPendingResume) {
        window._zencloxPendingResume = false;
        startTimer();
      }
    }, 3000);
  } else {
    // Only set standard label if we aren't showing the reflection overlay
    if (!(history.length > 0 && history[0].outcome === undefined && history[0].intention)) {
      dom.timerSub.textContent = isFocus ? 'Ready to focus' : 'Take a break';
    }
  }
  // BUG-M05 FIX: Create first interaction hook to auto-resume active sounds (respecting autoplay policies)
  const handleFirstInteraction = () => {
    try {
      const hasActive = Object.values(activeSounds).some(Boolean);
      if (hasActive) {
        resumeAmbientIfNeeded();
      }
    } catch (e) {
      console.warn('First interaction resume failed', e);
    }
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
    document.removeEventListener('pointerdown', handleFirstInteraction);
  };
  document.addEventListener('click', handleFirstInteraction);
  document.addEventListener('keydown', handleFirstInteraction);
  document.addEventListener('pointerdown', handleFirstInteraction);

  // BUG-M07/M08/M09/M10 FIX: Trap focus inside overlays for keyboard accessibility
  if (window.trapFocus) {
    window.trapFocus(dom.intentionOverlay);
    window.trapFocus(dom.reflOverlay);
  }
}

// Global focus trap helper
function trapFocus(modalEl) {
  if (!modalEl) return;
  modalEl.addEventListener('keydown', function(e) {
    const isTabPressed = e.key === 'Tab' || e.keyCode === 9;
    if (!isTabPressed) return;
    
    // Filter focusable elements that are visible
    const focusableEls = Array.from(modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => {
        return (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) && 
               !el.hasAttribute('disabled') && 
               el.getAttribute('aria-hidden') !== 'true';
      });
      
    if (focusableEls.length === 0) return;
    const firstFocusable = focusableEls[0];
    const lastFocusable = focusableEls[focusableEls.length - 1];

    if (e.shiftKey) { // Shift + Tab
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else { // Tab
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  });
}
window.trapFocus = trapFocus;

// Explicitly export core controls to window for features.js compatibility
window.handleStart = handleStart;
window.resetTimer = resetTimer;
window.skipToNext = skipToNext;
window.submitReflection = submitReflection;
window.addHistoryEntry = addHistoryEntry;
window.exportCSV = exportCSV;

init();

