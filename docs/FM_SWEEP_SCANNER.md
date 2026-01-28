# FM Sweep Scanner - User Guide & Design Documentation

The FM Sweep Scanner is a hybrid human-machine approach to finding FM radio stations using an RTL-SDR dongle. Rather than relying solely on automatic signal detection (which often misses stations or picks up noise), this system lets **you** decide what sounds like a real station while the machine handles the tedious tuning work.

## Main Features

### 🎚️ Hybrid Sweep Scanner
The core innovation is a **human-assisted sweep** system:

1. **Sweep Mode**: The scanner automatically tunes through the FM band (87.5 - 108.0 MHz) in 0.1 MHz steps
2. **You Listen**: Audio plays continuously so you hear each frequency as it's scanned
3. **You Mark**: When you hear something interesting, press the **Mark** button
4. **Machine Fine-tunes**: After the sweep, the system automatically fine-tunes each marked frequency to find the optimal signal

This approach combines human audio recognition (we're excellent at detecting speech/music in noise) with machine precision for frequency optimization.

### 📻 Channel Management
- Channels are saved to browser localStorage and persist between sessions
- Click any channel to tune and play immediately
- Edit station names inline
- Remove individual channels or clear all
- Channels sorted by frequency automatically

### 🎛️ Manual Tuning
- Direct frequency input with Go button
- Fine-tuning buttons: ±0.1, ±0.5, ±1.0 MHz
- Save button adds current frequency to channel list
- Responsive layout adapts to screen size

### 📊 Signal Meter
- Real-time signal strength display (0-700 scale)
- Dual-bar design expanding from center
- Yellow-to-green gradient indicates signal quality
- Numeric value shown inside the meter

### ⏱️ Sweep Speed Options
- **Slow** (1500ms): Best for weak stations, gives more time to hear each frequency
- **Fast** (600ms): Default, good balance of speed and recognition
- **Turbo** (300ms): Quick scan when you know what to look for

---

## Design Decisions Explained

### The Mark System & Audio Latency Compensation

**The Problem**: There's approximately 1-2 seconds of audio latency between when the SDR tunes to a frequency and when you hear it through the browser. If you press Mark when you hear something, the scanner has already moved several frequencies ahead.

**The Solution**: The system maintains a **history buffer** of the last 10 frequencies scanned. When you press Mark, instead of marking the current frequency, it finds the frequency with the **highest signal** in the recent history. This compensates for reaction time and audio latency.

```
Audio Latency Timeline:
[User Hears] ←── ~10 frequencies behind ──→ [Scanner Position]
     ↓
Mark button pressed
     ↓
System checks last 10 frequencies
     ↓
Selects the one with highest signal
```

The frequency display also shows the **expected frequency** (the oldest in the buffer) during sweep, so what you see roughly matches what you hear.

### Two-Stage Stop Button

**First Press** (during sweep): Stops the sweep early but proceeds to fine-tune any stations already marked. The button stays red to indicate fine-tuning is in progress.

**Second Press** (during fine-tune): Stops everything completely and returns to idle state.

This allows you to:
- Stop early if you've found what you want
- Still get the benefit of fine-tuning
- Abort completely if needed

### Fine-Tuning Process

When you mark a station during sweep, the frequency might be slightly off (e.g., you marked 101.2 but the actual station is at 101.15). The fine-tuner:

1. Scans ±0.3 MHz around each marked frequency in 0.05 MHz steps
2. Takes 3 signal readings at each step and averages them (reduces noise)
3. Finds the frequency with the strongest average signal
4. Rounds to 0.1 MHz for cleaner display
5. Deduplicates if multiple marks resolve to the same frequency

### Channel Update vs. New Channel (Save Button)

When you press Save on a manual frequency:

- **If within 1 MHz of the currently selected channel**: Updates that channel's frequency (useful for fine-tuning a saved station)
- **Otherwise**: Creates a new channel (prompts for name)

This prevents accidental duplicate entries when you're just adjusting a station.

### Gray Channels During Sweep

During sweep and fine-tuning, the channel list is grayed out and disabled. This prevents:
- Accidentally clicking a channel mid-sweep
- Confusion about which frequency is actually playing
- Interference with the scanning process

### Initial Audio Sync & Buffer Time

Before starting a sweep, the system:
1. Tunes to 87.5 MHz first
2. Starts a fresh audio stream
3. Waits 1.5 seconds for audio to buffer properly

This ensures the audio you hear matches the frequency being scanned from the start, rather than hearing leftover audio from a previous frequency.

### Signal Meter Scale (0-700)

RTL-SDR signal levels can exceed 100 for strong local stations. The meter uses a 0-700 scale to accommodate strong signals without constantly maxing out, while still showing good dynamic range for weaker stations.

---

## Keyboard Shortcuts

Currently, all interactions are button/touch-based for mobile compatibility. The frequency input field accepts Enter to submit.

---

## Tips for Best Results

1. **Use Slow speed** for the first scan of a new area - you'll catch more weak stations
2. **Mark liberally** - the fine-tuner will sort out duplicates
3. **Name your stations** after the sweep - easier to remember what's what
4. **Save often** - channels are only persisted to localStorage when you explicitly save or the system auto-saves after fine-tuning

---

## Technical Notes

- Requires the RTL-SDR Python backend running (`rtl_fm_python_web.py`)
- Audio streams via `/stream.mp3` endpoint
- State polling every 500ms for signal meter updates
- No external JavaScript dependencies - runs fully offline
- Tested on Firefox

---

## Development Lessons Learned

This section documents key challenges encountered during development.

### Why Human-Assisted Instead of Automatic Detection?

Early versions attempted fully automatic station detection using signal levels and various filtering algorithms. Problems encountered:

| Approach | Problem |
|----------|---------|
| Simple threshold | Too many false positives (200+ "stations") or missed real stations |
| SNR-based filtering | `s_level` measures demodulated audio energy, not RF signal - noise can appear as signal |
| Bandwidth verification | Complex to implement, still produced false positives |
| Peak detection | Too aggressive filtering removed legitimate stations |

**Conclusion**: Human ears are simply better at detecting real speech/music in noise than algorithmic approaches based on signal levels alone.

### RTL-SDR Device Exclusivity

Tools like `rtl_power` (FFT-based spectrum analysis) cannot run while `rtl_fm` is active - both require exclusive USB device access. This ruled out server-side spectrum analysis approaches.

### Gain API Gotcha

RTL-SDR gains are in **tenths of dB**. The codebase has two endpoints:
- `/gain/28` → sets raw value 28 (2.8 dB) - usually too low!
- `/gain/human/28` → multiplies by 10 first → 280 (28.0 dB) - correct

Always use `/gain/human/` for sensible values.

### AGC Instability for Measurements

Auto Gain Control constantly adjusts based on current signal, making readings inconsistent (same station: 528 vs 200 on consecutive checks). For any scanning/measurement operation, use fixed gain.

### Approaches Considered But Not Used

| Approach | Why Not Used |
|----------|--------------|
| `rtl_power` FFT analysis | Device exclusivity with rtl_fm |
| RDS detection | Requires C code changes |
| Stereo pilot (19kHz) detection | Requires C code changes to expose baseband |
| Audio pattern analysis | Complex, would need Web Audio API |
| Known frequency database | Less flexible, requires maintenance |
