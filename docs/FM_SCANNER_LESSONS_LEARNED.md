# FM Band Scanner - Lessons Learned

This document captures the pitfalls and challenges encountered while developing the FM band scanner feature for the RTL-SDR web interface.

## Session Date: January 28, 2026

---

## 1. RTL-SDR Device Exclusivity

**Problem:** We initially tried using `rtl_power` for proper FFT-based spectrum analysis, which would have been more accurate than signal level measurements.

**Discovery:** `rtl_power` cannot run while `rtl_fm` is active - both require exclusive access to the RTL-SDR USB device.

**Solution:** Abandoned server-side `rtl_power` approach. Used client-side scanning with the existing `rtl_fm` connection, measuring `s_level` at each frequency.

**Lesson:** When working with SDR hardware, always consider device exclusivity. You can't run multiple tools simultaneously on the same device.

---

## 2. Gain API Confusion (`/gain/` vs `/gain/human/`)

**Problem:** Scanner was showing extremely low signal levels (max 6) when testing showed manual tuning with gain 28 produced signal level 79.

**Discovery:** The codebase has two different gain-setting functions:
- `/gain/<value>` → calls `lib_set_real_gain()` → sets raw value directly
- `/gain/human/<value>` → calls `lib_set_gain()` → multiplies by 10 first

RTL-SDR gains are in **tenths of dB**. So:
- `/gain/28` sets gain to 28 (2.8 dB) - way too low!
- `/gain/human/28` sets gain to 280 (28.0 dB) - correct!

**Solution:** Changed scanner to use `/gain/human/28` instead of `/gain/28`.

**Lesson:** Always verify API behavior, especially when there are similar endpoints. Don't assume parameter handling is consistent.

---

## 3. Signal Level ≠ Station Detection

**Problem:** Early scanner versions found many "stations" that were just noise or interference.

**Discovery:** The `s_level` value measures demodulated audio energy, not actual RF signal strength. Noise can appear as signal, especially when:
- Threshold is set too low
- Only checking a single frequency point
- Not accounting for FM broadcast bandwidth

**Solution:** Implemented bandwidth verification - real FM stations occupy ~150kHz, so we test ±50kHz and ±100kHz around each candidate. Real stations maintain strong signal across this range; noise doesn't.

**Lesson:** For FM broadcast detection, use domain knowledge (FM stations are wideband) rather than just signal amplitude.

---

## 4. AGC (Auto Gain Control) Instability

**Problem:** Same station would show wildly different readings (528 vs 200) on consecutive scans.

**Discovery:** AGC constantly adjusts gain based on current signal, making measurements inconsistent and non-comparable.

**Solution:** Set fixed gain (28 dB) before scanning, restore previous gain setting after.

**Lesson:** For any measurement/scanning operation, disable automatic adjustments that could affect readings.

---

## 5. UI Status Not Updating

**Problem:** Status text showed "Setter fast forsterkning (gain 28)..." throughout the entire scan.

**Discovery:** The `updateScanProgress()` function was updating `scanProgressText` but not `scanStatus` - these were different DOM elements.

**Solution:** Made `updateScanProgress()` update both elements.

**Lesson:** When debugging UI issues, verify which elements are actually being updated. Similar names don't mean same element.

---

## 6. Threshold Tuning is Tricky

**Problem:** First attempts either found 200+ false positives or missed real stations entirely.

**Iterations:**
1. Threshold too low → 201 hits (mostly noise)
2. Threshold too high → 4 hits (missed stations)
3. Used bottom 25% for noise floor + percentage above → better but still noisy
4. Added minimum SNR requirement → still some false positives
5. Added bandwidth verification → finally reliable

**Lesson:** Simple threshold-based detection is insufficient for FM scanning. Multi-stage verification (threshold → local maximum → SNR → bandwidth test) produces much better results.

---

## 7. Peak Detection Algorithm Issues

**Problem:** Early peak detection checked if a frequency was the highest within ±150kHz, which was too aggressive and filtered out legitimate stations.

**Solution:** Changed to only check immediate neighbors (previous and next frequency in scan). Then rely on bandwidth verification to filter false positives.

**Lesson:** Make each detection stage do one thing well. Don't try to be too clever in a single step.

---

## Summary of Final Scanner Algorithm

1. **Set fixed gain** (28 dB via `/gain/human/28`)
2. **Scan band** (87.5-108 MHz in 0.1 MHz steps)
3. **Sample each frequency** (5 samples averaged, 150ms settle time)
4. **Calculate noise floor** (average of bottom 25% of readings)
5. **Find peaks** (local maxima above threshold with minimum SNR)
6. **Bandwidth verification** (test ±50kHz and ±100kHz, need 3/4 to pass)
7. **Deduplicate** (keep strongest within 0.3 MHz)
8. **Restore previous gain setting**

---

## Tools/Approaches Considered But Not Used

| Approach | Why Not Used |
|----------|--------------|
| `rtl_power` FFT analysis | Device exclusivity with rtl_fm |
| RDS detection | Requires significant C code changes or new dependencies |
| Stereo pilot (19kHz) detection | Requires C code changes to expose baseband |
| Audio pattern analysis | Complex, would need Web Audio API processing |
| Known frequency database | Less flexible, requires maintenance |

---

## Future Improvements

1. **RDS integration** - Could add station name display when tuned (not for scanning)
2. **Configurable gain** - Let user choose scan gain value
3. **Adjustable sensitivity** - UI controls for threshold/minSNR
4. **Scan range selection** - Custom start/end frequencies
5. **Background scanning** - Scan without interrupting current listening
