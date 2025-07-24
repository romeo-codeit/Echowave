// ======= Persistent Elements and Selectors =======
const navTabs = document.querySelectorAll(".nav-tab");
const sections = document.querySelectorAll(".section");
const songTitle = document.querySelector(".song-title");
const songArtist = document.querySelector(".song-artist");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
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

let currentAudio = new Audio();
let currentSongIndex = -1;
let songs = [];
let db;


// === Volume Control ===
const volumeSlider = document.getElementById("volumeSlider");

// Function to update slider background with dual colors
function updateVolumeSliderBackground(value) {
  const percent = value * 100;
  volumeSlider.style.background = `linear-gradient(to right, var(--primary-color, #1db954) ${percent}%, #ccc ${percent}%)`;
}

// Load saved volume
const savedVolume = parseFloat(localStorage.getItem("volume") || "1");
volumeSlider.value = savedVolume;
updateVolumeSliderBackground(savedVolume);

if (typeof currentAudio !== "undefined") {
  currentAudio.volume = savedVolume;
}

// Save volume on change + update slider color
volumeSlider.addEventListener("input", () => {
  const vol = parseFloat(volumeSlider.value);
  if (typeof currentAudio !== "undefined") {
    currentAudio.volume = vol;
  }
  localStorage.setItem("volume", vol);
  updateVolumeSliderBackground(vol);
});



// ======= IndexedDB Setup =======
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MusicPlayerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      
      // Create songs store
      if (!db.objectStoreNames.contains('songs')) {
        const songsStore = db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
        songsStore.createIndex('name', 'name', { unique: false });
      }
      
      // Create files store for actual file data
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
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
      
      // Then add the file data with the same ID
      const fileRequest = filesStore.add({
        id: songId,
        data: fileBlob
      });
      
      fileRequest.onsuccess = () => resolve(songId);
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
    
    request.onsuccess = () => resolve(request.result);
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
        resolve(request.result.data);
      } else {
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
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ======= Load Songs =======
async function loadSongs() {
  try {
    const dbSongs = await loadSongsFromDB();
    songs = dbSongs;
    
    // Create blob URLs for each song
    for (let song of songs) {
      try {
        const fileBlob = await getFileFromDB(song.id);
        song.url = URL.createObjectURL(fileBlob);
      } catch (error) {
        console.error(`Failed to load file for song ${song.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to load songs from DB:', error);
    songs = [];
  }
}

// ======= Navigation =======
navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    navTabs.forEach((t) => t.classList.remove("active"));
    sections.forEach((s) => s.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.section).classList.add("active");
  });
});

// ======= Theme Toggle =======
function applyTheme() {
  const isLight = localStorage.getItem("theme") === "light";
  document.body.classList.toggle("light-theme", isLight);
  themeToggle.classList.toggle("active", isLight);
}

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-theme");
  themeToggle.classList.toggle("active", isLight);
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

applyTheme();

// ======= Render Functions =======
function renderSongs() {
  songList.innerHTML = "";
  songs.forEach((song, index) => {
    const div = document.createElement("div");
    div.className = "song-item";
    div.textContent = song.name;
    div.addEventListener("click", () => {
      playSong(index);
      switchToSection("now-playing");
    });
    songList.appendChild(div);
  });
  renderUploadedFiles();
}

function renderUploadedFiles() {
  uploadedFiles.innerHTML = "";
  songs.forEach((song, index) => {
    const row = document.createElement("div");
    row.className = "uploaded-file";
    row.textContent = song.name;
    const del = document.createElement("button");
    del.innerHTML = deleteIcon;
    del.setAttribute('aria-label', 'Delete song');
    del.addEventListener("click", async () => {
      try {
        // Revoke the blob URL to free memory
        if (song.url) {
          URL.revokeObjectURL(song.url);
        }
        
        // Delete from IndexedDB
        await deleteSongFromDB(song.id);
        
        // Remove from songs array
        songs.splice(index, 1);
        
        // If we deleted the currently playing song, stop playback
        if (currentSongIndex === index) {
          currentAudio.pause();
          currentSongIndex = -1;
          songTitle.textContent = "No song selected";
          songArtist.textContent = "";
          localStorage.removeItem("currentSong");
        } else if (currentSongIndex > index) {
          // Adjust current song index if needed
          currentSongIndex--;
          localStorage.setItem("currentSong", currentSongIndex);
        }
        
        renderSongs();
      } catch (error) {
        console.error('Failed to delete song:', error);
      }
    });
    row.appendChild(del);
    uploadedFiles.appendChild(row);
  });
}

// ======= Upload Songs =======
uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  
  for (const file of files) {
    try {
      // Create song metadata
      const songData = {
        name: file.name,
        size: file.size,
        type: file.type,
        uploadDate: new Date().toISOString()
      };
      
      // Save to IndexedDB and get the assigned ID
      const songId = await saveSongToDB(songData, file);
      
      // Create blob URL for immediate use
      const url = URL.createObjectURL(file);
      
      // Add to songs array with the database ID
      songs.push({
        id: songId,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadDate: songData.uploadDate,
        url: url
      });
      
    } catch (error) {
      console.error(`Failed to save ${file.name}:`, error);
    }
  }
  
  renderSongs();
  // Clear the file input
  fileInput.value = '';
});

// ======= Playback Controls =======
function playSong(index) {
  if (index < 0 || index >= songs.length) return;
  currentSongIndex = index;
  currentAudio.src = songs[index].url;
  currentAudio.play().catch(error => {
    console.error('Failed to play song:', error);
  });
  songTitle.textContent = songs[index].name;
  songArtist.textContent = "Unknown Artist";
  localStorage.setItem("currentSong", index);
  updatePlayPauseIcon();
}



function loadCurrentSongFromStorage() {
  const savedIndex = localStorage.getItem("currentSong");
  if (savedIndex !== null && songs.length > 0) {
    const index = parseInt(savedIndex);
    if (index >= 0 && index < songs.length) {
      playSong(index);
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
  if (currentAudio.paused) {
    playPauseBtn.innerHTML = playIcon;
    playPauseBtn.setAttribute('aria-label', 'Play');
  } else {
    playPauseBtn.innerHTML = pauseIcon;
    playPauseBtn.setAttribute('aria-label', 'Pause');
  }
}

playPauseBtn.addEventListener("click", () => {
  if (currentAudio.paused) {
    currentAudio.play().catch(error => {
      console.error('Failed to play:', error);
    });
  } else {
    currentAudio.pause();
  }
});

prevBtn.addEventListener("click", () => {
  if (currentSongIndex > 0) playSong(currentSongIndex - 1);
});

nextBtn.addEventListener("click", () => {
  if (currentSongIndex < songs.length - 1) playSong(currentSongIndex + 1);
});

// Set initial icons for prev/next buttons
prevBtn.innerHTML = prevIcon;
nextBtn.innerHTML = nextIcon;

// ======= Audio Event Listeners =======
currentAudio.addEventListener('play', updatePlayPauseIcon);
currentAudio.addEventListener('pause', updatePlayPauseIcon);
currentAudio.addEventListener('ended', () => {
  updatePlayPauseIcon();
  // Auto-play next song if available
  if (currentSongIndex < songs.length - 1) {
    playSong(currentSongIndex + 1);
  }
});

// ======= Progress Bar =======
currentAudio.addEventListener("timeupdate", () => {
  if (currentAudio.duration) {
    const percent = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressFill.style.width = `${percent}%`;
    currentTimeDisplay.textContent = formatTime(currentAudio.currentTime);
    totalTimeDisplay.textContent = formatTime(currentAudio.duration);
  }
});

progressBar.addEventListener("click", (e) => {
  if (currentAudio.duration) {
    const width = progressBar.clientWidth;
    const clickX = e.offsetX;
    const duration = currentAudio.duration;
    currentAudio.currentTime = (clickX / width) * duration;
  }
});

function formatTime(t) {
  if (isNaN(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ======= Search =======
searchInput.addEventListener("input", () => {
  const value = searchInput.value.toLowerCase();
  searchResults.innerHTML = "";
  if (!value) return;

  songs.forEach((song, index) => {
    if (song.name.toLowerCase().includes(value)) {
      const div = document.createElement("div");
      div.className = "song-item";
      div.textContent = song.name;
      div.addEventListener("click", () => {
        playSong(index);
        switchToSection("now-playing");
      });
      searchResults.appendChild(div);
    }
  });
});

// ======= Helper =======
function switchToSection(id) {
  navTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.section === id);
  });
  sections.forEach((section) => {
    section.classList.toggle("active", section.id === id);
  });
}

// ======= Cleanup on page unload =======
window.addEventListener('beforeunload', () => {
  // Revoke all blob URLs to free memory
  songs.forEach(song => {
    if (song.url) {
      URL.revokeObjectURL(song.url);
    }
  });
});

// ======= Initialize App =======
async function initApp() {
  try {
    await initDB();
    await loadSongs();
    renderSongs();
    loadCurrentSongFromStorage();
    updatePlayPauseIcon(); // Set initial icon state
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

// Start the app
initApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => console.log('Service Worker registered ✔️', reg.scope))
      .catch((err) => console.error('Service Worker registration failed ❌', err));
  });
}
