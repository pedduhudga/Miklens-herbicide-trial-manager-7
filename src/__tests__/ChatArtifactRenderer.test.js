import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ChatArtifactRenderer from '../components/ChatArtifactRenderer.jsx';

// Mock chart.js so it doesn't fail in node test environment
vi.mock('chart.js/auto', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      destroy: vi.fn(),
      toBase64Image: vi.fn(() => 'data:image/png;base64,mock')
    }))
  };
});

// Mock react-router-dom useNavigate
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

describe('ChatArtifactRenderer - Interactive In-Chat Visual Artifacts', () => {
  it('handles empty or unknown artifact gracefully', () => {
    const result = ChatArtifactRenderer({ artifactType: null, data: null });
    expect(result).toBe(null);

    const unknown = ChatArtifactRenderer({ artifactType: 'unknown', data: {} });
    expect(unknown).toBe(null);
  });

  it('renders dose-response interactive simulator structure', () => {
    const data = {
      formula: 'Glycyl',
      target: 'Bermudagrass',
      ed50: 12.5,
      currentDosage: 10,
      unit: 'ml/L'
    };

    const element = ChatArtifactRenderer({ artifactType: 'doseresponse', data });
    expect(element).toBeDefined();
    expect(element.props.data.formula).toBe('Glycyl');
    expect(element.props.data.ed50).toBe(12.5);
  });

  it('renders 1-click launch trial widget structure', () => {
    const data = {
      formula: 'Goweed Ultra',
      dosage: '40 ml/L',
      target: 'Cynodon dactylon',
      notes: 'Recommended candidate'
    };

    const element = ChatArtifactRenderer({ artifactType: 'launch_trial', data });
    expect(element).toBeDefined();
    expect(element.props.data.formula).toBe('Goweed Ultra');
  });
});
