# RTL-SDR Web Radio

A mobile-friendly web interface for RTL-SDR radio reception. Stream audio over the network as MP3 and listen from any device.

## Why This Fork?

This fork simplifies radio use for non-technical users during emergencies. Built on [rtl_fm_python](https://github.com/th0ma5w/rtl_fm_python), it offers tailored HTML pages for specific radio modes, ensuring ease of use.

## Features

- **Mobile-optimized UI**
- **Purpose-built radio modes**: FM, Marine, Aviation, PMR446, Hunter/Gather
- **FM Sweep Scanner**: Discover and fine-tune stations
- **Channel memory**: Save stations locally
- **CTCSS tone squelch**: Filter walkie-talkie channels
- **Offline capable**: Runs on local network
- **Remote listening**: Stream audio from anywhere on your network

## Radio Modes

### FM Radio (87.5-108 MHz)
- Sweep Scanner for station discovery
- Auto fine-tuning and manual tuning
- Channel management

### Marine VHF (156-162 MHz)
- Emergency and common maritime channels preset

### Aviation (118-137 MHz)
- AM modulation with emergency and airport frequencies

### PMR446 (446 MHz)
- 16 walkie-talkie channels

### Hunter/Gather Radio (138-144 MHz)
- Norwegian hunter channels with CTCSS tone squelch

## Requirements

- RTL-SDR USB dongle
- Linux (tested on Raspberry Pi OS, Ubuntu)
- Python 3.x
- FFmpeg
- RTL-SDR drivers

## Installation

1. Install dependencies:
   ```bash
   sudo apt-get install rtl-sdr librtlsdr-dev ffmpeg
   pip install -r requirements.txt
   ```
2. Compile rtl_fm:
   ```bash
   ./build.sh
   ```

## Running

### Quick Start

Start the web server:
```bash
./start_web_stream.sh
```
Access at **http://localhost:10100/**

### Running as a Service

1. Edit `rtl-fm-radio.service` to match your setup.
2. Install the service:
   ```bash
   ./radio-control.sh install
   ```
3. Control the service:
   ```bash
   ./radio-control.sh start
   ```
4. Enable auto-start (optional):
   ```bash
   sudo systemctl enable rtl-fm-radio
   ```

Access remotely via `http://YOUR_SERVER_IP:10100/`.

## REST API

| Endpoint              | Description                          |
|-----------------------|--------------------------------------|
| `/state`              | Get current radio state             |
| `/frequency/human/101.1M` | Tune to frequency              |
| `/demod/w`            | Set modulation                      |
| `/gain/human/28`      | Set gain in dB                      |
| `/stream.mp3`         | Live audio stream                   |

## Project Structure

```
├── rtl_fm_python_web.py    # Flask web server
├── rtl_fm_python_thread.py # RTL-SDR control thread
├── static/                 # HTML, CSS, JS files
└── docs/                   # Documentation
```

## Technical Notes

- **Audio streaming**: Raw audio → FFmpeg → MP3 → Network
- **State polling**: Updates every 500ms
- **CTCSS detection**: Goertzel algorithm (~125ms blocks)

## Credits & License

Built on [rtl_fm_python](https://github.com/th0ma5w/rtl_fm_python) and [RTL-SDR](https://github.com/steve-m/librtlsdr). Licensed under GPLv2. See [LICENSE](LICENSE) for details.
