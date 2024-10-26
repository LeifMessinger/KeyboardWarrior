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

    stopAll(){
        for(let [note, sound] of this.activeOscillators.entries()){
            if((!note) || (!sound)) continue;
            const { oscillator, gainNode } = sound;
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.05);
            oscillator.stop(this.audioContext.currentTime + 0.05);
            this.activeOscillators.delete(note);
        }
    }
}

class MIDIInput extends EventTarget {
    constructor(audioPlayer) {
        super();
        this.audioPlayer = audioPlayer;
        this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    }

    getMIDINoteInfo(note) {
        const octave = Math.floor(note / 12) - 1;
        const noteIndex = note % 12;
        const noteName = this.noteNames[noteIndex];
        return {
            note,
            noteName,
            fullNoteName: `${noteName}${octave}`,
            octave
        };
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
        const noteInfo = this.getMIDINoteInfo(note);

        if ((command === 144) && (velocity > 0)) {
            this.audioPlayer.playNote(note, velocity / 127);
            this.dispatchEvent(new CustomEvent('noteon', { 
                detail: { ...noteInfo, velocity }
            }));
        } else if ((command === 128) || ((command === 144) && (velocity === 0))) {
            this.audioPlayer.stopNote(note);
            this.dispatchEvent(new CustomEvent('noteoff', { 
                detail: { ...noteInfo, velocity: 0 }
            }));
        }
    }
}

class PianoKeyboard {
    constructor(containerId, audioPlayer) {
        this.container = document.getElementById(containerId);
        this.audioPlayer = audioPlayer;
        this.activeKeys = new Set();
        this.setup();
    }

    createKey(note, isBlack = false) {
        const key = document.createElement('div');
        key.className = `key${isBlack ? ' black-key' : ''}`;
        key.dataset.note = note;
        return key;
    }

    setup() {
        const piano = document.createElement('div');
        piano.className = 'piano';

        const octaveStructure = [
            //Ocatve -1
            { note: 48, black: false }, // C
            { note: 49, black: true  }, // C#
            { note: 50, black: false }, // D
            { note: 51, black: true  }, // D#
            { note: 52, black: false }, // E
            { note: 53, black: false }, // F
            { note: 54, black: true  }, // F#
            { note: 55, black: false }, // G
            { note: 56, black: true  }, // G#
            { note: 57, black: false }, // A
            { note: 58, black: true  }, // A#
            { note: 59, black: false },  // B
            //Ocatve 0
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
            { note: 71, black: false },  // B
            //Ocatve + 1
            { note: 72, black: false }, // C
            { note: 73, black: true  }, // C#
            { note: 74, black: false }, // D
            { note: 75, black: true  }, // D#
            { note: 76, black: false }, // E
            { note: 77, black: false }, // F
            { note: 78, black: true  }, // F#
            { note: 79, black: false }, // G
            { note: 80, black: true  }, // G#
            { note: 81, black: false }, // A
            { note: 82, black: true  }, // A#
            { note: 83, black: false }  // B
        ];

        octaveStructure.forEach(({ note, black }) => {
            const key = this.createKey(note, black);
            piano.appendChild(key);
        });

        this.container.appendChild(piano);
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mouse events only for visualization
        this.container.addEventListener('mousedown', (e) => {
            const key = e.target.closest('.key');
            if (key) {
                key.classList.add('active');
                
                const note = parseInt(key.dataset.note);
                this.audioPlayer.playNote(note);
                this.dispatchEvent(new CustomEvent('noteon', { 
                    detail: { ...noteInfo}
                }));
            }
        });

        document.addEventListener('mouseup', () => {
            const activeKeys = this.container.querySelectorAll('.key.active');
            activeKeys.forEach(key => key.classList.remove('active'));

            this.audioPlayer.stopAll();
            this.dispatchEvent(new CustomEvent('noteoff'));
        });
    }

    setNoteActive(note, active) {
        const key = this.container.querySelector(`[data-note="${note}"]`);
        if (key) {
            if (active) {
                key.classList.add('active');
            } else {
                key.classList.remove('active');
            }
        }
    }
}

class AccessibilityMIDIKeyboard {
    constructor(){
        this.heldNotes = []
    }
    init(midiInput){
        // Set up event listeners
        midiInput.addEventListener('noteon', (e) => {
            const { note, noteName, fullNoteName, velocity } = e.detail;

        });

        midiInput.addEventListener('noteoff', (e) => {
            const { note, noteName, fullNoteName } = e.detail;

        });
    }
}

// Initialize the application
const audioPlayer = new AudioPlayer();
const midiInput = new MIDIInput(audioPlayer);
const piano = new PianoKeyboard('pianoContainer', audioPlayer);

// Set up event listeners
midiInput.addEventListener('noteon', (e) => {
    const { note, noteName, fullNoteName, velocity } = e.detail;
    console.log(`Note On: ${fullNoteName} (${note}) velocity: ${velocity}`);
    piano.setNoteActive(note, true);
});

midiInput.addEventListener('noteoff', (e) => {
    const { note, noteName, fullNoteName } = e.detail;
    console.log(`Note Off: ${fullNoteName} (${note})`);
    piano.setNoteActive(note, false);
});

// Connect UI controls
document.getElementById('midiConnectBtn').addEventListener('click', () => {
    midiInput.init();
});

document.getElementById('waveform').addEventListener('change', (e) => {
    audioPlayer.setWaveform(e.target.value);
});

document.getElementById('volume').addEventListener('input', (e) => {
    audioPlayer.setVolume(e.target.value / 100);
});