'use strict';

/**
 * Zenclox — Advanced Features Extension (features.js)
 * Implements 11 premium features client-side.
 */

// ============================================================
// CONSTANTS & UTILS
// ============================================================
const ALL_HISTORY_KEY = 'zenclox_all_history_v1';
const MOODS_KEY = 'zenclox_moods_v1';

const MOOD_COLORS = {
  struggling: '#f87171', // Red
  neutral: '#9ca3af',    // Gray
  good: '#38bdf8',       // Ocean Blue
  fire: '#fb923c'        // Orange/Gold
};

// Help helper
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getActiveColor = () => {
  try {
    const computedColor = getComputedStyle(document.documentElement).getPropertyValue('--active').trim();
    if (computedColor) return computedColor;
  } catch (e) {}

  const theme = document.documentElement.getAttribute('data-theme') || 'void';
  const isBreak = document.body.classList.contains('mode-break');
  if (theme === 'light') return '#000000';
  if (theme === 'dark') return '#ffffff';
  if (isBreak) {
    if (theme === 'forge') return '#fcd34d'; // --brk color
    if (theme === 'ocean') return '#2dd4bf'; // --brk color
    return '#34d399'; // default --brk color
  } else {
    if (theme === 'forge') return '#fb923c'; // --focus color
    if (theme === 'ocean') return '#38bdf8'; // --focus color
    return '#c084fc'; // default --focus color
  }
};

// ============================================================
// 1. TIME WARP VISUALIZER
// ============================================================
const TimeWarp = {
  update() {
    const timerRing = document.querySelector('.timer-ring');
    if (!timerRing) return;

    if (document.body && document.body.classList.contains('zen-mode-active')) {
      // In Zen mode, let the CSS keyframe pulse animation handle scaling/glows to keep it perfectly smooth
      return;
    }

    if (window.isFocus) {
      if (window.isRunning && window.totalSecs > 0) {
        // Accelerating inward warp as time runs out
        const progress = 1 - (window.remaining / window.totalSecs);
        const scale = 1 - 0.15 * Math.pow(progress, 3.5);
        // Add subtle rotateX perspective to simulate gravitational lens
        timerRing.style.transform = `perspective(400px) rotateX(${10 * progress}deg) scale(${scale})`;
      } else {
        timerRing.style.transform = 'perspective(400px) rotateX(0deg) scale(1)';
      }
    } else {
      // Break mode: gentle outward breathing wave
      if (window.isRunning) {
        const time = Date.now() / 900;
        const scale = 1 + 0.04 * Math.sin(time * Math.PI);
        timerRing.style.transform = `scale(${scale})`;
      } else {
        timerRing.style.transform = 'scale(1)';
      }
    }
  }
};

// ============================================================
// 2. SESSION DNA STRAND VIEW (3D Helix Canvas)
// ============================================================
const DNASystem = {
  canvas: null,
  ctx: null,
  angle: 0,
  animId: null,
  hoveredIndex: -1,

  init() {
    this.canvas = document.getElementById('dna-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Tooltip positioning
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

    // Resize responsiveness (High-DPI aware)
    const resizeObserver = new ResizeObserver(() => {
      if (this.canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = 260 * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `260px`;
        this.renderStrand();
      }
    });
    resizeObserver.observe(this.canvas.parentElement);
  },

  startAnimation() {
    if (this.animId) cancelAnimationFrame(this.animId);

    const draw = () => {
      this.renderStrand();
      this.angle += 0.015;
      this.animId = requestAnimationFrame(draw);
    };
    draw();
  },

  stopAnimation() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  },

  renderStrand() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.parentElement.clientWidth;
    const h = rect.height || 260;

    // Clear entire physical backing store
    ctx.clearRect(0, 0, w * dpr, h * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    const sessions = window.focusHistory || [];
    if (sessions.length === 0) {
      // Draw a template helix if no sessions yet
      this.drawHelixTemplate(w, h);
      ctx.restore();
      return;
    }

    const padding = 30;
    const usableH = h - padding * 2;
    const nodeCount = sessions.length;

    // Draw connections and backbone lines
    const points = [];
    const helixRadius = 45;

    for (let i = 0; i < nodeCount; i++) {
      // Distribute nodes evenly vertically
      const y = padding + (usableH * (i / Math.max(1, nodeCount - 1)));
      const sessionAngle = this.angle + i * 1.1;

      // Coordinate projections for a 3D helix
      const x1 = w / 2 + helixRadius * Math.sin(sessionAngle);
      const x2 = w / 2 - helixRadius * Math.sin(sessionAngle);

      const depth1 = Math.cos(sessionAngle); // -1 (back) to 1 (front)
      const depth2 = -Math.cos(sessionAngle);

      points.push({
        y,
        left: { x: x1, depth: depth1 },
        right: { x: x2, depth: depth2 },
        session: sessions[i]
      });
    }

    const theme = document.documentElement.getAttribute('data-theme') || 'void';
    const baseRungColor = theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const baseBackboneColor = theme === 'light' ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';

    // 1. Draw connecting base pairs (rungs)
    points.forEach((p, idx) => {
      ctx.beginPath();
      ctx.moveTo(p.left.x, p.y);
      ctx.lineTo(p.right.x, p.y);
      ctx.strokeStyle = baseRungColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Colored highlight base bar depending on session mood/outcome
      ctx.beginPath();
      ctx.moveTo(p.left.x, p.y);
      ctx.lineTo(w / 2, p.y);
      ctx.strokeStyle = MOOD_COLORS[p.session.mood || 'neutral'] + '44';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    });

    // 2. Draw backbone ribbons
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.left.x, p.y);
      else ctx.lineTo(p.left.x, p.y);
    });
    ctx.strokeStyle = baseBackboneColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.right.x, p.y);
      else ctx.lineTo(p.right.x, p.y);
    });
    ctx.strokeStyle = baseBackboneColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 3. Draw nodes (front nodes over back nodes)
    points.forEach((p, idx) => {
      // Sort layers by depth: Draw the back node, then front node
      const leftIsFront = p.left.depth >= 0;

      const drawNode = (side, isLeft) => {
        const moodColor = MOOD_COLORS[p.session.mood || 'neutral'];
        const isHovered = this.hoveredIndex === idx;

        // Size adapts based on duration and hover state
        const mins = Math.floor(p.session.duration / 60);
        const baseRadius = 5 + Math.min(mins / 5, 6);
        const radius = isHovered ? baseRadius * 1.3 : baseRadius;

        ctx.beginPath();
        ctx.arc(side.x, p.y, radius, 0, Math.PI * 2);

        // Depth-based sizing & opacity
        const opacityScale = 0.35 + (side.depth + 1) * 0.325; // 0.35 to 1.0

        ctx.fillStyle = moodColor;
        ctx.shadowBlur = isHovered ? 12 : 5;
        ctx.shadowColor = moodColor;

        // Apply depth styling
        ctx.globalAlpha = opacityScale;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0; // Reset shadow

        // Inner core
        ctx.beginPath();
        ctx.arc(side.x, p.y, radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = side.depth > 0 ? 0.9 : 0.4;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      };

      if (leftIsFront) {
        drawNode(p.right, false); // Draw back first
        drawNode(p.left, true);   // Draw front second
      } else {
        drawNode(p.left, true);
        drawNode(p.right, false);
      }
    });

    ctx.restore();
  },

  drawHelixTemplate(w, h) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    
    const theme = document.documentElement.getAttribute('data-theme') || 'void';
    const isLight = theme === 'light';
    const textColor = isLight ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.22)';
    const rungColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
    const backboneColor = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.07)';

    ctx.font = '12px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText('Complete focus sessions to grow your DNA strand', w / 2, h / 2 + 60);

    const padding = 20;
    const usableH = h - padding * 2;
    const stepCount = 12;
    const helixRadius = 38;

    const points = [];
    for (let i = 0; i < stepCount; i++) {
      const y = padding + (usableH * (i / (stepCount - 1)));
      const sa = this.angle + i * 0.65;
      points.push({
        y,
        x1: w / 2 + helixRadius * Math.sin(sa),
        x2: w / 2 - helixRadius * Math.sin(sa),
        depth: Math.cos(sa)
      });
    }

    // Draw lines
    ctx.lineWidth = 1.5;
    points.forEach(p => {
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y);
      ctx.lineTo(p.x2, p.y);
      ctx.strokeStyle = rungColor;
      ctx.stroke();
    });

    // Draw left backbone
    ctx.beginPath();
    ctx.strokeStyle = backboneColor;
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x1, p.y);
      else ctx.lineTo(p.x1, p.y);
    });
    ctx.stroke();

    // Draw right backbone
    ctx.beginPath();
    ctx.strokeStyle = backboneColor;
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x2, p.y);
      else ctx.lineTo(p.x2, p.y);
    });
    ctx.stroke();

    // Draw placeholders
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x1, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.depth > 0 ? 'rgba(192, 132, 252, 0.15)' : 'rgba(192, 132, 252, 0.05)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x2, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.depth < 0 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(52, 211, 153, 0.05)';
      ctx.fill();
    });
  },

  handleMouseMove(e) {
    const sessions = window.focusHistory || [];
    if (sessions.length === 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const padding = 30;
    const usableH = h - padding * 2;
    const nodeCount = sessions.length;
    let closestIndex = -1;
    let minDistance = 22; // Hover hit radius

    // Look for matching node in helix projection (using logical CSS coordinates)
    for (let i = 0; i < nodeCount; i++) {
      const y = padding + (usableH * (i / Math.max(1, nodeCount - 1)));
      const sessionAngle = this.angle + i * 1.1;
      const x1 = w / 2 + 45 * Math.sin(sessionAngle);
      const x2 = w / 2 - 45 * Math.sin(sessionAngle);

      const d1 = Math.hypot(mouseX - x1, mouseY - y);
      const d2 = Math.hypot(mouseX - x2, mouseY - y);

      if (d1 < minDistance) { closestIndex = i; minDistance = d1; }
      if (d2 < minDistance) { closestIndex = i; minDistance = d2; }
    }

    this.hoveredIndex = closestIndex;

    const tooltip = document.getElementById('dna-tooltip');
    if (!tooltip) return;

    if (closestIndex !== -1) {
      const session = sessions[closestIndex];
      const mins = Math.floor(session.duration / 60);
      const moodEmoji = { struggling: '😤 Struggling', neutral: '😐 Neutral', good: '😊 Good', fire: '🔥 On Fire' };

      tooltip.innerHTML = `
        <div style="font-weight: 700; color: var(--active); margin-bottom: 2px;">Session #${session.sessionNum || (nodeCount - closestIndex)}</div>
        <div style="font-size: 0.65rem; color: var(--muted); margin-bottom: 4px;">Time: ${session.time} · ${mins} mins</div>
        ${session.intention ? `<div style="font-size: 0.7rem; border-left: 2px solid var(--border); padding-left: 6px; font-style: italic; margin-bottom: 4px; word-break: break-word;">"${session.intention}"</div>` : ''}
        <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text); margin-top: 4px;">
          <span>Mood: ${moodEmoji[session.mood || 'neutral']}</span>
          <span>Score: ${session.velocity || 100} v</span>
        </div>
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = `${Math.min(mouseX + 16, w - 170)}px`;
      tooltip.style.top = `${Math.min(mouseY + 12, h - 100)}px`;
    } else {
      tooltip.style.display = 'none';
    }
  },

  handleMouseLeave() {
    this.hoveredIndex = -1;
    const tooltip = document.getElementById('dna-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }
};

// ============================================================
// 3. MOOD SELECTOR & GRADIENT HEATMAP BORDERS
// ============================================================
const MoodSystem = {
  selectedMood: 'good',

  init() {
    const row = document.getElementById('mood-selector-row');
    if (!row) return;

    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.mood-btn');
      if (!btn) return;

      // Remove selected from others
      row.querySelectorAll('.mood-btn').forEach(b => {
        b.classList.remove('selected');
        b.style.borderColor = 'transparent';
        b.style.transform = 'scale(1)';
      });

      // Set selected
      btn.classList.add('selected');
      btn.style.borderColor = '#38bdf8';
      btn.style.transform = 'scale(1.15)';
      this.selectedMood = btn.dataset.mood;
    });
  },

  resetSelection() {
    this.selectedMood = 'good';
    const row = document.getElementById('mood-selector-row');
    if (!row) return;

    row.querySelectorAll('.mood-btn').forEach(b => {
      b.classList.remove('selected');
      b.style.borderColor = 'transparent';
      b.style.transform = 'scale(1)';
    });

    const defaultBtn = row.querySelector('[data-mood="good"]');
    if (defaultBtn) {
      defaultBtn.classList.add('selected');
      defaultBtn.style.borderColor = '#38bdf8';
      defaultBtn.style.transform = 'scale(1.15)';
    }
  }
};

// ============================================================
// 4. CURATED QUOTE ORACLE (Reward quotes in timer ring)
// ============================================================
const QuoteOracle = {
  quotes: {
    struggling: [
      { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
      { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
      { text: "Fall seven times and stand up eight.", author: "Japanese Proverb" },
      { text: "Difficulties strengthen the mind, as labor does the body.", author: "Seneca" },
      { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
      { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
      { text: "Continuous effort - not strength or intelligence - is the key to unlocking our potential.", author: "Winston Churchill" },
      { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
      { text: "The best way out is always through.", author: "Robert Frost" },
      { text: "If you're going through hell, keep going.", author: "Winston Churchill" },
      { text: "Be not afraid of going slowly, be afraid only of standing still.", author: "Chinese Proverb" },
      { text: "Focus on the step in front of you, not the whole staircase.", author: "Unknown" },
      { text: "No friction, no polish. No struggle, no progress.", author: "Zen Maxim" },
      { text: "Calm is a superpower. Return to your breath and reset.", author: "Zen Master" },
      { text: "Show up. Even if it's imperfect. Showing up is the victory.", author: "Unknown" }
    ],
    celebration: [
      { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
      { text: "Flow is being completely involved in an activity for its own sake.", author: "Mihaly Csikszentmihalyi" },
      { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
      { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
      { text: "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus.", author: "Alexander Graham Bell" },
      { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
      { text: "He who conquers himself is the mightiest warrior.", author: "Lao Tzu" },
      { text: "My life is my message.", author: "Mahatma Gandhi" },
      { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
      { text: "Circumstances don't make the man, they only reveal him to himself.", author: "Epictetus" },
      { text: "You have power over your mind - not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
      { text: "The power of concentration is the only key to the treasure-house of knowledge.", author: "Swami Vivekananda" },
      { text: "Your velocity is a reflection of your state of mind. Flow cleanly.", author: "Zenclox AI" },
      { text: "Today you are the master of your focus. Cherish this momentum.", author: "Stoic Wisdom" },
      { text: "Excellent execution. Ride the wave of deep presence.", author: "Flow Coach" }
    ],
    neutral: [
      { text: "Rule your mind or it will rule you.", author: "Horace" },
      { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
      { text: "The key to everything is patience. You get the chicken by hatching the egg, not by smashing it.", author: "Arnold H. Glasow" },
      { text: "Do not seek to follow in the footsteps of the wise. Seek what they sought.", author: "Basho" },
      { text: "Quiet minds cannot be perplexed or frightened.", author: "Priscilla Maurice" },
      { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
      { text: "Nature does not hurry, yet everything is accomplished.", author: "Lao Tzu" },
      { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
      { text: "Muddy water is best cleared by leaving it alone.", author: "Alan Watts" },
      { text: "The present moment is filled with joy and happiness. If you are attentive, you will see it.", author: "Thich Nhat Hanh" },
      { text: "Work like there is someone working twenty-four hours a day to take it all away from you.", author: "Mark Cuban" },
      { text: "Very little is needed to make a happy life; it is all within yourself, in your way of thinking.", author: "Marcus Aurelius" },
      { text: "Slow down. Breathe. What is urgent is rarely important.", author: "Zen Maxim" },
      { text: "Associate with people who are likely to improve you.", author: "Seneca" },
      { text: "The mind is like water. When it's turbulent, it's difficult to see. When it's calm, everything becomes clear.", author: "Prasad Mahes" }
    ]
  },

  showQuote(session) {
    const container = document.getElementById('quote-display');
    if (!container) return;

    const FEATURE_TIPS = [
      "Tip: Tap the 🎧 icon in the header to blend ambient sounds and binaural beats without opening settings.",
      "Tip: Combine Binaural Beats and Rain 🌧️ sounds to lock into a deep flow state.",
      "Tip: Adjust the Master Volume in the mixer to scale all ambient track volumes proportionally.",
      "Tip: Toggle Flow Shield Cinema Mode (F) to hide all UI elements and stay 100% focused.",
      "Tip: Use hashtags like #coding or #study in your intention name to tag your sessions automatically!"
    ];

    // 10% probability to show a dynamic feature tip
    if (Math.random() < 0.10) {
      const tip = FEATURE_TIPS[Math.floor(Math.random() * FEATURE_TIPS.length)];
      container.innerHTML = `<span style="color: var(--active); font-weight: 500; font-style: normal;">💡 ${tip}</span>`;
      return;
    }

    let category = 'neutral';
    if (session) {
      if (session.velocity < 50 || session.outcome === 'no') {
        category = 'struggling';
      } else if (session.velocity >= 85 || (window.getStreak && window.getStreak().count >= 2)) {
        category = 'celebration';
      }
    }

    const list = this.quotes[category];
    const quote = list[Math.floor(Math.random() * list.length)];

    container.innerHTML = `"${quote.text}" <span class="quote-author">— ${quote.author}</span>`;
  }
};

// ============================================================
// 5. SMART BREAK SUGGESTIONS
// ============================================================
const BreakSuggestions = {
  suggestions: {
    shortFocus: [
      "Stand up and do a quick 30-second shoulder shrug & stretch.",
      "Look out the window at a point far away (20-20-20 rule).",
      "Hydrate! Go drink half a glass of fresh water.",
      "Breathe deeply: 3 slow counts in, hold, 3 slow counts out.",
      "Roll your wrists and stretch your forearms."
    ],
    longFocus: [
      "Take a 2-minute paced walk around your room or hallway.",
      "Perform a quick neck stretch: tilt head left, right, forward, back.",
      "Close your eyes, sit back, and relax for a mental screen detox.",
      "Launch box breathing mode for a complete nervous system reset.",
      "Clean your workspace surface or reorganize 3 items."
    ],
    lateNight: [
      "Light stretch to prepare your muscles for evening sleep.",
      "Rest your eyes in complete darkness. No phone scrolling during this break!",
      "Focus on slow, rhythmic abdominal breathing to trigger wind-down.",
      "Consider closing the screen after this cycle ends to protect circadian sleep rhythm."
    ]
  },

  generate(focusMinutes) {
    const card = document.getElementById('break-suggestion-card');
    const textEl = document.getElementById('break-suggestion-text');
    if (!card || !textEl) return;

    const hour = new Date().getHours();
    let category = 'shortFocus';

    if (hour >= 22 || hour < 5) {
      category = 'lateNight';
    } else if (focusMinutes >= 45) {
      category = 'longFocus';
    }

    const list = this.suggestions[category];
    const suggestion = list[Math.floor(Math.random() * list.length)];

    textEl.textContent = suggestion;
    card.removeAttribute('hidden');
  },

  hide() {
    const card = document.getElementById('break-suggestion-card');
    if (card) card.setAttribute('hidden', '');
  }
};

// ============================================================
// 6. COMMAND PALETTE (Ctrl+K)
// ============================================================
const CommandPalette = {
  isOpen: false,
  commands: [],
  selectedIndex: 0,

  init() {
    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');
    if (!overlay || !input) return;

    this.registerCommands();

    const toggleBtn = document.getElementById('palette-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }

    // Keybindings
    document.addEventListener('keydown', (e) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      } else if (this.isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveSelection(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveSelection(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.executeSelected();
        }
      }
    });

    input.addEventListener('input', () => this.filterCommands());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
  },

  registerCommands() {
    this.commands = [
      { name: "⏯️ Start / Pause Focus Timer", desc: "Toggle timer run state", action: () => window.handleStart() },
      { name: "🔄 Reset Active Timer Cycle", desc: "Return countdown to original value", action: () => window.resetTimer() },
      { name: "⏭️ Skip Cycle Mode", desc: "Shift between focus and break modes", action: () => window.skipToNext() },
      { name: "🧘 Switch to Void Theme", desc: "Deep purple aesthetic", action: () => window.applyTheme('void') },
      { name: "🔥 Switch to Forge Theme", desc: "Amber spark aesthetic", action: () => window.applyTheme('forge') },
      { name: "🌊 Switch to Ocean Theme", desc: "Calm teal water aesthetic", action: () => window.applyTheme('ocean') },
      { name: "🌙 Toggle Zen Serenity Mode", desc: "Strip UI down to animated morphing gradient", action: () => ZenMode.toggle() },
      { name: "🛡️ Toggle Flow Shield Cinema Mode", desc: "Fullscreen cinematic background particles", action: () => window.toggleFlowShield() },
      { name: "🔮 Generate AI Performance Report", desc: "Circadian rhythms and flow report modal", action: () => AIReport.open() },
      { name: "🖼️ Export Shareable Stats Wallpaper", desc: "Downloads customized HD canvas visual of stats", action: () => WallpaperExport.export() },
      { name: "🌧️ Toggle Rain Ambience", desc: "Web Audio white noise rain generator", action: () => window.startAmbientSound('rain') },
      { name: "🌌 Toggle Deep Space Drones", desc: "Harmonized synthesizer soundscape", action: () => window.startAmbientSound('space') },
      { name: "🪵 Toggle Fireplace Crackles", desc: "Synthesized firewood snap clicks", action: () => window.startAmbientSound('fire') },
      { name: "🎧 Toggle Binaural Focus Beats", desc: "Alpha/Theta frequency brainwave triggers", action: () => window.startAmbientSound('binaural') },
      { name: "📅 Export CSV Session Log", desc: "Download local spreadsheet file of history", action: () => window.exportCSV() },
      { name: "⚙️ Toggle Settings Panel", desc: "Access sliders and interval settings", action: () => document.getElementById('settings-toggle-btn')?.click() },
      { name: "🎬 Play Guided Onboarding Tour", desc: "Restart the spotlight walk-through of features", action: () => { localStorage.removeItem('zenclox_onboarding_completed_v1'); OnboardingSystem.start(); } }
    ];
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  open() {
    this.isOpen = true;
    const overlay = document.getElementById('command-palette-overlay');
    const input = document.getElementById('command-palette-input');
    if (overlay && input) {
      overlay.removeAttribute('hidden');
      input.value = '';
      this.selectedIndex = 0;
      this.filterCommands();
      setTimeout(() => input.focus(), 50);
    }
  },

  close() {
    this.isOpen = false;
    const overlay = document.getElementById('command-palette-overlay');
    if (overlay) overlay.setAttribute('hidden', '');
  },

  filterCommands() {
    const input = document.getElementById('command-palette-input');
    const list = document.getElementById('command-palette-list');
    if (!input || !list) return;

    const query = input.value.toLowerCase().trim();
    list.innerHTML = '';

    const filtered = this.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      list.innerHTML = '<div style="font-size:0.8rem; color:var(--sub); text-align:center; padding: 12px;">No commands found matching query.</div>';
      return;
    }

    filtered.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = 'command-palette-item' + (idx === this.selectedIndex ? ' active' : '');
      item.innerHTML = `
        <div style="display: flex; flex-direction: column; text-align: left;">
          <span style="font-weight:600; color:var(--text);">${cmd.name}</span>
          <span style="font-size: 0.65rem; color: var(--sub);">${cmd.desc}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        this.close();
        cmd.action();
      });
      list.appendChild(item);
    });

    // Make sure selected is visible
    const activeItem = list.children[this.selectedIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  },

  moveSelection(direction) {
    const list = document.getElementById('command-palette-list');
    if (!list) return;

    const query = document.getElementById('command-palette-input').value.toLowerCase().trim();
    const count = this.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)
    ).length;

    if (count === 0) return;

    this.selectedIndex = (this.selectedIndex + direction + count) % count;
    this.filterCommands();
  },

  executeSelected() {
    const query = document.getElementById('command-palette-input').value.toLowerCase().trim();
    const filtered = this.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)
    );

    const cmd = filtered[this.selectedIndex];
    if (cmd) {
      this.close();
      cmd.action();
    }
  }
};

// ============================================================
// 7. DYNAMIC WALLPAPER EXPORT
// ============================================================
const WallpaperExport = {
  export() {
    // Create heavy resolution canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    const theme = document.documentElement.getAttribute('data-theme') || 'void';
    const activeColor = getActiveColor();
    const surfaceColor = theme === 'forge' ? '#1a1005' : theme === 'ocean' ? '#051624' : '#16161f';
    const bgGradientStart = theme === 'forge' ? '#0e0800' : theme === 'ocean' ? '#010d15' : '#0f0f14';
    const bgGradientEnd = theme === 'forge' ? '#050301' : theme === 'ocean' ? '#000407' : '#040406';

    // 1. Draw smooth fluid gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, bgGradientStart);
    grad.addColorStop(1, bgGradientEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    // 2. Draw aesthetic glowing blobs
    ctx.shadowBlur = 180;
    ctx.shadowColor = activeColor;
    ctx.fillStyle = activeColor + '18';

    ctx.beginPath();
    ctx.arc(900, 200, 350, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#818cf812';
    ctx.shadowColor = '#818cf8';
    ctx.beginPath();
    ctx.arc(150, 1500, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // reset glow

    // 3. Draw glassmorphic stats card container
    const cardX = 115, cardY = 320, cardW = 850, cardH = 1200;

    // Shadow backing
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 40;
    ctx.fillStyle = surfaceColor;
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Glass panel border stroke
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.stroke();

    // 4. Header title text
    ctx.font = '700 68px "Inter", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('ZENCLOX', 540, 480);

    ctx.font = '500 28px "Inter", sans-serif';
    ctx.fillStyle = activeColor;
    ctx.fillText('PRODUCTIVITY GENOME CARD', 540, 530);

    // Divider line
    ctx.beginPath();
    ctx.moveTo(250, 600);
    ctx.lineTo(830, 600);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // 5. Gather Stats
    const sessions = window.focusHistory || [];
    const totalSessions = sessions.length;
    let totalMinutes = 0;
    let avgVelocity = 0;
    let moodCounts = { struggling: 0, neutral: 0, good: 0, fire: 0 };

    sessions.forEach(s => {
      totalMinutes += Math.floor(s.duration / 60);
      avgVelocity += (s.velocity || 100);
      moodCounts[s.mood || 'neutral']++;
    });

    avgVelocity = totalSessions > 0 ? Math.round(avgVelocity / totalSessions) : 100;
    const hoursText = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    const streak = window.getStreak ? window.getStreak().count : 0;

    // Render Stats grid on wallpaper
    this.drawStatLine(ctx, 'TOTAL FOCUS TIME', hoursText, 250, 720, activeColor);
    this.drawStatLine(ctx, 'SESSIONS COMPLETED', totalSessions.toString(), 540, 720, activeColor);
    this.drawStatLine(ctx, 'STREAK COUNT', `${streak} Days`, 830, 720, activeColor);

    this.drawStatLine(ctx, 'AVERAGE FLOW VELOCITY', `${avgVelocity}%`, 390, 890, '#38bdf8');

    // Mood emoji winner
    let topMood = 'good';
    let maxMoodCount = -1;
    Object.keys(moodCounts).forEach(k => {
      if (moodCounts[k] > maxMoodCount) {
        maxMoodCount = moodCounts[k];
        topMood = k;
      }
    });
    const moodEmojis = { struggling: '😤 Struggling', neutral: '😐 Neutral', good: '😊 Good', fire: '🔥 On Fire' };
    this.drawStatLine(ctx, 'DOMINANT FLOW MOOD', moodEmojis[topMood], 690, 890, '#34d399');

    // 6. Draw visual graphic (DNA helix schematic on card)
    ctx.save();
    ctx.translate(540, 1220);
    this.drawDecorDNA(ctx, 400, 160);
    ctx.restore();

    // 7. Footer branding
    ctx.font = 'italic 500 24px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.textAlign = 'center';
    ctx.fillText('Circadian AI Powered · local on-device statistics', 540, 1450);

    // Save and download
    const link = document.createElement('a');
    link.download = `zenclox-wallpaper-${getTodayStr()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  },

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  },

  drawStatLine(ctx, label, value, x, y, color) {
    ctx.textAlign = 'center';
    ctx.font = '600 20px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(label, x, y);

    ctx.font = '700 48px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.fillText(value, x, y + 55);
  },

  drawDecorDNA(ctx, width, height) {
    const steps = 18;
    const r = 30;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;

    for (let i = 0; i < steps; i++) {
      const t = (i / (steps - 1));
      const x = -width / 2 + t * width;
      const angle = t * Math.PI * 3.5;

      const y1 = r * Math.sin(angle);
      const y2 = -r * Math.sin(angle);

      // Connectors
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      // Left Node
      ctx.shadowColor = '#38bdf8';
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(x, y1, 6, 0, Math.PI * 2);
      ctx.fill();

      // Right Node
      ctx.shadowColor = '#fb923c';
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(x, y2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
};

// ============================================================
// 8. CIRCADIAN AI DAILY PREDICTOR (Circadian energy curves)
// ============================================================
const AIPredictor = {
  canvas: null,
  ctx: null,

  init() {
    this.canvas = document.getElementById('energy-curve-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // Fit canvas resolution to parent width (High-DPI aware)
    const updateSize = () => {
      if (this.canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = 90 * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `90px`;
        this.renderForecast();
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
  },

  renderForecast() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.parentElement.clientWidth;
    const h = rect.height || 90;

    // Clear physical backing store
    ctx.clearRect(0, 0, w * dpr, h * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    const history = this.getAllHistory();
    const theme = document.documentElement.getAttribute('data-theme') || 'void';

    // Base circadian values (energy curve default peaks: 10am and 4pm)
    const baseEnergyCurve = (hour) => {
      // Circadian energy wave equation
      return 50 + 35 * Math.sin((hour - 7) * Math.PI / 6) + 12 * Math.cos((hour - 14) * Math.PI / 3);
    };

    // Calculate dynamic focus weights based on historical velocity data
    const hourWeights = Array(24).fill(0);
    const hourCounts = Array(24).fill(0);

    history.forEach(item => {
      // Parse hour from entry e.g. "11:22am" or "4:15pm"
      if (item.time) {
        const parts = item.time.match(/(\d+):(\d+)(am|pm)/i);
        if (parts) {
          let hr = parseInt(parts[1]);
          const isPm = parts[3].toLowerCase() === 'pm';
          if (isPm && hr !== 12) hr += 12;
          if (!isPm && hr === 12) hr = 0;

          hourWeights[hr] += (item.velocity || 100);
          hourCounts[hr]++;
        }
      }
    });

    const activeHoursList = [];
    const maxCount = Math.max(...hourCounts, 0);

    for (let hr = 0; hr < 24; hr++) {
      const base = baseEnergyCurve(hr);
      let score;
      if (history.length === 0) {
        score = base;
      } else {
        if (hourCounts[hr] > 0) {
          const avgVelocity = hourWeights[hr] / hourCounts[hr];
          const frequencyFactor = maxCount > 0 ? (hourCounts[hr] / maxCount) : 1;
          const userScore = avgVelocity * (0.4 + 0.6 * frequencyFactor);
          // Combine user history with minor circadian influence (80% blend)
          score = (base * 0.2) + (userScore * 0.8);
        } else {
          // Suppress unworked hours below circadian default to keep prediction accurate to user's real input
          score = base * 0.2;
        }
      }
      activeHoursList.push({ hour: hr, score: Math.max(10, Math.min(95, score)) });
    }

    // Determine predicted peak hours
    const daylightHours = activeHoursList.filter(h => h.hour >= 8 && h.hour <= 22);
    daylightHours.sort((a, b) => b.score - a.score);

    const peak1 = daylightHours[0] ? daylightHours[0].hour : 10;
    // Get second peak far enough from first peak
    const peak2Item = daylightHours.find(h => Math.abs(h.hour - peak1) >= 3);
    const peak2 = peak2Item ? peak2Item.hour : 16;

    // Display forecast description below
    const fmtHr = (h) => `${h % 12 || 12}${h >= 12 ? ' PM' : ' AM'}`;
    const descEl = document.getElementById('predictor-insight-text');
    if (descEl) {
      if (history.length < 5) {
        descEl.innerHTML = `🌟 <strong>Focus Forecast:</strong> Best slots are predicted near <strong>${fmtHr(peak1)} - ${fmtHr(peak1 + 2)}</strong> and <strong>${fmtHr(peak2)} - ${fmtHr(peak2 + 2)}</strong>. Complete ${5 - history.length} more sessions to refine this prediction.`;
      } else {
        descEl.innerHTML = `🔥 <strong>Dynamic Optimum:</strong> Peak mental flow calculated around <strong>${fmtHr(peak1)}–${fmtHr(peak1 + 2)}</strong> &amp; <strong>${fmtHr(peak2)}–${fmtHr(peak2 + 2)}</strong>. Focus velocity averages ${Math.round(daylightHours[0].score)}% in these windows.`;
      }
    }

    // Render smooth energy spline path
    ctx.beginPath();
    const spacing = w / 15; // Render hours 8 to 22 (15 steps)
    const points = [];

    for (let i = 0; i <= 14; i++) {
      const hr = 8 + i;
      const x = i * spacing;
      const y = h - (activeHoursList[hr].score / 100) * (h - 20) - 10;
      points.push({ x, y });
    }

    // Draw spline curve
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(w, points[points.length - 1].y);

    const themeColor = getActiveColor();
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Fill area below gradient
    const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
    fillGrad.addColorStop(0, themeColor + '28');
    fillGrad.addColorStop(1, 'transparent');
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Highlight active current hour index on curve
    const curHour = new Date().getHours();
    if (curHour >= 8 && curHour <= 22) {
      const curIdx = curHour - 8;
      const p = points[curIdx];
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = themeColor;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw simple hour legends on x-axis
    ctx.fillStyle = theme === 'light' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.22)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('9AM', 1 * spacing, h - 2);
    ctx.fillText('1PM', 5 * spacing, h - 2);
    ctx.fillText('5PM', 9 * spacing, h - 2);
    ctx.fillText('9PM', 13 * spacing, h - 2);

    ctx.restore();
  },

  getAllHistory() {
    try {
      return JSON.parse(localStorage.getItem(ALL_HISTORY_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
};

// ============================================================
// 9. AI PERFORMANCE REPORT
// ============================================================
const AIReport = {
  currentPeriod: 7,

  init() {
    const overlay = document.getElementById('ai-report-overlay');
    const closeBtn = document.getElementById('report-close-btn');
    const exportBtn = document.getElementById('report-export-btn');
    if (!overlay) return;

    closeBtn?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    document.querySelectorAll('.report-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.report-tab').forEach(t => {
          t.classList.remove('active');
          t.style.background = 'none';
          t.style.color = 'var(--muted)';
        });
        tab.classList.add('active');
        tab.style.background = 'var(--surface)';
        tab.style.color = 'var(--text)';
        this.currentPeriod = tab.dataset.period === 'all' ? 'all' : parseInt(tab.dataset.period);
        this.generateReport();
      });
    });

    exportBtn?.addEventListener('click', () => this.exportReportCard());
  },

  open() {
    const overlay = document.getElementById('ai-report-overlay');
    if (overlay) {
      overlay.removeAttribute('hidden');
      this.generateReport();
    }
  },

  close() {
    const overlay = document.getElementById('ai-report-overlay');
    if (overlay) overlay.setAttribute('hidden', '');
  },

  generateReport() {
    const body = document.getElementById('report-content-body');
    if (!body) return;

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(ALL_HISTORY_KEY)) || [];
    } catch (e) { }

    // Filter by period
    if (this.currentPeriod !== 'all') {
      const now = new Date();
      const cutoffDate = new Date();
      cutoffDate.setDate(now.getDate() - this.currentPeriod);

      history = history.filter(item => {
        if (!item.date) return false;
        const d = new Date(item.date);
        return d >= cutoffDate;
      });
    }

    if (history.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; color: var(--sub); padding: 30px 10px;">
          ❌ No sessions logged during this period yet.
        </div>
      `;
      return;
    }

    // Calculations
    const totalSessions = history.length;
    let totalMinutes = 0;
    let totalVelocity = 0;
    let totalInterrupts = 0;
    let successCount = 0;
    const tagCounts = {};
    const moodCounts = { struggling: 0, neutral: 0, good: 0, fire: 0 };

    history.forEach(item => {
      totalMinutes += Math.floor(item.duration / 60);
      totalVelocity += (item.velocity || 100);
      totalInterrupts += (item.interrupts || 0);
      if (item.outcome === 'yes' || item.outcome === 'partial') successCount++;
      if (item.mood) moodCounts[item.mood]++;

      if (item.tags) {
        item.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const avgVelocity = Math.round(totalVelocity / totalSessions);
    const successRate = Math.round((successCount / totalSessions) * 100);
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const topTagStr = topTags[0] ? topTags[0][0] : 'None';

    // Construct glassmorphic widget summary
    let moodVisuals = '';
    const totalMoods = Object.values(moodCounts).reduce((a, b) => a + b, 0) || 1;
    const formatPercent = (k) => Math.round((moodCounts[k] / totalMoods) * 100);

    moodVisuals = `
      <div style="display:flex; justify-content:space-between; gap:6px; font-size:0.65rem; color:var(--muted); margin-top:8px;">
        <span>😤 ${formatPercent('struggling')}%</span>
        <span>😐 ${formatPercent('neutral')}%</span>
        <span>😊 ${formatPercent('good')}%</span>
        <span>🔥 ${formatPercent('fire')}%</span>
      </div>
    `;

    // Dynamic AI insight generation
    let aiInsightText = '';
    if (avgVelocity >= 85) {
      aiInsightText = `Your focus velocity is outstanding at ${avgVelocity}%. You are maintaining supreme flow states. Make sure to schedule recovery blocks to sustain this high mental speed!`;
    } else if (totalInterrupts / totalSessions > 1.5) {
      aiInsightText = `Distractions are clipping your momentum. You logged an average of ${(totalInterrupts / totalSessions).toFixed(1)} distractions per session. Try using Flow Shield or silencing devices for deep blocks.`;
    } else if (successRate < 70) {
      aiInsightText = `Your goal completion rate is at ${successRate}%. Try chunking your intentions down into smaller, bite-sized tasks. Vague intentions lead to partial success.`;
    } else if (topTagStr !== 'None') {
      aiInsightText = `Most of your productive cycles focus on ${topTagStr}. Data indicates mornings are your peak output slots for this tag — align your deep sprints accordingly.`;
    } else {
      aiInsightText = `Consistency looks healthy. You focused for ${totalMinutes} minutes. Keep seeding this streak to develop automatic focus cycles.`;
    }

    body.innerHTML = `
      <div class="report-stat-grid">
        <div class="report-stat-card">
          <span class="report-stat-label">Total Focus</span>
          <span class="report-stat-val" style="color: var(--focus);">${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m</span>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-label">Sessions</span>
          <span class="report-stat-val">${totalSessions}</span>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-label">Flow Velocity</span>
          <span class="report-stat-val" style="color: #38bdf8;">${avgVelocity}%</span>
        </div>
        <div class="report-stat-card">
          <span class="report-stat-label">Intention Met</span>
          <span class="report-stat-val" style="color: #34d399;">${successRate}%</span>
        </div>
      </div>

      <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius:10px; padding: 12px;">
        <span class="report-stat-label" style="display:block; margin-bottom:4px; text-align:center;">Vibe Spectrum</span>
        <div style="display:flex; height:6px; border-radius:3px; overflow:hidden; background: var(--border);">
          <div style="width:${formatPercent('struggling')}%; background:${MOOD_COLORS.struggling};"></div>
          <div style="width:${formatPercent('neutral')}%; background:${MOOD_COLORS.neutral};"></div>
          <div style="width:${formatPercent('good')}%; background:${MOOD_COLORS.good};"></div>
          <div style="width:${formatPercent('fire')}%; background:${MOOD_COLORS.fire};"></div>
        </div>
        ${moodVisuals}
      </div>

      <div class="report-insight-card">
        ${aiInsightText}
      </div>
    `;
  },

  exportReportCard() {
    // Generates reports dynamically as canvas card and exports
    WallpaperExport.export();
  }
};

// ============================================================
// 10. ZEN MODE SANCTUARY
// ============================================================
// Sound Synthesizers for Zen Mode
window.playSingingBowl = function() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const duration = 6.0;
    
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.35, now + 0.1);
    master.gain.exponentialRampToValueAtTime(0.001, now + duration);
    master.connect(ctx.destination);
    
    // Tibetan bowl frequencies (150Hz fundamental + overtones)
    const frequencies = [150, 300.5, 451.2, 602.8, 755.1, 903.5];
    const gains = [0.4, 0.25, 0.15, 0.1, 0.05, 0.03];
    
    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      // Detune LFO for slow, rich metallic vibration
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 1.6 + idx * 0.3;
      lfoGain.gain.value = 2.0;
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      
      g.gain.value = gains[idx];
      osc.connect(g);
      g.connect(master);
      
      osc.start(now);
      osc.stop(now + duration);
      
      setTimeout(() => {
        try {
          lfo.stop();
          lfo.disconnect();
        } catch(e) {}
      }, (duration + 0.2) * 1000);
    });
  } catch(e) {}
};

window.playWindChime = function() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const notes = [880, 1046.5, 1318.5]; // A5, C6, E6 chimes
    
    notes.forEach((freq, i) => {
      setTimeout(() => {
        try {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.12, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 1.3);
        } catch(e) {}
      }, i * 150);
    });
  } catch(e) {}
};

// Circadian Color Stages & Interpolator
const ZEN_STAGES = [
  { c1: '#07070b', c2: '#11051b', c3: '#040c17', c4: '#0b0312' }, // Cosmic Midnight Blue
  { c1: '#170b24', c2: '#23071b', c3: '#10051a', c4: '#1f0d2c' }, // Sunset Violet / Rose
  { c1: '#051b14', c2: '#06221c', c3: '#020f0a', c4: '#0b2b24' }  // Calming Forest Green
];

function interpolateColor(color1, color2, factor) {
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  
  return `#${String(r.toString(16)).padStart(2, '0')}${String(g.toString(16)).padStart(2, '0')}${String(b.toString(16)).padStart(2, '0')}`;
}

window.updateZenColors = function() {
  if (!document.body.classList.contains('zen-mode-active')) return;
  
  // Persist the initial Cosmic Midnight stage colors till the end of the session
  const currentColors = ZEN_STAGES[0];
  
  document.body.style.setProperty('--zen-bg-1', currentColors.c1);
  document.body.style.setProperty('--zen-bg-2', currentColors.c2);
  document.body.style.setProperty('--zen-bg-3', currentColors.c3);
  document.body.style.setProperty('--zen-bg-4', currentColors.c4);
};

// Sound Wave Ripples Canvas Animation
window.getSoundEnergy = function() {
  let energy = 0.5;
  const active = window.activeSounds || {};
  if (active.rain) {
    const el = document.getElementById('slider-rain');
    if (el) energy += parseFloat(el.value) / 100 * 0.8;
  }
  if (active.space) {
    const el = document.getElementById('slider-space');
    if (el) energy += parseFloat(el.value) / 100 * 0.4;
  }
  if (active.fire) {
    const el = document.getElementById('slider-fire');
    if (el) energy += parseFloat(el.value) / 100 * 0.5;
  }
  if (active.binaural) {
    const el = document.getElementById('slider-binaural');
    if (el) energy += parseFloat(el.value) / 100 * 0.3;
  }
  return Math.min(3.0, energy);
};

const ZenWave = {
  canvas: null,
  ctx: null,
  animId: null,
  phase: 0,
  
  init() {
    this.canvas = document.getElementById('zen-wave-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    const resize = () => {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = 120;
      }
    };
    resize();
    window.addEventListener('resize', resize);
  },
  
  start() {
    if (this.animId) return;
    this.animate();
  },
  
  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },
  
  animate() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const energy = window.getSoundEnergy();
    this.phase += 0.008 * energy;
    
    const themeColor = getActiveColor();
    
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const wavePhase = this.phase + (i * Math.PI / 3);
      const amplitude = (15 + i * 8) * (energy * 0.6 + 0.4);
      const frequency = 0.003 + (i * 0.0015);
      
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 15) {
        const y = h - 35 - Math.sin(x * frequency + wavePhase) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      
      const alpha = (0.04 - (i * 0.01));
      ctx.fillStyle = themeColor + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.fill();
    }
    
    this.animId = requestAnimationFrame(() => this.animate());
  }
};

// Interactive Pebble Garden
const ZenPebbles = {
  quotes: [
    "Drop your shoulders. Let go of the last hour.",
    "Breathing in, I calm body and mind. Breathing out, I smile.",
    "Only this moment exists. Let thoughts drift away like leaves in a river.",
    "Do not hurry; as long as you arrive, it is enough.",
    "Feel the physical touch of your seat, your breath. You are here.",
    "Peace is every step. The path is your goal.",
    "Focus is not force. It is resting your attention gently.",
    "Your worth is not defined by your productivity. Breathe.",
    "Let go of the need for control. Flow with the waves."
  ],
  fadeTimeout: null,
  
  init() {
    document.querySelectorAll('.zen-pebble').forEach(pebble => {
      pebble.addEventListener('click', () => {
        const idx = pebble.dataset.index;
        this.triggerPebble(idx);
      });
    });
  },
  
  triggerPebble(index) {
    if (window.playWindChime) window.playWindChime();
    
    const quoteEl = document.getElementById('zen-pebble-quote');
    if (!quoteEl) return;
    
    const rIdx = Math.floor(Math.random() * this.quotes.length);
    quoteEl.textContent = this.quotes[rIdx];
    quoteEl.classList.remove('active');
    
    // Force reflow
    void quoteEl.offsetWidth;
    
    quoteEl.classList.add('active');
    
    clearTimeout(this.fadeTimeout);
    this.fadeTimeout = setTimeout(() => {
      quoteEl.classList.remove('active');
    }, 4500);
  }
};

const GardenSystem = {
  canvas: null,
  ctx: null,
  animId: null,
  growthProgress: 0,

  init() {
    this.canvas = document.getElementById('zen-garden-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    const resize = () => {
      if (this.canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = 160 * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `160px`;
      }
    };
    resize();
    window.addEventListener('resize', resize);
  },

  start() {
    if (this.animId) return;
    this.growthProgress = 0;
    this.animate();
  },

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  },

  animate() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.parentElement.clientWidth;
    const h = rect.height || 160;

    ctx.clearRect(0, 0, w * dpr, h * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    // Calculate dynamic growth target based on time elapsed
    const elapsed = window.totalSecs - window.remaining;
    const pct = window.totalSecs > 0 ? (elapsed / window.totalSecs) : 0;
    
    // Smooth interpolation for tree growth
    this.growthProgress += (pct - this.growthProgress) * 0.05;
    
    // Base recursive depth increases with total history completed
    let historyCount = 0;
    try {
      historyCount = (window.focusHistory || []).length;
    } catch(e) {}
    const baseDepth = 2 + Math.min(Math.floor(historyCount / 2), 3); // max depth 5

    const activeColor = getActiveColor();

    // Draw generative trunk
    const startX = w / 2;
    const startY = h - 10;
    const trunkLen = 42 + Math.min(historyCount * 2, 10);
    
    this.drawBranch(ctx, startX, startY, trunkLen * Math.min(1.0, this.growthProgress + 0.15), -Math.PI / 2, 7, baseDepth, activeColor, this.growthProgress);

    ctx.restore();
    this.animId = requestAnimationFrame(() => this.animate());
  },

  drawBranch(ctx, x, y, len, angle, branchWidth, depth, leafColor, progress) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    const endX = x + Math.cos(angle) * len;
    const endY = y + Math.sin(angle) * len;
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(15,23,42,0.72)' : 'rgba(232,232,240,0.68)';
    ctx.lineWidth = branchWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (depth <= 0) {
      // Draw organic glowing leaf blossoms
      ctx.beginPath();
      const leafRad = 3.5 * Math.min(1.0, progress * 1.5);
      ctx.arc(endX, endY, leafRad, 0, Math.PI * 2);
      ctx.fillStyle = leafColor;
      ctx.shadowBlur = 4;
      ctx.shadowColor = leafColor;
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }

    // Recurse with organic wind sway
    const nextLen = len * 0.74;
    const nextWidth = branchWidth * 0.68;
    const spread = 0.38 + 0.05 * Math.sin(Date.now() / 2000 + depth);

    this.drawBranch(ctx, endX, endY, nextLen, angle - spread, nextWidth, depth - 1, leafColor, progress);
    this.drawBranch(ctx, endX, endY, nextLen, angle + spread, nextWidth, depth - 1, leafColor, progress);
  }
};

const ZenBgSystem = {
  canvas: null,
  ctx: null,
  animId: null,
  stars: [],
  noiseValues: [],

  init() {
    window.ZenBgSystem = this;
    this.canvas = document.getElementById('zen-bg-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.initNoise();

    const handleResize = () => {
      if (this.canvas) {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = `${window.innerWidth}px`;
        this.canvas.style.height = `${window.innerHeight}px`;
        this.ctx.scale(dpr, dpr);
        this.generateStars();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
  },

  initNoise() {
    if (this.noiseValues.length > 0) return;
    const rng = this.hashPRNG(42);
    for (let i = 0; i < 1024; i++) {
      this.noiseValues.push(rng());
    }
  },

  hashPRNG(seed) {
    let s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  },

  noise(x) {
    const len = this.noiseValues.length;
    const idx = Math.floor(x);
    const frac = x - idx;
    const t = frac * frac * (3 - 2 * frac);
    const i1 = ((idx % len) + len) % len;
    const i2 = (((idx + 1) % len) + len) % len;
    return this.noiseValues[i1] * (1 - t) + this.noiseValues[i2] * t;
  },

  getMountainHeight(x, baseY, amplitude, roughness, scale, octaves, seed) {
    let y = 0;
    let currentAmp = amplitude;
    let currentScale = scale;
    const fullOctaves = Math.floor(octaves);
    const fracOctave = octaves - fullOctaves;
    
    for (let i = 0; i < fullOctaves; i++) {
      y += (this.noise(x * currentScale + i * 35.7 + seed) - 0.5) * currentAmp;
      currentAmp *= roughness;
      currentScale *= 2.0;
    }
    if (fracOctave > 0) {
      y += (this.noise(x * currentScale + fullOctaves * 35.7 + seed) - 0.5) * currentAmp * fracOctave;
    }
    return baseY + y;
  },

  getTodayElapsedFocusMinutes() {
    let mins = 0;
    const history = window.focusHistory || [];
    history.forEach(s => {
      mins += (s.duration || 0) / 60;
    });
    if (window.isRunning && window.isFocus) {
      const elapsedSecs = window.totalSecs - window.remaining;
      mins += elapsedSecs / 60;
    }
    return mins;
  },

  addCompletedSessionStar() {
    const starsKey = 'zenclox_constellation_stars_v1';
    let stars = [];
    try {
      stars = JSON.parse(localStorage.getItem(starsKey)) || [];
    } catch(e) {}
    
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    stars = stars.filter(s => s.timestamp > oneWeekAgo);

    const x = 0.08 + Math.random() * 0.84;
    const y = 0.08 + Math.random() * 0.44;
    
    stars.push({
      timestamp: Date.now(),
      x,
      y
    });

    try {
      localStorage.setItem(starsKey, JSON.stringify(stars));
    } catch(e) {}

    this.generateStars();
  },

  generateStars() {
    if (!this.canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const starsKey = 'zenclox_constellation_stars_v1';
    
    let storedStars = [];
    try {
      storedStars = JSON.parse(localStorage.getItem(starsKey)) || [];
    } catch(e) {}

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    storedStars = storedStars.filter(s => s.timestamp > oneWeekAgo);

    // Fallback: If local storage has no stars but we have completed sessions, seed them
    const allHistory = window.focusHistory || [];
    if (storedStars.length === 0 && allHistory.length > 0) {
      allHistory.forEach((s, idx) => {
        let hash = idx * 79;
        const timeStr = s.time || '';
        for (let i = 0; i < timeStr.length; i++) {
          hash = (hash << 5) - hash + timeStr.charCodeAt(i);
        }
        
        const seedX = 0.08 + (Math.abs(hash % 1000) / 1000) * 0.84;
        const seedY = 0.08 + (Math.abs((hash >> 3) % 1000) / 1000) * 0.44;
        
        storedStars.push({
          timestamp: Date.now() - idx * 2 * 3600 * 1000,
          x: seedX,
          y: seedY
        });
      });
      try {
        localStorage.setItem(starsKey, JSON.stringify(storedStars));
      } catch(e) {}
    }

    this.stars = [];

    // Add completed focus stars
    storedStars.forEach((s, idx) => {
      this.stars.push({
        x: s.x * w,
        y: s.y * h,
        relX: s.x,
        relY: s.y,
        size: 2.0 + (idx % 3) * 0.6,
        twinkleOffset: idx * 1.5,
        twinklePeriod: 350 + (idx % 4) * 100,
        completed: true,
        timestamp: s.timestamp
      });
    });

    // Add ambient background stars
    const ambientCount = 35;
    for (let i = 0; i < ambientCount; i++) {
      const seedX = Math.sin(i * 12345.67) * 0.5 + 0.5;
      const seedY = Math.cos(i * 98765.43) * 0.5 + 0.5;
      this.stars.push({
        x: seedX * w,
        y: seedY * 0.55 * h,
        relX: seedX,
        relY: seedY * 0.55,
        size: 0.6 + (i % 2) * 0.6,
        twinkleOffset: i * 2.3,
        twinklePeriod: 600 + (i % 3) * 200,
        completed: false
      });
    }
  },

  start() {
    if (this.animId) return;
    this.generateStars();
    this.animate();
  },

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  drawSumiRidge(ctx, points, theme, fillStyle, strokeStyle, opacity, h, baseY) {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    ctx.lineTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 2; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.quadraticCurveTo(
      points[points.length - 2].x,
      points[points.length - 2].y,
      points[points.length - 1].x,
      points[points.length - 1].y
    );

    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();

    // Soft gradient fill
    const grad = ctx.createLinearGradient(0, baseY - 80, 0, h);
    const rgb = this.hexToRgb(fillStyle);

    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
    grad.addColorStop(0.3, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.75})`);
    grad.addColorStop(0.7, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.18})`);
    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.0)`);

    ctx.fillStyle = grad;
    ctx.fill();

    // Sharp ink stroke line on the ridge peak
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  },

  animate() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    const theme = document.documentElement.getAttribute('data-theme') || 'void';
    const activeColor = getActiveColor();

    // 1. Draw Constellation lines
    const completedStars = this.stars.filter(s => s.completed);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const connectDist = 120;
    for (let i = 0; i < completedStars.length; i++) {
      for (let j = i + 1; j < completedStars.length; j++) {
        const s1 = completedStars[i];
        const s2 = completedStars[j];
        const dx = s1.x - s2.x;
        const dy = s1.y - s2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < connectDist) {
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
      }
    }

    // Draw twinkling stars
    this.stars.forEach((s) => {
      const tVal = (Date.now() + s.twinkleOffset * 1000) / s.twinklePeriod;
      const opacity = 0.35 + 0.65 * Math.sin(tVal);

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      if (s.completed) {
        ctx.fillStyle = activeColor;
        ctx.globalAlpha = opacity;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = activeColor;
        ctx.globalAlpha = opacity * 0.16;
        ctx.fill();
      } else {
        ctx.fillStyle = theme === 'light' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.45)';
        ctx.globalAlpha = opacity * 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    });

    // 2. Generative Sumi-e Mountains
    const focusMins = this.getTodayElapsedFocusMinutes();
    
    // Smooth fractal detail progression: detail levels mapped to octaves
    const baseOctaves = 3.0;
    const maxExtraOctaves = 4.0;
    const octaves = baseOctaves + Math.min(focusMins / 5.0, maxExtraOctaves);
    
    // Smooth height growth
    const growthFactor = 1.0 + Math.min(focusMins / 30.0, 0.4);

    const layers = [
      {
        baseY: h - 170,
        amp: 45,
        roughness: 0.38,
        scale: 0.003,
        seed: 123.45,
        opacity: 0.12,
        fill: theme === 'light' ? '#78716c' : '#44403c',
        stroke: theme === 'light' ? 'rgba(120, 113, 108, 0.22)' : 'rgba(68, 64, 60, 0.35)'
      },
      {
        baseY: h - 110,
        amp: 32,
        roughness: 0.42,
        scale: 0.006,
        seed: 456.78,
        opacity: 0.22,
        fill: theme === 'light' ? '#57534e' : '#292524',
        stroke: theme === 'light' ? 'rgba(87, 83, 78, 0.3)' : 'rgba(41, 37, 36, 0.45)'
      },
      {
        baseY: h - 50,
        amp: 20,
        roughness: 0.46,
        scale: 0.012,
        seed: 789.01,
        opacity: 0.38,
        fill: theme === 'light' ? '#292524' : '#1c1917',
        stroke: theme === 'light' ? 'rgba(41, 37, 36, 0.45)' : 'rgba(28, 25, 22, 0.65)'
      }
    ];

    layers.forEach((layer) => {
      const points = [];
      const step = 8;
      const layerAmp = layer.amp * growthFactor;

      for (let x = 0; x <= w + step; x += step) {
        const y = this.getMountainHeight(x, layer.baseY, layerAmp, layer.roughness, layer.scale, octaves, layer.seed);
        points.push({ x, y });
      }

      // Draw the bezier overlapping ridge
      this.drawSumiRidge(ctx, points, theme, layer.fill, layer.stroke, layer.opacity, h, layer.baseY);

      // Draw mist (foggy horizon wash)
      const mistColor = theme === 'light' ? '255, 255, 255' : '10, 10, 12';
      const mistGrad = ctx.createLinearGradient(0, layer.baseY - 40, 0, h);
      mistGrad.addColorStop(0, `rgba(${mistColor}, 0)`);
      mistGrad.addColorStop(0.4, `rgba(${mistColor}, ${0.18 * layer.opacity})`);
      mistGrad.addColorStop(0.8, `rgba(${mistColor}, ${0.45 * layer.opacity})`);
      mistGrad.addColorStop(1, `rgba(${mistColor}, 0.8)`);
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, layer.baseY - 40, w, h - (layer.baseY - 40));
    });

    this.animId = requestAnimationFrame(() => this.animate());
  },

  hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 50, g: 50, b: 50 };
  }
};

const ZenMode = {
  active: false,

  init() {
    const btn = document.getElementById('zen-toggle-btn');
    if (!btn) return;

    btn.addEventListener('click', () => this.toggle());

    // Auto-dim mouse tracker
    let mouseTimer;
    document.addEventListener('mousemove', () => {
      if (this.active) {
        document.body.style.cursor = 'default';
        clearTimeout(mouseTimer);
        mouseTimer = setTimeout(() => {
          if (this.active && window.isRunning) {
            document.body.style.cursor = 'none';
          }
        }, 3000);
      }
    });

    // Keyboard shortcut (z key)
    document.addEventListener('keydown', (e) => {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Initialize sub-systems for pebbles, wave canvas, generative garden, and sumi-e bg system
    ZenPebbles.init();
    ZenWave.init();
    GardenSystem.init();
    ZenBgSystem.init();
  },

  toggle() {
    this.active = !this.active;
    const btn = document.getElementById('zen-toggle-btn');

    if (btn) {
      btn.setAttribute('aria-pressed', this.active ? 'true' : 'false');
      btn.classList.toggle('active', this.active);
    }

    document.body.classList.toggle('zen-mode-active', this.active);

    const garden = document.getElementById('zen-rock-garden');
    if (garden) {
      garden.hidden = !this.active;
    }

    if (this.active) {
      // Auto mix rain/space drone at low volume for calm
      if (window.getCtx) window.getCtx();

      const sliderRain = document.getElementById('slider-rain');
      const sliderSpace = document.getElementById('slider-space');
      if (sliderRain) sliderRain.value = '20';
      if (sliderSpace) sliderSpace.value = '20';

      if (window.activeSounds) {
        if (!window.activeSounds.rain && window.startAmbientSound) {
          window.startAmbientSound('rain');
        }
        if (!window.activeSounds.space && window.startAmbientSound) {
          window.startAmbientSound('space');
        }
      }
      if (window.updateAmbientVolume) window.updateAmbientVolume();

      // Trigger Grounding Sound Bath (Tibetan Singing Bowl)
      if (window.playSingingBowl) window.playSingingBowl();

      // Start wave visual ripples, generative tree growth loop, and sumi-e bg system
      ZenWave.start();
      GardenSystem.start();
      ZenBgSystem.start();

      // Set initial colors
      if (window.updateZenColors) window.updateZenColors();
    } else {
      document.body.style.cursor = 'default';
      // Stop wave visual ripples, generative tree growth loop, and sumi-e bg system
      ZenWave.stop();
      GardenSystem.stop();
      ZenBgSystem.stop();
      // Remove circadian color variables
      document.body.style.removeProperty('--zen-bg-1');
      document.body.style.removeProperty('--zen-bg-2');
      document.body.style.removeProperty('--zen-bg-3');
      document.body.style.removeProperty('--zen-bg-4');
    }

    TimeWarp.update();
  }
};

// ============================================================
// 11. SPOTLIGHT ONBOARDING SYSTEM (Guided first-visit showcase)
// ============================================================
const OnboardingSystem = {
  currentStep: 0,
  steps: [],
  resizeHandler: null,
  _hasEscListener: false,
  _resizeTimer: null,

  init() {
    this.steps = [
      {
        elementId: 'zen-toggle-btn',
        text: "🔹 <strong>Zen Mode (Z):</strong> Focus with a minimal interface and distraction-free timer view."
      },
      {
        elementId: 'shield-toggle-btn',
        text: "🛡️ <strong>Cinema Mode (F):</strong> Enter an immersive focus environment with dynamic visuals."
      },
      {
        elementId: 'palette-toggle-btn',
        text: "🔍 <strong>Command Palette (Ctrl+K):</strong> Access tools, themes, and actions instantly."
      },
      {
        elementId: 'history-view-toggle',
        text: "🧬 <strong>DNA Strand View:</strong> Visualize your focus history through an interactive 3D timeline."
      },
      {
        elementId: 'ai-predictor-section',
        text: "🔮 <strong>Circadian AI Forecast:</strong> Discover your peak focus hours using intelligent predictions."
      }
    ];

    const nextBtn = document.getElementById('onboarding-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.next());
    }

    const skipBtn = document.getElementById('onboarding-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.finish());
    }

    const closeBtn = document.getElementById('onboarding-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.finish());
    }

    // Bind Esc key global dismiss handler (only once)
    if (!this._hasEscListener) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const overlay = document.getElementById('onboarding-overlay');
          if (overlay && !overlay.hasAttribute('hidden')) {
            this.finish();
          }
        }
      });
      this._hasEscListener = true;
    }

    // Check if completed already for auto-start
    if (localStorage.getItem('zenclox_onboarding_completed_v1') === 'true') {
      return;
    }

    // Wait for first paint cycle to complete before launching
    // This ensures all CSS transitions, theme loads, and layout shifts have settled
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => this.start(), 800);
      });
    });
  },

  start() {
    const overlay = document.getElementById('onboarding-overlay');
    const tooltip = document.getElementById('onboarding-tooltip');
    if (!overlay) return;

    // Reset tooltip to invisible before showing overlay
    if (tooltip) {
      tooltip.style.opacity = '0';
      tooltip.style.left = '0';
      tooltip.style.top = '0';
    }

    // Show overlay
    overlay.removeAttribute('hidden');
    this.currentStep = 0;
    this.showStep();

    // Debounced resize handler to avoid stuttery recalculations
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.resizeHandler = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.showStep(), 150);
    };
    window.addEventListener('resize', this.resizeHandler);
  },

  showStep() {
    const overlay = document.getElementById('onboarding-overlay');
    const tooltip = document.getElementById('onboarding-tooltip');
    const textEl = document.getElementById('onboarding-text');
    const nextBtn = document.getElementById('onboarding-next-btn');
    if (!overlay || !tooltip || !textEl || this.currentStep >= this.steps.length) return;

    // Immediately hide tooltip so it never flashes at the old/wrong position
    tooltip.style.opacity = '0';

    const step = this.steps[this.currentStep];
    const el = document.getElementById(step.elementId);

    if (!el) {
      this.next();
      return;
    }

    const initialRect = el.getBoundingClientRect();
    if (initialRect.width === 0 && initialRect.height === 0) {
      this.next();
      return;
    }

    // Scroll to element smoothly
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll to settle, then use rAF to ensure browser has painted
    setTimeout(() => {
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();

        // Verify rect is valid (not at 0,0 with no dimensions)
        if (rect.width === 0 && rect.height === 0) {
          this.next();
          return;
        }

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radius = Math.max(rect.width, rect.height) / 2 + 10;

        // Draw the radial gradient spotlight
        overlay.style.background = `radial-gradient(circle ${radius}px at ${cx}px ${cy}px, transparent 96%, rgba(0, 0, 0, 0.8) 100%)`;

        // Set tooltip text
        textEl.innerHTML = step.text;

        // Set button text for final step
        if (this.currentStep === this.steps.length - 1) {
          nextBtn.textContent = 'Finish ✓';
        } else {
          nextBtn.textContent = 'Next →';
        }

        // Make tooltip visible for measurement but keep it invisible via opacity
        tooltip.style.display = 'flex';
        tooltip.style.opacity = '0';

        // Use another rAF to guarantee the tooltip has been laid out for measurement
        requestAnimationFrame(() => {
          const spacing = 15;
          let tooltipTop = cy + radius + spacing;
          let tooltipLeft = cx - tooltip.offsetWidth / 2;

          // Boundary checks
          if (tooltipLeft < 15) tooltipLeft = 15;
          if (tooltipLeft + tooltip.offsetWidth > window.innerWidth - 15) {
            tooltipLeft = window.innerWidth - tooltip.offsetWidth - 15;
          }

          // If tooltip overflows bottom, position above the target
          if (tooltipTop + tooltip.offsetHeight > window.innerHeight - 15) {
            tooltipTop = rect.top - radius - tooltip.offsetHeight - spacing;
          }

          // If it also overflows top, center vertically in viewport
          if (tooltipTop < 15) {
            tooltipTop = window.innerHeight / 2 - tooltip.offsetHeight / 2;
          }

          // Set final position BEFORE making visible
          tooltip.style.left = `${tooltipLeft}px`;
          tooltip.style.top = `${tooltipTop}px`;

          // Fade in after position is locked — one more rAF to ensure paint
          requestAnimationFrame(() => {
            tooltip.style.opacity = '1';
          });
        });
      });
    }, 400);
  },

  next() {
    this.currentStep++;
    if (this.currentStep >= this.steps.length) {
      this.finish();
    } else {
      this.showStep();
    }
  },

  finish() {
    const overlay = document.getElementById('onboarding-overlay');
    const tooltip = document.getElementById('onboarding-tooltip');
    if (tooltip) {
      tooltip.style.opacity = '0';
    }
    if (overlay) {
      overlay.setAttribute('hidden', '');
    }
    localStorage.setItem('zenclox_onboarding_completed_v1', 'true');
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    clearTimeout(this._resizeTimer);
  }
};

// ============================================================
const initFeatures = () => {
  // Initialize new systems
  MoodSystem.init();
  CommandPalette.init();
  AIPredictor.init();
  AIReport.init();
  ZenMode.init();
  DNASystem.init();
  OnboardingSystem.init();

  // Sync allHistory with the current day's focusHistory if needed to backfill missed sessions
  let allHistory = [];
  try {
    allHistory = JSON.parse(localStorage.getItem(ALL_HISTORY_KEY)) || [];
  } catch (e) {}

  const localHistory = window.focusHistory || [];
  const todayStrVal = getTodayStr();
  const existingTodayTimes = new Set(
    allHistory
      .filter(item => item.date === todayStrVal)
      .map(item => item.time)
  );

  let updated = false;
  localHistory.forEach(item => {
    if (!existingTodayTimes.has(item.time)) {
      const entry = { ...item };
      if (!entry.date) entry.date = todayStrVal;
      if (!entry.mood) entry.mood = 'good';
      allHistory.unshift(entry);
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem(ALL_HISTORY_KEY, JSON.stringify(allHistory));
  }

  // Load persistent initial data
  AIPredictor.renderForecast();

  // Bind view-switcher toggle in history card
  const historyToggleBtn = document.getElementById('history-view-toggle');
  const historyList = document.getElementById('history-list');
  const dnaView = document.getElementById('dna-strand-view');

  if (historyToggleBtn && historyList && dnaView) {
    let currentView = 'list'; // 'list' or 'dna'
    historyToggleBtn.addEventListener('click', () => {
      if (currentView === 'list') {
        currentView = 'dna';
        historyToggleBtn.textContent = '📋 List View';
        historyList.style.display = 'none';
        dnaView.style.display = 'block';
        DNASystem.startAnimation();
      } else {
        currentView = 'list';
        historyToggleBtn.textContent = '🧬 DNA View';
        historyList.style.display = 'block';
        dnaView.style.display = 'none';
        DNASystem.stopAnimation();
      }
    });
  }

  // Hook 1: Intercept addHistoryEntry to persist in long term and show quotes
  const originalAddHistoryEntry = window.addHistoryEntry;
  if (originalAddHistoryEntry) {
    window.addHistoryEntry = function (durSecs) {
      // Call original app.js logic
      originalAddHistoryEntry(durSecs);

      const entry = window.focusHistory[0];
      if (entry) {
        entry.date = getTodayStr();
        entry.mood = MoodSystem.selectedMood;

        // Persist to all time local storage
        let allHistory = [];
        try {
          allHistory = JSON.parse(localStorage.getItem(ALL_HISTORY_KEY)) || [];
        } catch (e) { }
        allHistory.unshift(entry);
        localStorage.setItem(ALL_HISTORY_KEY, JSON.stringify(allHistory));

        // Update forecast curves
        AIPredictor.renderForecast();
      }
    };
  }

  // Hook 2: Intercept submitReflection to bind mood inputs
  const originalSubmitReflection = window.submitReflection;
  if (originalSubmitReflection) {
    window.submitReflection = function (outcome) {
      if (window.focusHistory.length > 0 && window.focusHistory[0].outcome === undefined) {
        window.focusHistory[0].mood = MoodSystem.selectedMood;

        // Persist mood to all-time entry
        let allHistory = [];
        try {
          allHistory = JSON.parse(localStorage.getItem(ALL_HISTORY_KEY)) || [];
          if (allHistory.length > 0) {
            allHistory[0].mood = MoodSystem.selectedMood;
            allHistory[0].outcome = outcome;
            // Recalculate velocity with reflection details
            allHistory[0].velocity = window.focusHistory[0].velocity;
            localStorage.setItem(ALL_HISTORY_KEY, JSON.stringify(allHistory));
          }
        } catch (e) { }

        // Save mood for heatmap border color gradient mapping
        let dateMoods = {};
        try {
          dateMoods = JSON.parse(localStorage.getItem(MOODS_KEY)) || {};
        } catch (e) { }

        const todayKey = getTodayStr();
        if (!dateMoods[todayKey]) dateMoods[todayKey] = [];
        dateMoods[todayKey].push(MoodSystem.selectedMood);
        localStorage.setItem(MOODS_KEY, JSON.stringify(dateMoods));
      }

      // Call original reflection submission
      originalSubmitReflection(outcome);

      // Refresh visuals
      MoodSystem.resetSelection();
      window.renderHeatmap();
      DNASystem.renderStrand();
    };
  }

  // Hook 3: Intercept renderHeatmap to apply mood color borders
  const originalRenderHeatmap = window.renderHeatmap;
  if (originalRenderHeatmap) {
    window.renderHeatmap = function () {
      // Execute standard cell coloring first
      originalRenderHeatmap();

      let dateMoods = {};
      try {
        dateMoods = JSON.parse(localStorage.getItem(MOODS_KEY)) || {};
      } catch (e) { }

      const cells = document.querySelectorAll('.heatmap-cell');
      const now = new Date();

      for (let i = 6; i >= 0; i--) {
        const dt = new Date(now);
        dt.setDate(dt.getDate() - i);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

        const cellIdx = 6 - i;
        const cell = cells[cellIdx];

        if (cell && dateMoods[key] && dateMoods[key].length > 0) {
          const moods = dateMoods[key];
          const finalMood = moods[moods.length - 1] || 'neutral';
          const moodColor = MOOD_COLORS[finalMood] || '#9ca3af';
          
          cell.style.borderColor = moodColor;
          cell.style.border = `2px solid ${moodColor}`;
          cell.style.backgroundImage = 'none';
          cell.style.backgroundOrigin = '';
          cell.style.backgroundClip = '';
        }
      }
    };
  }

  // Hook 4: Intercept updateDisplay to trigger Time Warp perspective shifts
  const originalUpdateDisplay = window.updateDisplay;
  if (originalUpdateDisplay) {
    window.updateDisplay = function () {
      originalUpdateDisplay();
      TimeWarp.update();
    };
  }

  // Listen to theme switch event to redraw canvas-based curves instantly
  document.addEventListener('themechange', () => {
    setTimeout(() => {
      if (typeof AIPredictor !== 'undefined' && AIPredictor.renderForecast) {
        AIPredictor.renderForecast();
      }
      if (typeof DNASystem !== 'undefined' && DNASystem.renderStrand) {
        DNASystem.renderStrand();
      }
    }, 20);
  });

  // Hook 5: Intercept onCycleEnd to handle quotes and break activities
  const originalOnCycleEnd = window.onCycleEnd;
  if (originalOnCycleEnd) {
    window.onCycleEnd = function () {
      const isSessionFocus = window.isFocus;
      const focusMinsVal = window.focusMins;

      // Render quote at the moment break triggers
      if (isSessionFocus) {
        const lastSession = window.history[0];
        QuoteOracle.showQuote(lastSession);
      }

      // Execute original completion flash and modal triggers
      originalOnCycleEnd();

      // Trigger context-aware smart break card when entering break
      if (isSessionFocus) {
        setTimeout(() => {
          BreakSuggestions.generate(focusMinsVal);
        }, 1900); // Trigger after completion flash ends
      } else {
        BreakSuggestions.hide();
      }
    };
  }
};

// Wait for app.js globals to be bound securely
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initFeatures);
} else {
  initFeatures();
}
