// src/services/dataLayer.js
// Unified data access layer.
// Routes every read/write through Firebase (primary) or Google Sheets (legacy fallback).
// When Firebase is enabled, writes are additionally mirrored to Sheets if sheetMirrorEnabled=true.

import * as fbDB from './firebaseDB.js';
import * as sheetDB from './db.js';
import { mirrorWrite } from './sheetMirror.js';
import { fbGetAllUsers, fbUpdateUserProfile } from './firebaseAuth.js';
import { 
  validateCategoryOperation, 
  categoryValidationMiddleware,
  withCategoryValidation 
} from '../middleware/categoryValidationMiddleware.js';
import { 
  validateRecordCategory,
  validateTrialProjectCategory,
  validateFormulationIngredientCategory,
  CategoryValidationError,
  formatValidationErrorForUI,
  VALID_CATEGORIES
} from '../utils/categoryValidation.js';

// ─── helper ──────────────────────────────────────────────────────────────────

function getConfig(getAppState) {
  const s = getAppState ? getAppState().settings : {};
  return {
    useFirebase: !!s?.firebaseEnabled,
    sheetMirror: !!s?.sheetMirrorEnabled,
  };
}

function getCategory(getAppState) {
  const state = getAppState ? getAppState() : {};
  return state.activeCategory || 'herbicide';
}

function validateCrossReferenceIntegrity(payload, activeCategory, operation, getAppState) {
  // Enhanced validation for cross-reference integrity
  const state = getAppState ? getAppState() : {};
  
  // Validate trial-project relationships
  if ((operation.includes('Trial') || operation.includes('trial')) && (payload.ProjectId || payload.projectId)) {
    const projectId = payload.ProjectId || payload.projectId;
    const project = (state.projects || []).find(p => (p.ID || p.id) === projectId);
    
    if (project) {
      try {
        validateTrialProjectCategory(
          { ...payload, Category: activeCategory }, 
          project
        );
      } catch (error) {
        if (error instanceof CategoryValidationError) {
          const errorInfo = formatValidationErrorForUI(error);
          throw new Error(`${errorInfo.title}: ${errorInfo.message} ${errorInfo.suggestion || ''}`);
        }
        throw error;
      }
    }
  }
  
  // Validate formulation-ingredient relationships
  if ((operation.includes('Formulation') || operation.includes('formulation')) && payload.ingredients) {
    const ingredients = Array.isArray(payload.ingredients) 
      ? payload.ingredients.map(id => (state.ingredients || []).find(ing => (ing.ID || ing.id) === id)).filter(Boolean)
      : [];
    
    if (ingredients.length > 0) {
      try {
        validateFormulationIngredientCategory(
          { ...payload, Category: activeCategory }, 
          ingredients
        );
      } catch (error) {
        if (error instanceof CategoryValidationError) {
          const errorInfo = formatValidationErrorForUI(error);
          throw new Error(`${errorInfo.title}: ${errorInfo.message} ${errorInfo.suggestion || ''}`);
        }
        throw error;
      }
    }
  }
}

function validateDataServiceCall(operation, payload, getAppState) {
  if (!operation || typeof operation !== 'string') {
    throw new Error('Data service operation name is required and must be a string');
  }
  
  if (!getAppState || typeof getAppState !== 'function') {
    throw new Error(`Data service operation '${operation}' requires valid getAppState function for category enforcement`);
  }
  
  try {
    const state = getAppState();
    if (!state || typeof state !== 'object') {
      throw new Error(`Data service operation '${operation}' requires valid application state`);
    }
  } catch (error) {
    throw new Error(`Data service operation '${operation}' failed to access application state: ${error.message}`);
  }
  
  return true;
}

function validateCategory(category) {
  const validCategories = ['herbicide', 'fungicide', 'pesticide', 'nutrition', 'biostimulant'];
  if (!category || !validCategories.includes(category)) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${validCategories.join(', ')}`);
  }
  return category;
}

function validateCategoryParameter(category, operation) {
  if (!category) {
    throw new Error(`Category parameter is required for operation: ${operation}`);
  }
  return validateCategory(category);
}

function validateCategorySpecificCollection(category, collectionType, operation) {
  validateCategoryParameter(category, operation);
  const validCollectionTypes = ['trials', 'projects', 'formulations', 'ingredients', 'blocks'];
  if (!validCollectionTypes.includes(collectionType)) {
    throw new Error(`Invalid collection type '${collectionType}' for category-specific operation: ${operation}`);
  }
  return true;
}

function enforceActiveCategory(payload, getAppState, operation) {
  validateDataServiceCall(operation, payload, getAppState);
  
  const activeCategory = getCategory(getAppState);
  validateCategoryParameter(activeCategory, operation);
  
  // Enhanced cross-reference validation for data integrity
  validateCrossReferenceIntegrity(payload, activeCategory, operation, getAppState);
  
  // For data retrieval operations, ensure we only access active category
  const readOperations = ['getTrials', 'getProjects', 'getFormulations', 'getAllData', 'getIngredients', 'getBlocks'];
  if (readOperations.includes(operation)) {
    return activeCategory;
  }
  
  // For write operations, validate that the data belongs to active category
  const writeOperations = ['addTrial', 'updateTrial', 'deleteTrial', 'addProject', 'updateProject', 'deleteProject', 
                          'addFormulation', 'updateFormulation', 'deleteFormulation', 'addIngredient', 'deleteIngredient',
                          'addBlock', 'updateBlock', 'deleteBlock', 'finalizeTrial', 'updateTrialStatus', 'addBatchTrials', 'importAllData'];
  
  if (writeOperations.includes(operation)) {
    // Validate payload category consistency
    if (payload?.Category && payload.Category !== activeCategory) {
      throw new Error(`Category isolation violation: Cannot ${operation} ${payload.Category} data when active category is ${activeCategory}. This would mix data across category boundaries.`);
    }
    
    // Add additional validation for record updates/deletes
    const updateDeleteOperations = ['updateTrial', 'deleteTrial', 'updateProject', 'deleteProject', 'updateFormulation', 'deleteFormulation', 'updateBlock', 'deleteBlock', 'finalizeTrial', 'updateTrialStatus'];
    
    if (updateDeleteOperations.includes(operation)) {
      const recordCategory = getRecordCategory(getCollectionTypeFromOperation(operation), payload, getAppState);
      if (recordCategory && recordCategory !== activeCategory) {
        throw new Error(`Category isolation violation: Cannot ${operation} record from ${recordCategory} category when active category is ${activeCategory}. This would violate category boundaries.`);
      }
    }
  }
  
  return activeCategory;
}

function getCollectionTypeFromOperation(operation) {
  if (operation.includes('Trial') || operation.includes('trial')) return 'trials';
  if (operation.includes('Project') || operation.includes('project')) return 'projects';
  if (operation.includes('Formulation') || operation.includes('formulation')) return 'formulations';
  if (operation.includes('Ingredient') || operation.includes('ingredient')) return 'ingredients';
  if (operation.includes('Block') || operation.includes('block')) return 'blocks';
  return 'trials'; // Default fallback
}

function filterDataByCategory(data, category) {
  if (!data || typeof data !== 'object') return data;
  
  const filterArray = (arr, category) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter(item => {
      const itemCategory = item?.Category || item?.category;
      // Include items that match the category, or legacy items without category (assume herbicide)
      return itemCategory === category || (!itemCategory && category === 'herbicide');
    });
  };
  
  // Apply category filtering to all data arrays
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      filtered[key] = filterArray(value, category);
    } else {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

function getRecordCategory(collectionType, payload, getAppState) {
  if (payload?.Category) return payload.Category;
  if (payload?.category) return payload.category;

  const state = getAppState ? getAppState() : {};
  const list = state[collectionType] || [];
  const record = list.find(r => r.ID === (payload?.id || payload?.ID) || r.id === (payload?.id || payload?.ID));
  return record?.Category || record?.category || getCategory(getAppState);
}

function getUserId(getAppState) {
  const state = getAppState ? getAppState() : {};
  return state.auth?.uid || state.auth?.user?.ID || state.auth?.user?.uid || null;
}

function isAdmin(getAppState) {
  const state = getAppState ? getAppState() : {};
  const role = String(state.auth?.user?.Role || state.auth?.user?.role || '').toLowerCase();
  return role === 'admin';
}

function getAllowedUids(getAppState) {
  const state = getAppState ? getAppState() : {};
  const user = state.auth?.user;
  if (!user) return ['__empty_sandbox__'];

  const role = String(user.Role || user.role || '').toLowerCase();
  const uid = state.auth?.uid || user.ID || user.uid || null;

  if (role === 'admin') {
    return null; // admin sees all
  }

  if (role === 'developer') {
    // developer can see everything (all data) ONLY if allowDataAccess is explicitly true
    const allowData = !!user.allowDataAccess || !!user.AllowDataAccess;
    return allowData ? null : [uid]; // returns own uid so they see only their own test data
  }

  // Regular user (scientist/viewer)
  // Retrieve their own UID and any viewableUsers (cross-user sharing)
  const viewable = user.viewableUsers || user.ViewableUsers || [];
  const allowed = [uid];
  if (Array.isArray(viewable)) {
    for (const val of viewable) {
      if (val && typeof val === 'string' && !allowed.includes(val)) {
        allowed.push(val);
      }
    }
  }
  return allowed;
}

function getSharedWithUid(getAppState) {
  const state = getAppState ? getAppState() : {};
  const user = state.auth?.user;
  if (!user) return null;

  const role = String(user.Role || user.role || '').toLowerCase();
  if (role === 'admin') {
    return null; // Admin sees all data already
  }

  if (role === 'developer') {
    // developer can see shared data ONLY if allowDataAccess is true
    const allowData = !!user.allowDataAccess || !!user.AllowDataAccess;
    return allowData ? (state.auth?.uid || user.ID || user.uid) : null;
  }

  return state.auth?.uid || user.ID || user.uid || null;
}

function checkOwnership(collectionType, recordId, getAppState, action = 'edit') {
  const state = getAppState ? getAppState() : {};
  const user = state.auth?.user;
  if (!user) return false;

  const role = String(user.Role || user.role || '').toLowerCase();
  if (role === 'admin') return true; // admin bypass

  const ownUid = state.auth?.uid || user.ID || user.uid;
  if (!ownUid) return false;

  const list = state[collectionType] || [];
  const record = list.find(r => r.ID === recordId || r.id === recordId);
  if (!record) return true; // new record or not in state

  const isOwner = !record.CreatedBy || record.CreatedBy === ownUid;
  if (isOwner) return true;

  if (action === 'edit') {
    // Allow editing if the user is in the SharedWithEdit array
    const sharedWithEdit = record.SharedWithEdit || [];
    return Array.isArray(sharedWithEdit) && sharedWithEdit.includes(ownUid);
  }

  // Deletions are strictly restricted to the creator
  return false;
}

function mirror(action, payload, getAppState) {
  const { sheetMirror } = getConfig(getAppState);
  if (sheetMirror) mirrorWrite(action, payload, getAppState);
}

// ─── getAllData ───────────────────────────────────────────────────────────────

export async function getAllData(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getAllData');
  validateCategorySpecificCollection(category, 'trials', 'getAllData');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    console.log(`[DataLayer] Loading all data for category: ${category} (category-specific collections)`);
    return fbDB.fbGetAllData(allowedUids, category, sharedWithUid);
  }
  // For Google Sheets, apply category filtering on the response
  const data = await sheetDB.getAllData(payload, getAppState);
  const filtered = filterDataByCategory(data, category);
  console.log(`[DataLayer] Filtered Google Sheets data for category: ${category}`);
  return filtered;
}

// ─── Trials ──────────────────────────────────────────────────────────────────

export async function getTrials(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getTrials');
  validateCategorySpecificCollection(category, 'trials', 'getTrials');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    console.log(`[DataLayer] Loading trials for category: ${category} (category-specific collection)`);
    return fbDB.fbCatGetTrials(category, allowedUids, sharedWithUid);
  }
  // For Google Sheets, apply category filtering
  const data = await sheetDB.getTrials(payload, getAppState);
  const filtered = filterDataByCategory({ trials: data }, category).trials;
  console.log(`[DataLayer] Filtered ${filtered.length} trials for category: ${category}`);
  return filtered;
}

export async function addTrial(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'addTrial');
  validateCategorySpecificCollection(category, 'trials', 'addTrial');
  
  // Ensure payload has the correct category and validate it explicitly
  if (payload?.Category && payload.Category !== category) {
    throw new Error(`Category mismatch: Cannot add ${payload.Category} trial when active category is ${category}`);
  }
  const trialData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    console.log(`[DataLayer] Adding trial to category-specific collection: ${category}`);
    const result = await fbDB.fbCatAddTrial(category, trialData, uid);
    mirror('addTrial', trialData, getAppState);
    return result;
  }
  return sheetDB.addTrial(trialData, getAppState);
}

export async function updateTrial(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'updateTrial');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's trial.");
    }
    const trialCategory = getRecordCategory('trials', payload, getAppState);
    // Validate the record belongs to active category
    if (trialCategory !== category) {
      throw new Error(`Category isolation violation: Cannot update ${trialCategory} trial when active category is ${category}. This would violate category boundaries and mix trial data.`);
    }
    const result = await fbDB.fbCatUpdateTrial(category, payload);
    mirror('updateTrialRecord', payload, getAppState);
    return result;
  }
  return sheetDB.updateTrial(payload, getAppState);
}

export async function deleteTrial(payload, getAppState, showOverlay = true) {
  const category = enforceActiveCategory(payload, getAppState, 'deleteTrial');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState, 'delete')) {
      throw new Error("Permission Denied: You cannot delete another user's trial.");
    }
    const trialCategory = getRecordCategory('trials', payload, getAppState);
    // Validate the record belongs to active category
    if (trialCategory !== category) {
      throw new Error(`Category isolation violation: Cannot delete ${trialCategory} trial when active category is ${category}. This would violate category boundaries and mix trial data.`);
    }
    const result = await fbDB.fbCatDeleteTrial(category, payload.id || payload.ID);
    mirror('deleteTrialRecord', payload, getAppState);
    return result;
  }
  return sheetDB.deleteTrial(payload, getAppState, showOverlay);
}

export async function addBatchTrials(payload, getAppState, showOverlay = true) {
  const category = enforceActiveCategory(payload, getAppState, 'addBatchTrials');
  // Ensure all trials in batch have the correct category
  const trials = (payload.trials || []).map(trial => ({ ...trial, Category: category }));
  const batchPayload = { ...payload, trials };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbCatBatchWrite(category, 'trials', trials, uid);
    mirror('addBatchTrials', batchPayload, getAppState);
    return result;
  }
  return sheetDB.addBatchTrials(batchPayload, getAppState, showOverlay);
}

export async function importAllData(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'importAllData');
  validateCategorySpecificCollection(category, 'trials', 'importAllData');
  
  // Ensure all data in the import has the correct category
  const dataMap = { ...payload };
  const categoryCollections = ['trials', 'formulations', 'ingredients', 'projects', 'blocks'];
  
  for (const collectionType of categoryCollections) {
    if (Array.isArray(dataMap[collectionType])) {
      dataMap[collectionType] = dataMap[collectionType].map(item => ({ ...item, Category: category }));
    }
  }
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    console.log(`[DataLayer] Importing all data to category: ${category} (category-specific collections)`);
    const result = await fbDB.fbCatImportAll(category, dataMap, uid);
    mirror('importAllData', dataMap, getAppState);
    return result;
  }
  
  // For Google Sheets, we would need to implement batch import with category filtering
  throw new Error('Bulk import not implemented for Google Sheets backend');
}

export async function finalizeTrial(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'finalizeTrial');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's trial.");
    }
    const trialCategory = getRecordCategory('trials', payload, getAppState);
    // Validate the record belongs to active category
    if (trialCategory !== category) {
      throw new Error(`Category isolation violation: Cannot finalize ${trialCategory} trial when active category is ${category}. This would violate category boundaries.`);
    }
    const result = await fbDB.fbCatUpdateTrial(category, { ...payload, ControlFinalized: true, FinalizationDate: new Date().toISOString() });
    mirror('finalizeTrial', payload, getAppState);
    return result;
  }
  return sheetDB.finalizeTrial(payload, getAppState);
}

export async function updateTrialStatus(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'updateTrialStatus');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('trials', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's trial.");
    }
    const trialCategory = getRecordCategory('trials', payload, getAppState);
    // Validate the record belongs to active category
    if (trialCategory !== category) {
      throw new Error(`Category isolation violation: Cannot update ${trialCategory} trial status when active category is ${category}. This would violate category boundaries.`);
    }
    const result = await fbDB.fbCatUpdateTrial(category, payload);
    mirror('updateTrialStatus', payload, getAppState);
    return result;
  }
  return sheetDB.updateTrialStatus(payload, getAppState);
}

// ─── Formulations ────────────────────────────────────────────────────────────

export async function getFormulations(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getFormulations');
  validateCategorySpecificCollection(category, 'formulations', 'getFormulations');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    console.log(`[DataLayer] Loading formulations for category: ${category} (category-specific collection)`);
    return fbDB.fbCatGetFormulations(category, allowedUids, sharedWithUid);
  }
  // For Google Sheets, apply category filtering
  const data = await sheetDB.getFormulations(payload, getAppState);
  const filtered = filterDataByCategory({ formulations: data }, category).formulations;
  console.log(`[DataLayer] Filtered ${filtered.length} formulations for category: ${category}`);
  return filtered;
}

export async function addFormulation(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'addFormulation');
  // Ensure payload has the correct category
  const formulationData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbCatAddFormulation(category, formulationData, uid);
    mirror('addFormulation', formulationData, getAppState);
    return result;
  }
  return sheetDB.addFormulation(formulationData, getAppState);
}

export async function updateFormulation(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'updateFormulation');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('formulations', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's formulation.");
    }
    const formulationCategory = getRecordCategory('formulations', payload, getAppState);
    // Validate the record belongs to active category
    if (formulationCategory !== category) {
      throw new Error(`Category mismatch: Cannot update ${formulationCategory} formulation when active category is ${category}`);
    }
    const result = await fbDB.fbCatUpdateFormulation(category, payload);
    mirror('updateFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.apiCall('updateFormulation', payload, true, getAppState);
}

export async function deleteFormulation(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'deleteFormulation');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('formulations', payload.id || payload.ID, getAppState, 'delete')) {
      throw new Error("Permission Denied: You cannot delete another user's formulation.");
    }
    const formulationCategory = getRecordCategory('formulations', payload, getAppState);
    // Validate the record belongs to active category
    if (formulationCategory !== category) {
      throw new Error(`Category mismatch: Cannot delete ${formulationCategory} formulation when active category is ${category}`);
    }
    const result = await fbDB.fbCatDeleteFormulation(category, payload.id || payload.ID);
    mirror('deleteFormulation', payload, getAppState);
    return result;
  }
  return sheetDB.deleteFormulation(payload, getAppState);
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

export async function getIngredients(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getIngredients');
  validateCategory(category);
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    // Note: Ingredients may be shared across categories in some implementations
    // but we enforce category boundaries for consistency
    return fbDB.fbCatGetIngredients(category, allowedUids);
  }
  // For Google Sheets, apply category filtering
  const data = await sheetDB.getIngredients(payload, getAppState);
  return filterDataByCategory({ ingredients: data }, category).ingredients;
}

export async function addIngredient(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'addIngredient');
  // Ensure payload has the correct category
  const ingredientData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    // Use category-aware function if available, otherwise use shared collection
    const result = await (fbDB.fbCatAddIngredient 
      ? fbDB.fbCatAddIngredient(category, ingredientData, uid)
      : fbDB.fbAddIngredient(ingredientData, uid));
    mirror('addIngredient', ingredientData, getAppState);
    return result;
  }
  return sheetDB.addIngredient(ingredientData, getAppState);
}

export async function deleteIngredient(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'deleteIngredient');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('ingredients', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot delete another user's ingredient.");
    }
    // Validate the record belongs to active category if it has one
    const ingredientCategory = getRecordCategory('ingredients', payload, getAppState);
    if (ingredientCategory !== category) {
      throw new Error(`Category mismatch: Cannot delete ${ingredientCategory} ingredient when active category is ${category}`);
    }
    const result = await fbDB.fbDeleteIngredient(payload.id || payload.ID);
    mirror('deleteIngredient', payload, getAppState);
    return result;
  }
  return sheetDB.deleteIngredient(payload, getAppState);
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getProjects(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getProjects');
  validateCategorySpecificCollection(category, 'projects', 'getProjects');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    const sharedWithUid = getSharedWithUid(getAppState);
    console.log(`[DataLayer] Loading projects for category: ${category} (category-specific collection)`);
    return fbDB.fbCatGetProjects(category, allowedUids, sharedWithUid);
  }
  // For Google Sheets, apply category filtering
  const data = await sheetDB.getProjects(payload, getAppState);
  const filtered = filterDataByCategory({ projects: data }, category).projects;
  console.log(`[DataLayer] Filtered ${filtered.length} projects for category: ${category}`);
  return filtered;
}

export async function addProject(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'addProject');
  validateCategorySpecificCollection(category, 'projects', 'addProject');
  
  // Ensure payload has the correct category and validate it explicitly
  if (payload?.Category && payload.Category !== category) {
    throw new Error(`Category mismatch: Cannot add ${payload.Category} project when active category is ${category}`);
  }
  const projectData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    console.log(`[DataLayer] Adding project to category-specific collection: ${category}`);
    const result = await fbDB.fbCatAddProject(category, projectData, uid);
    mirror('addProject', projectData, getAppState);
    return result;
  }
  return sheetDB.addProject(projectData, getAppState);
}

export async function updateProject(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'updateProject');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('projects', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's project.");
    }
    const projectCategory = getRecordCategory('projects', payload, getAppState);
    // Validate the record belongs to active category
    if (projectCategory !== category) {
      throw new Error(`Category mismatch: Cannot update ${projectCategory} project when active category is ${category}`);
    }
    const result = await fbDB.fbCatUpdateProject(category, payload);
    mirror('updateProject', payload, getAppState);
    return result;
  }
  return sheetDB.updateProject(payload, getAppState);
}

export async function deleteProject(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'deleteProject');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('projects', payload.id || payload.ID, getAppState, 'delete')) {
      throw new Error("Permission Denied: You cannot delete another user's project.");
    }
    const projectCategory = getRecordCategory('projects', payload, getAppState);
    // Validate the record belongs to active category
    if (projectCategory !== category) {
      throw new Error(`Category mismatch: Cannot delete ${projectCategory} project when active category is ${category}`);
    }
    const result = await fbDB.fbCatDeleteProject(category, payload.id || payload.ID);
    mirror('deleteProject', payload, getAppState);
    return result;
  }
  return sheetDB.deleteProject(payload, getAppState);
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export async function getBlocks(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getBlocks');
  validateCategorySpecificCollection(category, 'blocks', 'getBlocks');
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    console.log(`[DataLayer] Loading blocks for category: ${category} (category-specific collection)`);
    return fbDB.fbCatGetBlocks(category, allowedUids);
  }
  // Google Sheets doesn't support blocks collection yet
  console.log(`[DataLayer] Blocks not supported in Google Sheets backend, returning empty array for category: ${category}`);
  return [];
}

export async function addBlock(payload, getAppState, showOverlay = true) {
  const category = enforceActiveCategory(payload, getAppState, 'addBlock');
  validateCategory(category);
  // Ensure payload has the correct category
  const blockData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbCatAddBlock(category, blockData, uid);
    mirror('addBlock', blockData, getAppState);
    return result;
  }
  return sheetDB.addBlock(blockData, getAppState, showOverlay);
}

export async function updateBlock(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'updateBlock');
  validateCategory(category);
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('blocks', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot modify another user's block.");
    }
    const blockCategory = getRecordCategory('blocks', payload, getAppState);
    // Validate the record belongs to active category
    if (blockCategory !== category) {
      throw new Error(`Category isolation violation: Cannot update ${blockCategory} block when active category is ${category}. This would violate category boundaries.`);
    }
    const result = await fbDB.fbCatUpdateBlock(category, payload);
    mirror('updateBlock', payload, getAppState);
    return result;
  }
  // Google Sheets doesn't support updateBlock yet
  throw new Error('Block updates not supported in Google Sheets backend. Please use Firebase for full block management functionality.');
}

export async function deleteBlock(payload, getAppState, showOverlay = true) {
  const category = enforceActiveCategory(payload, getAppState, 'deleteBlock');
  validateCategory(category);
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('blocks', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot delete another user's block.");
    }
    const blockCategory = getRecordCategory('blocks', payload, getAppState);
    // Validate the record belongs to active category
    if (blockCategory !== category) {
      throw new Error(`Category isolation violation: Cannot delete ${blockCategory} block when active category is ${category}. This would violate category boundaries.`);
    }
    const result = await fbDB.fbCatDeleteBlock(category, payload.id || payload.ID);
    mirror('deleteBlock', payload, getAppState);
    return result;
  }
  return sheetDB.apiCall('deleteBlock', payload, showOverlay, getAppState);
}

// ─── Organisations ───────────────────────────────────────────────────────────

export async function getOrganisations(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    return fbDB.fbGetOrganisations(allowedUids);
  }
  return sheetDB.getOrganisations(payload, getAppState);
}

export async function addOrganisation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    const result = await fbDB.fbAddOrganisation(payload, uid);
    mirror('addOrganisation', payload, getAppState);
    return result;
  }
  return sheetDB.addOrganisation(payload, getAppState);
}

export async function deleteOrganisation(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    if (!checkOwnership('organisations', payload.id || payload.ID, getAppState)) {
      throw new Error("Permission Denied: You cannot delete another user's organisation.");
    }
    const result = await fbDB.fbDeleteOrganisation(payload.id || payload.ID);
    mirror('deleteOrganisation', payload, getAppState);
    return result;
  }
  return sheetDB.deleteOrganisation(payload, getAppState);
}

// ─── Users (admin) ────────────────────────────────────────────────────────────

export async function getUsers(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    // fbGetAllUsers is statically imported at the top
    return fbGetAllUsers();
  }
  return sheetDB.getUsers(payload, getAppState);
}

export async function updateUser(payload, getAppState) {
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    // fbUpdateUserProfile is statically imported at the top
    const uid = payload.uid || payload.ID || payload.id;
    return fbUpdateUserProfile(uid, payload);
  }
  return sheetDB.updateUser(payload, getAppState);
}

// ─── Embeddings (category-aware for AI analysis) ───────────────────────────

export async function upsertEmbedding(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'upsertEmbedding');
  validateCategory(category);
  
  // Ensure embedding data has the correct category for AI analysis isolation
  const embeddingData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    console.log(`[DataLayer] Adding embedding for category: ${category} (category-specific AI data)`);
    return fbDB.fbAdd('embeddingsAll', embeddingData, uid);
  }
  return sheetDB.upsertEmbedding(embeddingData, getAppState);
}

export async function loadSmartIndex(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'loadSmartIndex');
  validateCategory(category);
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const allowedUids = getAllowedUids(getAppState);
    console.log(`[DataLayer] Loading smart index for category: ${category} (category-filtered AI embeddings)`);
    const embeddings = await fbDB.fbGetAll('embeddingsAll', allowedUids);
    // Filter embeddings by category to ensure AI analysis uses only relevant data
    const filtered = embeddings.filter(embedding => {
      const embeddingCategory = embedding?.Category || embedding?.category;
      // Include embeddings that match the category, or legacy embeddings without category (assume herbicide)
      return embeddingCategory === category || (!embeddingCategory && category === 'herbicide');
    });
    console.log(`[DataLayer] Filtered ${filtered.length}/${embeddings.length} embeddings for category: ${category}`);
    return filtered;
  }
  const data = await sheetDB.loadSmartIndex(payload, getAppState);
  // Apply category filtering for Google Sheets embeddings
  return filterDataByCategory({ embeddings: data }, category).embeddings || data;
}

export async function clearSmartEmbeddings(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'clearSmartEmbeddings');
  validateCategory(category);
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    console.log(`[DataLayer] Clear embeddings operation requested for category: ${category}. Use Firebase console to clear category-specific embeddings.`);
    return { success: true, message: `Use Firebase console to clear embeddings for category: ${category}. Ensure only ${category} category embeddings are removed to maintain category isolation.` };
  }
  return sheetDB.clearSmartEmbeddings(payload, getAppState);
}

// ─── Photo Upload (category-aware for trial association) ───────────────────
// Photos MUST go to Google Drive. The Apps Script is the only server-side proxy
// that can authenticate with Drive from the browser.
// This works regardless of whether Firebase or Sheet mode is active —
// Firebase stores trial metadata, Drive stores the photo files.
// Without a scriptUrl there is no path to Drive: return a clear error.

export async function uploadPhoto(payload, getAppState) {
  // Validate category context for photo uploads (photos are usually associated with specific trials)
  const category = enforceActiveCategory(payload, getAppState, 'uploadPhoto');
  validateCategory(category);
  
  const state = getAppState ? getAppState() : {};
  const hasScript = !!(state?.settings?.scriptUrl?.trim());

  if (!hasScript) {
    return {
      _errType: 'config',
      message: 'Google Drive upload requires the Apps Script URL to be set in Settings → Script URL. Photos cannot be saved without it.',
    };
  }

  // Ensure photo metadata includes category information for proper trial association
  const photoData = { ...payload, Category: category };
  console.log(`[DataLayer] Uploading photo for category: ${category} (category-aware trial association)`);

  return sheetDB.apiCall('uploadPhoto', photoData, false, getAppState);
}

// ─── Re-export apiCall for anything that still needs raw access ───────────────
export { apiCall } from './db.js';

// ─── AI Chat Sessions (category-specific for analysis isolation) ───────────
export async function getAiChatSessions(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'getAiChatSessions');
  validateCategory(category);
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    console.log(`[DataLayer] Loading AI chat sessions for category: ${category} (category-specific AI context)`);
    const sessions = await fbDB.fbGetAiChatSessions(uid);
    // Filter AI chat sessions by category to ensure context isolation
    const filtered = sessions.filter(session => {
      const sessionCategory = session?.Category || session?.category;
      // Include sessions that match the category, or legacy sessions without category (assume herbicide)
      return sessionCategory === category || (!sessionCategory && category === 'herbicide');
    });
    console.log(`[DataLayer] Filtered ${filtered.length}/${sessions.length} AI chat sessions for category: ${category}`);
    return filtered;
  }
  return []; // Not supported in sheets for now
}

export async function saveAiChatSession(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'saveAiChatSession');
  validateCategory(category);
  
  // Ensure AI chat session data has the correct category for context isolation
  const sessionData = { ...payload, Category: category };
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    const uid = getUserId(getAppState);
    console.log(`[DataLayer] Saving AI chat session for category: ${category} (category-specific AI context)`);
    return fbDB.fbSaveAiChatSession(sessionData, uid);
  }
  return sessionData; // Fallback to local storage for sheets
}

export async function deleteAiChatSession(payload, getAppState) {
  const category = enforceActiveCategory(payload, getAppState, 'deleteAiChatSession');
  validateCategory(category);
  
  const { useFirebase } = getConfig(getAppState);
  if (useFirebase) {
    // Additional validation: ensure the session being deleted belongs to active category
    const uid = getUserId(getAppState);
    const sessions = await fbDB.fbGetAiChatSessions(uid);
    const sessionToDelete = sessions.find(s => (s.id || s.ID) === (payload.id || payload.ID));
    
    if (sessionToDelete) {
      const sessionCategory = sessionToDelete?.Category || sessionToDelete?.category || 'herbicide';
      if (sessionCategory !== category) {
        throw new Error(`Category isolation violation: Cannot delete ${sessionCategory} AI chat session when active category is ${category}. This would violate category boundaries.`);
      }
    }
    
    console.log(`[DataLayer] Deleting AI chat session for category: ${category} (category-validated deletion)`);
    return fbDB.fbDeleteAiChatSession(payload.id);
  }
  return { success: true };
}

// ─── Enhanced Category Validation Functions ──────────────────────────────────

/**
 * Comprehensive validation function for cross-category data operations
 * This function should be called before any major data operation to ensure category isolation
 */
export async function validateCategoryDataOperation(operation, payload, getAppState) {
  try {
    const validation = await validateCategoryOperation(operation, payload, getAppState);
    
    if (!validation.valid) {
      // Log validation failure for monitoring
      console.warn(`[CategoryValidation] Operation ${operation} failed validation:`, validation.error.message);
      
      // Throw user-friendly error
      const errorInfo = validation.userMessage;
      const error = new Error(`${errorInfo.title}: ${errorInfo.message}`);
      error.validationError = true;
      error.errorInfo = errorInfo;
      error.suggestion = errorInfo.suggestion;
      throw error;
    }
    
    return validation;
  } catch (error) {
    // If it's already a validation error, re-throw as-is
    if (error.validationError) throw error;
    
    // Log unexpected errors
    console.error(`[CategoryValidation] Unexpected error in operation ${operation}:`, error);
    throw error;
  }
}

/**
 * Database constraint validation - used for Firestore security rules enforcement
 * This function validates data integrity at the database level
 */
export function validateDatabaseConstraints(collection, documentData, context = {}) {
  const violations = [];
  
  try {
    // Validate required category field
    const category = documentData.Category || documentData.category;
    if (!category) {
      violations.push({
        rule: 'required_category',
        message: 'All documents must have a Category field',
        severity: 'error'
      });
    } else if (!VALID_CATEGORIES.includes(category)) {
      violations.push({
        rule: 'valid_category',
        message: `Invalid category: ${category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        severity: 'error'
      });
    }
    
    // Validate collection-specific constraints
    switch (collection) {
      case 'trials':
        // Validate trial-project category consistency
        if (documentData.ProjectId && context.projects) {
          const project = context.projects.find(p => p.ID === documentData.ProjectId);
          if (project && project.Category && project.Category !== category) {
            violations.push({
              rule: 'trial_project_category_match',
              message: `Trial category (${category}) must match project category (${project.Category})`,
              severity: 'error'
            });
          }
        }
        break;
        
      case 'formulations':
        // Validate formulation-ingredient category consistency
        if (documentData.ingredients && context.ingredients) {
          const incompatibleIngredients = documentData.ingredients
            .map(id => context.ingredients.find(ing => ing.ID === id))
            .filter(ing => ing && ing.Category && ing.Category !== category);
            
          if (incompatibleIngredients.length > 0) {
            violations.push({
              rule: 'formulation_ingredient_category_match',
              message: `Formulation contains ingredients from different categories: ${incompatibleIngredients.map(ing => ing.Category).join(', ')}`,
              severity: 'error'
            });
          }
        }
        break;
    }
    
    return {
      valid: violations.filter(v => v.severity === 'error').length === 0,
      violations,
      category
    };
    
  } catch (error) {
    return {
      valid: false,
      violations: [{
        rule: 'validation_error',
        message: `Validation failed: ${error.message}`,
        severity: 'error'
      }],
      error
    };
  }
}

/**
 * UI validation messages for cross-category violations
 * Returns user-friendly error messages for display in the UI
 */
export function getCategoryValidationMessages(operation, violations) {
  const messages = {
    warnings: [],
    errors: [],
    suggestions: []
  };
  
  violations.forEach(violation => {
    switch (violation.rule) {
      case 'required_category':
        messages.errors.push('Missing category assignment');
        messages.suggestions.push('Please assign a category before saving');
        break;
        
      case 'valid_category':
        messages.errors.push('Invalid category selected');
        messages.suggestions.push('Please select a valid category from the dropdown');
        break;
        
      case 'trial_project_category_match':
        messages.errors.push('Trial and project categories must match');
        messages.suggestions.push('Either change the trial category or select a project from the same category');
        break;
        
      case 'formulation_ingredient_category_match':
        messages.errors.push('Formulation contains ingredients from other categories');
        messages.suggestions.push('Remove ingredients from other categories or create category-specific alternatives');
        break;
        
      case 'cross_category_reference':
        messages.errors.push('Cross-category reference detected');
        messages.suggestions.push('All related items must belong to the same category');
        break;
        
      default:
        messages.warnings.push(violation.message);
    }
  });
  
  return messages;
}

/**
 * Middleware wrapper for existing data operations
 * This wraps existing functions with category validation
 */
export const withCategoryValidationWrapper = {
  addTrial: withCategoryValidation(addTrial, 'addTrial'),
  updateTrial: withCategoryValidation(updateTrial, 'updateTrial'),
  deleteTrial: withCategoryValidation(deleteTrial, 'deleteTrial'),
  addProject: withCategoryValidation(addProject, 'addProject'),
  updateProject: withCategoryValidation(updateProject, 'updateProject'),
  deleteProject: withCategoryValidation(deleteProject, 'deleteProject'),
  addFormulation: withCategoryValidation(addFormulation, 'addFormulation'),
  updateFormulation: withCategoryValidation(updateFormulation, 'updateFormulation'),
  deleteFormulation: withCategoryValidation(deleteFormulation, 'deleteFormulation')
};

// Re-export validation utilities for external use
export { 
  validateCategoryOperation,
  categoryValidationMiddleware,
  CategoryValidationError,
  formatValidationErrorForUI
} from '../middleware/categoryValidationMiddleware.js';

export {
  VALID_CATEGORIES,
  VALIDATION_ERROR_TYPES
} from '../utils/categoryValidation.js';
