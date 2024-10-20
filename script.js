const LIVEKIT_WS_URL = 'wss://106.212.240.128:7880';
const BACKEND_URL = 'https://token-server-pk5o.onrender.com';

let room;
let audioTrack;

if (typeof LivekitClient === 'undefined') {
  console.error('LiveKit client library not loaded');
  alert('LiveKit client library not loaded. Please refresh the page.');
}

function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

function getAvatarColor(name) {
  const colors = [
    '#61dafb', '#4caf50', '#ff9800', '#e91e63',
    '#9c27b0', '#673ab7', '#3f51b5', '#2196f3'
  ];
  const index = Math.abs(name.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0)) % colors.length;
  return colors[index];
}

function createParticipantCard(participant, isLocal = false) {
  const card = document.createElement('div');
  card.className = `participant-card ${isLocal ? 'local-participant' : ''}`;
  card.id = `participant-${participant.identity}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.backgroundColor = getAvatarColor(participant.identity);
  avatar.textContent = getInitials(participant.identity);

  const nameElement = document.createElement('div');
  nameElement.className = 'participant-name';
  nameElement.textContent = participant.identity;

  const mutedIndicator = document.createElement('div');
  mutedIndicator.className = 'muted-indicator';
  mutedIndicator.style.display = 'none';
  mutedIndicator.innerHTML = '<i class="fas fa-microphone-slash"></i>';

  card.appendChild(avatar);
  card.appendChild(nameElement);
  card.appendChild(mutedIndicator);

  return card;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('Audio permissions granted');
  } catch (error) {
    console.error('Failed to get audio permissions:', error);
    alert('Failed to get audio permissions. Please check your microphone.');
  }
});

async function getToken(roomName, participantName) {
  try {
    const response = await fetch(`${BACKEND_URL}/get-token?room=${roomName}&participant=${participantName}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.text();
  } catch (error) {
    console.error('Failed to get token:', error);
    throw new Error('Failed to get access token. Please check server connection.');
  }
}
async function joinRoom() {
  const roomName = document.getElementById('roomName').value;
  const participantName = document.getElementById('participantName').value;

  if (!roomName || !participantName) {
    alert('Please enter both room name and participant name');
    return;
  }

  try {
    const token = await getToken(roomName, participantName);
    room = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true
    });

    room.on(LivekitClient.RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(LivekitClient.RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(LivekitClient.RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(LivekitClient.RoomEvent.Disconnected, handleDisconnection);
    room.on(LivekitClient.RoomEvent.TrackMuted, handleTrackMuted);
    room.on(LivekitClient.RoomEvent.TrackUnmuted, handleTrackUnmuted);

    room.on(LivekitClient.RoomEvent.Connected, () => {
      console.log('Successfully connected to LiveKit server');
    });

    room.on(LivekitClient.RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state:', state);
    });

    console.log('Connecting to LiveKit server at:', LIVEKIT_WS_URL);
    await room.connect(LIVEKIT_WS_URL, token);
    console.log('Connected to room:', room.name);

    audioTrack = await LivekitClient.createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    });

    await room.localParticipant.publishTrack(audioTrack);

    document.getElementById('joinControls').style.display = 'none';
    document.getElementById('roomControls').style.display = 'flex';
    document.getElementById('roomTitle').textContent = `Room: ${roomName}`;

    updateParticipantList();
    setupSpeakingDetection(room.localParticipant, audioTrack);

  } catch (error) {
    console.error('Failed to connect to room:', error);
    alert('Failed to connect: ' + error.message);
  }
}


function handleParticipantConnected(participant) {
  console.log('Participant connected:', participant.identity);
  updateParticipantList();
}

function handleParticipantDisconnected(participant) {
  console.log('Participant disconnected:', participant.identity);
  const card = document.getElementById(`participant-${participant.identity}`);
  if (card) card.remove();
  updateParticipantList();
}

function handleTrackSubscribed(track, publication, participant) {
  console.log('Track subscribed:', track.kind, 'from:', participant.identity);
  if (track.kind === 'audio') {
    const audioElement = new Audio();
    audioElement.srcObject = new MediaStream([track.mediaStreamTrack]);
    audioElement.autoplay = true;
    audioElement.play().catch(error => {
      console.error('Error playing audio:', error);
    });
    setupSpeakingDetection(participant, track);
  }
}

function handleTrackUnsubscribed(track) {
  console.log('Track unsubscribed:', track.kind);
}

function handleTrackMuted(track, participant) {
  updateMutedState(participant, true);
}

function handleTrackUnmuted(track, participant) {
  updateMutedState(participant, false);
}

function updateMutedState(participant, isMuted) {
  const card = document.getElementById(`participant-${participant.identity}`);
  if (card) {
    const mutedIndicator = card.querySelector('.muted-indicator');
    if (mutedIndicator) mutedIndicator.style.display = isMuted ? 'block' : 'none';
  }
}

function updateParticipantList() {
  const participantList = document.getElementById('participants');
  participantList.innerHTML = '';

  if (room && room.state === 'connected') {
    const participants = [room.localParticipant, ...Array.from(room.participants.values())];
    participants.forEach((participant, index) => {
      const card = createParticipantCard(participant, participant === room.localParticipant);
      card.style.order = index; // Set the order to maintain positions
      participantList.appendChild(card);
    });

    const totalParticipants = participants.length;
    document.getElementById('participantCount').textContent =
      `${totalParticipants} participant${totalParticipants !== 1 ? 's' : ''} in the room`;
  } else {
    console.error('Room not available or not connected');
    document.getElementById('participantCount').textContent = 'No participants (room not available or not connected)';
  }
}

function toggleMute() {
  if (audioTrack) {
    audioTrack.muted = !audioTrack.muted;
    const muteButton = document.getElementById('muteButton');
    updateMutedState(room.localParticipant, audioTrack.muted);

    if (audioTrack.muted) {
      muteButton.innerHTML = '<i class="fas fa-microphone-slash"></i> Unmute';
      muteButton.style.backgroundColor = '#f44336';
    } else {
      muteButton.innerHTML = '<i class="fas fa-microphone"></i> Mute';
      muteButton.style.backgroundColor = '#4caf50';
    }
  }
}

async function leaveRoom() {
  if (audioTrack) {
    audioTrack.stop();
    audioTrack = null;
  }

  if (room) {
    await room.disconnect(true);
    room = null;
  }

  document.getElementById('joinControls').style.display = 'flex';
  document.getElementById('roomControls').style.display = 'none';
  document.getElementById('participants').innerHTML = '';
  document.getElementById('roomTitle').textContent = '';
  document.getElementById('participantCount').textContent = '';

  const muteButton = document.getElementById('muteButton');
  muteButton.innerHTML = '<i class="fas fa-microphone"></i> Mute';
  muteButton.style.backgroundColor = '#4caf50';
}

function handleDisconnection() {
  console.log('Disconnected from room');
  leaveRoom();
}

function setupSpeakingDetection(participant, track) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  source.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  let speaking = false;
  const speakingThreshold = 20; // Adjust this value to change sensitivity

  function checkAudioLevel() {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;

    if (average > speakingThreshold && !speaking) {
      speaking = true;
      updateSpeakingState(participant, true);
    } else if (average <= speakingThreshold && speaking) {
      speaking = false;
      updateSpeakingState(participant, false);
    }

    requestAnimationFrame(checkAudioLevel);
  }

  checkAudioLevel();
}

function updateSpeakingState(participant, isSpeaking) {
  const card = document.getElementById(`participant-${participant.identity}`);
  if (card) {
    const nameElement = card.querySelector('.participant-name');
    if (nameElement) {
      if (isSpeaking && !participant.audioTrack?.muted) {
        nameElement.classList.add('speaking');
      } else {
        nameElement.classList.remove('speaking');
      }
    }
  }
}

window.addEventListener('beforeunload', () => {
  if (room) {
    leaveRoom();
  }
});
