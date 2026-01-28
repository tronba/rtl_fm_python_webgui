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
			// Player elements
			playBtn: document.getElementById('player-btn-play'),
			liveBtn: document.getElementById('player-btn-live'),
			playerStatus: document.getElementById('player-status'),
			// Scanner elements
			scanBtn: document.getElementById('scan-btn'),
			scanStatus: document.getElementById('scan-status'),
			scanProgressContainer: document.getElementById('scan-progress-container'),
			scanProgressBar: document.getElementById('scan-progress-bar'),
			scanProgressText: document.getElementById('scan-progress-text'),
			scanResults: document.getElementById('scan-results')
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

		// Setup scanner
		setupScanner();
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

	// ========== FM Band Scanner (using rtl_power FFT) ==========
	let scannerRunning = false;

	function setupScanner() {
		if (elements.scanBtn) {
			elements.scanBtn.addEventListener('click', startScanner);
		}
	}

	async function startScanner() {
		if (scannerRunning) return;
		
		scannerRunning = true;
		
		// Update UI
		if (elements.scanBtn) {
			elements.scanBtn.textContent = 'Skanner...';
			elements.scanBtn.classList.add('scanning');
			elements.scanBtn.disabled = true;
		}
		if (elements.scanProgressContainer) {
			elements.scanProgressContainer.style.display = 'block';
		}
		if (elements.scanResults) {
			elements.scanResults.innerHTML = '';
		}
		if (elements.scanStatus) {
			elements.scanStatus.textContent = 'Utfører spektrumanalyse med rtl_power...';
		}
		
		// Show indeterminate progress
		if (elements.scanProgressBar) {
			elements.scanProgressBar.style.width = '100%';
			elements.scanProgressBar.style.animation = 'pulse 1.5s infinite';
		}
		if (elements.scanProgressText) {
			elements.scanProgressText.textContent = 'Analyserer 87.5 - 108 MHz...';
		}

		try {
			// Call the server-side rtl_power scan
			const response = await fetch('/scan/fm?start=87.5&end=108&threshold=8');
			const data = await response.json();
			
			if (data.error) {
				throw new Error(data.error);
			}
			
			// Display results
			displayRtlPowerResults(data);
			
			if (elements.scanStatus) {
				const count = data.stations ? data.stations.length : 0;
				elements.scanStatus.textContent = `Ferdig - ${count} stasjoner funnet`;
			}
			
		} catch (err) {
			console.error('Scanner error:', err);
			if (elements.scanStatus) {
				elements.scanStatus.textContent = 'Feil: ' + err.message;
			}
			if (elements.scanResults) {
				elements.scanResults.innerHTML = `
					<div class="scan-results-empty">
						Skanning feilet: ${err.message}<br>
						<small>Sjekk at rtl_power er installert (apt install rtl-sdr)</small>
					</div>`;
			}
		}

		// Scan complete - restore UI
		scannerRunning = false;
		
		if (elements.scanBtn) {
			elements.scanBtn.textContent = 'Skann FM-båndet';
			elements.scanBtn.classList.remove('scanning');
			elements.scanBtn.disabled = false;
		}
		if (elements.scanProgressContainer) {
			elements.scanProgressContainer.style.display = 'none';
		}
		if (elements.scanProgressBar) {
			elements.scanProgressBar.style.animation = '';
		}
	}

	function displayRtlPowerResults(data) {
		if (!elements.scanResults) return;
		
		const stations = data.stations || [];
		
		if (stations.length === 0) {
			elements.scanResults.innerHTML = `
				<div class="scan-results-empty">
					Ingen stasjoner funnet.<br>
					<small>Støygulv: ${data.noise_floor || '?'} dB, Terskel: ${data.threshold || '?'} dB</small><br>
					<small>Prøv å justere antennen eller senke terskelen.</small>
				</div>`;
			return;
		}

		// Find max SNR for scaling
		const maxSnr = Math.max(...stations.map(s => s.snr));
		
		let html = '';
		
		// Debug info
		html += `<div class="scan-debug-info">
			Støygulv: ${data.noise_floor} dB | Terskel: ${data.threshold} dB | 
			FFT bins: ${data.total_bins}
		</div>`;
		
		// Results
		stations.forEach(station => {
			const barWidth = Math.round((station.snr / maxSnr) * 100);
			html += `
				<div class="scan-result-item" data-freq="${station.frequency}">
					<span class="scan-result-freq">${station.frequency.toFixed(1)} MHz</span>
					<div class="scan-result-bar-container">
						<div class="scan-result-bar" style="width: ${barWidth}%"></div>
					</div>
					<span class="scan-result-signal">${station.snr.toFixed(0)} dB</span>
				</div>`;
		});
		
		elements.scanResults.innerHTML = html;
		
		// Add click handlers
		elements.scanResults.querySelectorAll('.scan-result-item').forEach(item => {
			item.addEventListener('click', () => {
				const freq = item.dataset.freq;
				setFrequency(freq + 'M');
			});
		});
	}

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
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
		goLive,
		startScanner,
		stopScanner
	};

})();
