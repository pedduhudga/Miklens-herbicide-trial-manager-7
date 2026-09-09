import { describe, it, expect } from 'vitest';
import { sanitizeAiContent } from '../utils/sanitize.js';

describe('sanitizeAiContent - Professional Markdown Chat Renderer', () => {
  it('converts markdown table into styled HTML table structure', () => {
    const markdown = `
### 🏆 Top-Performing Herbicide Formulation Comparison

| Formulation | Trial Link | Target Weed | Dosage | Max Efficacy | Control Duration |
|---|---|---|---|---|---|
| Glycyl | [🔬 Trial: Glycyl @ 10ml (TR-01)](#/trials?focus=TR-01) | Bermudagrass | 10ml | 100% | 38d-FINALIZED |
| BPD | [🔬 Trial: BPD @ 5ml (TR-02)](#/trials?focus=TR-02) | Bermuda Grass | 5ml | 100% | 38d-FINALIZED |
`;

    const html = sanitizeAiContent(markdown);

    // Verifies markdown table is converted to real HTML table
    expect(html).toContain('<table class="w-full text-xs text-left border-collapse min-w-[550px]">');
    expect(html).toContain('<th class="px-3.5 py-2.5 font-bold text-slate-800');
    expect(html).toContain('<td class="px-3.5 py-2.5 text-slate-700');
    expect(html).toContain('Formulation');
    expect(html).toContain('Glycyl');

    // Verifies headers are styled
    expect(html).toContain('<h3 class="text-sm md:text-base font-bold text-emerald-950');

    // Verifies trial link is decorated with trial-redirect-link badge
    expect(html).toContain('class="trial-redirect-link inline-flex items-center gap-1.5 font-bold');
    expect(html).toContain('data-trial-id="TR-01"');
    expect(html).toContain('href="#/trials?focus=TR-01"');
  });

  it('converts bullet points into styled lists', () => {
    const markdown = `
- Adequate water volume is critical
- Apply during active vegetative weed growth
`;
    const html = sanitizeAiContent(markdown);
    expect(html).toContain('<ul class="list-disc list-inside space-y-1.5');
    expect(html).toContain('<li class="leading-relaxed">');
  });
});
