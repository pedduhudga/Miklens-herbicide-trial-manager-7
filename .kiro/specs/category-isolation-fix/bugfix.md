# Bugfix Requirements Document

## Introduction

The herbicide trial manager application has a well-designed category system supporting five trial categories (herbicide, fungicide, pesticide, nutrition, biostimulant). However, various parts of the application fail to properly respect category boundaries, resulting in data mixing between categories. Users report that "various places in my app, my app dont have proper category awareness many different category related things coming in different category each category must have data, info, data collection, report ai related things must strictly to that particular category only now all category have all category related things."

This bug violates the fundamental principle of category isolation, where each category should operate as a completely separate data domain with no cross-contamination of trials, projects, formulations, or analytical results.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN viewing reports page project dropdowns THEN the system shows some category filtering but inconsistently applied across all selection components

1.2 WHEN using AI services for analysis THEN the system processes trials from all categories instead of filtering to only the active category

1.3 WHEN accessing statistics and analytics pages THEN the system may display cross-category data mixing results from different trial types

1.4 WHEN performing data operations through services THEN some functions bypass category-specific filtering and access global collections

1.5 WHEN using export functions THEN the system may include data from incorrect categories in exported reports

1.6 WHEN comparing trials THEN the system lacks proper category filtering allowing inappropriate cross-category comparisons

1.7 WHEN legacy data records exist without Category fields THEN the system defaults them to 'herbicide' category causing data pollution

1.8 WHEN performing data validation THEN the system lacks validation to prevent cross-category relationships and references

### Expected Behavior (Correct)

2.1 WHEN viewing any reports or selection dropdowns THEN the system SHALL filter and display only trials, projects, and formulations belonging to the currently active category

2.2 WHEN AI services analyze data or generate insights THEN the system SHALL process only category-specific data using appropriate prompts and filtering for the active category

2.3 WHEN accessing statistics, analytics, or dashboard widgets THEN the system SHALL display metrics and calculations based exclusively on the active category's data

2.4 WHEN data operations execute through services THEN the system SHALL enforce category-specific collection access and filtering at the data layer

2.5 WHEN exporting data or generating reports THEN the system SHALL include only data from the selected category with no cross-category contamination

2.6 WHEN comparing trials or projects THEN the system SHALL restrict comparisons to entities within the same category only

2.7 WHEN processing legacy data records THEN the system SHALL properly categorize uncategorized records based on context or user assignment rather than defaulting all to 'herbicide'

2.8 WHEN validating data relationships THEN the system SHALL enforce category boundaries preventing creation of cross-category references

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the active category is switched THEN the system SHALL CONTINUE TO reload and display appropriate category-specific data as currently implemented

3.2 WHEN users have proper category access permissions THEN the system SHALL CONTINUE TO enforce role-based access control for category read/write operations

3.3 WHEN category configurations define specific fields and prompts THEN the system SHALL CONTINUE TO use category-appropriate forms, metrics, and AI prompts

3.4 WHEN Firebase or Google Sheets backends are used THEN the system SHALL CONTINUE TO store data in category-specific collections as currently configured

3.5 WHEN category-specific theming and UI elements are applied THEN the system SHALL CONTINUE TO display appropriate colors, icons, and labels for each category