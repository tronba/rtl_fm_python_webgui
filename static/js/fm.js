/**
 * FM Sweep Scanner - Hybrid Manual/Auto Station Finding
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
		autogain: true
	};
	let gains = [];
	let pollInterval = null;
	
	// Sweep scanner state
	let sweepRunning = false;
	let sweepAbort = false;
	let fineTuning = false;
	let fineTuneAbort = false;
	let currentSweepFreq = 87.5;
	let sweepSpeed = 600;  // ms per step (Fast default)
	let markedStations = [];  // Array of {freq, signal, name}
	let sweepHistory = [];    // Last N frequencies for latency compensation
	let currentPlayingFreq = null;
	let channelsDisabled = false;  // Gray out channels during sweep/finetune

	// DOM Elements
	let elements = {};

	document.addEventListener('DOMContentLoaded', init);

	function init() {
		elements = {
			freqDisplay: document.getElementById('freq-display'),
			freqInput: document.getElementById('freq-input'),
			signalBarLeft: document.getElementById('signal-bar-left'),
			signalBarRight: document.getElementById('signal-bar-right'),
			signalValue: document.getElementById('signal-value'),
			statusText: document.getElementById('status-text'),
			headerProgress: document.getElementById('header-progress'),
			headerProgressFill: document.getElementById('header-progress-fill'),
			modSelect: document.getElementById('mod-select'),
			gainSelect: document.getElementById('gain-select'),
			autogainCheck: document.getElementById('autogain-check'),
			audioPlayer: document.getElementById('audio-player'),
			playBtn: document.getElementById('player-btn-play'),
			liveBtn: document.getElementById('player-btn-live'),
			playerStatus: document.getElementById('player-status'),
			// Sweep elements
			sweepStartBtn: document.getElementById('sweep-start-btn'),
			sweepMarkBtn: document.getElementById('sweep-mark-btn'),
			// Channel elements
			channelList: document.getElementById('channel-list'),
			channelActions: document.getElementById('channel-actions'),
			clearChannelsBtn: document.getElementById('clear-channels-btn'),
			// Manual tuning
			manualSaveBtn: document.getElementById('manual-save-btn'),
			freqEnterBtn: document.getElementById('freq-enter-btn')
		};

		setupEventListeners();
		setupSweepScanner();
		setupAudioPlayer();
		fetchGainList();
		fetchState();
		pollInterval = setInterval(fetchState, 500);
		
		// Load saved channels
		loadSavedChannels();
	}

	// ============ SWEEP SCANNER ============
	
	function setupSweepScanner() {
		// Start/Stop button
		elements.sweepStartBtn.addEventListener('click', toggleSweep);
		
		// Mark button
		elements.sweepMarkBtn.addEventListener('click', markCurrentFrequency);
		
		// Speed buttons
		document.querySelectorAll('.speed-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				sweepSpeed = parseInt(btn.dataset.speed);
			});
		});
		
		// Clear button
		elements.clearChannelsBtn.addEventListener('click', clearAllChannels);
	}
	
	async function toggleSweep() {
		if (fineTuning) {
			// Stop fine-tuning completely
			fineTuneAbort = true;
			channelsDisabled = false;
			elements.sweepStartBtn.textContent = '▶️ Start Sweep';
			elements.sweepStartBtn.classList.remove('sweeping');
			elements.sweepMarkBtn.disabled = true;
			elements.headerProgress.classList.remove('active');
			setStatus('Fine-tuning stopped');
			updateChannelListUI();
		} else if (sweepRunning) {
			// Stop sweep but proceed to fine-tune
			sweepAbort = true;
			setStatus('Stopping sweep, will fine-tune marked stations...');
		} else {
			// Clear current marks for fresh sweep
			markedStations = [];
			channelsDisabled = true;
			updateChannelListUI();
			
			// Show header progress
			elements.headerProgress.classList.add('active');
			elements.headerProgressFill.style.width = '0%';
			
			// Start audio and sync first
			setStatus('Starting audio...');
			await startAudioAndSync();
			
			// Start sweep
			sweepRunning = true;
			sweepAbort = false;
			elements.sweepStartBtn.textContent = '⏹️ Stop';
			elements.sweepStartBtn.classList.add('sweeping');
			elements.sweepMarkBtn.disabled = false;
			
			await runSweep();
			
			sweepRunning = false;
			channelsDisabled = false;
			elements.sweepStartBtn.textContent = '▶️ Start Sweep';
			elements.sweepStartBtn.classList.remove('sweeping');
			elements.sweepMarkBtn.disabled = true;
			elements.headerProgress.classList.remove('active');
			updateChannelListUI();
		}
	}
	
	async function startAudioAndSync() {
		if (!elements.audioPlayer) return;
		
		// First tune to start frequency BEFORE starting audio
		setStatus('Tuning to 87.5 MHz...');
		await fetch('/frequency/human/87.5M');
		await sleep(300);
		
		// Now start fresh stream from current frequency
		setStatus('Starting audio...');
		const source = elements.audioPlayer.querySelector('source');
		if (source) {
			source.src = '/stream.mp3?t=' + Date.now();
			elements.audioPlayer.load();
		}
		
		try {
			await elements.audioPlayer.play();
			updatePlayerUI(true);
			// Wait longer for audio to buffer properly
			setStatus('Buffering audio...');
			await sleep(1500);
		} catch (err) {
			console.error('Audio start failed:', err);
		}
	}
	
	async function syncAudio() {
		if (!elements.audioPlayer) return;
		
		const source = elements.audioPlayer.querySelector('source');
		if (source) {
			source.src = '/stream.mp3?t=' + Date.now();
			elements.audioPlayer.load();
		}
		
		try {
			await elements.audioPlayer.play();
			updatePlayerUI(true);
		} catch (err) {
			console.error('Audio sync failed:', err);
		}
	}
	
	async function runSweep() {
		const startFreq = 87.5;
		const endFreq = 108.0;
		const step = 0.1;
		const historySize = 10;
		
		sweepHistory = [];
		currentSweepFreq = startFreq;
		
		setStatus('Scanning...');
		
		// Initial delay to let audio settle before sweep starts
		await sleep(1000);
		
		for (let freq = startFreq; freq <= endFreq && !sweepAbort; freq += step) {
			currentSweepFreq = freq;
			const freqStr = freq.toFixed(1) + 'M';
			
			// Update progress in header
			const progress = ((freq - startFreq) / (endFreq - startFreq)) * 100;
			elements.headerProgressFill.style.width = progress + '%';
			
			try {
				await fetch('/frequency/human/' + freqStr);
				await sleep(sweepSpeed);
				
				const response = await fetch('/state');
				const data = await response.json();
				const signal = parseInt(data.s_level) || 0;
				
				sweepHistory.push({ freq, signal, timestamp: Date.now() });
				if (sweepHistory.length > historySize) {
					sweepHistory.shift();
				}
				
			} catch (err) {
				console.error('Sweep error at ' + freqStr + ':', err);
			}
		}
		
		elements.headerProgressFill.style.width = '100%';
		
		if (markedStations.length > 0) {
			setStatus(`${markedStations.length} marked - fine-tuning...`);
			// Gray out mark button during fine-tune
			elements.sweepMarkBtn.disabled = true;
			fineTuning = true;
			fineTuneAbort = false;
			await finetuneMarkedStations();
			fineTuning = false;
			
			if (!fineTuneAbort) {
				setStatus(`Done! ${markedStations.length} stations found.`);
			}
		} else {
			setStatus('Done - no stations marked.');
		}
	}
	
	function markCurrentFrequency() {
		let bestMark = null;
		
		if (sweepHistory.length > 0) {
			bestMark = sweepHistory.reduce((best, current) => 
				current.signal > best.signal ? current : best
			);
		} else {
			bestMark = { freq: currentSweepFreq, signal: state.s_level };
		}
		
		// Check if already marked (within 0.2 MHz)
		const existing = markedStations.find(s => Math.abs(s.freq - bestMark.freq) < 0.2);
		if (existing) {
			setStatus(`Already marked near ${bestMark.freq.toFixed(1)} MHz`);
			return;
		}
		
		markedStations.push({
			freq: bestMark.freq,
			signal: bestMark.signal,
			name: ''
		});
		
		// Visual feedback
		elements.sweepMarkBtn.classList.add('marked');
		setTimeout(() => elements.sweepMarkBtn.classList.remove('marked'), 300);
		
		setStatus(`Marked: ${bestMark.freq.toFixed(1)} MHz (signal: ${bestMark.signal})`);
		updateChannelListUI();
	}
	
	async function finetuneMarkedStations() {
		const fineTunedStations = [];
		
		for (let i = 0; i < markedStations.length && !fineTuneAbort; i++) {
			const mark = markedStations[i];
			setStatus(`Fine-tuning ${i + 1}/${markedStations.length}: ${mark.freq.toFixed(1)} MHz`);
			
			const scanStart = Math.max(87.5, mark.freq - 0.3);
			const scanEnd = Math.min(108.0, mark.freq + 0.3);
			const step = 0.05;
			
			let bestFreq = mark.freq;
			let bestSignal = 0;
			
			for (let freq = scanStart; freq <= scanEnd && !fineTuneAbort; freq += step) {
				try {
					await fetch('/frequency/human/' + freq.toFixed(2) + 'M');
					
					// Update frequency display during fine-tune
					if (elements.freqDisplay) {
						elements.freqDisplay.textContent = freq.toFixed(1);
					}
					
					await sleep(150);
					
					let totalSignal = 0;
					for (let s = 0; s < 3; s++) {
						const response = await fetch('/state');
						const data = await response.json();
						totalSignal += parseInt(data.s_level) || 0;
						await sleep(30);
					}
					const avgSignal = totalSignal / 3;
					
					if (avgSignal > bestSignal) {
						bestSignal = avgSignal;
						bestFreq = freq;
					}
				} catch (err) {
					console.error('Fine-tune error:', err);
				}
			}
			
			// Round to 0.1 MHz
			const roundedFreq = Math.round(bestFreq * 10) / 10;
			
			// Only add if not already in fineTunedStations (deduplication fix)
			const alreadyExists = fineTunedStations.find(s => s.freq === roundedFreq);
			if (!alreadyExists) {
				fineTunedStations.push({
					freq: roundedFreq,
					signal: Math.round(bestSignal),
					name: mark.name || ''
				});
			}
		}
		
		markedStations = fineTunedStations;
		updateChannelListUI();
	}
	
	function updateChannelListUI() {
		const hasChannels = markedStations.length > 0;
		elements.channelActions.style.display = hasChannels ? 'flex' : 'none';
		
		if (!hasChannels) {
			elements.channelList.innerHTML = '<div class="no-channels">No channels saved yet. Run a sweep to find stations!</div>';
			return;
		}
		
		// Sort by frequency
		const sorted = [...markedStations].sort((a, b) => a.freq - b.freq);
		
		elements.channelList.innerHTML = sorted.map((station, index) => {
			const isPlaying = currentPlayingFreq === station.freq;
			const disabledClass = channelsDisabled ? 'disabled' : '';
			return `
			<div class="channel-item ${isPlaying ? 'playing' : ''} ${disabledClass}" data-freq="${station.freq}">
				<span class="freq">${station.freq.toFixed(1)}</span>
				<input type="text" class="name-input" placeholder="Station name" 
					value="${station.name || ''}" data-freq="${station.freq}" ${channelsDisabled ? 'disabled' : ''}>
				<span class="signal">📶${station.signal || '?'}</span>
				<button class="remove-btn" data-freq="${station.freq}" ${channelsDisabled ? 'disabled' : ''}>×</button>
			</div>
		`}).join('');
		
		// Add click handlers (only when not disabled)
		if (!channelsDisabled) {
			elements.channelList.querySelectorAll('.channel-item').forEach(item => {
				item.addEventListener('click', async (e) => {
					// Don't trigger if clicking input or remove button
					if (e.target.classList.contains('name-input') || e.target.classList.contains('remove-btn')) {
						return;
					}
					const freq = parseFloat(item.dataset.freq);
					await tuneToChannel(freq);
				});
			});
		}
		
		// Name input handlers
		elements.channelList.querySelectorAll('.name-input').forEach(input => {
			input.addEventListener('change', (e) => {
				const freq = parseFloat(e.target.dataset.freq);
				const station = markedStations.find(s => s.freq === freq);
				if (station) {
					station.name = e.target.value;
				}
			});
			// Prevent click from bubbling to channel item
			input.addEventListener('click', (e) => e.stopPropagation());
		});
		
		// Remove button handlers
		elements.channelList.querySelectorAll('.remove-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const freq = parseFloat(btn.dataset.freq);
				removeChannel(freq);
			});
		});
	}
	
	async function tuneToChannel(freq) {
		currentPlayingFreq = freq;
		updateChannelListUI();
		setStatus(`Tuning to ${freq.toFixed(1)} MHz...`);
		
		await fetch('/frequency/human/' + freq.toFixed(1) + 'M');
		await syncAudio();
		
		setStatus(`Playing ${freq.toFixed(1)} MHz`);
	}
	
	function removeChannel(freq) {
		markedStations = markedStations.filter(s => s.freq !== freq);
		if (currentPlayingFreq === freq) {
			currentPlayingFreq = null;
		}
		updateChannelListUI();
	}
	
	function clearAllChannels() {
		if (confirm('Remove all channels?')) {
			markedStations = [];
			currentPlayingFreq = null;
			localStorage.removeItem('fm_saved_channels');
			updateChannelListUI();
			setStatus('Channels cleared');
		}
	}
	
	function saveChannelsToStorage() {
		localStorage.setItem('fm_saved_channels', JSON.stringify(markedStations));
		setStatus(`${markedStations.length} channels saved!`);
	}
	
	function addCurrentFrequencyToChannels() {
		const currentMHz = state.freq_i / 1000000;
		const roundedFreq = Math.round(currentMHz * 10) / 10;
		
		// Check if we have a currently playing channel and are within 1 MHz of it
		if (currentPlayingFreq !== null) {
			const distanceFromPlaying = Math.abs(roundedFreq - currentPlayingFreq);
			
			if (distanceFromPlaying < 1.0) {
				// Update the existing channel instead of creating new
				const existingStation = markedStations.find(s => s.freq === currentPlayingFreq);
				if (existingStation) {
					const oldFreq = existingStation.freq;
					existingStation.freq = roundedFreq;
					existingStation.signal = state.s_level || 0;
					
					// Update currentPlayingFreq to new frequency
					currentPlayingFreq = roundedFreq;
					
					// Re-sort by frequency
					markedStations.sort((a, b) => a.freq - b.freq);
					
					updateChannelListUI();
					saveChannelsToStorage();
					setStatus(`Updated ${oldFreq.toFixed(1)} → ${roundedFreq.toFixed(1)} MHz`);
					return;
				}
			}
		}
		
		// Check if already exists at exact frequency
		const exists = markedStations.some(s => Math.abs(s.freq - roundedFreq) < 0.05);
		if (exists) {
			setStatus(`${roundedFreq.toFixed(1)} MHz already in channels`);
			return;
		}
		
		// Prompt for name
		const name = prompt(`Name for ${roundedFreq.toFixed(1)} MHz:`, '');
		
		markedStations.push({
			freq: roundedFreq,
			signal: state.s_level || 0,
			name: name || ''
		});
		
		// Sort by frequency
		markedStations.sort((a, b) => a.freq - b.freq);
		
		updateChannelListUI();
		saveChannelsToStorage();
		setStatus(`Added ${roundedFreq.toFixed(1)} MHz to channels`);
	}
	
	function loadSavedChannels() {
		try {
			const saved = localStorage.getItem('fm_saved_channels');
			if (saved) {
				markedStations = JSON.parse(saved);
				updateChannelListUI();
				if (markedStations.length > 0) {
					setStatus(`${markedStations.length} saved channels loaded`);
				}
			}
		} catch (e) {
			console.error('Failed to load saved channels:', e);
		}
	}
	
	function setStatus(text) {
		if (elements.statusText) {
			elements.statusText.textContent = text;
		}
	}

	// ============ AUDIO PLAYER ============
	
	function setupAudioPlayer() {
		if (!elements.audioPlayer) return;

		if (elements.playBtn) {
			elements.playBtn.addEventListener('click', togglePlayback);
		}

		if (elements.liveBtn) {
			elements.liveBtn.addEventListener('click', syncAudio);
		}

		elements.audioPlayer.addEventListener('play', () => updatePlayerUI(true));
		elements.audioPlayer.addEventListener('pause', () => updatePlayerUI(false));
		elements.audioPlayer.addEventListener('ended', () => updatePlayerUI(false));
		elements.audioPlayer.addEventListener('error', () => {
			updatePlayerUI(false);
			showPlayerError();
		});
		elements.audioPlayer.addEventListener('waiting', () => showPlayerStatus('Loading...'));
		elements.audioPlayer.addEventListener('playing', () => showPlayerStatus('Playing live'));
	}

	function togglePlayback() {
		if (!elements.audioPlayer) return;
		
		if (elements.audioPlayer.paused) {
			syncAudio();
		} else {
			elements.audioPlayer.pause();
		}
	}

	function updatePlayerUI(playing) {
		if (elements.playBtn) {
			elements.playBtn.innerHTML = playing ? '⏹️ Stop' : '▶️ Start Listening';
			elements.playBtn.classList.toggle('playing', playing);
		}
		
		if (elements.playerStatus) {
			elements.playerStatus.textContent = playing ? 'Playing live' : 'Stopped';
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
			elements.playerStatus.textContent = 'Playback error';
			elements.playerStatus.classList.add('error');
		}
	}

	// ============ EVENT LISTENERS ============
	
	function setupEventListeners() {
		// Manual tuning buttons with data-tune attribute
		document.querySelectorAll('[data-tune]').forEach(btn => {
			btn.addEventListener('click', () => {
				const delta = parseFloat(btn.getAttribute('data-tune'));
				adjustFrequency(delta);
			});
		});
		
		// Manual save button
		if (elements.manualSaveBtn) {
			elements.manualSaveBtn.addEventListener('click', () => {
				addCurrentFrequencyToChannels();
			});
		}

		// Frequency input - enter key or blur
		if (elements.freqInput) {
			elements.freqInput.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					setFrequencyFromInput();
				}
			});
		}
		
		// Go button for frequency input
		if (elements.freqEnterBtn) {
			elements.freqEnterBtn.addEventListener('click', () => {
				setFrequencyFromInput();
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
	}

	// ============ API FUNCTIONS ============
	
	function fetchState() {
		fetch('/state')
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			})
			.catch(err => console.error('State fetch error:', err));
	}

	function fetchGainList() {
		fetch('/gain/list')
			.then(res => res.json())
			.then(data => {
				gains = data.gains || [];
				populateGainSelect();
			})
			.catch(err => console.error('Gain list fetch error:', err));
	}

	async function setFrequencyHuman(freqStr) {
		const response = await fetch('/frequency/human/' + encodeURIComponent(freqStr));
		const data = await response.json();
		state = data;
		updateUI();
	}

	function adjustFrequency(deltaMHz) {
		const currentMHz = state.freq_i / 1000000;
		const newMHz = currentMHz + deltaMHz;
		setFrequencyHuman(newMHz.toFixed(1) + 'M');
	}

	function setFrequencyFromInput() {
		if (elements.freqInput && elements.freqInput.value) {
			let val = elements.freqInput.value.trim();
			// Handle various input formats
			val = val.toUpperCase().replace('MHZ', '').replace('M', '').trim();
			const num = parseFloat(val);
			if (!isNaN(num) && num >= 87.5 && num <= 108) {
				setFrequencyHuman(num.toFixed(1) + 'M');
				elements.freqInput.value = '';
				elements.freqInput.placeholder = num.toFixed(1) + ' MHz';
			}
		}
	}

	function setDemod(mod) {
		fetch('/demod/' + mod)
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			});
	}

	function setGain(gain) {
		fetch('/gain/human/' + gain)
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			});
	}

	function setAutoGain() {
		fetch('/gain/auto')
			.then(res => res.json())
			.then(data => {
				state = data;
				updateUI();
			});
	}

	// ============ UI UPDATE ============
	
	function updateUI() {
		// Frequency display - show expected freq during sweep (accounting for audio latency)
		if (elements.freqDisplay) {
			let displayFreq;
			if (sweepRunning && sweepHistory.length > 0) {
				// Show the oldest frequency in history (what user is hearing)
				displayFreq = sweepHistory[0].freq.toFixed(1);
			} else {
				displayFreq = state.freq_s ? state.freq_s.replace('M', '') : '---';
			}
			elements.freqDisplay.textContent = displayFreq;
			
			// Also update the frequency input field
			if (elements.freqInput && displayFreq !== '---') {
				elements.freqInput.value = displayFreq;
			}
		}

		// Signal meter (dual bars expanding from center, max 700)
		if (elements.signalBarLeft && elements.signalBarRight) {
			const rawLevel = state.s_level || 0;
			const level = Math.min(100, (rawLevel / 700) * 100);
			// Each bar fills up to 50% (half the meter)
			const barWidth = level / 2;
			elements.signalBarLeft.style.width = barWidth + '%';
			elements.signalBarRight.style.width = barWidth + '%';
		}
		if (elements.signalValue) {
			elements.signalValue.textContent = state.s_level || 0;
		}

		// Modulation select
		if (elements.modSelect && state.mod) {
			elements.modSelect.value = state.mod;
		}

		// Gain select
		if (elements.gainSelect && !state.autogain) {
			elements.gainSelect.value = state.gain;
		}

		// Autogain checkbox
		if (elements.autogainCheck) {
			elements.autogainCheck.checked = state.autogain;
		}
	}

	function populateGainSelect() {
		if (!elements.gainSelect) return;
		
		elements.gainSelect.innerHTML = '<option value="auto">Auto</option>';
		gains.forEach(g => {
			const option = document.createElement('option');
			option.value = g;
			option.textContent = g + ' dB';
			elements.gainSelect.appendChild(option);
		});
	}

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

})();
