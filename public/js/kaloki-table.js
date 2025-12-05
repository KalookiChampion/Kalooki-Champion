// KALOKI table logic with real PNG cards and basic drag-and-drop for Player 1

// Global debug flag: when true, relaxes some turn checks so you can test layouts easily.
let DEBUG_MODE = false;

// Demo mode: all 4 players are bots, human spectates
let demoMode = false;
let spectatorMode = false;

const SUITS = ['C', 'D', 'H', 'S'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const CARD_IMAGE_MAP = {
  'AC': '001_AC',
  'AD': '002_AD',
  'AH': '003_AH',
  'AS': '004_AS',
  '2C': '005_2C',
  '2D': '006_2D',
  '2H': '007_2H',
  '2S': '008_2S',
  '3C': '009_3C',
  '3D': '010_3D',
  '3H': '011_3H',
  '3S': '012_3S',
  '4C': '013_4C',
  '4D': '014_4D',
  '4H': '015_4H',
  '4S': '016_4S',
  '5C': '017_5C',
  '5D': '018_5D',
  '5H': '019_5H',
  '5S': '020_5S',
  '6C': '021_6C',
  '6D': '022_6D',
  '6H': '023_6H',
  '6S': '024_6S',
  '7C': '025_7C',
  '7D': '026_7D',
  '7H': '027_7H',
  '7S': '028_7S',
  '8C': '029_8C',
  '8D': '030_8D',
  '8H': '031_8H',
  '8S': '032_8S',
  '9C': '033_9C',
  '9D': '034_9D',
  '9H': '035_9H',
  '9S': '036_9S',
  '10C': '037_10C',
  '10D': '038_10D',
  '10H': '039_10H',
  '10S': '040_10S',
  'JC': '041_JC',
  'JD': '042_JD',
  'JH': '043_JH',
  'JS': '044_JS',
  'QC': '045_QC',
  'QD': '046_QD',
  'QH': '047_QH',
  'QS': '048_QS',
  'KC': '049_KC',
  'KD': '050_KD',
  'KH': '051_KH',
  'KS': '052_KS',
  'JOKER': '105_JOKER'
};

// Helper function to get card image path from card object
function getCardImagePath(card) {
  if (!card || !card.code) return 'cards/BACK_JAMAICA.png';
  const imageKey = CARD_IMAGE_MAP[card.code];
  if (imageKey) {
    return `cards/${imageKey}.png`;
  }
  return 'cards/BACK_JAMAICA.png';
}

// Multiplayer readiness tracking
let socketInitialized = false;
let domReady = false;
let pendingAnimations = [];
let pendingState = null;

// ============= SOUND SYSTEM =============
// High-quality sound effects from Kenney.nl (CC0 License)
let soundEnabled = true;
const audioElements = {};

// Sound file mappings using Kenney casino audio pack
const SOUND_FILES = {
  shuffle: '/sounds/Audio/card-shuffle.ogg',
  deal: '/sounds/Audio/card-slide-1.ogg',
  cardFlip: '/sounds/Audio/card-place-1.ogg',
  draw: '/sounds/Audio/card-slide-3.ogg',
  discard: '/sounds/Audio/card-place-2.ogg',
  // Variations for more natural sound
  deal2: '/sounds/Audio/card-slide-2.ogg',
  deal3: '/sounds/Audio/card-slide-4.ogg',
  place1: '/sounds/Audio/card-place-3.ogg',
  place2: '/sounds/Audio/card-place-4.ogg',
  fan: '/sounds/Audio/card-fan-1.ogg'
};

// Preload all audio files for instant playback
function initSounds() {
  try {
    for (const [name, path] of Object.entries(SOUND_FILES)) {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = 0.6;
      audioElements[name] = audio;
    }
  } catch (e) {
    console.warn('Failed to initialize sounds:', e);
    soundEnabled = false;
  }
}

function playSound(soundName) {
  if (!soundEnabled) return;
  
  // For deal sounds, randomly pick a variation
  let actualSound = soundName;
  if (soundName === 'deal') {
    const variations = ['deal', 'deal2', 'deal3'];
    actualSound = variations[Math.floor(Math.random() * variations.length)];
  } else if (soundName === 'cardFlip') {
    const variations = ['cardFlip', 'place1', 'place2'];
    actualSound = variations[Math.floor(Math.random() * variations.length)];
  }
  
  const audio = audioElements[actualSound];
  if (!audio) return;
  
  // Clone the audio to allow overlapping sounds
  const clone = audio.cloneNode();
  // Use settings volume if available, otherwise default to 60%
  clone.volume = (typeof settings !== 'undefined' && settings.volume !== undefined) 
    ? settings.volume / 100 
    : 0.6;
  clone.play().catch(() => {
    // Ignore autoplay restrictions silently
  });
}

function playShuffleSound(duration, onComplete) {
  // Play shuffle sound once at start - it naturally matches a short shuffle
  if (soundEnabled) {
    playSound('shuffle');
  }
  
  // Complete after the visual duration
  setTimeout(() => {
    if (onComplete) onComplete();
  }, duration);
}

// ============= SHUFFLE ANIMATION =============
function showShuffleAnimation(onComplete) {
  const deckEl = document.getElementById('deckPile');
  if (!deckEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const deckRect = deckEl.getBoundingClientRect();
  const shuffleContainer = document.createElement('div');
  shuffleContainer.id = 'shuffleAnimation';
  shuffleContainer.className = 'shuffle-animation';
  shuffleContainer.style.position = 'fixed';
  shuffleContainer.style.left = (deckRect.left - 30) + 'px';
  shuffleContainer.style.top = (deckRect.top - 20) + 'px';
  shuffleContainer.style.zIndex = '1500';
  shuffleContainer.style.pointerEvents = 'none';
  
  document.body.appendChild(shuffleContainer);
  
  // Create two card stacks for riffle animation
  const leftStack = document.createElement('div');
  leftStack.className = 'shuffle-stack shuffle-left';
  leftStack.style.backgroundImage = 'url("cards/BACK_JAMAICA.png")';
  
  const rightStack = document.createElement('div');
  rightStack.className = 'shuffle-stack shuffle-right';
  rightStack.style.backgroundImage = 'url("cards/BACK_JAMAICA.png")';
  
  shuffleContainer.appendChild(leftStack);
  shuffleContainer.appendChild(rightStack);
  
  // Shuffle duration 1.5-2 seconds - matches the sound effect length
  const shuffleDuration = 1500 + Math.random() * 500;
  
  // Start shuffle animation and sound
  shuffleContainer.classList.add('shuffling');
  playShuffleSound(shuffleDuration, () => {
    // End animation
    shuffleContainer.classList.remove('shuffling');
    shuffleContainer.classList.add('shuffle-complete');
    
    setTimeout(() => {
      shuffleContainer.remove();
      if (onComplete) onComplete();
    }, 300);
  });
}

// Initialize sounds when page loads
document.addEventListener('DOMContentLoaded', () => {
  initSounds();
});

// ============= MULTIPLAYER & SETTINGS =============
let multiplayerMode = false;
let socket = null;
let playerName = '';
let roomCode = '';
let playerId = '';
let roomPlayers = [];

// Track all game-related timeouts so we can clear them on game reset
let gameTimeouts = [];

// Set a game timeout that can be cleared when starting a new game
function setGameTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    // Remove from tracking array when executed
    const idx = gameTimeouts.indexOf(timeoutId);
    if (idx > -1) gameTimeouts.splice(idx, 1);
    callback();
  }, delay);
  gameTimeouts.push(timeoutId);
  return timeoutId;
}

// Clear all pending game timeouts
function clearAllGameTimeouts() {
  for (const timeoutId of gameTimeouts) {
    clearTimeout(timeoutId);
  }
  gameTimeouts = [];
}

// Settings stored in localStorage
let settings = {
  soundEnabled: true,
  volume: 60,
  tableColor: '#1a472a',
  botDifficulty: 'medium', // 'easy', 'medium', 'hard'
  animationSpeed: 100 // 100% = normal speed, lower = slower, higher = faster
};

// Base animation durations (at 100% speed) - all values in milliseconds
// These MUST match CSS base values for proper synchronization
const BASE_ANIM = {
  discard: 450,      // Discard card flying to pack (matches CSS 0.45s)
  draw: 500,         // Draw card animation (matches CSS 0.5s)
  botDraw: 450,      // Bot draw animation (matches CSS 0.45s)
  packCard: 450,     // Pack card transitions (matches CSS 0.45s)
  firstPack: 600,    // First card flip to pack
  botDelay: 1800,    // Delay before bot turn
  betweenBots: 750,  // Delay between bot turns
  deal: 300          // Deal animation per card (matches CSS 0.3s)
};

// Get animation duration adjusted by speed setting
function getAnimDuration(baseMs) {
  // Speed 100 = normal, 200 = 2x faster, 50 = 2x slower
  // We invert the speed: higher speed = shorter duration
  // Add small buffer (50ms) to ensure CSS completes before JS cleanup
  return Math.round(baseMs * (100 / settings.animationSpeed)) + 50;
}

// Get CSS duration in seconds (no buffer, for CSS property values)
function getAnimDurationCSS(baseMs) {
  return (baseMs * (100 / settings.animationSpeed) / 1000);
}

// Update CSS transitions based on animation speed
function updateAnimationCSS() {
  const root = document.documentElement;
  
  // Set CSS variables using unified BASE_ANIM values
  root.style.setProperty('--anim-pack-card', getAnimDurationCSS(BASE_ANIM.packCard) + 's');
  root.style.setProperty('--anim-discard', getAnimDurationCSS(BASE_ANIM.discard) + 's');
  root.style.setProperty('--anim-draw', getAnimDurationCSS(BASE_ANIM.draw) + 's');
  root.style.setProperty('--anim-bot-draw', getAnimDurationCSS(BASE_ANIM.botDraw) + 's');
  root.style.setProperty('--anim-deal', getAnimDurationCSS(BASE_ANIM.deal) + 's');
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('kalookiSettings');
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  applySettings();
  updateAnimationCSS();
}

function saveSettings() {
  try {
    localStorage.setItem('kalookiSettings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

function applySettings() {
  soundEnabled = settings.soundEnabled;
  
  // Update volume for all audio elements
  for (const audio of Object.values(audioElements)) {
    audio.volume = settings.volume / 100;
  }
  
  // Apply table color
  const tableRoot = document.getElementById('table-root');
  if (tableRoot) {
    const colors = {
      '#1a472a': 'radial-gradient(circle at 50% 30%, #106030 0, #003300 60%, #001800 100%)',
      '#1a2a4a': 'radial-gradient(circle at 50% 30%, #1a3a6a 0, #0a1a3a 60%, #050a1a 100%)',
      '#4a1a1a': 'radial-gradient(circle at 50% 30%, #6a2a2a 0, #3a0a0a 60%, #1a0505 100%)',
      '#3d3d3d': 'radial-gradient(circle at 50% 30%, #555555 0, #2a2a2a 60%, #151515 100%)'
    };
    tableRoot.style.background = colors[settings.tableColor] || colors['#1a472a'];
  }
}

// ============= FULLSCREEN FUNCTIONS =============
function isFullscreen() {
  return !!(document.fullscreenElement || 
            document.webkitFullscreenElement || 
            document.mozFullScreenElement || 
            document.msFullscreenElement);
}

function toggleFullscreen() {
  if (isFullscreen()) {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } else {
    // Enter fullscreen
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  }
}

function updateFullscreenButton() {
  const btn = document.getElementById('btnFullscreen');
  if (!btn) return;
  
  if (isFullscreen()) {
    btn.textContent = 'Exit Fullscreen';
    btn.classList.add('active');
  } else {
    btn.textContent = 'Enter Fullscreen';
    btn.classList.remove('active');
  }
}

function initSettings() {
  loadSettings();
  
  // Settings button
  const btnSettings = document.getElementById('btnSettings');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      settingsOverlay.classList.remove('hidden');
    });
  }
  
  if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });
  }
  
  // Close on overlay click
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) {
        settingsOverlay.classList.add('hidden');
      }
    });
  }
  
  // Sound toggle
  const toggleSound = document.getElementById('toggleSound');
  if (toggleSound) {
    toggleSound.checked = settings.soundEnabled;
    toggleSound.addEventListener('change', () => {
      settings.soundEnabled = toggleSound.checked;
      saveSettings();
      applySettings();
    });
  }
  
  // Volume slider
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  if (volumeSlider) {
    volumeSlider.value = settings.volume;
    if (volumeValue) volumeValue.textContent = settings.volume + '%';
    
    volumeSlider.addEventListener('input', () => {
      settings.volume = parseInt(volumeSlider.value);
      if (volumeValue) volumeValue.textContent = settings.volume + '%';
      saveSettings();
      applySettings();
    });
  }
  
  // Animation speed slider
  const animSpeedSlider = document.getElementById('animationSpeedSlider');
  const animSpeedValue = document.getElementById('animationSpeedValue');
  if (animSpeedSlider) {
    animSpeedSlider.value = settings.animationSpeed;
    if (animSpeedValue) animSpeedValue.textContent = settings.animationSpeed + '%';
    
    animSpeedSlider.addEventListener('input', () => {
      settings.animationSpeed = parseInt(animSpeedSlider.value);
      if (animSpeedValue) animSpeedValue.textContent = settings.animationSpeed + '%';
      saveSettings();
      updateAnimationCSS();
    });
  }
  
  // Color options
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    if (btn.dataset.color === settings.tableColor) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.tableColor = btn.dataset.color;
      saveSettings();
      applySettings();
    });
  });
  
  // Bot difficulty options
  const difficultyBtns = document.querySelectorAll('.difficulty-btn');
  difficultyBtns.forEach(btn => {
    // Set active state based on current setting
    if (btn.dataset.difficulty === settings.botDifficulty) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    btn.addEventListener('click', () => {
      difficultyBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.botDifficulty = btn.dataset.difficulty;
      saveSettings();
    });
  });
  
  // Fullscreen button
  const btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    // Update button state based on current fullscreen status
    updateFullscreenButton();
    
    btnFullscreen.addEventListener('click', () => {
      toggleFullscreen();
    });
    
    // Listen for fullscreen changes (e.g., user presses Escape)
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
    document.addEventListener('mozfullscreenchange', updateFullscreenButton);
    document.addEventListener('MSFullscreenChange', updateFullscreenButton);
  }
  
  // Lobby button
  const btnLobby = document.getElementById('btnLobby');
  if (btnLobby) {
    btnLobby.addEventListener('click', () => {
      if (confirm('Leave the game and return to lobby?')) {
        window.location.href = '/';
      }
    });
  }
  
  // Tab switching
  const tabs = document.querySelectorAll('.settings-tab');
  const settingsContent = document.getElementById('settingsTabContent');
  const leaderboardContent = document.getElementById('leaderboardTabContent');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      if (tab.dataset.tab === 'settings') {
        settingsContent.classList.remove('hidden');
        leaderboardContent.classList.add('hidden');
      } else if (tab.dataset.tab === 'leaderboard') {
        settingsContent.classList.add('hidden');
        leaderboardContent.classList.remove('hidden');
        updateLeaderboardDisplay();
      }
    });
  });
  
  // Reset stats button
  const btnResetStats = document.getElementById('btnResetStats');
  if (btnResetStats) {
    btnResetStats.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all your statistics? This cannot be undone.')) {
        resetPlayerStats();
        updateLeaderboardDisplay();
      }
    });
  }
  
  // Leaderboard mode tabs (Solo vs Multiplayer)
  const modeTabs = document.querySelectorAll('.leaderboard-mode-tab');
  const soloContent = document.getElementById('soloLeaderboardContent');
  const mpContent = document.getElementById('multiplayerLeaderboardContent');
  
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      if (tab.dataset.mode === 'solo') {
        soloContent.classList.remove('hidden');
        mpContent.classList.add('hidden');
      } else {
        soloContent.classList.add('hidden');
        mpContent.classList.remove('hidden');
      }
      
      // Refresh the leaderboard data when switching tabs
      updateLeaderboardDisplay();
    });
  });
  
  // Initial leaderboard update
  updateLeaderboardDisplay();
}

// ============= PLAYER STATISTICS SYSTEM =============

let playerStats = {
  solo: { players: {} },
  multiplayer: { players: {} }
};

function getDefaultPlayerStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    rating: 1000,
    currentStreak: 0,
    bestStreak: 0,
    lastPlayed: null
  };
}

function loadPlayerStats() {
  try {
    const saved = localStorage.getItem('kalookiPlayerStats');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.solo && parsed.multiplayer) {
        playerStats = parsed;
      } else if (parsed.players) {
        playerStats = {
          solo: { players: parsed.players },
          multiplayer: { players: {} }
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load player stats:', e);
    playerStats = { solo: { players: {} }, multiplayer: { players: {} } };
  }
}

function savePlayerStats() {
  try {
    localStorage.setItem('kalookiPlayerStats', JSON.stringify(playerStats));
  } catch (e) {
    console.warn('Failed to save player stats:', e);
  }
}

function getPlayerStats(name, mode) {
  const modeStats = mode === 'multiplayer' ? playerStats.multiplayer : playerStats.solo;
  if (!modeStats.players[name]) {
    modeStats.players[name] = getDefaultPlayerStats();
  }
  return modeStats.players[name];
}

function recordGameResult(winnerName, allPlayerNames, isMultiplayer = false) {
  loadPlayerStats();
  
  const mode = isMultiplayer ? 'multiplayer' : 'solo';
  
  allPlayerNames.forEach(name => {
    const stats = getPlayerStats(name, mode);
    stats.gamesPlayed++;
    stats.lastPlayed = new Date().toISOString();
    
    if (name === winnerName) {
      stats.gamesWon++;
      stats.currentStreak++;
      if (stats.currentStreak > stats.bestStreak) {
        stats.bestStreak = stats.currentStreak;
      }
      stats.rating += 25;
    } else {
      stats.currentStreak = 0;
      stats.rating = Math.max(100, stats.rating - 10);
    }
  });
  
  savePlayerStats();
}

function resetPlayerStats() {
  const currentPlayer = playerName || 'Player';
  
  if (playerStats.solo.players[currentPlayer]) {
    playerStats.solo.players[currentPlayer] = getDefaultPlayerStats();
  }
  if (playerStats.multiplayer.players[currentPlayer]) {
    playerStats.multiplayer.players[currentPlayer] = getDefaultPlayerStats();
  }
  
  savePlayerStats();
}

function updateLeaderboardDisplay() {
  loadPlayerStats();
  
  const currentPlayer = playerName || localStorage.getItem('kalookiPlayerName') || 'Player';
  
  // Update Solo stats
  updateModeStats('solo', currentPlayer);
  updateModeLeaderboard('solo');
  
  // Update Multiplayer stats
  updateModeStats('multiplayer', currentPlayer);
  updateModeLeaderboard('multiplayer');
}

function updateModeStats(mode, currentPlayer) {
  const prefix = mode === 'solo' ? 'solo' : 'mp';
  const stats = getPlayerStats(currentPlayer, mode);
  
  const nameEl = document.getElementById(`${prefix}StatsPlayerName`);
  const ratingEl = document.getElementById(`${prefix}StatsPlayerRating`);
  const gamesPlayedEl = document.getElementById(`${prefix}StatsGamesPlayed`);
  const gamesWonEl = document.getElementById(`${prefix}StatsGamesWon`);
  const winRateEl = document.getElementById(`${prefix}StatsWinRate`);
  const streakEl = document.getElementById(`${prefix}StatsCurrentStreak`);
  
  if (nameEl) nameEl.textContent = currentPlayer;
  if (ratingEl) ratingEl.textContent = `Rating: ${stats.rating}`;
  if (gamesPlayedEl) gamesPlayedEl.textContent = stats.gamesPlayed;
  if (gamesWonEl) gamesWonEl.textContent = stats.gamesWon;
  if (winRateEl) {
    const winRate = stats.gamesPlayed > 0 
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
      : 0;
    winRateEl.textContent = winRate + '%';
  }
  if (streakEl) streakEl.textContent = stats.currentStreak;
}

function updateModeLeaderboard(mode) {
  const listId = mode === 'solo' ? 'soloLeaderboardList' : 'mpLeaderboardList';
  const emptyMessage = mode === 'solo' ? 'No solo games played yet' : 'No multiplayer games played yet';
  const leaderboardList = document.getElementById(listId);
  
  if (!leaderboardList) return;
  
  const modeStats = mode === 'multiplayer' ? playerStats.multiplayer : playerStats.solo;
  
  const allPlayers = Object.entries(modeStats.players)
    .map(([name, s]) => ({ name, ...s }))
    .filter(p => p.gamesPlayed > 0)
    .sort((a, b) => b.rating - a.rating);
  
  if (allPlayers.length === 0) {
    leaderboardList.innerHTML = `<div class="leaderboard-empty">${emptyMessage}</div>`;
    return;
  }
  
  leaderboardList.innerHTML = allPlayers.slice(0, 10).map((p, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const winRate = p.gamesPlayed > 0 ? Math.round((p.gamesWon / p.gamesPlayed) * 100) : 0;
    return `
      <div class="leaderboard-entry">
        <div class="leaderboard-rank ${rankClass}">${i + 1}</div>
        <div class="leaderboard-entry-name">${p.name}</div>
        <div class="leaderboard-entry-stats">
          <div class="leaderboard-entry-rating">${p.rating}</div>
          <div class="leaderboard-entry-record">${p.gamesWon}W/${p.gamesPlayed - p.gamesWon}L (${winRate}%)</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============= CHAT SYSTEM =============
function initChat() {
  const chatBox = document.getElementById('chatBox');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnToggleChat = document.getElementById('btnToggleChat');
  
  if (!chatBox) return;
  
  // Toggle chat minimize/expand
  if (btnToggleChat) {
    btnToggleChat.addEventListener('click', () => {
      chatBox.classList.toggle('minimized');
      btnToggleChat.textContent = chatBox.classList.contains('minimized') ? '+' : '−';
    });
  }
  
  // Send message on button click
  if (btnSendChat) {
    btnSendChat.addEventListener('click', sendChatMessage);
  }
  
  // Send message on Enter key
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });
  }
}

function sendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  if (!chatInput) return;
  
  const message = chatInput.value.trim();
  if (!message) return;
  
  // Clear input
  chatInput.value = '';
  
  // Get sender name
  const senderName = playerName || 'Player';
  const isSpectator = spectatorMode;
  
  if (socket && (multiplayerMode || spectatorMode)) {
    // Send via socket for multiplayer/spectator
    socket.emit('chatMessage', {
      roomCode: roomCode,
      sender: senderName,
      message: message,
      isSpectator: isSpectator
    });
  } else {
    // Solo mode - just show locally
    addChatMessage(senderName, message, false);
  }
}

function addChatMessage(sender, message, isSpectator, isSystem = false) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  
  if (isSystem) {
    msgDiv.classList.add('system-msg');
    msgDiv.textContent = message;
  } else {
    if (isSpectator) {
      msgDiv.classList.add('spectator-msg');
    }
    msgDiv.innerHTML = `<span class="chat-sender">${escapeHtml(sender)}:</span><span class="chat-text">${escapeHtml(message)}</span>`;
  }
  
  chatMessages.appendChild(msgDiv);
  
  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Limit messages to prevent memory issues
  while (chatMessages.children.length > 50) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addSystemMessage(message) {
  addChatMessage('', message, false, true);
}

function initMultiplayer() {
  // Check if we're in multiplayer mode
  const gameMode = localStorage.getItem('kalookiGameMode');
  playerName = localStorage.getItem('kalookiPlayerName') || 'Player';
  roomCode = localStorage.getItem('kalookiRoomCode') || '';
  playerId = localStorage.getItem('kalookiPlayerId') || '';
  
  // Check for demo mode and spectator mode
  demoMode = localStorage.getItem('kalookiDemoMode') === 'true';
  spectatorMode = localStorage.getItem('kalookiSpectatorMode') === 'true';
  
  // Initialize chat
  initChat();
  
  if (gameMode === 'spectator' && roomCode) {
    // Spectator mode - watching a live game
    spectatorMode = true;
    multiplayerMode = true;
    initSpectatorSocket();
  } else if (gameMode === 'multiplayer' && roomCode) {
    multiplayerMode = true;
    initSocket();
  } else {
    // Solo mode - use player name for bottom label
    const labelBottom = document.getElementById('label-bottom');
    if (labelBottom && playerName) {
      // In demo mode, show "Bot 4" for bottom player
      labelBottom.textContent = demoMode ? 'Bot 4' : playerName;
    }
  }
  
  // Clear localStorage values used for game init
  localStorage.removeItem('kalookiGameMode');
  localStorage.removeItem('kalookiRoomCode');
  localStorage.removeItem('kalookiPlayerId');
  localStorage.removeItem('kalookiDemoMode');
  localStorage.removeItem('kalookiSpectatorMode');
}

function initSocket() {
  if (!window.io) {
    console.warn('Socket.io not available');
    return;
  }
  
  // Prevent double initialization
  if (socketInitialized) {
    console.log('Socket already initialized');
    return;
  }
  socketInitialized = true;
  
  socket = io();
  
  socket.on('connect', () => {
    console.log('Connected to game server, roomCode:', roomCode, 'playerName:', playerName);
    if (roomCode) {
      // Send rejoinGame immediately - don't wait for DOM
      // DOM elements are created dynamically after game state is received
      console.log('Sending rejoinGame to room:', roomCode);
      socket.emit('rejoinGame', { 
        roomCode: roomCode, 
        playerName: playerName 
      });
    } else {
      console.log('No roomCode, not rejoining (solo mode?)');
    }
  });
  
  function processPendingEvents() {
    console.log(`Processing ${pendingAnimations.length} pending animations`);
    // Process buffered animations first
    pendingAnimations.forEach(fn => fn());
    pendingAnimations = [];
    // Then apply pending state if any
    if (pendingState) {
      syncGameState(pendingState);
      pendingState = null;
    }
  }
  
  socket.on('roomPlayers', (data) => {
    roomPlayers = data.players;
    updatePlayerLabelsFromServer(data.players);
  });
  
  // Multiplayer animation queue system
  // Server sends: gameStateUpdate first (creates DOM), then animation events
  // This queue ensures animations complete before state updates rebuild DOM
  let mpAnimationQueue = [];
  let mpAnimating = false;
  let pendingGameState = null;
  let domInitialized = false;
  
  function isAnimationBlocking() {
    return mpAnimating || mpAnimationQueue.length > 0;
  }
  
  function processMpAnimationQueue() {
    if (mpAnimating || mpAnimationQueue.length === 0) {
      // Queue empty - apply any pending state after a small delay
      if (mpAnimationQueue.length === 0 && pendingGameState && !mpAnimating) {
        const state = pendingGameState;
        pendingGameState = null;
        console.log('Animations done, applying pending state');
        syncGameState(state);
      }
      return;
    }
    
    mpAnimating = true;
    const anim = mpAnimationQueue.shift();
    
    anim.fn(() => {
      mpAnimating = false;
      // Continue to next animation or apply pending state
      processMpAnimationQueue();
    });
  }
  
  function queueMpAnimation(animFn) {
    console.log('Queuing animation, queue length:', mpAnimationQueue.length + 1);
    mpAnimationQueue.push({ fn: animFn });
    processMpAnimationQueue();
  }
  
  socket.on('gameStateUpdate', (data) => {
    console.log('Received gameStateUpdate, domInit:', domInitialized, 'animating:', isAnimationBlocking());
    
    // First state update creates DOM
    if (!domInitialized) {
      console.log('First state - initializing DOM');
      syncGameState(data);
      domInitialized = true;
      return;
    }
    
    // If animations in progress, defer state update
    if (isAnimationBlocking()) {
      console.log('Deferring state - animations in progress');
      pendingGameState = data;
    } else {
      syncGameState(data);
    }
  });
  
  // Animation events from server - ALL SEATS USE THE SAME CORE ANIMATION FUNCTIONS
  socket.on('animateDraw', (data) => {
    console.log('Received animateDraw:', data);
    queueMpAnimation((done) => {
      playSound('draw');
      
      // Prepare card with imageKey
      const card = data.card || {};
      if (card.code && !card.imageKey) {
        card.imageKey = getImageKey(card.code);
      }
      
      // ALL seats use the SAME core animation function
      animateDrawCore(data.source, data.seat, card, done);
    });
  });
  
  socket.on('animateDiscard', (data) => {
    console.log('Received animateDiscard:', data);
    
    // Prepare card with imageKey
    const card = data.card || {};
    if (card.code && !card.imageKey) {
      card.imageKey = getImageKey(card.code);
    }
    
    // CAPTURE card position IMMEDIATELY before queuing, while card is still in DOM
    let capturedRect = null;
    if (data.seat === 'bottom') {
      const handEl = document.getElementById('hand-bottom');
      if (handEl && card) {
        const cardEls = handEl.querySelectorAll('.card');
        for (const cardEl of cardEls) {
          const cardId = cardEl.getAttribute('data-id');
          const cardCode = cardEl.getAttribute('data-code');
          if ((card.id && cardId === card.id) || (card.code && cardCode === card.code)) {
            capturedRect = cardEl.getBoundingClientRect();
            console.log('Captured discard position for card:', card.code, capturedRect);
            break;
          }
        }
        // Fallback to last card if not found
        if (!capturedRect && cardEls.length > 0) {
          capturedRect = cardEls[cardEls.length - 1].getBoundingClientRect();
        }
      }
    } else {
      // For other seats, capture mini-hand position
      const miniEl = document.getElementById(`mini-${data.seat}`);
      if (miniEl) {
        capturedRect = miniEl.getBoundingClientRect();
      }
    }
    
    queueMpAnimation((done) => {
      playSound('discard');
      // Use the captured position from when event arrived
      animateDiscardFromCapturedRect(card, capturedRect, data.seat, done);
    });
  });
  
  // dealInit - creates empty layout before deal animation
  socket.on('dealInit', (data) => {
    console.log('Received dealInit - creating empty layout');
    
    // Reset gameState to empty but keep correct structure for renderAll()
    gameState.deck = [];
    gameState.hands = { bottom: [], top: [], left: [], right: [] };
    gameState.sets = { bottom: [], top: [], left: [], right: [] };
    gameState.pack = [];
    gameState.draggingCardId = null;
    gameState.turnSeat = 'bottom';
    gameState.hasDrawn = false;
    gameState.lastDrawSource = null;
    gameState.lastPackCardId = null;
    gameState.lastDiscardSource = null;
    gameState.lastDiscardCardId = null;
    gameState.lastDiscardSeat = null;
    gameState.currentTurnId = 0;
    gameState.hasDiscardedThisTurn = false;
    gameState.opened = { bottom: false, top: false, left: false, right: false };
    gameState.eliminated = { bottom: false, top: false, left: false, right: false };
    gameState.invalidMelds = { bottom: [], top: [], left: [], right: [] };
    gameState.pendingExtendMelds = {};
    gameState.pendingLayoffs = {};
    gameState.inVoting = { isOpen: false, votes: [] };
    gameState.dealerSeat = data.dealer || 'bottom';
    
    // Render empty layout
    renderAll();
    domInitialized = true;
    console.log('Empty layout ready for deal animation');
  });
  
  // Deal animation - server sends this AFTER dealInit so DOM exists
  socket.on('animateDeal', (data) => {
    console.log('Received animateDeal:', data, 'domInit:', domInitialized);
    
    if (!domInitialized) {
      console.warn('animateDeal arrived before DOM - this should not happen');
      return;
    }
    
    queueMpAnimation((done) => {
      playMpDealAnimation(data.dealer, done);
    });
  });
  
  socket.on('actionError', (data) => {
    console.warn('Action error:', data.message);
    setStatus(data.message || 'Action failed');
    
    // If this was an extendMeld failure and we have a card to restore, restore it
    if (data.action === 'extendMeld' && data.cardId) {
      const hand = gameState.hands['bottom'];
      if (hand && !hand.find(c => c.id === data.cardId)) {
        // Check if we have the full card object stored
        const storedCard = gameState.pendingExtendMelds && gameState.pendingExtendMelds[data.cardId];
        if (storedCard) {
          // Restore the full card object
          hand.push(storedCard);
          delete gameState.pendingExtendMelds[data.cardId];
        } else {
          // Fallback - push minimal card (will need sync to fix)
          hand.push({ id: data.cardId });
        }
        renderBottomHand();
        renderMiniHands();
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from game server');
  });
  
  // Overlay synchronization - all players see the same overlays
  // Track pending overlays to avoid duplicate display
  socket.on('showOverlay', (data) => {
    console.log('Received overlay:', data.type, data.data);
    
    if (data.type === 'victory') {
      // Only show if we didn't trigger it (check if victory overlay already visible)
      const victoryOverlay = document.getElementById('victoryOverlay');
      if (!victoryOverlay || victoryOverlay.classList.contains('hidden')) {
        showVictoryFromServer(data.data.winnerName, data.data.winnerSeat);
      }
    } else if (data.type === 'elimination') {
      // Only show if elimination overlay not already visible
      const elimOverlay = document.getElementById('eliminationOverlay');
      if (!elimOverlay || elimOverlay.classList.contains('hidden')) {
        showEliminationFromServer(data.data.playerName, data.data.reason, data.data.details);
      }
    } else if (data.type === 'inRestart') {
      // Only show if restart overlay not already visible
      const restartOverlay = document.getElementById('restartOverlay');
      if (!restartOverlay || restartOverlay.classList.contains('hidden')) {
        showRestartOverlay(data.data.voterNames);
      }
    }
  });
  
  // IN voting updates
  socket.on('inVoteUpdate', (data) => {
    // Update local voting state from server using seat data
    if (data.voterSeats) {
      gameState.inVoting.votes = data.voterSeats;
    }
    updateInButtonUI();
    if (data.voteCount > 0) {
      setStatus(`${data.voteCount}/3 players voted to restart`);
    }
  });
  
  socket.on('inVotingClosed', () => {
    gameState.inVoting.isOpen = false;
    updateInButtonUI();
  });
  
  // Chat messages
  socket.on('chatMessage', (data) => {
    addChatMessage(data.sender, data.message, data.isSpectator);
  });
  
  socket.on('systemMessage', (data) => {
    addSystemMessage(data.message);
  });
}

function initSpectatorSocket() {
  if (!window.io) {
    console.warn('Socket.io not available');
    return;
  }
  
  socket = io();
  
  socket.on('connect', () => {
    console.log('Connected as spectator');
    if (roomCode) {
      socket.emit('rejoinAsSpectator', { 
        roomCode: roomCode 
      });
    }
  });
  
  socket.on('gameStateUpdate', (data) => {
    syncSpectatorGameState(data);
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from game server');
    setStatus('Connection lost. Refresh to reconnect.');
  });
  
  // Spectators see overlays too
  socket.on('showOverlay', (data) => {
    console.log('Spectator received overlay:', data.type, data.data);
    
    if (data.type === 'victory') {
      const victoryOverlay = document.getElementById('victoryOverlay');
      if (!victoryOverlay || victoryOverlay.classList.contains('hidden')) {
        showVictoryFromServer(data.data.winnerName, data.data.winnerSeat);
      }
    } else if (data.type === 'elimination') {
      const elimOverlay = document.getElementById('eliminationOverlay');
      if (!elimOverlay || elimOverlay.classList.contains('hidden')) {
        showEliminationFromServer(data.data.playerName, data.data.reason, data.data.details);
      }
    } else if (data.type === 'inRestart') {
      const restartOverlay = document.getElementById('restartOverlay');
      if (!restartOverlay || restartOverlay.classList.contains('hidden')) {
        showRestartOverlay(data.data.voterNames);
      }
    }
  });
  
  // Hide the IN button for spectators
  const inButton = document.getElementById('btnIN');
  if (inButton) {
    inButton.style.display = 'none';
  }
  
  // Chat messages for spectators
  socket.on('chatMessage', (data) => {
    addChatMessage(data.sender, data.message, data.isSpectator);
  });
  
  socket.on('systemMessage', (data) => {
    addSystemMessage(data.message);
  });
  
  // Set spectator status
  setStatus('Spectating game... All hands are hidden.');
}

function syncSpectatorGameState(serverState) {
  if (!serverState) return;
  
  console.log('Syncing spectator game state');
  
  updatePlayerLabelsFromServer(serverState.players);
  
  // All hands are hidden for spectators
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const handData = serverState.hands[seat] || [];
    gameState.hands[seat] = handData.map((card, i) => ({
      id: card.id || `hidden_${seat}_${i}`,
      hidden: true,
      code: null,
      rank: null,
      suit: null,
      imageKey: null
    }));
  }
  
  // Sync sets (melds are visible)
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const serverSets = serverState.sets[seat] || [];
    gameState.sets[seat] = serverSets.map(group => ({
      id: group.id,
      cards: group.cards.map(card => ({
        ...card,
        imageKey: getImageKey(card.code)
      }))
    }));
  }
  
  // Sync pack (discard pile is visible)
  gameState.pack = (serverState.pack || []).map(card => ({
    ...card,
    imageKey: getImageKey(card.code)
  }));
  
  // Sync deck count
  if (typeof serverState.deckCount === 'number') {
    gameState.deck = new Array(serverState.deckCount).fill({ hidden: true });
  }
  
  // Sync turn and game state
  gameState.turnSeat = serverState.turnSeat;
  gameState.hasDrawn = serverState.hasDrawn;
  gameState.currentDealer = serverState.currentDealer;
  gameState.opened = serverState.opened || { bottom: false, top: false, left: false, right: false };
  gameState.eliminated = serverState.eliminated || { bottom: false, top: false, left: false, right: false };
  gameState.gameOver = serverState.gameOver || false;
  gameState.winner = serverState.winner || null;
  
  // Render everything for spectator view
  renderSpectatorView();
  
  // Update status
  if (gameState.gameOver && gameState.winner) {
    setStatus(`Game Over! ${gameState.winner} wins!`);
  } else {
    const turnPlayerInfo = serverState.players[gameState.turnSeat];
    const turnPlayerName = turnPlayerInfo ? turnPlayerInfo.name : gameState.turnSeat;
    setStatus(`Spectating: ${turnPlayerName}'s turn`);
  }
}

function renderSpectatorView() {
  // Render all hands as face-down cards for spectators
  renderSpectatorMiniHands();
  
  // Render melds (visible to spectators)
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    renderMeldRow(seat);
  }
  
  // Render deck and pack
  renderPiles();
  
  // Update turn glow
  updateActiveTurnGlow();
}

function renderSpectatorMiniHands() {
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const hand = gameState.hands[seat];
    const container = document.getElementById(`hand-${seat}`);
    if (!container) continue;
    
    container.innerHTML = '';
    
    // Get correct card back image
    const backImage = getSavedCardPack() + '/back.png';
    
    if (seat === 'bottom') {
      // Bottom hand shows face-down cards side by side
      hand.forEach((card, i) => {
        const el = document.createElement('div');
        el.className = 'mini-card spectator-card';
        el.style.backgroundImage = `url('cards/${backImage}')`;
        el.style.backgroundSize = 'cover';
        container.appendChild(el);
      });
    } else {
      // Other seats show mini-hand indicators
      const handEl = document.getElementById(`mini-hand-${seat}`);
      if (handEl) {
        handEl.innerHTML = '';
        hand.forEach((card, i) => {
          const el = document.createElement('div');
          el.className = 'mini-card spectator-card';
          el.style.backgroundImage = `url('cards/${backImage}')`;
          el.style.backgroundSize = 'cover';
          handEl.appendChild(el);
        });
      }
    }
  }
}

function updatePlayerLabels() {
  if (!multiplayerMode) return;
}

function updatePlayerLabelsFromServer(players) {
  if (!players) return;
  
  const labels = {
    bottom: document.getElementById('label-bottom'),
    left: document.getElementById('label-left'),
    top: document.getElementById('label-top'),
    right: document.getElementById('label-right')
  };
  
  for (const seat of ['bottom', 'left', 'top', 'right']) {
    const player = players[seat];
    if (player && labels[seat]) {
      labels[seat].textContent = player.name + (player.isBot ? ' (Bot)' : '');
    }
  }
}

function syncGameState(serverState) {
  if (!multiplayerMode || !serverState) return;
  
  console.log('Syncing game state from server');
  
  // Clear pending extend melds - server state is now authoritative
  gameState.pendingExtendMelds = {};
  
  updatePlayerLabelsFromServer(serverState.players);
  
  gameState.hands.bottom = (serverState.hands.bottom || []).map(card => ({
    ...card,
    imageKey: getImageKey(card.code)
  }));
  
  for (const seat of ['top', 'left', 'right']) {
    const handData = serverState.hands[seat] || [];
    gameState.hands[seat] = handData.map((card, i) => ({
      id: card.id || `hidden_${seat}_${i}`,
      hidden: card.hidden || false,
      code: card.code,
      rank: card.rank,
      suit: card.suit,
      imageKey: card.hidden ? null : getImageKey(card.code)
    }));
  }
  
  gameState.pack = (serverState.pack || []).map(card => ({
    ...card,
    imageKey: getImageKey(card.code)
  }));
  
  // Convert server meld structure to client flat array format
  // Server: [{ id: 'meld_1', cards: [...] }, ...]
  // Client: [card1, card2, ...] with groupId property
  for (const seat of ['bottom', 'top', 'left', 'right']) {
    const flatCards = [];
    const serverMelds = serverState.sets[seat] || [];
    
    for (const meldGroup of serverMelds) {
      const groupId = meldGroup.id;
      for (const card of meldGroup.cards) {
        flatCards.push({
          ...card,
          groupId: groupId,
          imageKey: getImageKey(card.code)
        });
      }
    }
    
    gameState.sets[seat] = flatCards;
    gameState.opened[seat] = serverState.opened[seat] || false;
    gameState.eliminated[seat] = serverState.eliminated[seat] || false;
  }
  
  // Store meld structure for server communication
  gameState.serverMelds = serverState.sets;
  
  gameState.turnSeat = serverState.turnSeat || 'bottom';
  gameState.hasDrawn = serverState.hasDrawn || false;
  gameState.currentDealer = serverState.currentDealer || 'bottom';
  
  // Sync deck count (server sends count, we create placeholder array)
  if (typeof serverState.deckCount === 'number') {
    gameState.deck = new Array(serverState.deckCount).fill({ hidden: true });
  }
  
  // Sync game over state
  gameState.gameOver = serverState.gameOver || false;
  gameState.winner = serverState.winner || null;
  
  if (serverState.gameOver && serverState.winner) {
    showWinnerCelebration(serverState.winner);
  }
  
  renderAll();
  updateTurnIndicators();
  updateActiveTurnGlow();
  
  // Update status bar
  if (gameState.turnSeat === 'bottom') {
    if (gameState.hasDrawn) {
      setStatus('Your turn - lay cards or discard to end your turn');
    } else {
      setStatus('Your turn - draw from DECK or PACK');
    }
  } else {
    const turnPlayerInfo = serverState.players ? serverState.players[gameState.turnSeat] : null;
    const turnPlayerName = turnPlayerInfo ? turnPlayerInfo.name : gameState.turnSeat;
    setStatus(`${turnPlayerName}'s turn`);
  }
}

function getImageKey(code) {
  if (!code) return null;
  return CARD_IMAGE_MAP[code] || null;
}

function updateTurnIndicators() {
  const seats = ['bottom', 'top', 'left', 'right'];
  for (const seat of seats) {
    const indicator = document.querySelector(`#seat-${seat} .turn-indicator`);
    if (indicator) {
      indicator.style.display = gameState.turnSeat === seat ? 'block' : 'none';
    }
  }
}

function mpDrawCard(source) {
  if (!multiplayerMode || !socket) return;
  socket.emit('drawCard', { source: source });
}

function mpDiscardCard(cardId) {
  if (!multiplayerMode || !socket) return;
  socket.emit('discardCard', { cardId: cardId });
}

function mpLayMeld(cardIds) {
  if (!multiplayerMode || !socket) return;
  socket.emit('layMeld', { cardIds: cardIds });
}

function mpExtendMeld(cardId, targetSeat, meldId) {
  if (!multiplayerMode || !socket) return;
  socket.emit('extendMeld', { 
    cardId: cardId, 
    targetSeat: targetSeat, 
    meldId: meldId 
  });
}

// ============= UNIFIED ANIMATION FUNCTIONS =============
// These functions work for ANY seat (bottom, top, left, right)
// They use the same CSS classes, timing, and easing as solo mode

function animateDrawUnified(source, seat, card, onComplete) {
  // Get source element (deck or pack)
  const sourceEl = source === 'deck' 
    ? document.getElementById('deckPile') 
    : document.getElementById('packArea');
  
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  // Get target element based on seat
  let targetEl;
  if (seat === 'bottom') {
    targetEl = document.getElementById('hand-bottom');
  } else {
    targetEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Create flying card with proper CSS class for transitions
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  
  // Show card face for pack draws (visible), card back for deck draws (hidden)
  let cardImage = 'cards/BACK_JAMAICA.png';
  if (source === 'pack' && card && card.code) {
    const imgKey = card.imageKey || getImageKey(card.code);
    if (imgKey) {
      cardImage = `cards/${imgKey}.png`;
    }
  }
  flyingCard.style.backgroundImage = `url("${cardImage}")`;
  
  // Start position: center of source
  flyingCard.style.left = (sourceRect.left + sourceRect.width / 2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height / 2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow to ensure starting position is applied
  flyingCard.offsetHeight;
  
  // Calculate end position based on seat
  let endX, endY;
  if (seat === 'bottom') {
    // For player's hand, position at end of existing cards
    const cards = targetEl.querySelectorAll('.card');
    if (cards.length > 0) {
      const lastCard = cards[cards.length - 1];
      const lastCardRect = lastCard.getBoundingClientRect();
      endX = lastCardRect.right - 10;
      endY = lastCardRect.top;
    } else {
      endX = targetRect.left + targetRect.width / 2 - 50;
      endY = targetRect.top;
    }
  } else {
    // For other seats, center of mini-hand area
    endX = targetRect.left + targetRect.width / 2 - 50;
    endY = targetRect.top + targetRect.height / 2 - 75;
  }
  
  // Animate to target
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
  });
  
  // Clean up and complete using proper timing
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.draw));
}

function animateDiscardUnified(seat, card, onComplete) {
  const packAreaEl = document.getElementById('packArea');
  if (!packAreaEl) {
    if (onComplete) onComplete();
    return;
  }
  
  // Get source element based on seat
  let sourceEl;
  if (seat === 'bottom') {
    sourceEl = document.getElementById('hand-bottom');
  } else {
    sourceEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const packRect = packAreaEl.getBoundingClientRect();
  
  // Create flying card with proper CSS class for transitions
  const flyingCard = document.createElement('div');
  flyingCard.className = 'discarding-card';
  
  // Show card face
  let cardImage = 'cards/BACK_JAMAICA.png';
  if (card && card.code) {
    const imgKey = card.imageKey || getImageKey(card.code);
    if (imgKey) {
      cardImage = `cards/${imgKey}.png`;
    }
  }
  flyingCard.style.backgroundImage = `url("${cardImage}")`;
  
  // Start position: center of source hand
  flyingCard.style.left = (sourceRect.left + sourceRect.width / 2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height / 2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  // Force reflow
  flyingCard.offsetHeight;
  
  // Calculate random end position in pack area
  const endX = packRect.left + Math.random() * 80 - 10;
  const endY = packRect.top + Math.random() * 60 - 5;
  const endRotation = (Math.random() - 0.5) * 50;
  
  // Store position for rendering later
  if (card && card.id) {
    packCardPositions.set(card.id, { 
      x: endX - packRect.left, 
      y: endY - packRect.top, 
      rotation: endRotation 
    });
  }
  
  // Animate to pack
  requestAnimationFrame(() => {
    flyingCard.style.left = endX + 'px';
    flyingCard.style.top = endY + 'px';
    flyingCard.style.transform = `rotate(${endRotation}deg)`;
  });
  
  // Clean up and complete using proper timing
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

// Multiplayer deal animation - uses same CSS classes and timing as solo
function playMpDealAnimation(dealerSeat, onComplete) {
  console.log('Playing MP deal animation (unified with solo), dealer:', dealerSeat);
  playSound('shuffle');
  
  const deckEl = document.getElementById('deckPile');
  if (!deckEl) {
    console.error('Deck element not found');
    if (onComplete) onComplete();
    return;
  }
  
  const deckRect = deckEl.getBoundingClientRect();
  const seats = ['bottom', 'left', 'top', 'right'];
  
  let cardIndex = 0;
  const totalCards = 52;
  
  // Use same timing as solo mode
  const dealDuration = getAnimDuration(BASE_ANIM.deal);
  const dealInterval = Math.round(dealDuration * 0.2); // Cards dealt at 20% of animation duration
  
  function dealNextCard() {
    if (cardIndex >= totalCards) {
      setTimeout(() => {
        playSound('cardFlip');
        if (onComplete) onComplete();
      }, dealDuration);
      return;
    }
    
    const seatIndex = cardIndex % 4;
    const seat = seats[seatIndex];
    
    let targetEl;
    if (seat === 'bottom') {
      targetEl = document.getElementById('hand-bottom');
    } else {
      targetEl = document.getElementById(`mini-${seat}`);
    }
    
    if (!targetEl) {
      cardIndex++;
      setTimeout(dealNextCard, dealInterval);
      return;
    }
    
    const targetRect = targetEl.getBoundingClientRect();
    
    // Same CSS class as solo mode - 100x150 sizing
    const flyingCard = document.createElement('div');
    flyingCard.className = seat === 'bottom' ? 'dealing-card to-player' : 'dealing-card to-bot';
    flyingCard.style.left = (deckRect.left + deckRect.width/2 - 50) + 'px';
    flyingCard.style.top = (deckRect.top + deckRect.height/2 - 75) + 'px';
    
    document.body.appendChild(flyingCard);
    
    if (cardIndex % 4 === 0) playSound('deal');
    
    requestAnimationFrame(() => {
      flyingCard.style.left = (targetRect.left + targetRect.width/2 - 50) + 'px';
      flyingCard.style.top = (targetRect.top + targetRect.height/2 - 75) + 'px';
      if (seat === 'left' || seat === 'right') {
        flyingCard.style.transform = 'rotate(90deg)';
      }
    });
    
    setTimeout(() => {
      flyingCard.remove();
    }, dealDuration);
    
    cardIndex++;
    setTimeout(dealNextCard, dealInterval);
  }
  
  dealNextCard();
}

function playMpDrawAnimation(source, seat, card, isMe, onComplete) {
  console.log('Playing MP draw animation (unified with solo):', source, seat);
  playSound('draw');
  
  const sourceEl = source === 'deck' ? document.getElementById('deckPile') : document.getElementById('packArea');
  if (!sourceEl) {
    if (onComplete) onComplete();
    return;
  }
  
  let targetEl;
  if (seat === 'bottom') {
    targetEl = document.getElementById('hand-bottom');
  } else {
    targetEl = document.getElementById(`mini-${seat}`);
  }
  
  if (!targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Same CSS class as solo mode - 100x150 sizing
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  
  const cardImg = (source === 'pack' && card && card.code) ? getCardImagePath(card) : 'cards/BACK_JAMAICA.png';
  flyingCard.style.backgroundImage = `url("${cardImg}")`;
  flyingCard.style.left = (sourceRect.left + sourceRect.width/2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height/2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  requestAnimationFrame(() => {
    flyingCard.style.left = (targetRect.left + targetRect.width/2 - 50) + 'px';
    flyingCard.style.top = (targetRect.top + targetRect.height/2 - 75) + 'px';
  });
  
  // Use same timing as solo mode
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.draw));
}

function playMpDiscardAnimation(seat, card, onComplete) {
  console.log('Playing MP discard animation (unified with solo):', seat);
  playSound('discard');
  
  let sourceEl;
  if (seat === 'bottom') {
    sourceEl = document.getElementById('hand-bottom');
  } else {
    sourceEl = document.getElementById(`mini-${seat}`);
  }
  
  const targetEl = document.getElementById('packArea');
  
  if (!sourceEl || !targetEl) {
    if (onComplete) onComplete();
    return;
  }
  
  const sourceRect = sourceEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  
  // Same CSS class as solo mode - 100x150 sizing
  const flyingCard = document.createElement('div');
  flyingCard.className = 'drawing-card';
  
  const cardImg = (card && card.code) ? getCardImagePath(card) : 'cards/BACK_JAMAICA.png';
  flyingCard.style.backgroundImage = `url("${cardImg}")`;
  flyingCard.style.left = (sourceRect.left + sourceRect.width/2 - 50) + 'px';
  flyingCard.style.top = (sourceRect.top + sourceRect.height/2 - 75) + 'px';
  
  document.body.appendChild(flyingCard);
  
  requestAnimationFrame(() => {
    flyingCard.style.left = (targetRect.left + targetRect.width/2 - 50) + 'px';
    flyingCard.style.top = (targetRect.top + targetRect.height/2 - 75) + 'px';
  });
  
  // Use same timing as solo mode
  setTimeout(() => {
    flyingCard.remove();
    if (onComplete) onComplete();
  }, getAnimDuration(BASE_ANIM.discard));
}

function mpReorderHand(cardIds) {
  if (!multiplayerMode || !socket) return;
  socket.emit('reorderHand', { cardIds: cardIds });
}

function broadcastGameAction(action, payload) {
  if (!multiplayerMode || !socket) return;
  
  socket.emit('gameAction', {
    action: action,
    payload: payload
  });
}

let gameState = {
  deck: [],
  hands: {
    bottom: [],
    top: [],
    left: [],
    right: []
  },
  sets: {
    bottom: [],
    top: [],
    left: [],
    right: []
  },
  pack: [],
  draggingCardId: null,

  // Turn / rule-engine state
  turnSeat: 'bottom',
  hasDrawn: false,
  lastDrawSource: null,        // 'deck' or 'pack'
  lastPackCardId: null,        // id of the PACK card drawn this turn (if any)
  lastDiscardSource: null,     // 'deck' or 'pack' for the most recent discard
  lastDiscardCardId: null,     // id of the most recent discard
  lastDiscardSeat: null,       // which seat made the most recent discard
  currentTurnId: 0,
  hasDiscardedThisTurn: false,

  opened: {
    bottom: false,
    top: false,
    left: false,
    right: false
  },

  eliminated: {
    bottom: false,
    top: false,
    left: false,
    right: false
  },

  // Track which meld groups are invalid (locked, glowing red)
  invalidMelds: {
    bottom: [],
    top: [],
    left: [],
    right: []
  },

  // Track goers played this turn (cards played on other players' sets)
  goersThisTurn: [],

  // Current dealer for this hand
  currentDealer: 'bottom',

  nextGroupId: 1,               // counter for manual set grouping
  
  // Joker swap staging for win attempts
  // When a player swaps a natural card for a Joker, we stage the swap
  // and only validate it when they try to win (discard their last card)
  stagedJokerSwaps: [],         // Array of { jokerCard, naturalCard, targetSeat, groupId, originalMeldState }
  winAttemptSnapshot: null,     // Snapshot of game state before swap (for rollback)
  
  // Pending Joker swap - when swapping for a Joker, the Joker goes to player's set box
  // The player can add cards to form a meld, or double-click to undo
  pendingJokerSwap: null,       // { jokerCard, naturalCard, originalSeat, originalGroupId, newGroupId, addedCards }
  
  // Card tracking for smart bot AI
  cardTracking: {
    discardHistory: [],         // Array of { card, seat, turnNumber } - all discards this hand
    knownCards: new Set(),      // Set of card IDs that have been seen (discards + melds)
    totalCardsInGame: 106,      // 52 cards x 2 decks + 2 jokers
    playerDiscardPatterns: {    // Track what each player tends to discard
      bottom: [],
      top: [],
      left: [],
      right: []
    }
  },
  
  // IN voting system (multiplayer only) - vote to restart/re-deal the hand
  // Voting is open until the first player takes their second draw
  inVoting: {
    isOpen: false,              // Whether voting window is open
    votes: [],                  // Array of seat names who voted IN
    drawCounts: {               // Track how many times each player has drawn
      bottom: 0,
      top: 0,
      left: 0,
      right: 0
    }
  }
};

// Global group-id allocator used by human + bots
function nextGroupId() {
  if (typeof gameState.nextGroupId !== 'number') {
    gameState.nextGroupId = 1;
  }
  const id = 'g_' + gameState.nextGroupId;
  gameState.nextGroupId += 1;
  return id;
}

// ============= IN VOTING SYSTEM (MULTIPLAYER ONLY) =============
// Allows players to vote for restarting the hand before anyone takes their second draw

function resetInVoting() {
  gameState.inVoting = {
    isOpen: multiplayerMode, // Only open in multiplayer
    votes: [],
    drawCounts: {
      bottom: 0,
      top: 0,
      left: 0,
      right: 0
    }
  };
  updateInButtonUI();
}

function castInVote(seat) {
  if (!gameState.inVoting.isOpen) return;
  if (gameState.inVoting.votes.includes(seat)) return;
  
  // In multiplayer, let server handle the voting
  if (multiplayerMode && socket && seat === 'bottom') {