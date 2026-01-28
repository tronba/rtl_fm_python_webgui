# RTL-SDR Web Radio

A mobile-friendly web interface for RTL-SDR radio reception. Still very much in development, only the FM section is kinda done. Will work on the rest as time permits.

## Why This Fork?

I needed a radio interface that non-technical family members could use during emergencies. The original [rtl_fm_python](https://github.com/th0ma5w/rtl_fm_python) by Thomas Winningham was the perfect starting point - a working REST API with Python bindings and a functional web UI.

My goal was to create something where someone can just tap "Marine Radio" → "Channel 16" and start listening, without needing to know that Channel 16 is 156.800 MHz or that marine VHF uses FM modulation.

Each radio mode (FM, Marine, Aviation, PMR446) is a separate HTML page with its own presets and appropriate defaults. This isn't elegant from a code perspective, but it means each page can be tailored for its specific use case - and a confused user can't accidentally switch from marine emergency monitoring to FM music.

![Radio Modes](https://img.shields.io/badge/Modes-FM%20|%20Marine%20|%20Air%20|%20PMR446-blue)
![License](https://img.shields.io/badge/License-GPLv2-green)

## Features

- **📱 Mobile-optimized UI** - Touch-friendly controls, works great on phones
- **🎯 Purpose-built radio modes** - Separate pages for FM, Marine VHF, Aviation, PMR446
- **🔍 FM Sweep Scanner** - Human-assisted station discovery with automatic fine-tuning
- **💾 Channel memory** - Save and organize stations in browser localStorage
- **🔌 Offline capable** - No external JavaScript dependencies, runs on local network

## Radio Modes

### 📻 FM Radio (87.5-108 MHz)
Full FM broadcast band with:
- **Sweep Scanner** - Scan the band while listening, mark stations you hear
- **Auto fine-tuning** - Machine precision finds optimal frequency for marked stations
- **Channel management** - Save, name, and organize your stations
- **Manual tuning** - Direct frequency input and ±0.1/0.5/1.0 MHz buttons

See [FM Sweep Scanner Documentation](docs/FM_SWEEP_SCANNER.md) for details.

### ⚓ Marine VHF (156-162 MHz)
- Channel 16 emergency frequency highlighted
- Common maritime channels preset
- Automatic FM modulation

### ✈️ Aviation (118-137 MHz)
- Automatic AM modulation
- International emergency frequency 121.5 MHz
- Airport tower and approach frequencies

### 📞 PMR446 (446 MHz)
- All 16 PMR446 walkie-talkie channels
- License-free monitoring

## Screenshots

*Home screen with radio mode selection*

Each mode includes:
- Large frequency display with signal meter
- Preset buttons for common frequencies
- Antenna length recommendations

## Requirements

- RTL-SDR USB dongle
- Linux (tested on Raspberry Pi OS, Ubuntu)
- Python 3.x
- FFmpeg (for MP3 audio streaming)
- RTL-SDR drivers and libraries

## Installation

### 1. Install RTL-SDR drivers

```bash
sudo apt-get install rtl-sdr librtlsdr-dev
```

### 2. Install FFmpeg

```bash
sudo apt-get install ffmpeg
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Compile the modified rtl_fm

```bash
./build.sh
```

## Running

Start the web server:

```bash
./start_web_stream.sh
```

Or manually:

```bash
./rtl_fm_python_web.py -M wbfm -f 101.1M -
```

Open in browser: **http://localhost:10100/**

For remote access (e.g., from phone on same network):

```bash
# Find your IP
hostname -I

# Access from phone
http://YOUR_IP:10100/
```

## REST API

The original REST API is fully preserved:

| Endpoint | Description |
|----------|-------------|
| `/state` | Get current frequency, signal level, gain, modulation |
| `/frequency/human/101.1M` | Tune to frequency |
| `/demod/w` | Set modulation (w=WBFM, f=FM, a=AM, l=LSB, u=USB) |
| `/gain/human/28` | Set gain in dB |
| `/gain/auto` | Enable auto gain |
| `/gain/list` | List available gain values |
| `/stream.mp3` | Live audio stream |

## Project Structure

```
├── rtl_fm_python_web.py    # Flask web server with audio streaming
├── rtl_fm_python_thread.py # RTL-SDR control thread
├── rtl_fm_python_common.py # Shared utilities
├── rtl_fm.c                # Modified rtl_fm source
├── static/
│   ├── index.html          # Mode selection home page
│   ├── fm.html             # FM radio with sweep scanner
│   ├── marine.html         # Marine VHF channels
│   ├── air.html            # Aviation frequencies
│   ├── pmr446.html         # PMR446 channels
│   ├── css/style.css       # Shared styles
│   └── js/radio.js         # Shared JavaScript (legacy)
└── docs/
    └── FM_SWEEP_SCANNER.md # Sweep scanner documentation
```

## Technical Notes

- Audio is streamed as MP3 via FFmpeg (32kHz → 128kbps MP3)
- State polling every 500ms for signal meter
- No WebSocket - simple REST polling for maximum compatibility
- Channels stored in browser localStorage

## Credits & License

This project is built upon the work of many contributors:

- **[rtl_fm_python](https://github.com/th0ma5w/rtl_fm_python)** by Thomas Winningham - The foundation this fork is built on
- **[RTL-SDR / librtlsdr](https://github.com/steve-m/librtlsdr)** - The core SDR library
  - Steve Markgraf (steve-m)
  - Hoernchen
  - Kyle Keen (keenerd)
  - Elias Oenal
- **[Flask](https://flask.pocoo.org/)** web framework

### License

GPLv2 - inherited from the rtl-sdr project. See [LICENSE](LICENSE) for details.
