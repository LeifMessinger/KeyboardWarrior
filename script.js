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
    }

    static getMIDINoteInfo(note) {
        const octave = Math.floor(note / 12) - 1;
        const noteIndex = note % 12;
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteName = noteNames[noteIndex];
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
        const noteInfo = MIDIInput.getMIDINoteInfo(note);

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

    createKey(keyData) {
        const key = document.createElement('div');
        key.className = `key${keyData.black ? ' black-key' : ''}`;
        Object.assign(key.dataset, keyData);
        key.setAttribute("draggable", true);
        key.addEventListener('dragstart', function(event) {
            event.dataTransfer.setData('text/plain', key.dataset.key + "\n");
        });
        key.addEventListener('dragend', (event)=>{
            this.audioPlayer.stopAll();
        });
        key.textContent = key.dataset.key;
        return key;
    }

    setup() {
        const piano = document.createElement('div');
        piano.className = 'piano';

        const octaveStructure = [
            //Ocatve -1
            { note: 48, black: false, key:"C" }, // C
            { note: 49, black: true , key:"C#" }, // C#
            { note: 50, black: false, key:"D" }, // D
            { note: 51, black: true , key:"D#" }, // D#
            { note: 52, black: false, key:"E" }, // E
            { note: 53, black: false, key:"F" }, // F
            { note: 54, black: true , key:"F#" }, // F#
            { note: 55, black: false, key:"G" }, // G
            { note: 56, black: true , key:"G#" }, // G#
            { note: 57, black: false, key:"A" }, // A
            { note: 58, black: true , key:"A#" }, // A#
            { note: 59, black: false, key:"B" },  // B
            //Ocatve 0
            { note: 60, black: false, key: "C", key:"C" }, // C
            { note: 61, black: true , key:"C#" }, // C#
            { note: 62, black: false, key:"D" }, // D
            { note: 63, black: true , key:"D#" }, // D#
            { note: 64, black: false, key:"E" }, // E
            { note: 65, black: false, key:"F" }, // F
            { note: 66, black: true , key:"F#" }, // F#
            { note: 67, black: false, key:"G" }, // G
            { note: 68, black: true , key:"G#" }, // G#
            { note: 69, black: false, key:"A" }, // A
            { note: 70, black: true , key:"A#" }, // A#
            { note: 71, black: false, key:"B" },  // B
            //Ocatve + 1
            { note: 72, black: false, key:"C" }, // C
            { note: 73, black: true , key:"C#" }, // C#
            { note: 74, black: false, key:"D" }, // D
            { note: 75, black: true , key:"D#" }, // D#
            { note: 76, black: false, key:"E" }, // E
            { note: 77, black: false, key:"F" }, // F
            { note: 78, black: true , key:"F#" }, // F#
            { note: 79, black: false, key:"G" }, // G
            { note: 80, black: true , key:"G#" }, // G#
            { note: 81, black: false, key:"A" }, // A
            { note: 82, black: true , key:"A#" }, // A#
            { note: 83, black: false, key:"B" }  // B
        ];

        octaveStructure.forEach((keyData) => {
            const key = this.createKey(keyData);
            piano.appendChild(key);
        });

        this.container.appendChild(piano);
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mouse events only for visualization
        this.container.addEventListener('mousedown', (e) => {
            this.audioPlayer.stopAll();

            const key = e.target.closest('.key');
            if (key) {
                const activeKeys = this.container.querySelectorAll('.key.active');
                activeKeys.forEach((thatKey) =>{
                    if(thatKey != key)
                        thatKey.classList.remove('active')
                });
                key.classList.add('active');
                
                const note = parseInt(key.dataset.note);
                const noteInfo = MIDIInput.getMIDINoteInfo(note);
                this.audioPlayer.playNote(note);
            }
        });

        document.addEventListener('mouseup', () => {
            const activeKeys = this.container.querySelectorAll('.key.active');
            activeKeys.forEach(key => key.classList.remove('active'));

            this.audioPlayer.stopAll();
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
        this.heldNotes = {}
    }
    init(midiInput, callback, timeout = .5){
        // Set up event listeners
        midiInput.addEventListener('noteon', (e) => {
            const { note, noteName, fullNoteName, velocity } = e.detail;
            this.heldNotes[note] = (setTimeout(()=>{
                callback(e.detail);
            }, timeout * 1000.0));
        });

        midiInput.addEventListener('noteoff', (e) => {
            const { note, noteName, fullNoteName } = e.detail;
            clearTimeout(this.heldNotes[note])
        });
    }
}

function parseMusicScript(input) {
    let notes = [];
    let octave = 0;
    let stepDuration = .25;
    let currentTime = 0;

    try{
        const lines = input.split('\n');

        lines.forEach(line => {
            if (line.startsWith('octave')) {
                if(!(line.includes(" "))) return;
                octave = parseInt(line.split(" ")[1])
            } else if (line.startsWith('step')) {
                if(!(line.includes(" "))) return;
                if(line.includes('/')){
                    const stepParts = line.split(' ');
                    const stepFraction = stepParts[1]?.split('/');
                    stepDuration = 1 / (parseFloat(stepFraction[1]) / parseFloat(stepFraction[0]));
                }else{
                    const old = stepDuration
                    stepDuration = parseFloat(line.split(' ')[1])
                    if(isNaN(stepDuration)) stepDuration = old
                }
            } else if (line.trim() !== '') {
                if (line.trim() === 'rest') {
                    currentTime += stepDuration;
                } else {
                    const octaveStructure = [
                        //Ocatve 0
                        { note: 60, black: false, key: "C" }, // C
                        { note: 61, black: true , key:"C#" }, // C#
                        { note: 62, black: false, key:"D" }, // D
                        { note: 63, black: true , key:"D#" }, // D#
                        { note: 64, black: false, key:"E" }, // E
                        { note: 65, black: false, key:"F" }, // F
                        { note: 66, black: true , key:"F#" }, // F#
                        { note: 67, black: false, key:"G" }, // G
                        { note: 68, black: true , key:"G#" }, // G#
                        { note: 69, black: false, key:"A" }, // A
                        { note: 70, black: true , key:"A#" }, // A#
                        { note: 71, black: false, key:"B" },  // B
                    ];

                    const noteLetter = line.trim();
                    const note = octaveStructure.find(n => n.key.toUpperCase() === noteLetter.toUpperCase());
                    if(!note){
                        console.error("Note not found:", noteValue);
                        throw "shit";
                    }
                    const noteValue = (note?.note) + ((octave - 4) * 12);

                    notes.push({
                        noteValue,
                        noteLetter,
                        startTime: currentTime,
                        endTime: currentTime + stepDuration
                    });
                    currentTime += stepDuration;
                }
            }
        });
    }catch(e){
        console.warn(e)
        return []
    }
    return notes
}

class Game{
    constructor(canvas){
        this.audioPlayer = new AudioPlayer();
        this.canvas = canvas
        this.canvasContext = canvas.getContext("2d");
        this.monsters = ["1f479", "1f47a", "1f47b", "1f480", "1f47d", "1f916", "1f47f", "1f608", "1f9db", "1f9df", "1f9d9", "1f577", "1f987"]; //Array.from("👹👺👻💀👽🤖👿😈🧛🧟🧙🕷️🦇").filter((str)=>str.length > 1)
        this.notes = []
        this.ghostNotes = []
        this.notesQueued = []
        this.start = 0;
        this.end =  1;
        this.darkMode = false;
        this.playing = false;
        this.startTime = Date.now()
        this.bpm = 120.0;
        this.startDelay = .5;
        this.sword = document.getElementById("sword");

        this.calculateRanges(); //sets highestNote, lowestNote, highestNoteLetter, lowestNoteLetter, end
    }

    shuffleMonsters(){
        //this doesn't work
        this.monsters = this.monsters
            .map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value)
    }

    calculateRanges(){
        const calculate = (notes) => {
            const maxNote = notes.reduce((prev, current) => (prev.noteValue > current.noteValue) ? prev : current);
            const minNote = notes.reduce((prev, current) => (prev.noteValue < current.noteValue) ? prev : current);
            
            return {minNote, maxNote};
        }
        const setRanges = ({minNote, maxNote}) => {
            this.highestNote = maxNote.noteValue ?? 0;
            this.lowestNote = minNote.noteValue ?? 0;
            this.highestNoteLetter = maxNote.noteLetter;
            this.lowestNoteLetter = minNote.noteLetter;
        }

        this.end = Math.max.apply(undefined, this.ghostNotes.map((note)=>note.endTime), this.notes.map((note)=>note.endTime))
        if(this.ghostNotes.length > 0 && this.notes.length > 0){
            const {maxNote: maxGhostNote, minNote: minGhostNote} = calculate(this.ghostNotes);
            const {maxNote: maxRealNote, minNote: minRealNote} = calculate(this.notes);
            const maxNote = (maxGhostNote.noteValue > maxRealNote.noteValue)? maxGhostNote : maxRealNote;
            const minNote = (minGhostNote.noteValue < minRealNote.noteValue)? minGhostNote : minRealNote;
            
            setRanges({minNote, maxNote});
        } else if(this.ghostNotes.length > 0){
            setRanges(calculate(this.ghostNotes));
        }else if(this.notes.length > 0){
            setRanges(calculate(this.notes));
        }else{
            this.highestNote = undefined;
            this.lowestNote = undefined;
            this.highestNoteLetter = 'C';
            this.lowestNoteLetter = 'C';
        }

        if(isNaN(this.end)){
            console.warn("end is NaN. Parsing the script probably failed and put NaN for note.endTime")
        }
    }

    setGhostNotes(ghostNotes){
        this.ghostNotes = ghostNotes ?? [];
        this.calculateRanges();
    }

    setNotes(notes){
        this.notes = notes ?? this.notes;
        this.calculateRanges();
    }

    run(){
        window.requestAnimationFrame(()=>{
            this.draw();
            this.run();
        });
    }

    uvX(x){
        return x * this.canvas.width
    }
    uvY(y){
        return y * this.canvas.height
    }

    lerp( a, b, zeroToOne ) {
        return a + zeroToOne * ( b - a )
    }
    invLerp(x, a, b){
        return (x - a) / (b - a)
    }

    //you gotta set the this.canvasContext.fillStyle before calling this
    drawNotes(notes, shake = 5.0){
        //This is in game space, from (0,0) in the top left corner, to (1,1) in the bottom right corner.
        const noteRange = this.highestNote - this.lowestNote;
        const noteHeight = 1.0/(noteRange + 1);

        for(let note of notes){
            const y = (this.highestNote - note.noteValue) * noteHeight;  //This should always yield a >= 0 value
            const xStart = this.invLerp(note.startTime * (120.0/this.bpm), this.start, this.end)
            const xEnd = this.invLerp(note.endTime * (120.0/this.bpm), this.start, this.end)

            const rect = [this.uvX(xStart), this.uvY(y) + (this.canvas.height / 500.0)*shake*Math.sin(1.5*note.startTime + (Date.now() / 1000)), this.uvX(xEnd - xStart), this.uvY(noteHeight)];
            this.canvasContext.beginPath(); // Start a new path
            this.canvasContext.fillRect(...rect); // Add a rectangle to the current path
        }
    }

    drawBackground(){
        this.canvasContext.fillStyle = this.darkMode? "black" : "white";
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    draw(){
        if(this.playing){
            return this.drawAnimation();
        }
        if((this.end == 0) ||
            (!this.highestNote) ||
            (!this.lowestNote)){
                return;
        }

        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.darkMode = true;
        }else{
            this.darkMode = false;
        }

        this.drawBackground();

        //this.canvasContext.fillStyle = "blue";
        //this.drawNotes(this.ghostNotes)
        
        this.canvasContext.fillStyle = this.darkMode? "white" : "black";
        this.drawNotes(this.notes, 0)
        
        const noteRange = this.highestNote - this.lowestNote;
        const noteHeight = 1.0/(noteRange + 1);
        const horPixelSize = (this.canvas.width / this.canvas.clientWidth);
        const vertPixelSize = (this.canvas.height / this.canvas.clientHeight);

        //Notes overlay
        this.canvasContext.globalCompositeOperation = this.darkMode? "lighten" : "darken";
        
        this.canvasContext.fillStyle = "grey";
        this.drawNotes(this.ghostNotes)

        this.canvasContext.strokeStyle = "grey";
        for(let i = 1; i < noteRange + 1; ++i){
            const y = i * noteHeight;
            
            this.canvasContext.beginPath(); // Start a new path

            const lineStart = [0, this.uvY(y)];
            this.canvasContext.moveTo(...lineStart); // Move the pen to (30, 50)

            const lineEnd = [this.uvX(1.0), this.uvY(y)];
            this.canvasContext.lineTo(...lineEnd); // Draw a line to (150, 100)
            
            this.canvasContext.lineWidth = 1 * vertPixelSize;
            this.canvasContext.stroke(); // Render the path
        }
        
        for(let i = 0; i < this.end * 4; ++i){
            const x = this.invLerp(i / 4.0, this.start, this.end);

            this.canvasContext.beginPath(); // Start a new path

            const lineStart = [this.uvX(x), 0];
            this.canvasContext.moveTo(...lineStart); // Move the pen to (30, 50)

            const lineEnd = [this.uvX(x), this.uvY(1.0)];
            this.canvasContext.lineTo(...lineEnd); // Draw a line to (150, 100)
            
            this.canvasContext.lineWidth = ((i % 4 == 0)? 2 : 1) * horPixelSize * .70;
            this.canvasContext.stroke(); // Render the path
        }
        

        const notes = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
        const highestNotePos = notes.indexOf(this.highestNoteLetter);

        this.canvasContext.fillStyle = "grey";
        for(let i = 0; i < noteRange + 1; ++i){
            const y = (i + 1) * noteHeight; //I think text draws from the bottom up, for some reason
            
            this.canvasContext.beginPath(); // Start a new path

            function wrapIndex(index, length) {
                return ((index % length) + length) % length;
            }

            const letter = notes[wrapIndex(highestNotePos - (i), notes.length)];
            const fontSize = 20;
            const pos = [0, this.uvY(y) - ((this.uvY(noteHeight) - fontSize)/2.0)];
            this.canvasContext.font = parseInt(fontSize*vertPixelSize) + "px Arial";
            this.canvasContext.fillText(letter, ...pos);
        }
        this.canvasContext.globalCompositeOperation = "source-over";
    }

    //Draw gouls
    drawAnimation(shake = 5.0){
        this.drawBackground();

        //This is in game space, from (0,0) in the top left corner, to (1,1) in the bottom right corner.
        const noteRange = this.highestNote - this.lowestNote;
        const noteHeight = 1.0/(noteRange + 1);

        let salt = 0;
        for(let note of this.ghostNotes){
            let y = (this.highestNote - note.noteValue) * noteHeight;  //This should always yield a >= 0 value
            const runUpSpeed = 5.0;
            let xStart = (this.invLerp((note.startTime + this.startDelay - ((Date.now() - this.startTime)/1000.0)) * (120.0/this.bpm), this.start, this.end)) * runUpSpeed;
            const xEnd = this.invLerp(note.endTime + this.startDelay * (120.0/this.bpm), this.start, this.end)

            this.canvasContext.beginPath(); // Start a new path
            let fontSize = 40;
            const vertPixelSize = (this.canvas.height / this.canvas.clientHeight);
            this.canvasContext.font = parseInt(fontSize*vertPixelSize) + "px serif";
            
            function wrapIndex(index, length) {
                return ((index % length) + length) % length;
            }

            //console.log(this.monsters, this.monsters[wrapIndex(note.noteValue, this.monsters.length)], wrapIndex(note.noteValue, this.monsters.length))
            const monster = String.fromCodePoint(parseInt(this.monsters[wrapIndex(note.noteValue + (salt++) * 13, this.monsters.length)], 16));

            function absBounce(x, floor){
                return Math.abs(x - floor) + floor;
            }

            const noteHit = this.notes.some(({
                noteValue,
                noteLetter,
                startTime,
                endTime,
            }) => {
                return noteValue == note.noteValue && (Math.abs(note.startTime - startTime) < .001)
            });
            if(noteHit){
                const swordDistance = 0.0005;
                if(xStart < swordDistance){
                    xStart = absBounce(xStart, swordDistance);
                    y += xStart * xStart;
                }else{
                    fontSize = 80;
                }
            }
            
            const rect = [this.uvX(xStart) + this.uvX(.05), this.uvY(y) + (this.canvas.height / 500.0)*shake*Math.sin(1.5*note.startTime + (Date.now() / 1000)), this.uvX(xEnd - xStart), this.uvY(noteHeight)];
            this.canvasContext.fillText(monster, rect[0], rect[1]);
        }
    }

    play(){
        if(this.notes.length < 1) return;
        this.shuffleMonsters();
        this.startTime = Date.now()
        this.playing = true;
        //We don't need "notesBeingPlayed" because we can `stopAll()` with the audioPlayer, but we do need to stop new notes from being played
        this.notesQueued = []
        //this.sword.swing = false;
        for(let note of this.notes){
            this.notesQueued.push(setTimeout(()=>{
                this.audioPlayer.playNote(note.noteValue)

                this.sword.swing = !(this.sword.swing);
                console.log(this.sword.swing)
                //this.sword.style.setProperty("scale", this.sword.swing? "1.0 -1.0" : "");
                this.sword.style.setProperty("transform", this.sword.swing? "rotate(80deg)" : "rotate(-80deg)");

                const noteRange = this.highestNote - this.lowestNote;
                const noteHeight = 1.0/(noteRange + 1);
                const y = (this.highestNote - note.noteValue) * noteHeight;
                this.sword.style.setProperty("top", (y * 100.0) + "%");
            }, (note.startTime + this.startDelay) * 1000 * (120.0/this.bpm)));
            //This might silence the user's notes, but better that notes get silenced then notes get sustained forever.
            setTimeout(()=>{
                this.audioPlayer.stopNote(note.noteValue)
            }, (note.endTime + this.startDelay) * 1000 * (120.0/this.bpm));
        }
        this.sword.style.setProperty("display", "block");
    }

    stop(){
        this.playing = false;
        this.sword.style.setProperty("display", "none");

        for(let note of this.notesQueued){
            clearTimeout(note);
        }
        this.notesQueued = []

        audioPlayer.stopAll()
    }

    playStop(){
        if(this.playing){
            this.stop();
        }else{
            this.play();
        }
    }
}

// Initialize the application
const audioPlayer = new AudioPlayer();
const midiInput = new MIDIInput(audioPlayer);
const piano = new PianoKeyboard('pianoContainer', audioPlayer);

// Set up event listeners
midiInput.addEventListener('noteon', (e) => {
    const { note, noteName, fullNoteName, velocity } = e.detail;
    //console.info(`Note On: ${fullNoteName} (${note}) velocity: ${velocity}`);
    piano.setNoteActive(note, true);
});

midiInput.addEventListener('noteoff', (e) => {
    const { note, noteName, fullNoteName } = e.detail;
    //console.info(`Note Off: ${fullNoteName} (${note})`);
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

var editor = ace.edit("editor", {fontSize: "20pt"});
editor.setTheme("ace/theme/monokai");
//editor.session.setMode("ace/mode/javascript");

const ally = new AccessibilityMIDIKeyboard();
ally.init(midiInput, ({ note, noteName, fullNoteName, velocity }) =>{
    editor.session.insert(editor.getCursorPosition(), noteName + "\n");
});

const songList = {
    "Heart and Soul": "octave 4\r\nstep 1/8\r\nC\r\nrest\r\nrest\r\nC\r\nrest\r\nrest\r\nstep 1\r\nC\r\n\r\nstep 1/8\r\nC\r\noctave 3\r\nB\r\nrest\r\nA\r\nB\r\noctave 4\r\nrest\r\nC\r\nstep 3/8\r\nD\r\n\r\nE\r\nE\r\nstep 1\r\nE\r\n\r\nstep 1/8\r\nE\r\nD\r\nrest\r\nC\r\nD\r\nrest\r\nE\r\nstep 3/8\r\nF\r\nstep 3/4\r\nG\r\nstep 1\r\nC\r\n\r\nstep 1/8\r\nA\r\nG\r\nrest\r\nF\r\nstep 3/8\r\nE\r\nD\r\nstep 5/8\r\nC\r\n\r\noctave 3\r\nstep 1/8\r\nB\r\nstep 1/4\r\nA\r\nrest\r\n\r\nstep 1/8\r\nrest\r\nG\r\nstep 1/4\r\nF\r\nrest\r\n\r\nstep 1/8\r\nrest\r\nG\r\nstep 3/8\r\nA\r\nB",
    "None": ""
}

function autorun() {
    const canvas = document.getElementById("roll");
    const game = new Game(canvas);
    if(canvas){
        function resizeCanvas(){
            canvas.width = canvas.clientWidth * 2;
            canvas.height = canvas.clientHeight * 2;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas, false);

        const session = editor.getSession();
        function updateNotes(data, data2){
            //There's a lot of cool stuff in here
            //console.log(data)

            //In here, you can look at the breakpoints n stuff
            //console.log(data2)

            const editorValue = editor.getValue();
            //console.log(editorValue)
            const notes = parseMusicScript(editorValue);
            game.setNotes(notes);
        }
        updateNotes();
        session.on('change', updateNotes);

        canvas.addEventListener('click', ()=>{
            game.playStop();
        });
        
        const elm = document.getElementById("playStop");
        if(elm){
            elm.addEventListener('click', ()=>{
                game.playStop();
            });
        }
        
        game.run()
    }
    
    const elm = document.getElementById("songList");
    if(elm){
        for(let song of Object.keys(songList)){
            let tab = document.createElement("td");
            let button = document.createElement("button");
            button.textContent = song;
            button.onclick = () => {
                game.setGhostNotes(parseMusicScript(songList[song]), -1) // moves cursor to the start

                // Change this if you don't want the text to be pasted when you switch songs.
                editor.setValue("");
                //editor.setValue(songList[song]);
            };
            tab.appendChild(button)
            elm.appendChild(tab);
        }
        const firstSongText = Object.values(songList)[0];
        if(firstSongText){
            editor.setValue(firstSongText, -1);
            game.setGhostNotes(parseMusicScript(firstSongText)) // moves cursor to the start
        }
    }
}
if (document.addEventListener)
document.addEventListener('DOMContentLoaded', autorun, false)
else window.onload = autorun