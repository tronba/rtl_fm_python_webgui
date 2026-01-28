/**
 * RTL FM Python Web GUI - Vanilla JavaScript
 * Zero dependencies, fully offline capable
 */

(function() {
	'use strict';

	// State
	let state = {
		freq_i: 0,
		freq_s: '---',
		s_level: 0,
		mod: 'w',
		gain: 0,
		autogain: true,
		squelch: 0
	};
	let gains = [];
	let pollInterval = null;

	// DOM Elements (cached on init)
	let elements = {};

	// Initialize when DOM is ready
	document.addEventListener('DOMContentLoaded', init);

	function init() {
		// Cache DOM elements
		elements = {
			freqDisplay: document.getElementById('freq-display'),
			freqInput: document.getElementById('freq-input'),
			signalBar: document.getElementById('signal-bar'),
			signalValue: document.getElementById('signal-value'),
			modSelect: document.getElementById('mod-select'),
			gainSelect: document.getElementById('gain-select'),
			autogainCheck: document.getElementById('autogain-check'),
			audioPlayer: document.getElementById('audio-player'),
			squelchSlider: document.getElementById('squelch-slider'),
			squelchValue: document.getElementById('squelch-value'),
			// New player elements
			playBtn: document.getElementById('player-btn-play'),
			liveBtn: document.getElementById('player-btn-live'),
			playerStatus: document.getElementById('player-status')
		};

		// Setup event listeners
		setupEventListeners();

		// Fetch initial data
		fetchGainList();
		fetchState();

		// Start polling
		pollInterval = setInterval(fetchState, 500);

		// Setup custom audio player
		setupAudioPlayer();
	}

	function setupAudioPlayer() {
		if (!elements.audioPlayer) return;

		// Play/Stop button
		if (elements.playBtn) {
			elements.playBtn.addEventListener('click', togglePlayback);
		}

		// Live button - reload stream
		if (elements.liveBtn) {
			elements.liveBtn.addEventListener('click', goLive);
		}

		// Audio events
		elements.audioPlayer.addEventListener('play', () => updatePlayerUI(true));
		elements.audioPlayer.addEventListener('pause', () => updatePlayerUI(false));
		elements.audioPlayer.addEventListener('ended', () => updatePlayerUI(false));
		elements.audioPlayer.addEventListener('error', (e) => {
			updatePlayerUI(false);
			showPlayerError();
		});
		elements.audioPlayer.addEventListener('waiting', () => showPlayerStatus('Laster...'));
		elements.audioPlayer.addEventListener('playing', () => showPlayerStatus('Spiller direkte'));
	}

	function togglePlayback() {
		if (!elements.audioPlayer) return;
		
		if (elements.audioPlayer.paused) {
			// Start fresh stream
			goLive();
		} else {
			elements.audioPlayer.pause();
		}
	}

	function goLive() {
		if (!elements.audioPlayer) return;
		
		// Reload the stream source to get live audio
		const source = elements.audioPlayer.querySelector('source');
		if (source) {
			// Add timestamp to bust cache and force reconnect
			const baseUrl = '/stream.mp3';
			source.src = baseUrl + '?t=' + Date.now();
			elements.audioPlayer.load();
		}
		
		elements.audioPlayer.play().catch(err => {
			console.error('Playback failed:', err);
			showPlayerError();
		});
	}

	function updatePlayerUI(playing) {
		if (elements.playBtn) {
			if (playing) {
				elements.playBtn.innerHTML = '⏹️ Stopp';
				elements.playBtn.classList.add('playing');
			} else {
				elements.playBtn.innerHTML = '▶️ Start lytting';
				elements.playBtn.classList.remove('playing');
			}
		}
		
		if (elements.playerStatus) {
			elements.playerStatus.textContent = playing ? 'Spiller direkte' : 'Stoppet';
			elements.playerStatus.classList.toggle('playing', playing);
			elements.playerStatus.classList.remove('error');
		}
	}

	function showPlayerStatus(msg) {
		if (elements.playerStatus) {
			elements.playerStatus.textContent = msg;
		}
	}

	function showPlayerError() {
		if (elements.playerStatus) {
			elements.playerStatus.textContent = 'Feil - trykk Direkte';
			elements.playerStatus.classList.add('error');
		}
	}

	function setupEventListeners() {
		// Frequency adjustment buttons
		document.querySelectorAll('[data-tune]').forEach(btn => {
			btn.addEventListener('click', () => {
				const delta = parseFloat(btn.dataset.tune);
				adjustFrequency(delta);
			});
		});

		// Set frequency button
		const setFreqBtn = document.getElementById('set-freq-btn');
		if (setFreqBtn) {
			setFreqBtn.addEventListener('click', setFrequencyFromInput);
		}

		// Frequency input - enter key
		if (elements.freqInput) {
			elements.freqInput.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					setFrequencyFromInput();
				}
			});
		}

		// Modulation select
		if (elements.modSelect) {
			elements.modSelect.addEventListener('change', () => {
				setDemod(elements.modSelect.value);
			});
		}

		// Gain select
		if (elements.gainSelect) {
			elements.gainSelect.addEventListener('change', () => {
				const value = elements.gainSelect.value;
				if (value === 'auto') {
					setAutoGain();
				} else {
					setGain(parseInt(value));
				}
			});
		}

		// Autogain checkbox
		if (elements.autogainCheck) {
			elements.autogainCheck.addEventListener('change', () => {
				if (elements.autogainCheck.checked) {
					setAutoGain();
				} else if (gains.length > 0) {
					setGain(gains[0]);
				}
			});
		}

		// Preset buttons
		document.querySelectorAll('[data-preset]').forEach(btn => {
			btn.addEventListener('click', () => {
				const freq = btn.dataset.preset;
				setFrequencyHuman(freq);
			});
		});

		// Squelch slider
		if (elements.squelchSlider) {
			elements.squelchSlider.addEventListener('input', () => {
				// Update display immediately for responsiveness
				if (elements.squelchValue) {
					elements.squelchValue.textContent = elements.squelchSlider.value;
				}
			});
			elements.squelchSlider.addEventListener('change', () => {
				setSquelch(parseInt(elements.squelchSlider.value));
			});
		}
	}

	// API Functions
	function fetchState() {
		fetch('/state')
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to fetch state:', err));
	}

	function fetchGainList() {
		fetch('/gain/list')
			.then(res => res.json())
			.then(data => {
				gains = data.gains || [];
				updateGainSelect();
			})
			.catch(err => console.error('Failed to fetch gains:', err));
	}

	function setFrequency(hz) {
		fetch('/frequency/' + hz)
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to set frequency:', err));
	}

	function setFrequencyHuman(freqStr) {
		fetch('/frequency/human/' + encodeURIComponent(freqStr))
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to set frequency:', err));
	}

	function setDemod(mod) {
		fetch('/demod/' + mod)
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to set demod:', err));
	}

	function setGain(gain) {
		fetch('/gain/' + gain)
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to set gain:', err));
	}

	function setAutoGain() {
		fetch('/gain/auto')
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to set auto gain:', err));
	}

	function setSquelch(level) {
		fetch('/squelch/' + level)
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('Failed to set squelch:', err));
	}

	// UI Update Functions
	function updateUI() {
		// Update frequency display
		if (elements.freqDisplay) {
			elements.freqDisplay.textContent = state.freq_s || '---';
		}

		// Update document title
		document.title = state.freq_s || 'Radio';

		// Update signal meter
		if (elements.signalBar && state.s_level !== undefined) {
			// s_level comes as a string like "123" representing signal strength
			const level = parseInt(state.s_level) || 0;
			const percent = Math.min(100, Math.max(0, level / 3)); // Scale for display
			elements.signalBar.style.width = percent + '%';
		}
		if (elements.signalValue) {
			elements.signalValue.textContent = state.s_level || '0';
		}

		// Update modulation select
		if (elements.modSelect && state.mod) {
			elements.modSelect.value = state.mod;
		}

		// Update gain select
		if (elements.gainSelect) {
			if (state.autogain) {
				elements.gainSelect.value = 'auto';
			} else {
				elements.gainSelect.value = state.gain;
			}
		}

		// Update autogain checkbox
		if (elements.autogainCheck) {
			elements.autogainCheck.checked = state.autogain;
		}

		// Update squelch slider (only if not being dragged)
		if (elements.squelchSlider && document.activeElement !== elements.squelchSlider) {
			elements.squelchSlider.value = state.squelch || 0;
		}
		if (elements.squelchValue) {
			elements.squelchValue.textContent = state.squelch || 0;
		}

		// Update preset buttons active state
		updatePresetButtons();
	}

	function updateGainSelect() {
		if (!elements.gainSelect) return;

		// Clear existing options (except auto)
		elements.gainSelect.innerHTML = '<option value="auto">Auto</option>';

		// Add gain options
		gains.forEach(g => {
			const option = document.createElement('option');
			option.value = g;
			option.textContent = (g / 10).toFixed(1) + ' dB';
			elements.gainSelect.appendChild(option);
		});
	}

	function updatePresetButtons() {
		document.querySelectorAll('[data-preset]').forEach(btn => {
			const presetFreq = btn.dataset.preset.toLowerCase();
			const currentFreq = (state.freq_s || '').toLowerCase();
			
			// Simple matching - could be improved
			if (currentFreq.includes(presetFreq.replace('m', '')) || 
				presetFreq.includes(currentFreq.replace(' mhz', '').replace('mhz', ''))) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		});
	}

	// Helper Functions
	function adjustFrequency(deltaMHz) {
		const deltaHz = deltaMHz * 1000000;
		const newFreq = state.freq_i + deltaHz;
		setFrequency(Math.round(newFreq));
	}

	function setFrequencyFromInput() {
		if (!elements.freqInput) return;
		const value = elements.freqInput.value.trim();
		if (value) {
			setFrequencyHuman(value);
			elements.freqInput.value = '';
		}
	}

	// Expose functions globally for inline onclick handlers if needed
	window.radioAPI = {
		setFrequency,
		setFrequencyHuman,
		adjustFrequency,
		setDemod,
		setGain,
		setAutoGain,
		setSquelch,
		togglePlayback,
		goLive
	};

})();
