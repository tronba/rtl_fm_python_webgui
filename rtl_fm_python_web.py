#!/usr/bin/env python3
# rtl-sdr, turns your Realtek RTL2832 based DVB dongle into a SDR receiver
# Copyright (C) 2012 by Steve Markgraf <steve@steve-m.de>
# Copyright (C) 2012 by Hoernchen <la@tfc-server.de>
# Copyright (C) 2012 by Kyle Keen <keenerd@gmail.com>
# Copyright (C) 2013 by Elias Oenal <EliasOenal@gmail.com>
# Copyright (C) 2014 by Thomas Winningham <winningham@gmail.com>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

from flask import Flask, jsonify, url_for, redirect, Response, request
from rtl_fm_python_thread import *
from rtl_fm_python_common import set_audio_output, get_squelch, set_squelch
import subprocess
import threading
import queue
import tempfile
import os
import csv
from datetime import datetime

# Audio streaming setup
audio_queue = queue.Queue(maxsize=100)
ffmpeg_process = None

def start_audio_stream():
	"""Start FFmpeg process to convert raw audio to MP3"""
	global ffmpeg_process
	# Start FFmpeg to convert raw S16_LE PCM to MP3
	# Input: 32kHz, 16-bit signed little-endian, mono
	# Output: MP3 stream
	try:
		ffmpeg_process = subprocess.Popen([
			'ffmpeg',
			'-f', 's16le',           # Input format
			'-ar', '32000',          # Sample rate
			'-ac', '1',              # Mono
			'-i', 'pipe:0',          # Read from stdin
			'-f', 'mp3',             # Output format
			'-b:a', '128k',          # Bitrate
			'-',                     # Output to stdout
		], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
	except FileNotFoundError:
		print("ERROR: FFmpeg not found. Please install it:", file=sys.stderr)
		print("  sudo apt-get install ffmpeg", file=sys.stderr)
		sys.exit(1)
	
	# Thread to read from FFmpeg and put in queue
	def ffmpeg_reader():
		try:
			while True:
				chunk = ffmpeg_process.stdout.read(4096)
				if not chunk:
					break
				try:
					audio_queue.put(chunk, block=False)
				except queue.Full:
					# Drop old data if queue is full
					try:
						audio_queue.get_nowait()
						audio_queue.put(chunk, block=False)
					except:
						pass
		except:
			pass
	
	reader_thread = threading.Thread(target=ffmpeg_reader, daemon=True)
	reader_thread.start()
	
	# Redirect rtl_fm audio output to FFmpeg
	set_audio_output(ffmpeg_process.stdin)

# Start audio streaming before RTL_FM thread
start_audio_stream()
make_rtl_fm_thread(block=False)

app = Flask(__name__)

@app.route('/')
def web_root():
	return redirect(url_for('static', filename='index.html'))

@app.route('/state')
def web_state():
	return jsonify(
		{
			's_level'	: get_s_level(),
			'freq_s' 	: get_freq_human(),
			'freq_i' 	: get_frequency(),
			'mod'		: get_demod(),
			'gain'		: get_gain(),
			'autogain'	: get_auto_gain(),
			'squelch'	: get_squelch()
		})

@app.route('/frequency/<int:f>')
def web_set_frequency(f):
	set_frequency(f)
	return web_state()

@app.route('/frequency/human/<f>')
def web_set_human_frequency(f):
	set_freq_human(str(f))
	return web_state()

@app.route('/demod/<c>')
def web_set_demod(c):
	set_demod(str(c))
	return web_state()

@app.route('/gain/<g>')
def web_set_gain(g):
	gain = int(str(g))
	set_gain(gain)
	return web_state()

@app.route('/gain/human/<g>')
def web_set_gain_human(g):
	gain = int(str(g))
	set_gain_human(gain)
	return web_state()

@app.route('/gain/auto')
def web_set_auto_gain():
	set_auto_gain()
	return web_state()

@app.route('/squelch/<int:level>')
def web_set_squelch(level):
	set_squelch(level)
	return web_state()

@app.route('/gain/list')
def web_get_gain_list():
	l=get_gains()
	return jsonify({'gains':l})

@app.route('/scan/fm')
def web_scan_fm():
	"""
	Scan FM broadcast band using rtl_power for proper spectrum analysis.
	This uses FFT to measure actual power levels - much more reliable than signal strength.
	
	Query params:
	  - start: Start frequency in MHz (default 87.5)
	  - end: End frequency in MHz (default 108.0)
	  - threshold: dB above noise floor to detect station (default 10)
	"""
	start_mhz = float(request.args.get('start', 87.5))
	end_mhz = float(request.args.get('end', 108.0))
	threshold_db = float(request.args.get('threshold', 10))
	
	# Convert to Hz for rtl_power
	start_hz = int(start_mhz * 1e6)
	end_hz = int(end_mhz * 1e6)
	
	# Create temp file for output
	with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
		temp_file = f.name
	
	try:
		# Run rtl_power
		# -f start:end:bin_size - frequency range and FFT bin size
		# -g gain - fixed gain (avoid AGC issues)
		# -i integration_time - seconds to integrate (longer = more accurate)
		# -1 single shot mode
		# -e time - how long to run
		result = subprocess.run([
			'rtl_power',
			'-f', f'{start_hz}:{end_hz}:25k',  # 25kHz bins for FM
			'-g', '28',                         # Fixed gain
			'-i', '1',                          # 1 second integration
			'-1',                               # Single shot
			'-e', '10s',                        # Run for 10 seconds max
			temp_file
		], capture_output=True, text=True, timeout=30)
		
		# Parse the CSV output
		stations = []
		all_powers = []
		freq_power = {}
		
		if os.path.exists(temp_file):
			with open(temp_file, 'r') as f:
				reader = csv.reader(f)
				for row in reader:
					if len(row) < 7:
						continue
					# rtl_power CSV format:
					# date, time, hz_low, hz_high, hz_step, samples, dB1, dB2, ...
					try:
						hz_low = float(row[2])
						hz_step = float(row[4])
						powers = [float(x) for x in row[6:] if x.strip()]
						
						for i, power_db in enumerate(powers):
							freq_hz = hz_low + (i * hz_step)
							freq_mhz = freq_hz / 1e6
							all_powers.append(power_db)
							
							# Keep the highest power for each frequency
							if freq_mhz not in freq_power or power_db > freq_power[freq_mhz]:
								freq_power[freq_mhz] = power_db
					except (ValueError, IndexError):
						continue
		
		if not all_powers:
			return jsonify({
				'error': 'No data from rtl_power',
				'stations': [],
				'stderr': result.stderr
			})
		
		# Calculate noise floor (median of all power readings)
		sorted_powers = sorted(all_powers)
		noise_floor = sorted_powers[len(sorted_powers) // 2]
		
		# Find peaks above threshold
		threshold = noise_floor + threshold_db
		
		# Sort frequencies and find local maxima
		sorted_freqs = sorted(freq_power.keys())
		
		for i, freq in enumerate(sorted_freqs):
			power = freq_power[freq]
			
			# Check if above threshold
			if power < threshold:
				continue
			
			# Check if local maximum (higher than neighbors)
			is_peak = True
			# Check ±200kHz neighbors (FM stations are 200kHz apart minimum)
			for j, other_freq in enumerate(sorted_freqs):
				if other_freq == freq:
					continue
				if abs(other_freq - freq) < 0.15:  # Within 150kHz
					if freq_power[other_freq] > power:
						is_peak = False
						break
			
			if is_peak:
				stations.append({
					'frequency': round(freq, 1),
					'power_db': round(power, 1),
					'snr': round(power - noise_floor, 1)
				})
		
		# Sort by power (strongest first)
		stations.sort(key=lambda x: x['power_db'], reverse=True)
		
		return jsonify({
			'stations': stations,
			'noise_floor': round(noise_floor, 1),
			'threshold': round(threshold, 1),
			'total_bins': len(freq_power)
		})
		
	except subprocess.TimeoutExpired:
		return jsonify({'error': 'Scan timed out', 'stations': []})
	except FileNotFoundError:
		return jsonify({
			'error': 'rtl_power not found. Install with: sudo apt-get install rtl-sdr',
			'stations': []
		})
	except Exception as e:
		return jsonify({'error': str(e), 'stations': []})
	finally:
		# Clean up temp file
		try:
			os.unlink(temp_file)
		except:
			pass

@app.route('/stream.mp3')
def stream_audio():
	"""Stream MP3 audio to browser"""
	def generate():
		try:
			while True:
				chunk = audio_queue.get(timeout=5.0)
				yield chunk
		except queue.Empty:
			pass
	
	response = Response(generate(), mimetype='audio/mpeg')
	response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
	response.headers['Pragma'] = 'no-cache'
	response.headers['Expires'] = '0'
	response.headers['X-Content-Type-Options'] = 'nosniff'
	return response

if __name__ == '__main__':
	app.run(host='0.0.0.0',port=10100)
	stop_thread()

