rtl_fm_python
=============

An API and web application to interact with a running instance of RTL_FM

<img src="http://th0ma5w.github.io/rtl_fm_python.gif" alt="Screenshot" title="rtl_fm_python" />

# What

This is a Python library built upon the RTL-SDR project and allows you to use the 
RTL-SDR dongle to tune in arbitrary stations either with a simple web application
running on a built-in server, or programmatically with Python or any language using
the REST API provided.

- http://sdr.osmocom.org/trac/wiki/rtl-sdr
- http://www.reddit.com/r/rtlsdr

# Why

I wanted a minimalist remote control for demodulated audio coming from the usb stick
and something that could also provide that functionality on the Raspberry PI, or
allow for control of multiple dongles through web scripting and VPNs.

# Features

- Based on the rtl_fm utility from the RTL-SDR Project https://github.com/steve-m/librtlsdr
- Drop in replacement for rtl_fm
- Live web interface based on React http://facebook.github.io/react/ and Flask http://flask.pocoo.org/
- RESTful API
- Change frequency, demodulation, and gain while running
- Read the RMS signal level
- Interact with rtl_fm with Python

# License

GPLv2

# How to Build

## System Requirements

- RTL-SDR software and drivers
- Python 3.x
- FFmpeg (for audio streaming to browser)
- GCC and build tools

## Installation Steps

### 1. Install RTL-SDR software

On Debian/Ubuntu/Raspberry Pi OS:

    sudo apt-get install rtl-sdr librtlsdr-dev

### 2. Install FFmpeg

    sudo apt-get install ffmpeg

### 3. Install Python dependencies

    sudo pip install -r requirements.txt

Or manually:

    sudo pip install flask

### 4. Compile rtl_fm_python

Compile and link the modified rtl_fm source:

    ./build.sh

If you have problems let me know. I may not be able to help as I'm not very experienced 
with building C applications.

# Issues

- Can crash, probably
- Works best if started with WBFM modulation and sample rates if you're going to be switching around demodulation.
- May get out of sync with the features of rtl_fm due to my time and interest. Pull requests accepted!

# How to Run

## Web Interface & API with Audio Streaming

Use the script *rtl_fm_python_web.py* as a replacement for *rtl_fm*. The audio will be streamed as MP3 to your browser instead of playing through local speakers.

**Requirements:**
- FFmpeg must be installed and available in PATH

**Running:**

    ./rtl_fm_python_web.py -M wbfm -f 101.1M -

Or use the included script:

    ./start_web_stream.sh

By default the application runs at http://127.0.0.1:10100/

The web interface includes:
- Live audio streaming (MP3 format, plays in browser)
- Frequency control
- Modulation switching
- Gain control
- Signal strength meter

**Legacy (local speaker output):**

If you want to pipe audio to local speakers instead of streaming to browser, use:

    ./rtl_fm_python_web.py -M wbfm -f 101.1M - |aplay -r 32000 -f S16_LE -t raw -c 1

## Python interactive mode

Use the script *rtl_fm_python_thread.py* with flags identical to the rtl_fm command. When
you start the application you will be placed into an interactive shell where you can
issue commands.

# REST API

## /state

Returns the current state of the device, for example:

	{
	  "autogain": true,
	  "freq_i": 102500000,
	  "freq_s": "102.5M",
	  "gain": -100,
	  "mod": "w",
	  "s_level": 14
	}

Modulation modes are denoted as a single letter, w for WBFM, f for FM, a for AM, l for LSB, u for USB, and r for RAW.

## /frequency/ *value*

Tune the device to a specific integer frequency. For example:

    /frequency/101100000
    /frequency/144390000
    /frequency/162550000

## /frequency/human/ *value*

Tune to a human readable string representation of a frequency. For example:

    /frequency/human/101.1M
    /frequency/human/144390.0K
    /frequency/human/0.16255G

## /demod/ *value*

Switch the modulation. For example:

    /demod/w
    /demod/f
    /demod/a
    /demod/l
    /demod/u
    /demod/r

## /gain/list

Returns the real gain values available. For example:

    {
      "gains": [
        -10,
        15,
        40,
        65,
        90,
        115,
        140,
        165,
        190,
        215,
        240,
        290,
        340,
        420
      ]
    }


## /gain/ *value*

Set a real gain value for the device. For example:

    /gain/-10
    /gain/115
    /gain/340
    
This call turns off automatic gain.

## /gain/human/ *value*

Sets the gain given an arbitrary number scale and tries to find a gain that matches. For example:

    /gain/human/0
    /gain/human/40

This call turns off automatic gain.

## /gain/auto

Sets the device to be in auto gain mode. The gain may read -100 in the above state call.

## /stream.mp3

Streams live demodulated audio as MP3. Use in an HTML5 audio element:

    <audio controls autoplay>
        <source src="/stream.mp3" type="audio/mpeg">
    </audio>

# Python Functions

## Device functions

    get_s_level()
    get_frequency()
    set_demod_fm()
    set_demod_wbfm()
    set_demod_am()
    set_demod_lsb()
    set_demod_usb()
    set_demod_raw()
    set_frequency(frequency)
    set_squelch(level) #untested
    get_demod()
    set_demod(modulation) #w,f,a,l,u,r
    get_gains()
    get_gain()
    set_gain(value)
    get_auto_gain()
    set_gain_human(human_value)
    set_freq_human(human_frequency)
    get_freq_human()

## Utility functions
	
    str_to_freq(human_frequency)
    freq_to_str(frequency)
    printstderr(text) 

# Thanks

The rtl-sdr team and community for being awesome.



