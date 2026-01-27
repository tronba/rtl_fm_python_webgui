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

from flask import Flask, jsonify, url_for, redirect, Response
from rtl_fm_python_thread import *
from rtl_fm_python_common import set_audio_output
import subprocess
import threading
import queue

# Audio streaming setup
audio_queue = queue.Queue(maxsize=100)
ffmpeg_process = None

def start_audio_stream():
	"""Start FFmpeg process to convert raw audio to MP3"""
	global ffmpeg_process
	# Start FFmpeg to convert raw S16_LE PCM to MP3
	# Input: 32kHz, 16-bit signed little-endian, mono
	# Output: MP3 stream
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
			'autogain'	: get_auto_gain()
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

@app.route('/gain/list')
def web_get_gain_list():
	l=get_gains()
	return jsonify({'gains':l})

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
	
	return Response(generate(), mimetype='audio/mpeg')

if __name__ == '__main__':
	app.run(host='0.0.0.0',port=10100)
	stop_thread()

