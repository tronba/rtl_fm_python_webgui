# RTL-SDR Web Radio

A mobile-friendly web interface for RTL-SDR radio reception. Listen to the radio from your phone while the RTL-SDR runs on a server (Raspberry Pi, old laptop, etc). Audio streams over the network as MP3 - no need to be physically near the dongle.

## Why This Fork?

I needed a radio interface that non-technical family members could use during emergencies. The original [rtl_fm_python](https://github.com/th0ma5w/rtl_fm_python) by Thomas Winningham was the perfect starting point - a working REST API with Python bindings and a functional web UI.

My goal was to create something where someone can just tap "Marine Radio" → "Channel 16" and start listening, without needing to know that Channel 16 is 156.800 MHz or that marine VHF uses FM modulation.

Each radio mode (FM, Marine, Aviation, PMR446, Hunter/Gather) is a separate HTML page with its own presets and appropriate defaults. This isn't elegant from a code perspective, but it means each page can be tailored for its specific use case - and a confused user can't accidentally switch from marine emergency monitoring to FM music.

![Radio Modes](https://img.shields.io/badge/Modes-FM%20|%20Marine%20|%20Air%20|%20PMR446%20|%20Hunter-blue)
![License](https://img.shields.io/badge/License-GPLv2-green)

## Features

- **📱 Mobile-optimized UI** - Touch-friendly controls, compact layout designed for phones
- **🎯 Purpose-built radio modes** - Separate pages for FM, Marine VHF, Aviation, PMR446, Hunter/Gather
- **🔍 FM Sweep Scanner** - Human-assisted station discovery with automatic fine-tuning
- **💾 Channel memory** - Save and organize stations in browser localStorage
- **🔊 CTCSS tone squelch** - Filter walkie-talkie channels by sub-audible tone (Hunter radio)
- **⚡ Advanced squelch** - Attack delay, hang time, and hysteresis for cleaner audio
- **🔌 Offline capable** - No external JavaScript dependencies, runs on local network
- **🌐 Remote listening** - Server runs on one device, listen from anywhere on your network

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

### 🦌 Hunter/Gather Radio (138-144 MHz)
- Norwegian hunter radio channels (analog FM only)
- 6 hunting channels + 2 gathering channels preset
- **CTCSS tone squelch** - Filter by sub-audible tone (67.0-250.3 Hz)
- Narrowband FM optimized for voice communication

**Note:** Digital DMR channels are not supported - this mode only works with analog FM transmissions.

## Advanced Squelch

All radio pages include advanced squelch features (hidden in the HTML for simplicity):
- **Attack delay** - Signal must be above threshold for X ms before opening
- **Hang time** - Keep squelch open for X ms after signal drops
- **Hysteresis** - Different thresholds for opening vs closing

Default values are tuned per radio type. To customize, edit the `data-squelch-*` attributes in the `<body>` tag of each HTML file:
```html
<body data-squelch-attack="100" data-squelch-hang="300" data-squelch-hysteresis="15">
```

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

### Quick Start (Manual)

Start the web server (on the device with the RTL-SDR dongle):

```bash
./start_web_stream.sh
```

Or manually:

```bash
./rtl_fm_python_web.py -M wbfm -f 101.1M -
```

Open in browser: **http://localhost:10100/**

### Running as a Service (Recommended)

For proper start/stop control and automatic restart on failure, install as a systemd service:

#### 1. Edit the service file for your setup

Before installing, edit `rtl-fm-radio.service` to match your system:
- Change `User=pi` and `Group=pi` to your username
- Change `WorkingDirectory` to your install location

```bash
nano rtl-fm-radio.service
```

#### 2. Install the service

```bash
chmod +x radio-control.sh
./radio-control.sh install
```

#### 3. Control the service

```bash
./radio-control.sh start     # Start the radio server
./radio-control.sh stop      # Stop the radio server
./radio-control.sh restart   # Restart the server
./radio-control.sh status    # Check if running
./radio-control.sh log       # View live logs
```

#### 4. Auto-start on boot (Optional)

If you want the radio server to start automatically when the system boots:

```bash
sudo systemctl enable rtl-fm-radio
```

To disable auto-start:

```bash
sudo systemctl disable rtl-fm-radio
```

**Note:** Auto-start is opt-in. The service will not start on boot unless you explicitly enable it.

**For remote listening** (the whole point!) - find your server's IP and connect from your phone/tablet:

```bash
# On the server, find your IP
hostname -I

# On your phone's browser
http://YOUR_SERVER_IP:10100/
```

Example: RTL-SDR plugged into a Raspberry Pi at `192.168.1.50`, access from your phone at `http://192.168.1.50:10100/`

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
| `/squelch/<level>` | Set squelch level (0-300) |
| `/ctcss/<freq>` | Set CTCSS tone filter (67.0-250.3 Hz, 0=off) |
| `/stream.mp3` | Live audio stream |

## Project Structure

```
├── rtl_fm_python_web.py    # Flask web server with audio streaming
├── rtl_fm_python_thread.py # RTL-SDR control thread
├── rtl_fm_python_common.py # Shared utilities
├── rtl_fm.c                # Modified rtl_fm source (CTCSS + advanced squelch)
├── static/
│   ├── index.html          # Mode selection home page
│   ├── fm.html             # FM radio with sweep scanner
│   ├── marine.html         # Marine VHF channels
│   ├── air.html            # Aviation frequencies
│   ├── pmr446.html         # PMR446 channels
│   ├── hunter.html         # Hunter/gather radio with CTCSS
│   ├── css/style.css       # Shared styles
│   └── js/radio.js         # Shared JavaScript
└── docs/
    └── FM_SWEEP_SCANNER.md # Sweep scanner documentation
```

## Technical Notes

- **Audio streaming**: Raw audio from rtl_fm → FFmpeg → MP3 (32kHz/128kbps) → Network
- **Silent frame injection**: Keeps MP3 stream alive during squelch (no reconnect spam)
- **State polling**: Every 500ms for signal meter updates
- **No WebSocket**: Simple REST polling for maximum compatibility
- **Channel storage**: Browser localStorage (no server-side database)
- **CTCSS detection**: Goertzel algorithm running on demodulated audio (~125ms blocks)

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
