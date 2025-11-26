const roomCode = new URLSearchParams(window.location.search).get('room');
if (document.getElementById('room-code')) {
    document.getElementById('room-code').innerText = roomCode;
}

const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('video-grid');
const transcriptBox = document.getElementById('transcript-box');
const recButton = document.querySelector('.btn-info');
const langSelect = document.getElementById('target-lang'); // Get Dropdown

let localStream;
let rtcPeerConnections = {};
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const BACKEND_URL = 'ws://127.0.0.1:8000';
const signalSocket = new WebSocket(`${BACKEND_URL}/ws/signal/${roomCode}/`);
const translateSocket = new WebSocket(`${BACKEND_URL}/ws/translate/`);

async function startMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        signalSocket.addEventListener('open', () => {
            signalSocket.send(JSON.stringify({ type: 'join', sender: getMyId() }));
        });
        activateButtons();
    } catch (e) {
        console.error('Media Error:', e);
        alert("Could not access Camera/Microphone.");
    }
}
startMedia();

function activateButtons() {
    document.getElementById('btn-mic').onclick = () => {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack.enabled) {
            audioTrack.enabled = false;
            document.getElementById('btn-mic').innerText = "🔇";
            document.getElementById('btn-mic').classList.replace('btn-danger', 'btn-secondary');
        } else {
            audioTrack.enabled = true;
            document.getElementById('btn-mic').innerText = "🎤";
            document.getElementById('btn-mic').classList.replace('btn-secondary', 'btn-danger');
        }
    };
    document.getElementById('btn-cam').onclick = () => {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack.enabled) {
            videoTrack.enabled = false;
            document.getElementById('btn-cam').innerText = "⬛";
            document.getElementById('btn-cam').classList.replace('btn-success', 'btn-secondary');
        } else {
            videoTrack.enabled = true;
            document.getElementById('btn-cam').innerText = "📷";
            document.getElementById('btn-cam').classList.replace('btn-secondary', 'btn-success');
        }
    };
}

// === WebRTC Logic (Standard) ===
signalSocket.onmessage = async (e) => {
    const data = JSON.parse(e.data);
    const peerId = data.sender;
    if (data.type === 'join') createOffer(peerId);
    else if (data.type === 'offer') handleOffer(data.offer, peerId);
    else if (data.type === 'answer') handleAnswer(data.answer, peerId);
    else if (data.type === 'ice-candidate') handleCandidate(data.candidate, peerId);
};

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(config);
    rtcPeerConnections[peerId] = pc;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = (event) => {
        let vid = document.getElementById(`vid-${peerId}`);
        if (!vid) {
            const container = document.createElement('div');
            container.className = 'video-container m-2';
            vid = document.createElement('video');
            vid.id = `vid-${peerId}`;
            vid.autoplay = true;
            vid.playsInline = true;
            container.appendChild(vid);
            videoGrid.appendChild(container);
        }
        vid.srcObject = event.streams[0];
    };
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            signalSocket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate, target: peerId, sender: getMyId() }));
        }
    };
    return pc;
}

const myId = Math.random().toString(36).substr(2, 9);
function getMyId() { return myId; }

async function createOffer(peerId) {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalSocket.send(JSON.stringify({ type: 'offer', offer: offer, target: peerId, sender: getMyId() }));
}

async function handleOffer(offer, peerId) {
    const pc = createPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalSocket.send(JSON.stringify({ type: 'answer', answer: answer, target: peerId, sender: getMyId() }));
}

async function handleAnswer(answer, peerId) {
    const pc = rtcPeerConnections[peerId];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(candidate, peerId) {
    const pc = rtcPeerConnections[peerId];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

// === TRANSLATION LOGIC (Start/Stop + Dynamic Lang) ===
let audioContext;
let processor;
let inputSource;
let audioBufferChunks = []; 
let isRecording = false;

recButton.onclick = toggleTranslation;
recButton.innerText = "🔴 Start Speaking";

async function toggleTranslation() {
    if (!isRecording) {
        // === 1. START RECORDING ===
        isRecording = true;
        recButton.innerText = "⏹️ Stop & Send";
        recButton.classList.replace('btn-info', 'btn-warning');
        audioBufferChunks = []; 
        
        // NEW: Send the selected language to backend FIRST
        const selectedLang = langSelect.value;
        if(translateSocket.readyState === WebSocket.OPEN){
             translateSocket.send(JSON.stringify({ type: 'config', lang: selectedLang }));
             console.log("Setting Language to:", selectedLang);
        }

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        inputSource = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            if (isRecording) {
                const inputData = e.inputBuffer.getChannelData(0);
                audioBufferChunks.push(new Float32Array(inputData));
            }
        };

        inputSource.connect(processor);
        processor.connect(audioContext.destination);

    } else {
        // === 2. STOP & SEND ===
        isRecording = false;
        recButton.innerText = "⏳ Processing...";
        
        inputSource.disconnect();
        processor.disconnect();

        if (audioBufferChunks.length > 0 && translateSocket.readyState === WebSocket.OPEN) {
            let totalLength = 0;
            for (let chunk of audioBufferChunks) totalLength += chunk.length;

            let merged = new Float32Array(totalLength);
            let offset = 0;
            for (let chunk of audioBufferChunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
            }

            const pcmData = new Int16Array(merged.length);
            for (let i = 0; i < merged.length; i++) {
                let s = Math.max(-1, Math.min(1, merged[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            console.log(`Sending ${pcmData.byteLength} bytes...`);
            translateSocket.send(pcmData.buffer);
        }

        setTimeout(() => {
            recButton.innerText = "🔴 Start Speaking";
            recButton.classList.replace('btn-warning', 'btn-info');
        }, 1000);
    }
}

translateSocket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    
    recButton.innerText = "🔴 Start Speaking";
    recButton.classList.replace('btn-warning', 'btn-info');

    const div = document.createElement('div');
    div.className = 'subtitle-msg';
    div.innerHTML = `<div class="subtitle-orig">${data.original}</div><div class="subtitle-trans">${data.translated}</div>`;
    transcriptBox.appendChild(div);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;

    const audio = new Audio("data:audio/mp3;base64," + data.audio);
    audio.play();
};