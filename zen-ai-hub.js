/**
 * Zenclox — Zen AI Command & Control Hub (Modern Squircle + Teaser Tooltip UX)
 * Full client-side module with squircle chat icon, teaser badge tooltip, and action cards.
 */
(function () {
  'use strict';

  const ENGINE_MODE_KEY = 'zenclox_ai_engine_mode';
  const N8N_WEBHOOK_KEY = 'zenclox_n8n_webhook';
  const CHAT_HISTORY_KEY = 'zenclox_ai_chat_history_v1';
  const SUBTASKS_KEY = 'zenclox_ai_subtasks_v1';

  let engineMode = localStorage.getItem(ENGINE_MODE_KEY) || 'standard';
  let n8nWebhookUrl = localStorage.getItem(N8N_WEBHOOK_KEY) || '';
  let chatHistory = [];
  let subtasks = [];

  try {
    chatHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY)) || [];
  } catch (e) {
    chatHistory = [];
  }

  try {
    subtasks = JSON.parse(localStorage.getItem(SUBTASKS_KEY)) || [];
  } catch (e) {
    subtasks = [];
  }

  const SMART_PROMPTS = [
    { label: '✨ Plan Focus Session', query: 'Break down my current task into a 25-min Pomodoro plan with subtasks.' },
    { label: '🛡️ Toggle Cinema Mode', query: 'What is Cinema Mode / Flow Shield?' },
    { label: '🌊 Set Deep Focus Vibe', query: 'Set up an optimal deep focus environment with Ocean theme and calm ambient sounds.' },
    { label: '❓ Explain Session DNA', query: 'What is the Session DNA strand feature and how does it work?' }
  ];

  const ZENCLOX_KNOWLEDGE = [
    {
      keywords: ['cinema', 'shield', 'flow shield', 'distraction overlay', 'curtain', 'mode cinema'],
      answer: '🎬 **Cinema Mode (Flow Shield)** creates a full-screen ambient overlay that blocks all visual distractions and dims background UI so you can focus entirely on the timer circle. Press **F** key or click below to toggle!',
      actions: [
        { label: '🛡️ Toggle Cinema Mode', type: 'toggle_shield' }
      ]
    },
    {
      keywords: ['theme', 'void', 'ocean', 'forge', 'dark', 'light', 'color', 'palette'],
      answer: '🎨 Zenclox features 5 curated color themes: 🟣 **Void** (Violet default), ⚫ **Dark** (Monochrome), 🌊 **Ocean** (Cyan/Blue), 🔥 **Forge** (Warm amber), and ☀️ **Light** (Daytime).',
      actions: [
        { label: '🟣 Void Theme', type: 'set_theme', value: 'void' },
        { label: '🌊 Ocean Theme', type: 'set_theme', value: 'ocean' },
        { label: '🔥 Forge Theme', type: 'set_theme', value: 'forge' }
      ]
    },
    {
      keywords: ['sound', 'rain', 'fire', 'space', 'binaural', 'music', 'ambient', 'mixer', 'audio'],
      answer: '🎧 Zenclox ambient soundscapes are synthesized live via Web Audio API: Rain 🌧️, Cosmic Space 🌌, Crackling Fire 🔥, and Focus Binaural Beats 🎧.',
      actions: [
        { label: '⛈️ Storm Preset', type: 'set_sound_preset', preset: 'storm' },
        { label: '🌌 Space Void Preset', type: 'set_sound_preset', preset: 'space' },
        { label: '🔇 Mute All Sounds', type: 'set_sound_preset', preset: 'mute' }
      ]
    },
    {
      keywords: ['timer', 'start', 'pause', 'pomodoro', '25/5', '50/10', 'preset', 'duration', 'break', 'session'],
      answer: '⏱️ Customize Focus/Break times or use quick presets: **25/5 Classic**, **50/10 Deep**, or **90/20 Ultra**. You can also enable Box Breathing prep before sessions.',
      actions: [
        { label: '⏱️ Start 25m Focus', type: 'start_timer', mins: 25 },
        { label: '🧘 Start Box Breathing', type: 'start_breathing' },
        { label: '⏸️ Pause/Play Timer', type: 'toggle_timer' }
      ]
    },
    {
      keywords: ['dna', 'helix', 'strand', '3d', 'visualizer'],
      answer: '🧬 The **Session DNA Strand** visualizes your session history as an interactive 3D double helix! Each colored node represents a session mapped to your focus mood.',
      actions: [
        { label: '🧬 View Session DNA', type: 'open_dna' }
      ]
    },
    {
      keywords: ['zen mode', 'sanctuary', 'distraction', 'fullscreen', 'minimal'],
      answer: '🧘 **Zen Mode** strips away UI distractions, leaving only the circular timer ring and soothing generative zen graphics. Press **Z** key or click below.',
      actions: [
        { label: '🧘 Toggle Zen Mode', type: 'toggle_zen' }
      ]
    },
    {
      keywords: ['command', 'palette', 'shortcut', 'ctrl+k', 'search', 'hotkey'],
      answer: '🔍 Press **Ctrl+K** or **Cmd+K** anytime to open the Command Palette. Quick access to every feature, theme, and sound setting!',
      actions: [
        { label: '🔍 Open Command Palette', type: 'open_palette' }
      ]
    },
    {
      keywords: ['export', 'wallpaper', 'download', 'image', 'share'],
      answer: '🖼️ You can export your session summary as a high-resolution shareable wallpaper! Click **Export** in the Sessions history card.',
      actions: [
        { label: '📊 View Session History', type: 'scroll_to', element: 'history' }
      ]
    },
    {
      keywords: ['circadian', 'energy', 'forecast', 'predictor', 'curve'],
      answer: '⚡ The **Circadian Energy Predictor** estimates your peak focus hours based on your daily session patterns so you can schedule deep work effectively.',
      actions: [
        { label: '⚡ Check Focus Forecast', type: 'scroll_to', element: 'forecast' }
      ]
    },
    {
      keywords: ['streak', 'fire', 'daily', 'consecutive', 'days'],
      answer: '🔥 Keep your focus streak alive by completing at least one Pomodoro session every day! View your active streak badge at the top header.',
      actions: [
        { label: '🔥 Check Daily Streak', type: 'scroll_to', element: 'header' }
      ]
    }
  ];

  let elements = {};

  function initZenAIHub() {
    createHubDOM();
    cacheElements();
    bindEvents();
    renderChatHistory();
    renderSubtasks();
    syncSoundDeckState();
    updateStatusUI();
    showTeaserTooltip();
  }

  function createHubDOM() {
    if (document.getElementById('zen-ai-hub-container')) return;

    // Inject core widget styles directly to guarantee exact visual match
    if (!document.getElementById('zen-ai-hub-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'zen-ai-hub-styles';
      styleEl.textContent = `
        #zen-ai-hub-container {
          position: fixed !important;
          bottom: 24px !important;
          right: 24px !important;
          z-index: 99990 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-end !important;
        }

        /* Teaser Tooltip Card Anchored Above Button */
        #zen-ai-teaser-tooltip {
          position: absolute !important;
          bottom: 68px !important;
          right: 0 !important;
          width: 275px !important;
          background: #18181b !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          border-radius: 18px !important;
          padding: 12px 16px !important;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
          color: #ffffff !important;
          opacity: 0 !important;
          transform: translateY(12px) scale(0.95) !important;
          pointer-events: none !important;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          z-index: 99950 !important;
          box-sizing: border-box !important;
        }

        #zen-ai-teaser-tooltip.visible {
          opacity: 1 !important;
          transform: translateY(0) scale(1) !important;
          pointer-events: auto !important;
        }

        #zen-ai-teaser-tooltip::after {
          content: '' !important;
          position: absolute !important;
          bottom: -7px !important;
          right: 20px !important;
          width: 13px !important;
          height: 13px !important;
          background: #18181b !important;
          border-right: 1px solid rgba(255, 255, 255, 0.18) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.18) !important;
          transform: rotate(45deg) !important;
        }

        .zen-ai-teaser-close {
          position: absolute !important;
          top: 6px !important;
          right: 8px !important;
          background: transparent !important;
          border: none !important;
          color: #71717a !important;
          font-size: 0.95rem !important;
          cursor: pointer !important;
          padding: 2px 6px !important;
          border-radius: 50% !important;
          transition: color 0.15s ease !important;
          line-height: 1 !important;
          z-index: 2 !important;
        }

        .zen-ai-teaser-close:hover {
          color: #ffffff !important;
        }

        .zen-ai-teaser-body {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          cursor: pointer !important;
        }

        .zen-ai-teaser-avatar {
          width: 38px !important;
          height: 38px !important;
          border-radius: 12px !important;
          background: #27272a !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          color: #e4e4e7 !important;
          font-size: 0.78rem !important;
          font-weight: 700 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }

        .zen-ai-teaser-content {
          display: flex !important;
          flex-direction: column !important;
          gap: 1px !important;
          flex: 1 !important;
          padding-right: 14px !important;
        }

        .zen-ai-teaser-title {
          font-size: 0.82rem !important;
          font-weight: 700 !important;
          color: #f4f4f5 !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
        }

        .zen-ai-teaser-status {
          font-size: 0.66rem !important;
          color: #a1a1aa !important;
          display: flex !important;
          align-items: center !important;
          gap: 5px !important;
          margin-top: 1px !important;
        }

        .zen-ai-teaser-dot {
          width: 6px !important;
          height: 6px !important;
          border-radius: 50% !important;
          background: #22c55e !important;
          box-shadow: 0 0 6px #22c55e !important;
        }

        .zen-ai-teaser-msg {
          font-size: 0.71rem !important;
          color: #d4d4d8 !important;
          margin-top: 4px !important;
          line-height: 1.3 !important;
        }

        /* Dark Squircle Floating Trigger Button */
        #zen-ai-trigger-btn {
          position: relative !important;
          width: 52px !important;
          height: 52px !important;
          border-radius: 16px !important;
          background: #18181b !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          color: #f4f4f5 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.3) !important;
          transition: transform 0.25s ease, background 0.25s ease, box-shadow 0.25s ease !important;
        }

        #zen-ai-trigger-btn:hover {
          transform: scale(1.06) translateY(-2px) !important;
          background: #27272a !important;
          border-color: rgba(255, 255, 255, 0.28) !important;
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.7) !important;
        }

        #zen-ai-trigger-badge {
          position: absolute !important;
          top: -4px !important;
          right: -4px !important;
          background: #ef4444 !important;
          color: #ffffff !important;
          font-size: 0.65rem !important;
          font-weight: 700 !important;
          width: 18px !important;
          height: 18px !important;
          border-radius: 50% !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 2px solid #18181b !important;
          box-shadow: 0 2px 6px rgba(239, 68, 68, 0.5) !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    const container = document.createElement('div');
    container.id = 'zen-ai-hub-container';
    container.innerHTML = `
      <!-- TEASER TOOLTIP CARD (ANCHORED ABOVE BUTTON) -->
      <div id="zen-ai-teaser-tooltip" class="zen-ai-teaser-tooltip">
        <button id="zen-ai-teaser-close" class="zen-ai-teaser-close" title="Dismiss">&times;</button>
        <div class="zen-ai-teaser-body" id="zen-ai-teaser-click-area">
          <div class="zen-ai-teaser-avatar">AI</div>
          <div class="zen-ai-teaser-content">
            <div class="zen-ai-teaser-title">Zen AI Assistant</div>
            <div class="zen-ai-teaser-status">
              <span class="zen-ai-teaser-dot"></span> Zen Copilot
            </div>
            <div class="zen-ai-teaser-msg">Ready to maximize your focus flow?</div>
          </div>
        </div>
      </div>

      <!-- FLOATING SQUIRCLE TRIGGER BUTTON -->
      <button id="zen-ai-trigger-btn" class="zen-ai-trigger-btn" title="Zen AI Copilot (Alt+A)" aria-label="Open Zen AI Hub">
        <svg class="zen-ai-chat-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>

      <!-- MAIN DRAWER MODAL -->
      <div id="zen-ai-drawer" class="zen-ai-drawer" hidden aria-modal="true" role="dialog">
        
        <!-- DRAWER HEADER -->
        <div class="zen-ai-header">
          <div class="zen-ai-brand">
            <div class="zen-ai-logo-badge">AI</div>
            <div>
              <div class="zen-ai-title">Zen AI Assistant</div>
              <div class="zen-ai-subtitle">
                <span id="zen-ai-status-dot" class="zen-ai-status-dot online"></span>
                <span id="zen-ai-status-text">Online now</span>
              </div>
            </div>
          </div>
          <div class="zen-ai-header-actions">
            <button id="zen-ai-config-btn" class="zen-ai-icon-btn" title="AI Engine Settings" aria-label="AI Settings">⚙️</button>
            <button id="zen-ai-close-btn" class="zen-ai-icon-btn" title="Close Drawer" aria-label="Close Drawer">&times;</button>
          </div>
        </div>

        <!-- TAB NAVIGATION -->
        <div class="zen-ai-tabs" role="tablist">
          <button class="zen-ai-tab active" data-tab="chat" role="tab" aria-selected="true">🤖 AI Assistant</button>
          <button class="zen-ai-tab" data-tab="sounds" role="tab" aria-selected="false">🎧 Sound Deck</button>
          <button class="zen-ai-tab" data-tab="goal" role="tab" aria-selected="false">🎯 Focus Goal</button>
        </div>

        <!-- TAB CONTENT 1: AI CHATBOT -->
        <div id="zen-ai-tab-chat" class="zen-ai-tab-content active">
          <div class="zen-ai-prompt-chips">
            ${SMART_PROMPTS.map(p => `
              <button class="zen-ai-chip" data-query="${escapeHtml(p.query)}">${p.label}</button>
            `).join('')}
          </div>

          <div id="zen-ai-messages" class="zen-ai-messages"></div>

          <form id="zen-ai-chat-form" class="zen-ai-chat-form">
            <input type="text" id="zen-ai-chat-input" placeholder="Ask Zen AI or request UI commands..." autocomplete="off" />
            <button type="submit" id="zen-ai-send-btn" class="zen-ai-send-btn" title="Send Message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>

        <!-- TAB CONTENT 2: QUICK SOUND DECK -->
        <div id="zen-ai-tab-sounds" class="zen-ai-tab-content">
          <div class="zen-ai-section-title">Quick Ambient Mix Presets</div>
          <div class="zen-ai-sound-presets">
            <button class="zen-ai-preset-btn" data-preset="storm">⛈️ Storm</button>
            <button class="zen-ai-preset-btn" data-preset="space">🌌 Space</button>
            <button class="zen-ai-preset-btn" data-preset="hearth">🔥 Hearth</button>
            <button class="zen-ai-preset-btn" data-preset="mute">🔇 Mute All</button>
          </div>

          <div class="zen-ai-section-title" style="margin-top: 14px;">Live Audio Channels</div>
          <div class="zen-ai-volume-rows">
            <div class="zen-ai-vol-row">
              <span>🌧️ Rain</span>
              <input type="range" class="zen-ai-vol-slider" id="zen-ai-rain-vol" min="0" max="100" value="0" />
              <span id="zen-ai-rain-val" class="zen-ai-vol-val">0%</span>
            </div>
            <div class="zen-ai-vol-row">
              <span>🌌 Space</span>
              <input type="range" class="zen-ai-vol-slider" id="zen-ai-space-vol" min="0" max="100" value="0" />
              <span id="zen-ai-space-val" class="zen-ai-vol-val">0%</span>
            </div>
            <div class="zen-ai-vol-row">
              <span>🔥 Fire</span>
              <input type="range" class="zen-ai-vol-slider" id="zen-ai-fire-vol" min="0" max="100" value="0" />
              <span id="zen-ai-fire-val" class="zen-ai-vol-val">0%</span>
            </div>
            <div class="zen-ai-vol-row">
              <span>🎧 Binaural</span>
              <input type="range" class="zen-ai-vol-slider" id="zen-ai-binaural-vol" min="0" max="100" value="0" />
              <span id="zen-ai-binaural-val" class="zen-ai-vol-val">0%</span>
            </div>
            <div class="zen-ai-vol-row master">
              <span>🔊 Master Volume</span>
              <input type="range" class="zen-ai-vol-slider" id="zen-ai-master-vol" min="0" max="100" value="50" />
              <span id="zen-ai-master-val" class="zen-ai-vol-val">50%</span>
            </div>
          </div>
        </div>

        <!-- TAB CONTENT 3: FOCUS TASK GOAL -->
        <div id="zen-ai-tab-goal" class="zen-ai-tab-content">
          <div class="zen-ai-section-title">Current Session Intention</div>
          <div class="zen-ai-goal-box">
            <input type="text" id="zen-ai-goal-input" placeholder="What is your main focus goal right now?" />
            <button id="zen-ai-sync-goal-btn" class="zen-ai-action-btn">Save Goal</button>
          </div>

          <div class="zen-ai-subtask-header">
            <div class="zen-ai-section-title">Session Action Checklist</div>
            <button id="zen-ai-gen-subtasks-btn" class="zen-ai-mini-btn" title="Auto-generate subtasks using AI">✨ AI Breakdown</button>
          </div>

          <form id="zen-ai-add-subtask-form" class="zen-ai-subtask-form">
            <input type="text" id="zen-ai-subtask-input" placeholder="Add micro step..." />
            <button type="submit" class="zen-ai-mini-add-btn">+</button>
          </form>

          <ul id="zen-ai-subtask-list" class="zen-ai-subtask-list"></ul>
        </div>

      </div>

      <!-- PROFESSIONAL SETTINGS & DEVELOPER MODAL -->
      <div id="zen-ai-config-modal" class="zen-ai-modal" hidden>
        <div class="zen-ai-modal-content">
          <div class="zen-ai-modal-header">
            <h3>⚡ AI Engine Settings</h3>
            <button id="zen-ai-config-close" class="zen-ai-icon-btn">&times;</button>
          </div>
          
          <div class="zen-ai-mode-selector">
            <label class="zen-ai-radio-label ${engineMode === 'standard' ? 'selected' : ''}">
              <input type="radio" name="ai-engine-mode" value="standard" ${engineMode === 'standard' ? 'checked' : ''} />
              <div>
                <strong>🟢 Standard Zen AI (Built-in Zero-Config)</strong>
                <p>Instant responses, offline friendly, 100% private. No setup required.</p>
              </div>
            </label>

            <label class="zen-ai-radio-label ${engineMode === 'custom_n8n' ? 'selected' : ''}">
              <input type="radio" name="ai-engine-mode" value="custom_n8n" ${engineMode === 'custom_n8n' ? 'checked' : ''} />
              <div>
                <strong>🔌 Custom Webhook (n8n / xAI Grok / OpenAI)</strong>
                <p>Connect your n8n workflow or backend powered by Grok AI, ChatGPT, or Claude.</p>
              </div>
            </label>
          </div>

          <div id="zen-ai-developer-fields" class="zen-ai-developer-fields" ${engineMode === 'custom_n8n' ? '' : 'style="display:none;"'}>
            <div class="zen-ai-field-group">
              <label for="zen-ai-webhook-input">n8n / AI Webhook Endpoint URL</label>
              <input type="url" id="zen-ai-webhook-input" placeholder="https://n8n.your-domain.com/webhook/zenclox-chat" value="${escapeHtml(n8nWebhookUrl)}" />
            </div>
            <div class="zen-ai-config-status" id="zen-ai-config-status"></div>
            <button id="zen-ai-test-webhook-btn" class="zen-ai-secondary-btn" style="margin-top: 6px;">Test Connection</button>
          </div>

          <div class="zen-ai-template-download-note">
            <span>Need the n8n template?</span>
            <a id="zen-ai-download-n8n-template" href="zenclox-n8n-workflow.json" download="zenclox-n8n-workflow.json">Download Template JSON</a>
          </div>

          <div class="zen-ai-modal-actions">
            <button id="zen-ai-save-webhook-btn" class="zen-ai-primary-btn">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
  }

  function cacheElements() {
    elements = {
      triggerBtn: document.getElementById('zen-ai-trigger-btn'),
      triggerBadge: document.getElementById('zen-ai-trigger-badge'),
      teaserTooltip: document.getElementById('zen-ai-teaser-tooltip'),
      teaserClose: document.getElementById('zen-ai-teaser-close'),
      teaserClickArea: document.getElementById('zen-ai-teaser-click-area'),
      drawer: document.getElementById('zen-ai-drawer'),
      closeBtn: document.getElementById('zen-ai-close-btn'),
      configBtn: document.getElementById('zen-ai-config-btn'),
      statusDot: document.getElementById('zen-ai-status-dot'),
      statusText: document.getElementById('zen-ai-status-text'),
      messagesContainer: document.getElementById('zen-ai-messages'),
      chatForm: document.getElementById('zen-ai-chat-form'),
      chatInput: document.getElementById('zen-ai-chat-input'),
      goalInput: document.getElementById('zen-ai-goal-input'),
      syncGoalBtn: document.getElementById('zen-ai-sync-goal-btn'),
      genSubtasksBtn: document.getElementById('zen-ai-gen-subtasks-btn'),
      subtaskForm: document.getElementById('zen-ai-add-subtask-form'),
      subtaskInput: document.getElementById('zen-ai-subtask-input'),
      subtaskList: document.getElementById('zen-ai-subtask-list'),
      configModal: document.getElementById('zen-ai-config-modal'),
      configClose: document.getElementById('zen-ai-config-close'),
      webhookInput: document.getElementById('zen-ai-webhook-input'),
      saveWebhookBtn: document.getElementById('zen-ai-save-webhook-btn'),
      testWebhookBtn: document.getElementById('zen-ai-test-webhook-btn'),
      configStatus: document.getElementById('zen-ai-config-status'),
      developerFields: document.getElementById('zen-ai-developer-fields')
    };
  }

  function bindEvents() {
    elements.triggerBtn.addEventListener('click', toggleDrawer);
    elements.closeBtn.addEventListener('click', closeDrawer);

    if (elements.teaserClickArea) {
      elements.teaserClickArea.addEventListener('click', () => {
        hideTeaserTooltip();
        toggleDrawer();
      });
    }

    if (elements.teaserClose) {
      elements.teaserClose.addEventListener('click', (e) => {
        e.stopPropagation();
        hideTeaserTooltip();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggleDrawer();
      }
    });

    document.querySelectorAll('.zen-ai-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
    });

    document.querySelectorAll('.zen-ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-query');
        if (query) {
          elements.chatInput.value = query;
          handleUserSubmit(query);
        }
      });
    });

    elements.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = elements.chatInput.value.trim();
      if (val) handleUserSubmit(val);
    });

    elements.syncGoalBtn.addEventListener('click', syncGoalToMainApp);
    elements.genSubtasksBtn.addEventListener('click', autoGenerateSubtasks);

    elements.subtaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = elements.subtaskInput.value.trim();
      if (text) {
        subtasks.push({ id: Date.now(), text, done: false });
        elements.subtaskInput.value = '';
        saveSubtasks();
        renderSubtasks();
      }
    });

    document.querySelectorAll('.zen-ai-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applySoundPreset(btn.getAttribute('data-preset'));
      });
    });

    ['rain', 'space', 'fire', 'binaural', 'master'].forEach(sound => {
      const slider = document.getElementById(`zen-ai-${sound}-vol`);
      const label = document.getElementById(`zen-ai-${sound}-val`);
      if (slider) {
        slider.addEventListener('input', () => {
          if (label) label.textContent = `${slider.value}%`;
          syncVolumeToMainApp(sound, slider.value);
        });
      }
    });

    elements.configBtn.addEventListener('click', () => {
      elements.configModal.hidden = false;
    });
    elements.configClose.addEventListener('click', () => {
      elements.configModal.hidden = true;
    });

    document.querySelectorAll('input[name="ai-engine-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        engineMode = e.target.value;
        document.querySelectorAll('.zen-ai-radio-label').forEach(lbl => {
          lbl.classList.toggle('selected', lbl.querySelector('input').checked);
        });
        elements.developerFields.style.display = engineMode === 'custom_n8n' ? 'block' : 'none';
      });
    });

    elements.saveWebhookBtn.addEventListener('click', saveEngineSettings);
    elements.testWebhookBtn.addEventListener('click', testWebhookConnection);
  }

  function showTeaserTooltip() {
    if (elements.teaserTooltip) {
      setTimeout(() => {
        elements.teaserTooltip.classList.add('visible');
      }, 200);
    }
  }

  function hideTeaserTooltip() {
    if (elements.teaserTooltip) {
      elements.teaserTooltip.classList.remove('visible');
      sessionStorage.setItem('zenclox_ai_teaser_dismissed', 'true');
    }
    if (elements.triggerBadge) {
      elements.triggerBadge.style.display = 'none';
    }
  }

  function toggleDrawer() {
    hideTeaserTooltip();
    const isHidden = elements.drawer.hidden;
    elements.drawer.hidden = !isHidden;
    if (isHidden) {
      syncStateFromMainApp();
      if (chatHistory.length === 0) {
        sendWelcomeMessage();
      }
      elements.chatInput.focus();
    }
  }

  function closeDrawer() {
    elements.drawer.hidden = true;
  }

  function switchTab(tabId) {
    document.querySelectorAll('.zen-ai-tab').forEach(t => {
      const active = t.getAttribute('data-tab') === tabId;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active);
    });

    document.querySelectorAll('.zen-ai-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `zen-ai-tab-${tabId}`);
    });
  }

  function syncStateFromMainApp() {
    const mainIntention = document.getElementById('intention-input');
    if (mainIntention && elements.goalInput) {
      elements.goalInput.value = mainIntention.value || window.currentIntention || '';
    }
    syncSoundDeckState();
  }

  function syncSoundDeckState() {
    const soundMap = {
      rain: 'rain-volume',
      space: 'space-volume',
      fire: 'fire-volume',
      binaural: 'binaural-volume'
    };

    for (const [sound, mainId] of Object.entries(soundMap)) {
      const mainEl = document.getElementById(mainId);
      const hubEl = document.getElementById(`zen-ai-${sound}-vol`);
      const hubVal = document.getElementById(`zen-ai-${sound}-val`);
      if (mainEl && hubEl) {
        hubEl.value = mainEl.value || 0;
        if (hubVal) hubVal.textContent = `${hubEl.value}%`;
      }
    }

    const mainMaster = document.getElementById('volume-slider');
    const hubMaster = document.getElementById('zen-ai-master-vol');
    const hubMasterVal = document.getElementById('zen-ai-master-val');
    if (mainMaster && hubMaster) {
      hubMaster.value = mainMaster.value || 50;
      if (hubMasterVal) hubMasterVal.textContent = `${hubMaster.value}%`;
    }
  }

  function syncVolumeToMainApp(sound, value) {
    if (sound === 'master') {
      const mainMaster = document.getElementById('volume-slider');
      if (mainMaster) {
        mainMaster.value = value;
        mainMaster.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      const mainSlider = document.getElementById(`${sound}-volume`);
      if (mainSlider) {
        mainSlider.value = value;
        mainSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function applySoundPreset(presetKey) {
    const presets = {
      storm: { rain: 70, space: 0, fire: 40, binaural: 30 },
      space: { rain: 0, space: 70, fire: 0, binaural: 80 },
      hearth: { rain: 40, space: 0, fire: 80, binaural: 0 },
      mute: { rain: 0, space: 0, fire: 0, binaural: 0 }
    };

    const target = presets[presetKey];
    if (!target) return;

    for (const [sound, val] of Object.entries(target)) {
      const hubSlider = document.getElementById(`zen-ai-${sound}-vol`);
      const hubVal = document.getElementById(`zen-ai-${sound}-val`);
      if (hubSlider) {
        hubSlider.value = val;
        if (hubVal) hubVal.textContent = `${val}%`;
        syncVolumeToMainApp(sound, val);
      }
    }
  }

  function syncGoalToMainApp() {
    const goalText = elements.goalInput.value.trim();
    const mainIntention = document.getElementById('intention-input');
    if (mainIntention) {
      mainIntention.value = goalText;
      mainIntention.dispatchEvent(new Event('input', { bubbles: true }));
      mainIntention.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.currentIntention = goalText;
    showNotification(`Target goal saved: "${goalText}"`);
  }

  async function handleUserSubmit(userMessage) {
    elements.chatInput.value = '';

    const userMsgObj = { sender: 'user', text: userMessage, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    chatHistory.push(userMsgObj);
    renderChatHistory();

    showTypingIndicator();

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'void';
    const timerDisplay = document.getElementById('timer-display')?.textContent || '25:00';
    const modeLabel = document.getElementById('mode-label')?.textContent || 'Focus';

    const statePayload = {
      message: userMessage,
      context: {
        theme: currentTheme,
        timer: {
          isRunning: !!window.isRunning,
          mode: modeLabel,
          remaining: timerDisplay
        },
        intention: elements.goalInput.value || window.currentIntention || ''
      }
    };

    if (engineMode === 'custom_n8n' && n8nWebhookUrl && navigator.onLine) {
      try {
        const response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statePayload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        removeTypingIndicator();
        handleAIResponse(data.reply || data.output || JSON.stringify(data), data.actions || []);
      } catch (err) {
        console.warn('n8n Webhook Error, gracefully falling back to Built-in AI:', err);
        removeTypingIndicator();
        processLocalRAGResponse(userMessage);
      }
    } else {
      setTimeout(() => {
        removeTypingIndicator();
        processLocalRAGResponse(userMessage);
      }, 400);
    }
  }

  function processLocalRAGResponse(query) {
    const qLower = query.toLowerCase();

    let matchedKb = ZENCLOX_KNOWLEDGE.find(kb => kb.keywords.some(k => qLower.includes(k)));

    if (matchedKb) {
      handleAIResponse(matchedKb.answer, matchedKb.actions);
    } else if (qLower.includes('break down') || qLower.includes('subtask') || qLower.includes('plan')) {
      const generated = autoGenerateSubtasksFromText(query);
      handleAIResponse(`I have generated a custom Pomodoro action plan in the **Focus Goal** tab!`, [
        { label: '🎯 View Goal Checklist', type: 'switch_tab', tab: 'goal' }
      ]);
    } else {
      handleAIResponse(`I am your **Zen AI Assistant**. I can help optimize your focus state, switch themes, adjust soundscapes, or guide your sessions.`, [
        { label: '🛡️ Toggle Cinema Mode', type: 'toggle_shield' },
        { label: '🌊 Set Ocean Vibe', type: 'set_theme', value: 'ocean' },
        { label: '⛈️ Cozy Storm Audio', type: 'set_sound_preset', preset: 'storm' }
      ]);
    }
  }

  function handleAIResponse(replyText, actions = []) {
    const aiMsgObj = {
      sender: 'ai',
      text: replyText,
      actions: actions,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    chatHistory.push(aiMsgObj);
    saveChatHistory();
    renderChatHistory();
  }

  function renderChatHistory() {
    if (!elements.messagesContainer) return;

    elements.messagesContainer.innerHTML = chatHistory.map(msg => `
      <div class="zen-ai-msg ${msg.sender}">
        <div class="zen-ai-msg-header">
          <span class="zen-ai-msg-author">${msg.sender === 'user' ? 'You' : 'Zen AI'}</span>
          <span class="zen-ai-msg-time">${msg.time}</span>
        </div>
        <div class="zen-ai-msg-bubble">${formatMarkdown(msg.text)}</div>
        ${msg.actions && msg.actions.length ? `
          <div class="zen-ai-msg-actions">
            ${msg.actions.map((act, idx) => `
              <button class="zen-ai-action-btn" data-act-idx="${idx}" onclick="window.ZenAIHubExecuteAction(${chatHistory.indexOf(msg)}, ${idx})">
                ${escapeHtml(act.label)}
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }

  window.ZenAIHubExecuteAction = function (msgIdx, actIdx) {
    const msg = chatHistory[msgIdx];
    if (!msg || !msg.actions || !msg.actions[actIdx]) return;
    const action = msg.actions[actIdx];

    executeAction(action);
  };

  function executeAction(action) {
    switch (action.type) {
      case 'set_theme':
        document.documentElement.setAttribute('data-theme', action.value);
        const themeBtn = document.querySelector(`.theme-dot[data-theme="${action.value}"]`);
        if (themeBtn) themeBtn.click();
        showNotification(`Theme switched to ${action.value.toUpperCase()}`);
        break;

      case 'set_sound_preset':
        applySoundPreset(action.preset);
        showNotification(`Audio preset applied: ${action.preset}`);
        break;

      case 'start_timer':
        const focusInput = document.getElementById('focus-val');
        if (focusInput) focusInput.value = action.mins || 25;
        const applyBtn = document.getElementById('apply-settings-btn');
        if (applyBtn) applyBtn.click();
        const startBtn = document.getElementById('start-btn');
        if (startBtn && !window.isRunning) startBtn.click();
        showNotification(`Started ${action.mins || 25}m Focus timer!`);
        break;

      case 'toggle_timer':
        const btn = document.getElementById('start-btn');
        if (btn) btn.click();
        break;

      case 'start_breathing':
        const breathToggle = document.getElementById('breath-toggle');
        if (breathToggle) {
          breathToggle.checked = true;
          const apply = document.getElementById('apply-settings-btn');
          if (apply) apply.click();
        }
        const start = document.getElementById('start-btn');
        if (start) start.click();
        showNotification('Box Breathing Prep started!');
        break;

      case 'toggle_shield':
        const shieldBtn = document.getElementById('shield-toggle-btn');
        if (shieldBtn) shieldBtn.click();
        showNotification('Cinema Mode (Flow Shield) toggled!');
        break;

      case 'toggle_zen':
        const zenBtn = document.getElementById('zen-toggle-btn');
        if (zenBtn) zenBtn.click();
        break;

      case 'open_palette':
        const palBtn = document.getElementById('palette-toggle-btn');
        if (palBtn) palBtn.click();
        break;

      case 'open_dna':
        const dnaBtn = document.getElementById('dna-view-btn') || document.querySelector('[data-action="dna"]');
        if (dnaBtn) dnaBtn.click();
        break;

      case 'switch_tab':
        switchTab(action.tab);
        break;
    }
  }

  function autoGenerateSubtasks() {
    const goal = elements.goalInput.value.trim() || window.currentIntention || 'Focus Session';
    autoGenerateSubtasksFromText(goal);
    renderSubtasks();
    switchTab('goal');
    showNotification('AI Sub-tasks generated!');
  }

  function autoGenerateSubtasksFromText(goalText) {
    const generated = [
      { id: Date.now() + 1, text: `Outline goals for: ${goalText}`, done: false },
      { id: Date.now() + 2, text: `Execute core 25-min focus block`, done: false },
      { id: Date.now() + 3, text: `Review progress & log session mood`, done: false }
    ];

    subtasks = [...subtasks, ...generated];
    saveSubtasks();
    return generated;
  }

  function renderSubtasks() {
    if (!elements.subtaskList) return;

    elements.subtaskList.innerHTML = subtasks.length === 0
      ? `<li class="zen-ai-empty-subtask">No sub-tasks yet. Click "✨ AI Breakdown" above!</li>`
      : subtasks.map(task => `
        <li class="zen-ai-subtask-item ${task.done ? 'done' : ''}">
          <label>
            <input type="checkbox" ${task.done ? 'checked' : ''} onchange="window.ZenAIToggleSubtask(${task.id})" />
            <span>${escapeHtml(task.text)}</span>
          </label>
          <button class="zen-ai-del-subtask" onclick="window.ZenAIDeleteSubtask(${task.id})">&times;</button>
        </li>
      `).join('');
  }

  window.ZenAIToggleSubtask = function (id) {
    const item = subtasks.find(t => t.id === id);
    if (item) {
      item.done = !item.done;
      saveSubtasks();
      renderSubtasks();
    }
  };

  window.ZenAIDeleteSubtask = function (id) {
    subtasks = subtasks.filter(t => t.id !== id);
    saveSubtasks();
    renderSubtasks();
  };

  function sendWelcomeMessage() {
    handleAIResponse(`Hello! 👋 I am your **Zen AI Assistant**.
How can I assist your focus session today? You can ask me questions, adjust sounds, or click any prompt chip below!`);
  }

  function showTypingIndicator() {
    if (document.getElementById('zen-ai-typing')) return;
    const typing = document.createElement('div');
    typing.id = 'zen-ai-typing';
    typing.className = 'zen-ai-msg ai typing';
    typing.innerHTML = `
      <div class="zen-ai-msg-bubble">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    `;
    elements.messagesContainer.appendChild(typing);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }

  function removeTypingIndicator() {
    const typing = document.getElementById('zen-ai-typing');
    if (typing) typing.remove();
  }

  function saveEngineSettings() {
    const url = elements.webhookInput.value.trim();
    n8nWebhookUrl = url;
    localStorage.setItem(ENGINE_MODE_KEY, engineMode);
    localStorage.setItem(N8N_WEBHOOK_KEY, url);
    updateStatusUI();
    elements.configModal.hidden = true;
    showNotification(engineMode === 'custom_n8n' ? 'Developer Webhook activated!' : 'Standard Zen AI active!');
  }

  function updateStatusUI() {
    if (elements.statusText) {
      elements.statusText.textContent = engineMode === 'custom_n8n' ? 'Custom AI Connected' : 'Online now';
    }
    if (elements.statusDot) {
      elements.statusDot.className = `zen-ai-status-dot ${engineMode === 'custom_n8n' ? 'n8n' : 'online'}`;
    }
  }

  async function testWebhookConnection() {
    const url = elements.webhookInput.value.trim();
    if (!url) {
      elements.configStatus.innerHTML = `<span style="color:#ef4444;">Please enter a valid Webhook URL.</span>`;
      return;
    }

    elements.configStatus.innerHTML = `<span style="color:var(--focus);">Testing connection...</span>`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'ping', test: true })
      });

      if (res.ok) {
        elements.configStatus.innerHTML = `<span style="color:#10b981;">✅ Webhook Connected (HTTP ${res.status})</span>`;
      } else {
        elements.configStatus.innerHTML = `<span style="color:#f59e0b;">⚠️ Server responded with HTTP ${res.status}</span>`;
      }
    } catch (e) {
      elements.configStatus.innerHTML = `<span style="color:#ef4444;">❌ Failed to connect: ${e.message}</span>`;
    }
  }

  function saveChatHistory() {
    if (chatHistory.length > 30) chatHistory = chatHistory.slice(-30);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
  }

  function saveSubtasks() {
    localStorage.setItem(SUBTASKS_KEY, JSON.stringify(subtasks));
  }

  function formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showNotification(msg) {
    const flash = document.getElementById('session-flash');
    const flashText = document.getElementById('flash-text');
    if (flash && flashText) {
      flashText.textContent = msg;
      flash.hidden = false;
      setTimeout(() => { flash.hidden = true; }, 3000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initZenAIHub);
  } else {
    initZenAIHub();
  }

})();
