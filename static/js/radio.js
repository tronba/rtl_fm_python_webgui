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

	// ========== FM Band Scanner (client-side using rtl_fm signal levels) ==========
	let scannerRunning = false;
	let scannerAbort = false;

	function setupScanner() {
		if (elements.scanBtn) {
			elements.scanBtn.addEventListener('click', toggleScanner);
		}
	}

	function toggleScanner() {
		if (scannerRunning) {
			scannerAbort = true;
		} else {
			startScanner();
		}
	}

	async function startScanner() {
		if (scannerRunning) return;
		
		scannerRunning = true;
		scannerAbort = false;
		
		// Update UI
		if (elements.scanBtn) {
			elements.scanBtn.textContent = 'Stopp skanning';
			elements.scanBtn.classList.add('scanning');
		}
		if (elements.scanProgressContainer) {
			elements.scanProgressContainer.style.display = 'block';
		}
		if (elements.scanResults) {
			elements.scanResults.innerHTML = '';
		}
		if (elements.scanStatus) {
			elements.scanStatus.textContent = 'Starter skanning...';
		}
		
		// Pause state polling during scan
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}

		// Save current state and set fixed gain for consistent scanning
		let previousState = null;
		try {
			const stateResponse = await fetch('/state');
			previousState = await stateResponse.json();
			
			if (elements.scanStatus) {
				elements.scanStatus.textContent = 'Setter fast forsterkning (gain 28)...';
			}
			await fetch('/gain/28');
			await sleep(300);
			
		} catch (err) {
			console.error('Failed to set scan gain:', err);
		}

		if (elements.scanStatus) {
			elements.scanStatus.textContent = 'Skanner FM-båndet...';
		}

		try {
			// Scan the FM band
			const scanResults = await performBandScan();
			
			if (scannerAbort) {
				if (elements.scanStatus) {
					elements.scanStatus.textContent = 'Avbrutt';
				}
			} else if (scanResults.stations.length === 0) {
				if (elements.scanStatus) {
					elements.scanStatus.textContent = 'Ingen stasjoner funnet';
				}
				if (elements.scanResults) {
					elements.scanResults.innerHTML = `
						<div class="scan-results-empty">
							Ingen stasjoner funnet.<br>
							<small>Støygulv: ${scanResults.noiseFloor}, Terskel: ${scanResults.threshold}</small><br>
							<small>Prøv å justere antennen.</small>
						</div>`;
				}
			} else {
				displayScanResults(scanResults);
				if (elements.scanStatus) {
					elements.scanStatus.textContent = `Ferdig - ${scanResults.stations.length} stasjoner funnet`;
				}
			}
			
		} catch (err) {
			console.error('Scanner error:', err);
			if (elements.scanStatus) {
				elements.scanStatus.textContent = 'Feil: ' + err.message;
			}
		}

		// Restore previous gain state
		if (previousState) {
			try {
				if (previousState.autogain) {
					await fetch('/gain/auto');
				} else {
					await fetch('/gain/' + previousState.gain);
				}
			} catch (err) {
				console.error('Failed to restore gain:', err);
			}
		}

		// Scan complete - restore UI
		scannerRunning = false;
		
		if (elements.scanBtn) {
			elements.scanBtn.textContent = 'Skann FM-båndet';
			elements.scanBtn.classList.remove('scanning');
		}
		if (elements.scanProgressContainer) {
			elements.scanProgressContainer.style.display = 'none';
		}
		
		// Resume state polling
		pollInterval = setInterval(fetchState, 500);
	}

	async function performBandScan() {
		const startFreq = 87.5;
		const endFreq = 108.0;
		const step = 0.1;
		const settleTime = 150;  // ms to let signal stabilize
		const sampleCount = 5;   // samples to average
		
		const rawResults = [];
		const totalSteps = Math.round((endFreq - startFreq) / step);
		let currentStep = 0;

		// Phase 1: Collect all signal levels
		for (let freq = startFreq; freq <= endFreq && !scannerAbort; freq += step) {
			currentStep++;
			const freqStr = freq.toFixed(1) + 'M';
			
			const progress = Math.round((currentStep / totalSteps) * 80);
			updateScanProgress(progress, freqStr);
			
			try {
				await fetch('/frequency/human/' + freqStr);
				await sleep(settleTime);
				
				// Take multiple samples and average
				let totalSignal = 0;
				for (let i = 0; i < sampleCount; i++) {
					const response = await fetch('/state');
					const data = await response.json();
					totalSignal += parseInt(data.s_level) || 0;
					if (i < sampleCount - 1) await sleep(30);
				}
				const avgSignal = Math.round(totalSignal / sampleCount);
				
				rawResults.push({ freq, signal: avgSignal });
				
			} catch (err) {
				console.error('Scan error at ' + freqStr + ':', err);
			}
		}

		if (scannerAbort || rawResults.length === 0) {
			return { stations: [], noiseFloor: 0, threshold: 0 };
		}

		// Phase 2: Calculate noise floor from bottom 25%
		const sortedBySignal = [...rawResults].sort((a, b) => a.signal - b.signal);
		const bottomQuarter = sortedBySignal.slice(0, Math.ceil(sortedBySignal.length / 4));
		const noiseFloor = Math.round(bottomQuarter.reduce((sum, r) => sum + r.signal, 0) / bottomQuarter.length);
		
		// Threshold: noise floor + 30%
		const threshold = Math.round(noiseFloor * 1.3);
		const minSnr = 5;  // Minimum signal-to-noise ratio to be considered a station
		console.log('Noise floor:', noiseFloor, 'Threshold:', threshold, 'Min SNR:', minSnr);

		// Phase 3: Find peaks (local maxima above threshold AND minimum SNR)
		const peaks = [];
		for (let i = 0; i < rawResults.length; i++) {
			const current = rawResults[i];
			const snr = current.signal - noiseFloor;
			
			// Must be above threshold AND have minimum SNR
			if (current.signal < threshold || snr < minSnr) continue;
			
			// Check if local maximum (higher than immediate neighbors)
			const prev = rawResults[i - 1];
			const next = rawResults[i + 1];
			
			const higherThanPrev = !prev || current.signal >= prev.signal;
			const higherThanNext = !next || current.signal >= next.signal;
			
			if (higherThanPrev && higherThanNext) {
				peaks.push(current);
			}
		}

		// Phase 4: Deduplicate (keep strongest within 0.3 MHz)
		if (elements.scanStatus) {
			elements.scanStatus.textContent = `Fant ${peaks.length} kandidater, dedupliserer...`;
		}
		updateScanProgress(90, 'Dedupliserer...');
		
		peaks.sort((a, b) => b.signal - a.signal);
		const stations = [];
		for (const peak of peaks) {
			const tooClose = stations.find(s => Math.abs(s.freq - peak.freq) < 0.3);
			if (!tooClose) {
				stations.push({
					frequency: peak.freq,
					signal: peak.signal,
					snr: peak.signal - noiseFloor
				});
			}
		}

		updateScanProgress(100, 'Ferdig');
		
		return { stations, noiseFloor, threshold };
	}

	function updateScanProgress(percent, text) {
		if (elements.scanProgressBar) {
			elements.scanProgressBar.style.width = percent + '%';
		}
		if (elements.scanProgressText) {
			elements.scanProgressText.textContent = text + ' (' + percent + '%)';
		}
	}

	function displayScanResults(scanData) {
		if (!elements.scanResults) return;
		
		const { stations, noiseFloor, threshold } = scanData;
		const maxSignal = Math.max(...stations.map(s => s.signal));
		
		let html = '';
		
		// Debug info
		html += `<div class="scan-debug-info">
			Støygulv: ${noiseFloor} | Terskel: ${threshold} | Maks: ${maxSignal}
		</div>`;
		
		// Results
		stations.forEach(station => {
			const barWidth = Math.round((station.snr / (maxSignal - noiseFloor)) * 100);
			html += `
				<div class="scan-result-item" data-freq="${station.frequency.toFixed(1)}M">
					<span class="scan-result-freq">${station.frequency.toFixed(1)} MHz</span>
					<div class="scan-result-bar-container">
						<div class="scan-result-bar" style="width: ${Math.min(barWidth, 100)}%"></div>
					</div>
					<span class="scan-result-signal">+${station.snr}</span>
				</div>`;
		});
		
		elements.scanResults.innerHTML = html;
		
		// Add click handlers
		elements.scanResults.querySelectorAll('.scan-result-item').forEach(item => {
			item.addEventListener('click', () => {
				const freq = item.dataset.freq;
				setFrequencyHuman(freq);
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
