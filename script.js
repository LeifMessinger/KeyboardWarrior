class AudioPlayer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.activeOscillators = new Map();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        this.setVolume(0.5);
    }

    midiNoteToFrequency(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    setVolume(value) {
        this.masterGain.gain.setValueAtTime(value, this.audioContext.currentTime);
    }

    setWaveform(waveform) {
        this.waveform = waveform;
    }

    playNote(note, velocity = 1.0) {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const frequency = this.midiNoteToFrequency(note);
        
        // Stop any existing note
        this.stopNote(note);

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = this.waveform || 'triangle';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(velocity, this.audioContext.currentTime + 0.01);
        
        oscillator.start();
        this.activeOscillators.set(note, { oscillator, gainNode });

        return frequency;
    }

    stopNote(note) {
        const sound = this.activeOscillators.get(note);
        if (sound) {
            const { oscillator, gainNode } = sound;
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.05);
            oscillator.stop(this.audioContext.currentTime + 0.05);
            this.activeOscillators.delete(note);
        }
    }
}

class MIDIInput {
    constructor(audioPlayer) {
        this.audioPlayer = audioPlayer;
        this.onNoteOn = null;
        this.onNoteOff = null;
    }

    async init() {
        try {
            const midiAccess = await navigator.requestMIDIAccess();
            const inputs = midiAccess.inputs.values();
            
            for (const input of inputs) {
                input.onmidimessage = this.handleMIDIMessage.bind(this);
            }

            const inputCount = Array.from(midiAccess.inputs).length;
            document.getElementById('midiStatus').textContent = 
                `MIDI connected: ${inputCount} input${inputCount !== 1 ? 's' : ''} available`;
            
            midiAccess.onstatechange = (e) => {
                const input = e.port;
                if (input.type === "input") {
                    if (input.state === "connected") {
                        input.onmidimessage = this.handleMIDIMessage.bind(this);
                    }
                    const newInputCount = Array.from(midiAccess.inputs).length;
                    document.getElementById('midiStatus').textContent = 
                        `MIDI connected: ${newInputCount} input${newInputCount !== 1 ? 's' : ''} available`;
                }
            };
        } catch (err) {
            document.getElementById('midiStatus').textContent = 
                'Failed to connect MIDI: ' + err;
        }
    }

    handleMIDIMessage(message) {
        const command = message.data[0];
        const note = message.data[1];
        const velocity = (message.data.length > 2) ? message.data[2] : 0;

        if ((command === 144) && (velocity > 0)) {
            this.audioPlayer.playNote(note, velocity / 127);
            if (this.onNoteOn) this.onNoteOn(note);
        } else if ((command === 128) || ((command === 144) && (velocity === 0))) {
            this.audioPlayer.stopNote(note);
            if (this.onNoteOff) this.onNoteOff(note);
        }
    }
}

class PianoKeyboard {
    constructor(containerId, audioPlayer) {
        this.container = document.getElementById(containerId);
        this.audioPlayer = audioPlayer;
        this.activeKeys = new Set();
        this.keyMap = this.createKeyMap();
        this.setup();
    }

    createKeyMap() {
        return {
            'a': 60, // C4
            'w': 61,
            's': 62,
            'e': 63,
            'd': 64,
            'f': 65,
            't': 66,
            'g': 67,
            'y': 68,
            'h': 69,
            'u': 70,
            'j': 71  // B4
        };
    }

    createKey(note, isBlack = false) {
        const key = document.createElement('div');
        key.className = `key${isBlack ? ' black-key' : ''}`;
        key.dataset.note = note;
        return key;
    }

    setup() {
        // Create piano container
        const piano = document.createElement('div');
        piano.className = 'piano';

        // Define the structure of a single octave
        const octaveStructure = [
            { note: 60, black: false }, // C
            { note: 61, black: true  }, // C#
            { note: 62, black: false }, // D
            { note: 63, black: true  }, // D#
            { note: 64, black: false }, // E
            { note: 65, black: false }, // F
            { note: 66, black: true  }, // F#
            { note: 67, black: false }, // G
            { note: 68, black: true  }, // G#
            { note: 69, black: false }, // A
            { note: 70, black: true  }, // A#
            { note: 71, black: false }  // B
        ];

        // Create keys
        octaveStructure.forEach(({ note, black }) => {
            const key = this.createKey(note, black);
            piano.appendChild(key);
        });

        this.container.appendChild(piano);
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mouse/touch events
        this.container.addEventListener('mousedown', (e) => {
            const key = e.target.closest('.key');
            if (key) {
                const note = parseInt(key.dataset.note);
                this.playNote(note);
            }
        });

        document.addEventListener('mouseup', () => {
            this.activeKeys.forEach(note => this.stopNote(note));
            this.activeKeys.clear();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (!e.repeat && this.keyMap[e.key] !== undefined) {
                const note = this.keyMap[e.key];
                this.playNote(note);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.keyMap[e.key] !== undefined) {
                const note = this.keyMap[e.key];
                this.stopNote(note);
            }
        });
    }

    playNote(note) {
        this.activeKeys.add(note);
        this.audioPlayer.playNote(note);
        const key = this.container.querySelector(`[data-note="${note}"]`);
        if (key) key.classList.add('active');
    }

    stopNote(note) {
        this.activeKeys.delete(note);
        this.audioPlayer.stopNote(note);
        const key = this.container.querySelector(`[data-note="${note}"]`);
        if (key) key.classList.remove('active');
    }
}

// Initialize the application
const audioPlayer = new AudioPlayer();
const midiInput = new MIDIInput(audioPlayer);
const piano = new PianoKeyboard('pianoContainer', audioPlayer);

// Set up MIDI connection button
document.getElementById('midiConnectBtn').addEventListener('click', () => {
    midiInput.init();
});

// Connect UI controls
document.getElementById('waveform').addEventListener('change', (e) => {
    audioPlayer.setWaveform(e.target.value);
});

document.getElementById('volume').addEventListener('input', (e) => {
    audioPlayer.setVolume(e.target.value / 100);
});

// Connect MIDI visual feedback
midiInput.onNoteOn = (note) => {
    const key = document.querySelector(`[data-note="${note}"]`);
    if (key) key.classList.add('active');
};

midiInput.onNoteOff = (note) => {
    const key = document.querySelector(`[data-note="${note}"]`);
    if (key) key.classList.remove('active');
};