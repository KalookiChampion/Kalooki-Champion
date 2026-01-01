const socket = io();

let playerName = '';
let isHost = false;
let currentRoomCode = '';
let selectedPlayerCount = 2;

const sections = {
  name: document.getElementById('name-section'),
  choice: document.getElementById('choice-section'),
  create: document.getElementById('create-section'),
  waiting: document.getElementById('waiting-section'),
  join: document.getElementById('join-section'),
  joined: document.getElementById('joined-section'),
  spectate: document.getElementById('spectate-section'),
  spectating: document.getElementById('spectating-section')
};

function showSection(sectionName) {
  Object.values(sections).forEach(s => {
    if (s) s.classList.add('hidden');
  });
  if (sections[sectionName]) {
    sections[sectionName].classList.remove('hidden');
  }
}

// Load previously saved name on page load
const savedName = localStorage.getItem('kalookiPlayerName');
if (savedName && savedName !== 'Player') {
  playerName = savedName;
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    nameInput.value = savedName;
  }
}

function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('error-overlay').classList.remove('hidden');
}

document.getElementById('btnConfirmName').addEventListener('click', () => {
  const nameInput = document.getElementById('playerName');
  const name = nameInput.value.trim();
  
  if (!name) {
    nameInput.style.borderColor = '#d32f2f';
    return;
  }
  
  if (name.length > 20) {
    showError('Name must be 20 characters or less');
    return;
  }
  
  playerName = name;
  // Save name immediately when confirmed
  localStorage.setItem('kalookiPlayerName', playerName);
  document.getElementById('displayName').textContent = playerName;
  showSection('choice');
});

document.getElementById('playerName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btnConfirmName').click();
  }
});

document.getElementById('playerName').addEventListener('input', (e) => {
  e.target.style.borderColor = '#ddd';
});

document.getElementById('btnCreateTable').addEventListener('click', () => {
  showSection('create');
});

document.getElementById('btnJoinTable').addEventListener('click', () => {
  showSection('join');
  document.getElementById('roomCodeInput').focus();
});

document.getElementById('btnPlayAlone').addEventListener('click', () => {
  localStorage.setItem('kalookiPlayerName', playerName);
  localStorage.setItem('kalookiGameMode', 'solo');
  localStorage.removeItem('kalookiDemoMode');
  window.location.href = '/game.html';
});

document.getElementById('btnDemoMode').addEventListener('click', () => {
  // Don't overwrite the player's actual name - demo mode uses bots only
  localStorage.setItem('kalookiGameMode', 'solo');
  localStorage.setItem('kalookiDemoMode', 'true');
  window.location.href = '/game.html';
});

const btnSpectate = document.getElementById('btnSpectate');
if (btnSpectate) {
  btnSpectate.addEventListener('click', () => {
    showSection('spectate');
    const spectateInput = document.getElementById('spectateCodeInput');
    if (spectateInput) spectateInput.focus();
  });
}

const btnBackFromSpectate = document.getElementById('btnBackFromSpectate');
if (btnBackFromSpectate) {
  btnBackFromSpectate.addEventListener('click', () => {
    showSection('choice');
  });
}

const spectateCodeInput = document.getElementById('spectateCodeInput');
if (spectateCodeInput) {
  spectateCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const errorEl = document.getElementById('spectateError');
    if (errorEl) errorEl.classList.add('hidden');
  });
  
  spectateCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const btnSpectateRoom = document.getElementById('btnSpectateRoom');
      if (btnSpectateRoom) btnSpectateRoom.click();
    }
  });
}

const btnSpectateRoom = document.getElementById('btnSpectateRoom');
if (btnSpectateRoom) {
  btnSpectateRoom.addEventListener('click', () => {
    const codeInput = document.getElementById('spectateCodeInput');
    const code = codeInput ? codeInput.value.trim() : '';
    
    if (code.length !== 4) {
      const errorEl = document.getElementById('spectateError');
      if (errorEl) {
        errorEl.textContent = 'Please enter a 4-digit code';
        errorEl.classList.remove('hidden');
      }
      return;
    }
    
    socket.emit('spectateRoom', {
      roomCode: code,
      spectatorName: playerName || 'Spectator'
    });
  });
}

const btnLeaveSpectate = document.getElementById('btnLeaveSpectate');
if (btnLeaveSpectate) {
  btnLeaveSpectate.addEventListener('click', () => {
    socket.emit('leaveSpectate');
    showSection('choice');
  });
}

document.querySelectorAll('.count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedPlayerCount = parseInt(btn.dataset.count);
  });
});

document.getElementById('btnBackFromCreate').addEventListener('click', () => {
  showSection('choice');
});

document.getElementById('btnBackFromJoin').addEventListener('click', () => {
  showSection('choice');
});

document.getElementById('btnBackFromWaiting').addEventListener('click', () => {
  socket.emit('leaveRoom');
  showSection('choice');
});

document.getElementById('btnLeaveRoom').addEventListener('click', () => {
  socket.emit('leaveRoom');
  showSection('choice');
});

document.getElementById('btnCloseError').addEventListener('click', () => {
  document.getElementById('error-overlay').classList.add('hidden');
});

document.getElementById('btnCreateRoom').addEventListener('click', () => {
  isHost = true;
  socket.emit('createRoom', {
    playerName: playerName,
    maxPlayers: selectedPlayerCount
  });
});

document.getElementById('btnCopyCode').addEventListener('click', () => {
  const code = document.getElementById('roomCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('btnCopyCode');
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = '📋', 1500);
  });
});

document.getElementById('roomCodeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  document.getElementById('joinError').classList.add('hidden');
});

document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('btnJoinRoom').click();
  }
});

document.getElementById('btnJoinRoom').addEventListener('click', () => {
  const code = document.getElementById('roomCodeInput').value.trim();
  
  if (code.length !== 4) {
    const errorEl = document.getElementById('joinError');
    errorEl.textContent = 'Please enter a 4-digit code';
    errorEl.classList.remove('hidden');
    return;
  }
  
  socket.emit('joinRoom', {
    roomCode: code,
    playerName: playerName
  });
});

document.getElementById('btnStartGame').addEventListener('click', () => {
  socket.emit('startGame', { roomCode: currentRoomCode });
});

socket.on('roomCreated', (data) => {
  currentRoomCode = data.roomCode;
  document.getElementById('roomCode').textContent = data.roomCode;
  document.getElementById('maxPlayers').textContent = data.maxPlayers;
  showSection('waiting');
  updatePlayersList(data.players, data.maxPlayers, true);
});

socket.on('roomJoined', (data) => {
  currentRoomCode = data.roomCode;
  document.getElementById('joinedRoomCode').textContent = data.roomCode;
  document.getElementById('joinedMaxPlayers').textContent = data.maxPlayers;
  showSection('joined');
  updatePlayersList(data.players, data.maxPlayers, false);
});

socket.on('playerJoined', (data) => {
  if (isHost) {
    updatePlayersList(data.players, data.maxPlayers, true);
  } else {
    updatePlayersList(data.players, data.maxPlayers, false);
  }
});

socket.on('playerLeft', (data) => {
  if (isHost) {
    updatePlayersList(data.players, data.maxPlayers, true);
  } else {
    updatePlayersList(data.players, data.maxPlayers, false);
  }
});

socket.on('joinError', (data) => {
  const errorEl = document.getElementById('joinError');
  errorEl.textContent = data.message;
  errorEl.classList.remove('hidden');
});

socket.on('roomClosed', () => {
  showError('The room has been closed by the host.');
  showSection('choice');
});

socket.on('gameStarting', (data) => {
  localStorage.setItem('kalookiPlayerName', playerName);
  localStorage.setItem('kalookiRoomCode', data.roomCode);
  localStorage.setItem('kalookiGameMode', 'multiplayer');
  localStorage.setItem('kalookiPlayerId', socket.id);
  localStorage.removeItem('kalookiSpectatorMode');
  window.location.href = '/game.html';
});

socket.on('spectateJoined', (data) => {
  currentRoomCode = data.roomCode;
  document.getElementById('spectatingRoomCode').textContent = data.roomCode;
  
  const listEl = document.getElementById('spectatingPlayersList');
  listEl.innerHTML = '';
  
  data.players.forEach((player, index) => {
    const li = document.createElement('li');
    li.textContent = player.name;
    if (player.isBot) {
      li.classList.add('bot');
    }
    listEl.appendChild(li);
  });
  
  if (data.gameStarted) {
    localStorage.setItem('kalookiPlayerName', playerName || 'Spectator');
    localStorage.setItem('kalookiRoomCode', data.roomCode);
    localStorage.setItem('kalookiGameMode', 'spectator');
    localStorage.setItem('kalookiSpectatorMode', 'true');
    window.location.href = '/game.html';
  } else {
    showSection('spectating');
  }
});

socket.on('spectateError', (data) => {
  const errorEl = document.getElementById('spectateError');
  errorEl.textContent = data.message;
  errorEl.classList.remove('hidden');
});

socket.on('spectateGameStarting', (data) => {
  localStorage.setItem('kalookiPlayerName', playerName || 'Spectator');
  localStorage.setItem('kalookiRoomCode', data.roomCode);
  localStorage.setItem('kalookiGameMode', 'spectator');
  localStorage.setItem('kalookiSpectatorMode', 'true');
  window.location.href = '/game.html';
});

function updatePlayersList(players, maxPlayers, isHostView) {
  const listEl = isHostView ? document.getElementById('playersList') : document.getElementById('joinedPlayersList');
  const countEl = isHostView ? document.getElementById('playerCount') : document.getElementById('joinedPlayerCount');
  const startBtn = document.getElementById('btnStartGame');
  
  listEl.innerHTML = '';
  countEl.textContent = players.length;
  
  players.forEach((player, index) => {
    const li = document.createElement('li');
    li.textContent = player.name;
    
    if (index === 0) {
      li.classList.add('host');
    }
    if (player.id === socket.id) {
      li.classList.add('you');
      li.textContent += ' (You)';
    }
    
    listEl.appendChild(li);
  });
  
  const botsNeeded = maxPlayers - players.length;
  for (let i = 0; i < botsNeeded; i++) {
    const li = document.createElement('li');
    li.classList.add('bot');
    li.textContent = `Bot ${i + 1} (waiting for player...)`;
    listEl.appendChild(li);
  }
  
  if (isHostView && startBtn) {
    if (players.length >= 2) {
      startBtn.disabled = false;
      startBtn.textContent = `Start Game (${players.length} players + ${botsNeeded} bots)`;
    } else {
      startBtn.disabled = true;
      startBtn.textContent = 'Waiting for at least 1 more player...';
    }
  }
}

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  showError('Lost connection to server. Please refresh the page.');
});
