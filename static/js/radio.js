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

	// ========== FM Band Scanner ==========
	let scannerRunning = false;
	let scannerAbort = false;

	function setupScanner() {
		if (elements.scanBtn) {
			elements.scanBtn.addEventListener('click', toggleScanner);
		}
	}

	function toggleScanner() {
		if (scannerRunning) {
			stopScanner();
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
		
		// Pause state polling during scan
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}

		try {
			// === PHASE 1: Calibrate noise floor ===
			updateScanProgress(0, 'Kalibrerer...');
			if (elements.scanStatus) {
				elements.scanStatus.textContent = 'Måler bakgrunnsstøy...';
			}
			
			const noiseFloor = await calibrateNoiseFloor();
			if (scannerAbort) throw new Error('Aborted');
			
			// Threshold = noise floor + 50% margin
			const threshold = Math.round(noiseFloor * 1.5);
			console.log('Noise floor:', noiseFloor, 'Threshold:', threshold);

			// === PHASE 2: Coarse scan ===
			if (elements.scanStatus) {
				elements.scanStatus.textContent = 'Grovskanning...';
			}
			
			const coarseResults = await coarseScan(threshold);
			if (scannerAbort) throw new Error('Aborted');
			
			// === PHASE 3: Fine-tune top candidates ===
			if (elements.scanStatus) {
				elements.scanStatus.textContent = 'Finjusterer...';
			}
			
			// Take top 15 for fine-tuning (to get best 10 after)
			const topCandidates = coarseResults.slice(0, 15);
			const fineTunedResults = await fineTuneCandidates(topCandidates);
			if (scannerAbort) throw new Error('Aborted');
			
			// Sort by signal strength
			fineTunedResults.sort((a, b) => b.signal - a.signal);
			
			// Display results
			displayScanResults(fineTunedResults, coarseResults.length);
			
			if (elements.scanStatus) {
				elements.scanStatus.textContent = `Ferdig - ${fineTunedResults.length} sterke av ${coarseResults.length} totalt`;
			}
			
		} catch (err) {
			if (err.message !== 'Aborted') {
				console.error('Scanner error:', err);
			}
			if (elements.scanStatus) {
				elements.scanStatus.textContent = scannerAbort ? 'Avbrutt' : 'Feil under skanning';
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

	async function calibrateNoiseFloor() {
		// Sample frequencies unlikely to have stations
		const emptyFreqs = ['87.5M', '87.7M', '107.7M', '107.9M'];
		let totalSignal = 0;
		let samples = 0;
		
		for (const freq of emptyFreqs) {
			if (scannerAbort) break;
			
			await fetch('/frequency/human/' + freq);
			await sleep(100);
			
			// Take a few samples
			for (let i = 0; i < 3; i++) {
				const response = await fetch('/state');
				const data = await response.json();
				totalSignal += parseInt(data.s_level) || 0;
				samples++;
				await sleep(30);
			}
		}
		
		return samples > 0 ? Math.round(totalSignal / samples) : 20;
	}

	async function coarseScan(threshold) {
		const startFreq = 88.0;
		const endFreq = 108.0;
		const step = 0.2; // Coarse step
		const settleTime = 100;
		
		const results = [];
		const totalSteps = Math.round((endFreq - startFreq) / step);
		let currentStep = 0;

		for (let freq = startFreq; freq <= endFreq; freq += step) {
			if (scannerAbort) break;
			
			currentStep++;
			const freqStr = freq.toFixed(1) + 'M';
			
			// Progress: 5-60% for coarse scan
			const progress = 5 + Math.round((currentStep / totalSteps) * 55);
			updateScanProgress(progress, freqStr);
			
			try {
				await fetch('/frequency/human/' + freqStr);
				await sleep(settleTime);
				
				// Take samples
				let totalSignal = 0;
				for (let i = 0; i < 2; i++) {
					const response = await fetch('/state');
					const data = await response.json();
					totalSignal += parseInt(data.s_level) || 0;
					await sleep(30);
				}
				const avgSignal = Math.round(totalSignal / 2);
				
				// Keep if above threshold
				if (avgSignal > threshold) {
					results.push({ freq: freq, signal: avgSignal, freqStr: freqStr });
				}
			} catch (err) {
				console.error('Coarse scan error at ' + freqStr + ':', err);
			}
		}

		// Sort by signal and return
		results.sort((a, b) => b.signal - a.signal);
		return results;
	}

	async function fineTuneCandidates(candidates) {
		const results = [];
		const totalCandidates = candidates.length;
		let currentCandidate = 0;
		
		for (const candidate of candidates) {
			if (scannerAbort) break;
			
			currentCandidate++;
			
			// Progress: 60-95% for fine-tuning
			const progress = 60 + Math.round((currentCandidate / totalCandidates) * 35);
			updateScanProgress(progress, candidate.freq.toFixed(1) + 'M finjustering');
			
			// Scan ±0.2 MHz around candidate at 0.05 MHz steps
			const centerFreq = candidate.freq;
			const scanStart = centerFreq - 0.2;
			const scanEnd = centerFreq + 0.2;
			const step = 0.05;
			
			let bestFreq = centerFreq;
			let bestSignal = candidate.signal;
			
			for (let freq = scanStart; freq <= scanEnd; freq += step) {
				if (scannerAbort) break;
				if (freq < 88.0 || freq > 108.0) continue;
				
				const freqStr = freq.toFixed(2) + 'M';
				
				try {
					await fetch('/frequency/human/' + freqStr);
					await sleep(80);
					
					const response = await fetch('/state');
					const data = await response.json();
					const signal = parseInt(data.s_level) || 0;
					
					if (signal > bestSignal) {
						bestSignal = signal;
						bestFreq = freq;
					}
				} catch (err) {
					console.error('Fine-tune error:', err);
				}
			}
			
			// Round to nearest 0.05 for clean display
			bestFreq = Math.round(bestFreq * 20) / 20;
			
			results.push({
				freq: bestFreq,
				signal: bestSignal,
				freqStr: bestFreq.toFixed(1) + 'M'
			});
		}
		
		return results;
	}

	function stopScanner() {
		scannerAbort = true;
		if (elements.scanStatus) {
			elements.scanStatus.textContent = 'Stopper...';
		}
	}

	function updateScanProgress(percent, freqStr) {
		if (elements.scanProgressBar) {
			elements.scanProgressBar.style.width = percent + '%';
		}
		if (elements.scanProgressText) {
			elements.scanProgressText.textContent = freqStr + ' (' + percent + '%)';
		}
	}

	function displayScanResults(results, totalFound) {
		if (!elements.scanResults) return;
		
		if (results.length === 0) {
			elements.scanResults.innerHTML = '<div class="scan-results-empty">Ingen stasjoner funnet. Prøv å justere antennen.</div>';
			return;
		}

		// Find max signal for scaling
		const maxSignal = Math.max(...results.map(r => r.signal));
		
		// Split into top 10 and rest
		const topResults = results.slice(0, 10);
		const moreResults = results.slice(10);
		
		let html = '';
		
		// Top results
		topResults.forEach(result => {
			html += createResultItem(result, maxSignal);
		});
		
		// "Show more" section if there are more results
		if (moreResults.length > 0 || totalFound > results.length) {
			const hiddenCount = moreResults.length;
			const filteredCount = totalFound - results.length;
			
			html += `
				<div class="scan-more-section">
					<button class="scan-more-btn" id="scan-show-more">
						Vis ${hiddenCount} flere stasjoner
						${filteredCount > 0 ? `(${filteredCount} svake filtrert bort)` : ''}
					</button>
					<div class="scan-more-results" id="scan-more-results" style="display: none;">
			`;
			
			moreResults.forEach(result => {
				html += createResultItem(result, maxSignal);
			});
			
			html += `
					</div>
				</div>
			`;
		}
		
		elements.scanResults.innerHTML = html;
		
		// Add click handlers for result items
		elements.scanResults.querySelectorAll('.scan-result-item').forEach(item => {
			item.addEventListener('click', () => {
				const freq = item.dataset.freq;
				setFrequencyHuman(freq);
			});
		});
		
		// Add click handler for "show more" button
		const showMoreBtn = document.getElementById('scan-show-more');
		const moreResultsDiv = document.getElementById('scan-more-results');
		if (showMoreBtn && moreResultsDiv) {
			showMoreBtn.addEventListener('click', () => {
				if (moreResultsDiv.style.display === 'none') {
					moreResultsDiv.style.display = 'block';
					showMoreBtn.textContent = 'Skjul ekstra stasjoner';
				} else {
					moreResultsDiv.style.display = 'none';
					showMoreBtn.textContent = `Vis ${moreResults.length} flere stasjoner`;
				}
			});
		}
	}

	function createResultItem(result, maxSignal) {
		const barWidth = Math.round((result.signal / maxSignal) * 100);
		let strengthClass = 'weak';
		if (result.signal > maxSignal * 0.7) strengthClass = 'strong';
		else if (result.signal > maxSignal * 0.4) strengthClass = 'medium';
		
		return `
			<div class="scan-result-item" data-freq="${result.freqStr}">
				<span class="scan-result-freq">${result.freq.toFixed(1)}</span>
				<div class="scan-result-bar-container">
					<div class="scan-result-bar ${strengthClass}" style="width: ${barWidth}%"></div>
				</div>
				<span class="scan-result-signal">${result.signal}</span>
			</div>
		`;
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
