import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { 
  Info, Check, X, HelpCircle, Layers, Grid, 
  Columns, Settings2, Sliders, ChevronDown, CheckCircle2 
} from 'lucide-react';

export default function TrialDesignGuideModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');

  const designTypes = [
    {
      id: 'pot',
      name: 'Pot Trial (Greenhouse)',
      fullName: 'Pot Trial & Greenhouse Layout Design',
      whenToUse: 'Primary choice for in-house pot screening, greenhouse benches, growth chambers, and nursery bioassays.',
      layout: 'Organized as a 2D matrix of Greenhouse Rows × Columns, with individual Pot Labels (e.g. R1 C1, R1 C2) and optional Block grouping.',
      example: {
        treatments: ['T1 = Control', 'T2 = Formulation A', 'T3 = Formulation B'],
        visual: [
          { block: 'Bench Row 1', plots: ['T1 (Pot 1)', 'T2 (Pot 2)', 'T3 (Pot 3)'] },
          { block: 'Bench Row 2', plots: ['T2 (Pot 4)', 'T3 (Pot 5)', 'T1 (Pot 6)'] },
          { block: 'Bench Row 3', plots: ['T3 (Pot 7)', 'T1 (Pot 8)', 'T2 (Pot 9)'] }
        ]
      },
      advantages: [
        'Purpose-built for indoor bench spaces, pots, growth cabinets, and polyhouses.',
        'Supports stripe layout, randomized rows, and balanced pot assignment.',
        'Captures individual pot metrics: Plant Height, Branches, Flowers, Fruit Count, and Yield (g/pot).'
      ],
      recommendedFor: 'In-house screening, greenhouse pot bioassays, nursery trials, and growth chamber evaluation.'
    },
    {
      id: 'crd',
      name: 'CRD (Completely Random)',
      fullName: 'Completely Randomized Design',
      whenToUse: 'Indoor pot trials, growth chambers, laboratory incubator studies, or highly uniform greenhouse benches.',
      layout: 'Treatments are assigned to pots or plots completely at random with no grouping/blocking.',
      example: {
        treatments: ['T1 = Control', 'T2 = NPK Powder', 'T3 = NPK Liquid'],
        plots: ['T2 (Pot 1)', 'T1 (Pot 2)', 'T3 (Pot 3)', 'T2 (Pot 4)', 'T1 (Pot 5)']
      },
      advantages: [
        'Simplest experimental design to set up in laboratory and greenhouse.',
        'Maximum degrees of freedom for error term (increases test power).',
        'Flexible: Can have different number of replicates per treatment.'
      ],
      disadvantages: [
        'Poor choice when ambient bench microclimates vary (heating/cooling gradients, edge effects).'
      ],
      recommendedFor: 'Pot experiments, greenhouse bioassays, petri dish screening, and laboratory trials.'
    },
    {
      id: 'rcbd',
      name: 'RCBD (Block / Bench)',
      fullName: 'Randomized Complete Block Design',
      whenToUse: 'Greenhouse benches with light/temperature gradients, or standard field verification trials.',
      layout: 'Each block (bench or replication) contains all treatments exactly once. Treatments are randomized within each block.',
      example: {
        treatments: ['T1 = Control', 'T2 = NPK Powder', 'T3 = NPK Liquid'],
        visual: [
          { block: 'Bench 1', plots: ['T2', 'T1', 'T3'] },
          { block: 'Bench 2', plots: ['T3', 'T2', 'T1'] },
          { block: 'Bench 3', plots: ['T1', 'T3', 'T2'] }
        ]
      },
      advantages: [
        'Controls and isolates directional bench/light/moisture variability.',
        'Simple and straightforward statistical ANOVA analysis.',
        'Standard benchmark for both greenhouse benches and field verification.'
      ],
      recommendedFor: 'Pot trials grouped by bench/shelf, and field verification trials for fertilizers and biostimulants.'
    },
    {
      id: 'split',
      name: 'Split-Plot',
      fullName: 'Split Plot Design',
      whenToUse: 'When testing two or more factors where one factor is difficult/expensive to apply (e.g., irrigation, tillage) and another is easy (e.g., fertilizer rate, variety).',
      layout: 'Main plots contain levels of the hard-to-apply factor. Each main plot is then subdivided into subplots containing levels of the secondary factor.',
      example: {
        mainFactor: 'Irrigation (I1 = Normal, I2 = Deficit)',
        subFactor: 'Biofertilizer (B1 = Control, B2 = Mikrise, B3 = Mikrise + Humic)',
        visual: [
          { main: 'Irrigation Level I1', subplots: ['B1', 'B2', 'B3'] },
          { main: 'Irrigation Level I2', subplots: ['B3', 'B1', 'B2'] }
        ]
      },
      recommendedFor: 'Testing irrigation × fertilizer interactions or tillage × herbicide efficacy.'
    },
    {
      id: 'lattice',
      name: 'Alpha-Lattice',
      fullName: 'Alpha Lattice Design',
      whenToUse: 'Large varietal screening or breeding trials with many treatments (typically >20 treatments/varieties).',
      layout: 'Incomplete block design where treatments are grouped into smaller, highly homogeneous sub-blocks within each replication to reduce error.',
      example: {
        description: 'For screening 30 tomato varieties. RCBD would require a huge block which has too much variation. Alpha-lattice splits these 30 varieties into 6 smaller incomplete blocks of 5 plots each.'
      },
      advantages: [
        'Significantly higher precision than RCBD for large numbers of treatments.',
        'Effectively filters out spatial soil variations within blocks.'
      ],
      recommendedFor: 'Variety screening, crop breeding programs, and large germplasm evaluations.'
    },
    {
      id: 'factorial',
      name: 'Factorial',
      fullName: 'Factorial Design',
      whenToUse: 'When you want to study the individual and combined interaction effects of two or more factors.',
      layout: 'All possible combinations of factor levels are tested. Usually arranged as an RCBD structure.',
      example: {
        factors: [
          'Factor A (Biofertilizer): A1 = None, A2 = Applied',
          'Factor B (Humic Acid): B1 = None, B2 = Applied'
        ],
        combinations: ['A1B1 (Control)', 'A1B2 (Humic Only)', 'A2B1 (Biofertilizer Only)', 'A2B2 (Combined)']
      },
      advantages: [
        'Measures interactions (e.g., does biofertilizer work better with humic acid?).',
        'Saves resources by evaluating multiple factors simultaneously.'
      ],
      recommendedFor: 'Studying synergies and product combinations (e.g., Biofertilizer × Humic Acid).'
    },
    {
      id: 'strip',
      name: 'Strip-Plot',
      fullName: 'Strip Plot Design',
      whenToUse: 'Two-factor trials where both factors are applied in strips perpendicularly (e.g., mechanized planting/tillage in one direction, and sprinkler irrigation in another).',
      layout: 'Horizontal strips for Factor A and vertical strips for Factor B intersect to form the plot layout.',
      example: {
        description: 'Horizontal strips receive different fertilizer treatments using bulk spreaders, while vertical strips receive irrigation levels. The crossing intersections become the trial units.'
      },
      recommendedFor: 'Large-scale mechanized field trials.'
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Trial Design & Layout Guide" maxWidth="max-w-4xl">
      <div className="flex flex-col gap-5">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview & Comparison
          </button>
          {designTypes.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveTab(d.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
                activeTab === d.id
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="text-slate-700 leading-relaxed text-sm">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
                <Info className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-emerald-950">Choosing the Right Layout</h4>
                  <p className="text-emerald-800 text-xs mt-1">
                    This platform is specifically optimized for **in-house, greenhouse, growth chamber, and pot-scale trials**, while maintaining full support for commercial field evaluations. Selecting an appropriate layout ensures statistical validity and maximizes statistical power.
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100 text-xs uppercase">
                      <th className="p-3">Design Type</th>
                      <th className="p-3">Full Name</th>
                      <th className="p-3">When to Use</th>
                      <th className="p-3">Ideal Crop / Trial Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {designTypes.map((d, i) => (
                      <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-semibold text-slate-800">{d.name}</td>
                        <td className="p-3 text-slate-600">{d.fullName}</td>
                        <td className="p-3 text-slate-600 max-w-xs">{d.whenToUse}</td>
                        <td className="p-3 font-medium text-emerald-700">{d.recommendedFor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recommended guidelines */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Quick Guidelines for In-House & Field Trials
                </h4>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
                  <li>Use <strong className="text-slate-800">Pot Trial (Greenhouse Grid)</strong> as the primary standard for indoor greenhouse pot screening, bench arrangements, and growth chamber bioassays.</li>
                  <li>Use <strong className="text-slate-800">CRD (Completely Random)</strong> for incubator tests, petri dish seed germination assays, or uniform growth cabinets with no directional light/temp gradient.</li>
                  <li>Use <strong className="text-slate-800">RCBD (Block / Bench)</strong> when greenhouse benches have edge/cooling/lighting gradients, or for commercial field verification trials.</li>
                  <li>Use <strong className="text-slate-800">Factorial & Split-Plot</strong> for multi-factor interaction experiments (e.g., Water Regimes × Biostimulant Doses).</li>
                </ul>
              </div>
            </div>
          )}

          {designTypes.map(d => {
            if (activeTab !== d.id) return null;
            return (
              <div key={d.id} className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    {d.fullName}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {d.name}
                    </span>
                  </h3>
                  <p className="text-slate-500 text-xs mt-1">{d.whenToUse}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left Column: Rules & Details */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Layout & Setup</h4>
                      <p className="text-slate-600 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {d.layout}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-2">Advantages</h4>
                      <ul className="space-y-1.5">
                        {d.advantages?.map((adv, idx) => (
                          <li key={idx} className="flex gap-2 items-start text-xs text-slate-600">
                            <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <span>{adv}</span>
                          </li>
                        ))}
                        {d.disadvantages?.map((dis, idx) => (
                          <li key={idx} className="flex gap-2 items-start text-xs text-slate-600">
                            <X className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                            <span>{dis}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs uppercase text-slate-400 tracking-wider mb-1">Recommended Crops / Trials</h4>
                      <p className="text-emerald-700 font-semibold text-xs">{d.recommendedFor}</p>
                    </div>
                  </div>

                  {/* Right Column: Visual Layout / Example */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Example Layout & Mapping</h4>
                    
                    {d.id === 'rcbd' && d.example && (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500">
                          <strong>Treatments:</strong> {d.example.treatments.join(', ')} (3 Replications)
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {d.example.visual.map((v, idx) => (
                            <div key={idx} className="border bg-white rounded-lg p-2 text-center shadow-sm">
                              <div className="font-bold text-slate-500 border-b pb-1 text-[10px] mb-1.5">{v.block}</div>
                              <div className="space-y-1">
                                {v.plots.map((p, pIdx) => (
                                  <div key={pIdx} className="bg-emerald-50 text-emerald-800 text-xs font-semibold py-1 rounded border border-emerald-100">
                                    {p}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {d.id === 'crd' && d.example && (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500">
                          <strong>Treatments:</strong> {d.example.treatments.join(', ')} (No Block Groups)
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {d.example.plots.map((p, idx) => (
                            <div key={idx} className="border bg-white rounded-lg p-2 text-center shadow-sm">
                              <div className="text-[10px] text-slate-400 mb-0.5">Plot {idx+1}</div>
                              <div className="bg-amber-50 text-amber-800 text-xs font-bold py-1 rounded border border-amber-100">
                                {p}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {d.id === 'split' && d.example && (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500">
                          <strong>Main factor:</strong> {d.example.mainFactor}<br />
                          <strong>Sub factor:</strong> {d.example.subFactor}
                        </div>
                        <div className="space-y-2">
                          {d.example.visual.map((v, idx) => (
                            <div key={idx} className="border bg-white rounded-lg p-2 shadow-sm">
                              <div className="font-bold text-slate-600 text-[10px] mb-1.5">{v.main}</div>
                              <div className="grid grid-cols-3 gap-2">
                                {v.subplots.map((s, sIdx) => (
                                  <div key={sIdx} className="bg-blue-50 text-blue-800 text-xs font-bold py-1 text-center rounded border border-blue-100">
                                    {s}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {d.id === 'factorial' && d.example && (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500">
                          <strong>Factors:</strong>
                          <ul className="list-disc pl-4 mt-1">
                            {d.example.factors.map((f, fIdx) => <li key={fIdx}>{f}</li>)}
                          </ul>
                        </div>
                        <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border">
                          <strong>All treatment combinations are generated:</strong>
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            {d.example.combinations.map((c, cIdx) => (
                              <div key={cIdx} className="bg-slate-100 text-slate-700 p-1.5 text-center font-semibold rounded text-[10px]">
                                {c}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {(d.id === 'lattice' || d.id === 'strip') && (
                      <div className="text-slate-600 text-xs flex flex-col justify-center h-full min-h-[140px] text-center">
                        <p className="font-medium">{d.example.description}</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm transition-colors"
          >
            Close Guide
          </button>
        </div>

      </div>
    </Modal>
  );
}
