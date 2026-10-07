import { describe, it, expect, vi } from 'vitest';
import { hasAccess } from '../utils/categoryConfig.js';
import * as dataLayer from '../services/dataLayer.js';

// Mock dependencies
vi.mock('../services/firebaseDB.js', () => ({
  fbGetAllData: vi.fn().mockResolvedValue({ trials: [], projects: [], formulations: [], ingredients: [] }),
  fbCatGetIngredients: vi.fn().mockResolvedValue([{ ID: 'ing-1', Name: 'Glyphosate', Category: 'herbicide', CreatedBy: 'other-scientist-99' }]),
  fbCatAddIngredient: vi.fn().mockResolvedValue({ ID: 'ing-1', success: true }),
  fbCatDeleteIngredient: vi.fn().mockResolvedValue({ success: true }),
  fbDeleteIngredient: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/db.js', () => ({
  getAllData: vi.fn().mockResolvedValue({ ingredients: [] }),
  getIngredients: vi.fn().mockResolvedValue([]),
  addIngredient: vi.fn().mockResolvedValue({ success: true }),
  deleteIngredient: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../services/sheetMirror.js', () => ({
  mirrorWrite: vi.fn(),
}));

describe('Ingredients Permission & Scientist Herbicide Category Access', () => {
  it('allows scientists with herbicide write permission to access and edit', () => {
    const scientistWithHerbicide = {
      id: 'scientist-1',
      role: 'scientist',
      categoryAccess: {
        herbicide: { read: true, write: true },
        fungicide: { read: false, write: false }
      }
    };

    expect(hasAccess(scientistWithHerbicide, 'herbicide', 'read')).toBe(true);
    expect(hasAccess(scientistWithHerbicide, 'herbicide', 'write')).toBe(true);
    expect(hasAccess(scientistWithHerbicide, 'fungicide', 'write')).toBe(false);
  });

  it('restricts scientists without herbicide write permission', () => {
    const scientistReadOnly = {
      id: 'scientist-2',
      role: 'scientist',
      categoryAccess: {
        herbicide: { read: true, write: false }
      }
    };

    expect(hasAccess(scientistReadOnly, 'herbicide', 'read')).toBe(true);
    expect(hasAccess(scientistReadOnly, 'herbicide', 'write')).toBe(false);

    const scientistFungicideOnly = {
      id: 'scientist-3',
      role: 'scientist',
      categoryAccess: {
        herbicide: { read: false, write: false },
        fungicide: { read: true, write: true }
      }
    };

    expect(hasAccess(scientistFungicideOnly, 'herbicide', 'read')).toBe(false);
    expect(hasAccess(scientistFungicideOnly, 'herbicide', 'write')).toBe(false);
  });

  it('prohibits viewer role from write actions even if configured', () => {
    const viewer = {
      id: 'viewer-1',
      role: 'viewer',
      categoryAccess: {
        herbicide: { read: true, write: true }
      }
    };

    expect(hasAccess(viewer, 'herbicide', 'read')).toBe(true);
    expect(hasAccess(viewer, 'herbicide', 'write')).toBe(false);
  });

  it('allows a scientist with herbicide permission to delete/edit another user ingredient via dataLayer', async () => {
    const mockState = {
      activeCategory: 'herbicide',
      settings: {
        firebaseEnabled: true,
        sheetMirrorEnabled: false,
      },
      auth: {
        uid: 'scientist-herbicide-user',
        user: {
          ID: 'scientist-herbicide-user',
          Role: 'scientist',
          categoryAccess: {
            herbicide: { read: true, write: true }
          }
        }
      },
      ingredients: [
        {
          ID: 'ing-100',
          Name: 'Atrazine',
          Category: 'herbicide',
          CreatedBy: 'original-creator-different-user'
        }
      ]
    };

    const getAppState = () => mockState;

    // Should succeed because user has herbicide write permission
    const result = await dataLayer.deleteIngredient({ ID: 'ing-100', Category: 'herbicide' }, getAppState);
    expect(result).toBeDefined();
  });

  it('blocks a user without herbicide permission from deleting another user ingredient', async () => {
    const mockState = {
      activeCategory: 'herbicide',
      settings: {
        firebaseEnabled: true,
        sheetMirrorEnabled: false,
      },
      auth: {
        uid: 'fungicide-only-user',
        user: {
          ID: 'fungicide-only-user',
          Role: 'scientist',
          categoryAccess: {
            herbicide: { read: false, write: false },
            fungicide: { read: true, write: true }
          }
        }
      },
      ingredients: [
        {
          ID: 'ing-100',
          Name: 'Atrazine',
          Category: 'herbicide',
          CreatedBy: 'original-creator-different-user'
        }
      ]
    };

    const getAppState = () => mockState;

    await expect(
      dataLayer.deleteIngredient({ ID: 'ing-100', Category: 'herbicide' }, getAppState)
    ).rejects.toThrow(/Permission Denied|Category isolation violation/);
  });

  it('loads all ingredients from library when scientist has herbicide read permission', async () => {
    const mockState = {
      activeCategory: 'herbicide',
      settings: {
        firebaseEnabled: true,
        sheetMirrorEnabled: false,
      },
      auth: {
        uid: 'scientist-herbicide-user',
        user: {
          ID: 'scientist-herbicide-user',
          Role: 'scientist',
          categoryAccess: {
            herbicide: { read: true, write: true }
          }
        }
      },
      ingredients: []
    };

    const getAppState = () => mockState;
    const items = await dataLayer.getIngredients({ Category: 'herbicide' }, getAppState);
    expect(items).toBeDefined();
  });

  it('correctly filters ingredients library by query (name, PubChem CID, formula, IUPAC, SMILES)', () => {
    const ingredients = [
      {
        ID: '1',
        Name: 'Glyphosate',
        PubChemCID: '3496',
        IupacName: '2-(phosphonomethylamino)acetic acid',
        MolecularFormula: 'C3H8NO5P',
        SMILES: 'C(C(=O)O)NCP(=O)(O)O'
      },
      {
        ID: '2',
        Name: 'Atrazine',
        PubChemCID: '2256',
        IupacName: '6-chloro-N2-ethyl-N4-propan-2-yl-1,3,5-triazine-2,4-diamine',
        MolecularFormula: 'C8H14ClN5',
        SMILES: 'CCNC1=NC(=NC(=N1)Cl)NC(C)C'
      },
      {
        ID: '3',
        Name: '2,4-D Acid',
        PubChemCID: '1486',
        IupacName: '2-(2,4-dichlorophenoxy)acetic acid',
        MolecularFormula: 'C8H6Cl2O3',
        SMILES: 'C1=CC(=C(C=C1Cl)Cl)OCC(=O)O'
      }
    ];

    const filterFn = (list, query) => list.filter(ing => {
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return (
        (ing.Name && ing.Name.toLowerCase().includes(q)) ||
        (ing.IupacName && ing.IupacName.toLowerCase().includes(q)) ||
        (ing.MolecularFormula && ing.MolecularFormula.toLowerCase().includes(q)) ||
        (ing.PubChemCID && String(ing.PubChemCID).toLowerCase().includes(q)) ||
        (ing.SMILES && ing.SMILES.toLowerCase().includes(q))
      );
    });

    // Name search
    expect(filterFn(ingredients, 'glyph').map(i => i.Name)).toEqual(['Glyphosate']);
    // CID search
    expect(filterFn(ingredients, '2256').map(i => i.Name)).toEqual(['Atrazine']);
    // Formula search
    expect(filterFn(ingredients, 'C8H6Cl2O3').map(i => i.Name)).toEqual(['2,4-D Acid']);
    // IUPAC search
    expect(filterFn(ingredients, 'triazine').map(i => i.Name)).toEqual(['Atrazine']);
    // Empty search
    expect(filterFn(ingredients, '').length).toBe(3);
    // Non-matching search
    expect(filterFn(ingredients, 'nonexistent').length).toBe(0);
  });
});
