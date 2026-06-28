// src/components/CategoryValidationAlert.jsx
// UI component for displaying category validation errors and warnings

import React from 'react';
import { AlertTriangle, XCircle, Info, CheckCircle } from 'lucide-react';
import { 
  VALIDATION_ERROR_TYPES, 
  formatValidationErrorForUI,
  CategoryValidationError 
} from '../utils/categoryValidation.js';

/**
 * Alert component for displaying category validation messages
 */
export default function CategoryValidationAlert({ 
  error, 
  violations = [], 
  onDismiss, 
  showSuggestions = true,
  className = '' 
}) {
  
  if (!error && violations.length === 0) return null;
  
  // Format error if it's a CategoryValidationError
  const errorInfo = error instanceof CategoryValidationError 
    ? formatValidationErrorForUI(error)
    : error ? { 
        title: 'Validation Error', 
        message: error.message || 'An unknown error occurred',
        type: 'error'
      } : null;
  
  // Determine alert style based on error type or violation severity
  const getAlertStyle = () => {
    if (errorInfo) {
      switch (errorInfo.errorType) {
        case VALIDATION_ERROR_TYPES.CATEGORY_MISMATCH:
        case VALIDATION_ERROR_TYPES.CROSS_CATEGORY_REFERENCE:
        case VALIDATION_ERROR_TYPES.CATEGORY_ISOLATION_VIOLATION:
          return {
            containerClass: 'bg-red-50 border-red-200 text-red-800',
            iconColor: 'text-red-600',
            icon: XCircle
          };
        case VALIDATION_ERROR_TYPES.INVALID_CATEGORY:
        case VALIDATION_ERROR_TYPES.MISSING_CATEGORY:
          return {
            containerClass: 'bg-amber-50 border-amber-200 text-amber-800',
            iconColor: 'text-amber-600',
            icon: AlertTriangle
          };
        default:
          return {
            containerClass: 'bg-blue-50 border-blue-200 text-blue-800',
            iconColor: 'text-blue-600',
            icon: Info
          };
      }
    }
    
    // For violations array
    const hasErrors = violations.some(v => v.severity === 'error');
    if (hasErrors) {
      return {
        containerClass: 'bg-red-50 border-red-200 text-red-800',
        iconColor: 'text-red-600',
        icon: XCircle
      };
    }
    
    return {
      containerClass: 'bg-amber-50 border-amber-200 text-amber-800',
      iconColor: 'text-amber-600',
      icon: AlertTriangle
    };
  };
  
  const { containerClass, iconColor, icon: Icon } = getAlertStyle();
  
  return (
    <div className={`rounded-lg border p-4 ${containerClass} ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
        
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="font-semibold text-sm mb-1">
            {errorInfo?.title || 'Category Validation Issue'}
          </h4>
          
          {/* Main message */}
          <div className="text-sm mb-2">
            {errorInfo?.message || 'Category validation violations detected'}
          </div>
          
          {/* Violation details */}
          {violations.length > 0 && (
            <div className="space-y-1 text-xs">
              {violations.map((violation, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    violation.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <span>{violation.message}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Suggestions */}
          {showSuggestions && errorInfo?.suggestion && (
            <div className="mt-3 pt-2 border-t border-current border-opacity-20">
              <div className="flex items-start gap-2 text-xs">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Suggestion:</strong> {errorInfo.suggestion}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-1 rounded hover:bg-black hover:bg-opacity-10 transition-colors"
            aria-label="Dismiss alert"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline validation message component
 */
export function InlineCategoryValidation({ error, className = '' }) {
  if (!error) return null;
  
  const errorInfo = error instanceof CategoryValidationError 
    ? formatValidationErrorForUI(error)
    : { message: error.message || 'Validation error', type: 'error' };
  
  return (
    <div className={`flex items-center gap-2 text-xs text-red-600 ${className}`}>
      <AlertTriangle className="w-3 h-3 shrink-0" />
      <span>{errorInfo.message}</span>
    </div>
  );
}

/**
 * Hook for managing category validation state in forms
 */
export function useCategoryValidation() {
  const [validationErrors, setValidationErrors] = React.useState([]);
  const [isValidating, setIsValidating] = React.useState(false);
  
  const validateOperation = React.useCallback(async (operation, payload, getAppState) => {
    setIsValidating(true);
    setValidationErrors([]);
    
    try {
      const { validateCategoryDataOperation } = await import('../services/dataLayer.js');
      await validateCategoryDataOperation(operation, payload, getAppState);
      return { valid: true };
    } catch (error) {
      if (error.validationError) {
        setValidationErrors([error]);
        return { valid: false, error };
      }
      throw error; // Re-throw non-validation errors
    } finally {
      setIsValidating(false);
    }
  }, []);
  
  const clearValidation = React.useCallback(() => {
    setValidationErrors([]);
  }, []);
  
  return {
    validationErrors,
    isValidating,
    validateOperation,
    clearValidation,
    hasErrors: validationErrors.length > 0
  };
}

/**
 * Higher-order component that wraps forms with category validation
 */
export function withCategoryValidationAlert(WrappedComponent) {
  return function CategoryValidatedComponent(props) {
    const { validationErrors, clearValidation, ...validationProps } = useCategoryValidation();
    
    return (
      <div className="space-y-3">
        {validationErrors.length > 0 && (
          <CategoryValidationAlert 
            error={validationErrors[0]}
            onDismiss={clearValidation}
          />
        )}
        <WrappedComponent 
          {...props} 
          categoryValidation={validationProps}
          clearCategoryValidation={clearValidation}
        />
      </div>
    );
  };
}

/**
 * Toast notification for category validation errors
 */
export function showCategoryValidationToast(error) {
  const errorInfo = error instanceof CategoryValidationError 
    ? formatValidationErrorForUI(error)
    : { 
        title: 'Validation Error', 
        message: error.message || 'A validation error occurred'
      };
  
  // Dispatch custom toast event
  window.dispatchEvent(new CustomEvent('app:toast', {
    detail: {
      msg: `${errorInfo.title}: ${errorInfo.message}`,
      type: 'error',
      duration: 6000,
      actions: errorInfo.suggestion ? [{
        label: 'Learn More',
        action: () => {
          // Could show a help modal or navigate to documentation
          console.info('Category Validation Help:', errorInfo.suggestion);
        }
      }] : undefined
    }
  }));
}