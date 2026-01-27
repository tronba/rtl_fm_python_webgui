#!/bin/bash
# Start the web interface with audio streaming to browser
# Audio will stream as MP3 to http://localhost:10100/stream.mp3
# -g 0 enables auto gain
./rtl_fm_python_web.py -M wbfm -f 101.1M -g 0 -
