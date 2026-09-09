import { describe, it, expect } from 'vitest';
import { parseVoiceObservation, isSpeechRecognitionSupported } from '../utils/voiceParser.js';

describe('voiceParser - Hands-Free Voice Field Scout Parser', () => {
  it('detects browser speech recognition support safely', () => {
    // In node environment window may not have SpeechRecognition, should return boolean without throwing
    expect(typeof isSpeechRecognitionSupported()).toBe('boolean');
  });

  it('accurately parses complete field scouting speech into structured observation data', () => {
    const speech = "Plot 4, Goweed Ultra at 40 ml, Bermudagrass, 95 percent kill, no regrowth observed, slight leaf scorch on border, 34 degrees dry";
    
    const parsed = parseVoiceObservation(speech, {
      knownFormulations: ['Goweed Ultra', 'Glycyl', 'BPD'],
      knownTargets: ['Bermudagrass', 'Parthenium', 'Cyperus rotundus']
    });

    expect(parsed.plot).toBe('4');
    expect(parsed.formulation).toBe('Goweed Ultra');
    expect(parsed.dosage).toBe('40 ml');
    expect(parsed.target).toBe('Bermudagrass');
    expect(parsed.efficacy).toBe(95);
    expect(parsed.result).toBe('Excellent');
    expect(parsed.weather.temp).toBe('34');
    expect(parsed.weather.rain).toBe('dry');
    expect(parsed.notes.toLowerCase()).toContain('no regrowth');
  });

  it('correctly categorizes efficacy ratings according to agronomic standard', () => {
    const excellentSpeech = "Plot 1, Glycyl 10ml, 85% control, sunny";
    const goodSpeech = "Plot 2, 60 percent kill, dry";
    const fairSpeech = "Plot 3, 40 percent control, cloudy";
    const poorSpeech = "Plot 5, 20 percent efficacy, wet";

    expect(parseVoiceObservation(excellentSpeech).result).toBe('Excellent');
    expect(parseVoiceObservation(goodSpeech).result).toBe('Good');
    expect(parseVoiceObservation(fairSpeech).result).toBe('Fair');
    expect(parseVoiceObservation(poorSpeech).result).toBe('Poor');
  });

  it('extracts DAA, phytotoxicity, and weedControl dictionary', () => {
    const speech = "Plot 3 at 14 DAA, Bermudagrass, 90% control, crop injury 5 percent, leaf scorch, BBCH 14, 28 degrees";
    const parsed = parseVoiceObservation(speech, {
      knownTargets: ['Bermudagrass']
    });

    expect(parsed.plot).toBe('3');
    expect(parsed.daa).toBe(14);
    expect(parsed.efficacy).toBe(90);
    expect(parsed.phytotoxicityPct).toBe(5);
    expect(parsed.cropInjury.toLowerCase()).toContain('leaf scorch');
    expect(parsed.bbch).toBe(14);
    expect(parsed.weedControl['Bermudagrass']).toBe(90);
  });

  it('handles empty or malformed voice inputs gracefully', () => {
    const empty = parseVoiceObservation('');
    expect(empty.plot).toBe('');
    expect(empty.efficacy).toBe(null);
    expect(empty.result).toBe('');
  });
});
