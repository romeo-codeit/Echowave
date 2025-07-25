// ======= Persistent Elements and Selectors =======
const navTabs = document.querySelectorAll(".nav-tab");
const sections = document.querySelectorAll(".section");
const songTitle = document.querySelector(".song-title");
const songArtist = document.querySelector(".song-artist");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const loopBtn = document.getElementById("loopBtn");
const progressBar = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const currentTimeDisplay = document.getElementById("currentTime");
const totalTimeDisplay = document.getElementById("totalTime");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const uploadedFiles = document.getElementById("uploadedFiles");
const songList = document.getElementById("songList");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const themeToggle = document.getElementById("themeToggle");
const volumeSlider = document.getElementById("volumeSlider");
const volumeIcon = document.getElementById("volumeIcon");

let currentAudio = new Audio();
let currentSongIndex = -1;
let songs = [];
let db;
let isShuffleEnabled = false;
let isLoopEnabled = false;
let shuffleOrder = [];

// ======= Debug Functions =======
function debugLog(message, data = null) {
  console.log(`[DEBUG] ${message}`, data || '');
}

function checkElements() {
  const elements = {
    playPauseBtn,
    songTitle,
    songArtist,
    songList,
    uploadBtn,
    fileInput
  };
  
  for (const [name, element] of Object.entries(elements)) {
    if (!element) {
      console.error(`Element ${name} not found!`);
    }
  }
}

// ======= IndexedDB Setup =======
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MusicPlayerDB', 1);
    
    request.onerror = () => {
      debugLog('IndexedDB error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      debugLog('IndexedDB initialized');
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      
      // Create songs store
      if (!db.objectStoreNames.contains('songs')) {
        const songsStore = db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
        songsStore.createIndex('name', 'name', { unique: false });
        debugLog('Created songs store');
      }
      
      // Create files store for actual file data
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
        debugLog('Created files store');
      }
    };
  });
}

// ======= IndexedDB Operations =======
function saveSongToDB(songData, fileBlob) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['songs', 'files'], 'readwrite');
    const songsStore = transaction.objectStore('songs');
    const filesStore = transaction.objectStore('files');
    
    // First, add the song metadata
    const songRequest = songsStore.add(songData);
    
    songRequest.onsuccess = () => {
      const songId = songRequest.result;
      debugLog('Song saved with ID:', songId);
      
      // Then add the file data with the same ID
      const fileRequest = filesStore.add({
        id: songId,
        data: fileBlob
      });
      
      fileRequest.onsuccess = () => {
        debugLog('File data saved for song ID:', songId);
        resolve(songId);
      };
      fileRequest.onerror = () => reject(fileRequest.error);
    };
    
    songRequest.onerror = () => reject(songRequest.error);
  });
}

function loadSongsFromDB() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const request = store.getAll();
    
    request.onsuccess = () => {
      debugLog('Loaded songs from DB:', request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function getFileFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readonly');
    const store = transaction.objectStore('files');
    const request = store.get(id);
    
    request.onsuccess = () => {
      if (request.result) {
        debugLog('File loaded for ID:', id);
        resolve(request.result.data);
      } else {
        debugLog('File not found for ID:', id);
        reject(new Error('File not found'));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteSongFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['songs', 'files'], 'readwrite');
    const songsStore = transaction.objectStore('songs');
    const filesStore = transaction.objectStore('files');
    
    // Delete from both stores
    songsStore.delete(id);
    filesStore.delete(id);
    
    transaction.oncomplete = () => {
      debugLog('Song deleted from DB:', id);
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

// ======= Filename Parsing =======
function parseFilename(filename) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  const match = nameWithoutExt.match(/^(.+?)\s*-\s*(.+)$/);
  
  if (match) {
    return {
      artist: match[1].trim(),
      title: match[2].trim(),
      fallbackTitle: nameWithoutExt,
      hasArtistSeparator: true
    };
  }
  
  return {
    artist: 'Unknown Artist',
    title: nameWithoutExt,
    fallbackTitle: nameWithoutExt,
    hasArtistSeparator: false
  };
}

// ======= Visualizer Setup =======
const canvas = document.getElementById("visualizerCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

let audioCtx, analyser, sourceNode, bufferLength, dataArray;
let isVisualizerInitialized = false;

function initializeVisualizer() {
  if (!canvas || !ctx || isVisualizerInitialized) return;
  
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    
    if (!sourceNode) {
      sourceNode = audioCtx.createMediaElementSource(currentAudio);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
    
    analyser.fftSize = 128;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    isVisualizerInitialized = true;
    drawVisualizer();
    
    debugLog('Visualizer initialized successfully');
  } catch (error) {
    debugLog('Failed to initialize visualizer:', error);
  }
}

function drawVisualizer() {
  if (!canvas || !ctx || !analyser || !isVisualizerInitialized) {
    requestAnimationFrame(drawVisualizer);
    return;
  }
  
  requestAnimationFrame(drawVisualizer);

  analyser.getByteFrequencyData(dataArray);

  if (canvas.width === 0 || canvas.height === 0) {
    canvas.width = canvas.offsetWidth || 400;
    canvas.height = canvas.offsetHeight || 100;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const barWidth = canvas.width / bufferLength;
  const centerY = canvas.height / 2;
  
  dataArray.forEach((value, i) => {
    const center = bufferLength / 2;
    const normalized = (i - center) / center;
    const heightMultiplier = 1 - Math.pow(normalized, 2);

    const barHeight = (value / 255) * canvas.height * 0.5 * heightMultiplier;
    const x = i * barWidth;

    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary-color')?.trim() || '#1db954';
    ctx.fillStyle = primaryColor;

    ctx.fillRect(x, centerY - barHeight, barWidth - 2, barHeight);
    ctx.fillRect(x, centerY, barWidth - 2, barHeight);
  });
}

// ======= Shuffle and Loop Functions =======
function generateShuffleOrder() {
  shuffleOrder = Array.from({length: songs.length}, (_, i) => i);
  for (let i = shuffleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
  }
  debugLog('Generated shuffle order:', shuffleOrder);
}

function toggleShuffle() {
  isShuffleEnabled = !isShuffleEnabled;
  if (shuffleBtn) {
    shuffleBtn.classList.toggle('active', isShuffleEnabled);
    
    if (isShuffleEnabled) {
      shuffleBtn.style.color = '#1db954';
      generateShuffleOrder();
      if (currentSongIndex !== -1) {
        const currentInShuffle = shuffleOrder.indexOf(currentSongIndex);
        if (currentInShuffle !== -1) {
          shuffleOrder.splice(currentInShuffle, 1);
          shuffleOrder.unshift(currentSongIndex);
        }
      }
    } else {
      shuffleBtn.style.color = '';
    }
  }
  
  localStorage.setItem('shuffleEnabled', isShuffleEnabled);
  debugLog('Shuffle toggled:', isShuffleEnabled);
}

function toggleLoop() {
  isLoopEnabled = !isLoopEnabled;
  if (loopBtn) {
    loopBtn.classList.toggle('active', isLoopEnabled);
    
    if (isLoopEnabled) {
      loopBtn.style.color = '#1db954';
    } else {
      loopBtn.style.color = '';
    }
  }
  
  localStorage.setItem('loopEnabled', isLoopEnabled);
  debugLog('Loop toggled:', isLoopEnabled);
}

function getNextSongIndex() {
  if (songs.length === 0) return -1;
  
  if (isShuffleEnabled) {
    const currentShuffleIndex = shuffleOrder.indexOf(currentSongIndex);
    if (currentShuffleIndex === -1 || currentShuffleIndex === shuffleOrder.length - 1) {
      return shuffleOrder[0] || 0;
    }
    return shuffleOrder[currentShuffleIndex + 1];
  } else {
    return currentSongIndex >= songs.length - 1 ? 0 : currentSongIndex + 1;
  }
}

function getPrevSongIndex() {
  if (songs.length === 0) return -1;
  
  if (isShuffleEnabled) {
    const currentShuffleIndex = shuffleOrder.indexOf(currentSongIndex);
    if (currentShuffleIndex === -1 || currentShuffleIndex === 0) {
      return shuffleOrder[shuffleOrder.length - 1] || 0;
    }
    return shuffleOrder[currentShuffleIndex - 1];
  } else {
    return currentSongIndex <= 0 ? songs.length - 1 : currentSongIndex - 1;
  }
}

// ======= Load Songs =======
async function loadSongs() {
  try {
    const dbSongs = await loadSongsFromDB();
    songs = dbSongs || [];
    debugLog('Songs loaded:', songs.length);
    
    // Create blob URLs for each song
    for (let song of songs) {
      try {
        const fileBlob = await getFileFromDB(song.id);
        song.url = URL.createObjectURL(fileBlob);
        debugLog('Created blob URL for song:', song.name);
      } catch (error) {
        debugLog(`Failed to load file for song ${song.name}:`, error);
      }
    }
  } catch (error) {
    debugLog('Failed to load songs from DB:', error);
    songs = [];
  }
}

// ======= Navigation =======
if (navTabs && navTabs.length > 0) {
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => t.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      tab.classList.add("active");
      const section = document.getElementById(tab.dataset.section);
      if (section) {
        section.classList.add("active");
      }
    });
  });
}

// ======= Theme Toggle =======
function applyTheme() {
  const isLight = localStorage.getItem("theme") === "light";
  document.body.classList.toggle("light-theme", isLight);
  if (themeToggle) {
    themeToggle.classList.toggle("active", isLight);
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-theme");
    themeToggle.classList.toggle("active", isLight);
    localStorage.setItem("theme", isLight ? "light" : "dark");
  });
}

applyTheme();

// ======= Render Functions =======
function renderSongs() {
  debugLog('Rendering songs, count:', songs.length);
  
  if (songList) {
    songList.innerHTML = "";
    songs.forEach((song, index) => {
      const div = document.createElement("div");
      div.className = "song-item";
      div.textContent = song.name;
      div.style.cursor = "pointer";
      div.style.padding = "10px";
      div.style.borderBottom = "1px solid #333";
      
      div.addEventListener("click", (e) => {
        debugLog('Song clicked:', song.name, 'Index:', index);
        e.preventDefault();
        e.stopPropagation();
        playSong(index);
        switchToSection("now-playing");
      });
      
      songList.appendChild(div);
    });
  }
  
  renderUploadedFiles();
  
  if (isShuffleEnabled && songs.length > 0) {
    generateShuffleOrder();
  }
}

function renderUploadedFiles() {
  if (!uploadedFiles) return;
  
  uploadedFiles.innerHTML = "";
  songs.forEach((song, index) => {
    const row = document.createElement("div");
    row.className = "uploaded-file";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "10px";
    row.style.borderBottom = "1px solid #333";
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = song.name;
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", () => {
      debugLog('File name clicked:', song.name);
      playSong(index);
      switchToSection("now-playing");
    });
    
    const del = document.createElement("button");
    del.innerHTML = deleteIcon;
    del.setAttribute('aria-label', 'Delete song');
    del.style.background = "none";
    del.style.border = "none";
    del.style.color = "#ff4444";
    del.style.cursor = "pointer";
    del.style.padding = "5px";
    
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        if (song.url) {
          URL.revokeObjectURL(song.url);
        }
        
        await deleteSongFromDB(song.id);
        songs.splice(index, 1);
        
        if (currentSongIndex === index) {
          currentAudio.pause();
          currentSongIndex = -1;
          if (songTitle) songTitle.textContent = "No song selected";
          if (songArtist) songArtist.textContent = "";
          localStorage.removeItem("currentSong");
        } else if (currentSongIndex > index) {
          currentSongIndex--;
          localStorage.setItem("currentSong", currentSongIndex);
        }
        
        renderSongs();
      } catch (error) {
        debugLog('Failed to delete song:', error);
      }
    });
    
    row.appendChild(nameSpan);
    row.appendChild(del);
    uploadedFiles.appendChild(row);
  });
}

// ======= Upload Songs =======
if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => {
    debugLog('Upload button clicked');
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    debugLog('Files selected:', files.length);
    
    for (const file of files) {
      try {
        debugLog('Processing file:', file.name);
        
        // Validate file type
        if (!file.type.startsWith('audio/')) {
          debugLog('Skipping non-audio file:', file.name);
          continue;
        }
        
        const songData = {
          name: file.name,
          size: file.size,
          type: file.type,
          uploadDate: new Date().toISOString()
        };
        
        const songId = await saveSongToDB(songData, file);
        const url = URL.createObjectURL(file);
        
        songs.push({
          id: songId,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadDate: songData.uploadDate,
          url: url
        });
        
        debugLog('Song added:', file.name);
        
      } catch (error) {
        debugLog(`Failed to save ${file.name}:`, error);
      }
    }
    
    renderSongs();
    fileInput.value = '';
  });
}

// ======= Playback Controls =======
function playSong(index) {
  debugLog('playSong called with index:', index);

  if (index < 0 || index >= songs.length) {
    debugLog('Invalid song index');
    return;
  }

  const song = songs[index];
  if (!song || !song.url) {
    debugLog('Song or URL not found');
    return;
  }

  debugLog('Playing song:', song.name);

  currentSongIndex = index;

  // Stop current audio
  currentAudio.pause();
  currentAudio.currentTime = 0;

  // Set new source
  currentAudio.src = song.url;
  currentAudio.load();

  // Only create sourceNode once per audio element
  if (audioCtx && !sourceNode) {
    try {
      sourceNode = audioCtx.createMediaElementSource(currentAudio);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (error) {
      debugLog('Error creating audio source:', error);
    }
  }

  // Play the audio
  currentAudio.play()
    .then(() => {
      debugLog('Audio started playing');
    })
    .catch(error => {
      debugLog('Failed to play song:', error);
      // Try to resume audio context if suspended
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          return currentAudio.play();
        }).catch(err => {
          debugLog('Failed to resume and play:', err);
        });
      }
    });

  // Update UI
  const { artist, title } = parseFilename(song.name);
  if (songTitle) songTitle.textContent = title;
  if (songArtist) songArtist.textContent = artist;

  localStorage.setItem("currentSong", index);
  updatePlayPauseIcon();
}

function loadCurrentSongFromStorage() {
  const savedIndex = localStorage.getItem("currentSong");
  debugLog('Loading saved song index:', savedIndex);
  
  if (savedIndex !== null && songs.length > 0) {
    const index = parseInt(savedIndex);
    if (index >= 0 && index < songs.length) {
      currentSongIndex = index;
      const song = songs[index];
      
      if (song && song.url) {
        currentAudio.src = song.url;
        
        const { artist, title } = parseFilename(song.name);
        if (songTitle) songTitle.textContent = title;
        if (songArtist) songArtist.textContent = artist;
        
        debugLog('Loaded saved song:', song.name);
      }
    }
  }
}

// ======= SVG Icons =======
const playIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 5V19L19 12L8 5Z" fill="currentColor"/>
  </svg>
`;

const pauseIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4H10V20H6V4ZM14 4H18V20H14V4Z" fill="currentColor"/>
  </svg>
`;

const prevIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6H8V18H6V6ZM9.5 12L18 6V18L9.5 12Z" fill="currentColor"/>
  </svg>
`;

const nextIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 18H18V6H16V18ZM6 18L14.5 12L6 6V18Z" fill="currentColor"/>
  </svg>
`;

const shuffleIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="16,3 21,3 21,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="21,16 21,21 16,21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="4" y1="4" x2="9" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const loopIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 1L21 5L17 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 11V9C3 7.89543 3.89543 7 5 7H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 23L3 19L7 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 13V15C21 16.1046 20.1046 17 19 17H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const deleteIcon = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

// ======= Update Play/Pause Icon =======
function updatePlayPauseIcon() {
  if (!playPauseBtn) return;
  
  if (currentAudio.paused) {
    playPauseBtn.innerHTML = playIcon;
    playPauseBtn.setAttribute('aria-label', 'Play');
  } else {
    playPauseBtn.innerHTML = pauseIcon;
    playPauseBtn.setAttribute('aria-label', 'Pause');
  }
}

// ======= Volume Control Functions =======
function setupVolumeControl() {
  if (!volumeSlider) return;
  
  // Load saved volume or default to 1
  const savedVolume = localStorage.getItem('volume');
  const volume = savedVolume !== null ? parseFloat(savedVolume) : 1;
  
  // Set initial volume
  currentAudio.volume = volume;
  volumeSlider.value = volume;
  
  // Update volume icon based on level
  updateVolumeIcon(volume);
  
  debugLog('Volume control initialized, volume:', volume);
}

function updateVolumeIcon(volume) {
  if (!volumeIcon) return;
  
  if (volume === 0) {
    // Muted icon
    volumeIcon.innerHTML = `
      <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10H1.5A.5.5 0 0 1 1 9.5v-3a.5.5 0 0 1 .5-.5h2.325l2.363-2.39a.5.5 0 0 1 .529-.06zM9.5 6a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V7.414L8.354 8.06a.5.5 0 0 1-.708-.708L9.293 6H9.5z"/>
    `;
  } else if (volume < 0.5) {
    // Low volume icon
    volumeIcon.innerHTML = `
      <path d="M9.717 3.55A.5.5 0 0 1 10 4v8a.5.5 0 0 1-.812.39L6.825 10H4.5A.5.5 0 0 1 4 9.5v-3a.5.5 0 0 1 .5-.5h2.325l2.363-2.39a.5.5 0 0 1 .529-.06z"/>
      <path d="M11.025 8a.5.5 0 0 1 .9 0 2.5 2.5 0 0 1 0 2.236.5.5 0 1 1-.9-.472 1.5 1.5 0 0 0 0-1.764z"/>
    `;
  } else {
    // High volume icon
    volumeIcon.innerHTML = `
      <path d="M9.717 3.55A.5.5 0 0 1 10 4v8a.5.5 0 0 1-.812.39L6.825 10H4.5A.5.5 0 0 1 4 9.5v-3a.5.5 0 0 1 .5-.5h2.325l2.363-2.39a.5.5 0 0 1 .529-.06z"/>
      <path d="M11.025 8a.5.5 0 0 1 .9 0 6 6 0 0 1 0 5.373.5.5 0 1 1-.9-.746 5 5 0 0 0 0-3.881z"/>
      <path d="M12.16 6.867a.5.5 0 0 1 .708.708 2.5 2.5 0 0 1 0 3.536.5.5 0 1 1-.708-.708 1.5 1.5 0 0 0 0-2.122z"/>
    `;
  }
}


// ======= Event Listeners =======
if (playPauseBtn) {
  playPauseBtn.addEventListener("click", () => {
    debugLog('Play/pause button clicked, audio paused:', currentAudio.paused);
    
    if (currentAudio.paused) {
      // If no song is selected, play the first song
      if (currentSongIndex === -1 && songs.length > 0) {
        debugLog('No song selected, playing first song');
        playSong(0);
      } else if (currentAudio.src) {
        // Resume current song
        currentAudio.play()
          .then(() => {
            debugLog('Audio resumed');
          })
          .catch(error => {
            debugLog('Failed to resume audio:', error);
            // Try to resume audio context if suspended
            if (audioCtx && audioCtx.state === 'suspended') {
              audioCtx.resume().then(() => {
                return currentAudio.play();
              }).catch(err => {
                debugLog('Failed to resume context and play:', err);
              });
            }
          });
      }
    } else {
      currentAudio.pause();
      debugLog('Audio paused');
    }
  });
}

if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    const prevIndex = getPrevSongIndex();
    debugLog('Previous button clicked, next index:', prevIndex);
    if (prevIndex !== -1) playSong(prevIndex);
  });
}

if (nextBtn) {
  nextBtn.addEventListener("click", () => {
    const nextIndex = getNextSongIndex();
    debugLog('Next button clicked, next index:', nextIndex);
    if (nextIndex !== -1) playSong(nextIndex);
  });
}

if (shuffleBtn) {
  shuffleBtn.addEventListener("click", toggleShuffle);
}

if (loopBtn) {
  loopBtn.addEventListener("click", toggleLoop);
}

if (volumeSlider) {
  volumeSlider.addEventListener("input", (e) => {
    const volume = parseFloat(e.target.value);
    currentAudio.volume = volume;
    localStorage.setItem('volume', volume);
    updateVolumeIcon(volume);
    debugLog('Volume changed to:', volume);
  });
}

// Set initial icons for all buttons
if (prevBtn) prevBtn.innerHTML = prevIcon;
if (nextBtn) nextBtn.innerHTML = nextIcon;
if (shuffleBtn) shuffleBtn.innerHTML = shuffleIcon;
if (loopBtn) loopBtn.innerHTML = loopIcon;

// ======= Audio Event Listeners =======
currentAudio.addEventListener('play', () => {
  debugLog('Audio play event fired');
  updatePlayPauseIcon();
  
  // Initialize visualizer on first play
  if (!isVisualizerInitialized && audioCtx) {
    initializeVisualizer();
  }
});

currentAudio.addEventListener('pause', () => {
  debugLog('Audio pause event fired');
  updatePlayPauseIcon();
});

currentAudio.addEventListener('ended', () => {
  debugLog('Audio ended event fired');
  updatePlayPauseIcon();
  
  if (isLoopEnabled) {
    debugLog('Looping current song');
    currentAudio.currentTime = 0;
    currentAudio.play();
  } else {
    debugLog('Auto-playing next song');
    const nextIndex = getNextSongIndex();
    if (nextIndex !== -1) {
      playSong(nextIndex);
    }
  }
});

currentAudio.addEventListener('error', (e) => {
  debugLog('Audio error event:', e.error || e);
});

currentAudio.addEventListener('loadstart', () => {
  debugLog('Audio loading started');
});

currentAudio.addEventListener('canplay', () => {
  debugLog('Audio can play');
});

// ======= Progress Bar =======
currentAudio.addEventListener("timeupdate", () => {
  if (currentAudio.duration && progressFill && currentTimeDisplay && totalTimeDisplay) {
    const percent = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressFill.style.width = `${percent}%`;
    currentTimeDisplay.textContent = formatTime(currentAudio.currentTime);
    totalTimeDisplay.textContent = formatTime(currentAudio.duration);
  }
});

if (progressBar) {
  progressBar.addEventListener("click", (e) => {
    if (currentAudio.duration) {
      const width = progressBar.clientWidth;
      const clickX = e.offsetX;
      const duration = currentAudio.duration;
      const newTime = (clickX / width) * duration;
      currentAudio.currentTime = newTime;
      debugLog('Progress bar clicked, seeking to:', newTime);
    }
  });
}

function formatTime(t) {
  if (isNaN(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ======= Search =======
if (searchInput && searchResults) {
  searchInput.addEventListener("input", () => {
    const value = searchInput.value.toLowerCase();
    searchResults.innerHTML = "";
    if (!value) return;

    songs.forEach((song, index) => {
      if (song.name.toLowerCase().includes(value)) {
        const div = document.createElement("div");
        div.className = "song-item";
        div.textContent = song.name;
        div.style.cursor = "pointer";
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid #333";
        
        div.addEventListener("click", () => {
          debugLog('Search result clicked:', song.name);
          playSong(index);
          switchToSection("now-playing");
        });
        searchResults.appendChild(div);
      }
    });
  });
}

// ======= Helper Functions =======
function switchToSection(id) {
  debugLog('Switching to section:', id);
  
  if (navTabs && navTabs.length > 0) {
    navTabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.section === id);
    });
  }
  
  if (sections && sections.length > 0) {
    sections.forEach((section) => {
      section.classList.toggle("active", section.id === id);
    });
  }
}

// ======= Cleanup on page unload =======
window.addEventListener('beforeunload', () => {
  debugLog('Page unloading, cleaning up blob URLs');
  songs.forEach(song => {
    if (song.url) {
      URL.revokeObjectURL(song.url);
    }
  });
});

// ======= User Interaction for Audio Context =======
function initAudioContextOnInteraction() {
  const initAudio = () => {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        debugLog('Audio context created on user interaction');
      } catch (error) {
        debugLog('Failed to create audio context:', error);
      }
    }
    
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        debugLog('Audio context resumed');
      });
    }
    
    // Remove event listeners after first interaction
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
    document.removeEventListener('touchstart', initAudio);
  };
  
  // Add listeners for user interaction
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);
  document.addEventListener('touchstart', initAudio);
}

// ======= Initialize App =======
async function initApp() {
  debugLog('Initializing app...');
  
  // Check if required elements exist
  checkElements();
  
  try {
    await initDB();
    debugLog('Database initialized');
    
    await loadSongs();
    debugLog('Songs loaded from database');
    
    renderSongs();
    debugLog('Songs rendered');
    
    loadCurrentSongFromStorage();
    debugLog('Current song loaded from storage');

    setupVolumeControl();
    debugLog('Volume control initialized');

    updatePlayPauseIcon();
    
    // Initialize audio context on user interaction
    initAudioContextOnInteraction();

    // Load saved shuffle and loop states
    const savedShuffle = localStorage.getItem('shuffleEnabled') === 'true';
    const savedLoop = localStorage.getItem('loopEnabled') === 'true';

    if (savedShuffle) {
      isShuffleEnabled = true;
      if (shuffleBtn) {
        shuffleBtn.classList.add('active');
        shuffleBtn.style.color = '#1db954';
      }
      generateShuffleOrder();
      debugLog('Shuffle state restored');
    }

    if (savedLoop) {
      isLoopEnabled = true;
      if (loopBtn) {
        loopBtn.classList.add('active');
        loopBtn.style.color = '#1db954';
      }
      debugLog('Loop state restored');
    }
    
    debugLog('App initialization complete');
    
    // Log some helpful info
    console.log('=== MUSIC PLAYER DEBUG INFO ===');
    console.log('Songs loaded:', songs.length);
    console.log('Current song index:', currentSongIndex);
    console.log('Audio element:', currentAudio);
    console.log('Play button element:', playPauseBtn);
    console.log('Song list element:', songList);
    console.log('Volume slider element:', volumeSlider);
    console.log('===============================');
    
  } catch (error) {
    debugLog('Failed to initialize app:', error);
    console.error('App initialization failed:', error);
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
