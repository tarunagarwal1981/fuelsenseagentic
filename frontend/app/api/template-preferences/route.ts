/**
 * Template Preferences API
 * 
 * REST API for managing user template preferences.
 * GET - Retrieve current preferences
 * POST - Update preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import type { UserTemplatePreferences } from '@/lib/config/template-preferences';
import { DEFAULT_PREFERENCES } from '@/lib/config/template-preferences';

// In-memory storage for now (TODO: Replace with database)
const preferencesStore: Map<string, UserTemplatePreferences> = new Map();

/**
 * GET /api/template-preferences
 * 
 * Retrieve user template preferences.
 * Query params:
 *   - user_id: Optional user identifier (defaults to 'default')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') || 'default';
    
    // Get stored preferences or return defaults
    const preferences = preferencesStore.get(userId) || {
      ...DEFAULT_PREFERENCES,
      user_id: userId,
    };
    
    console.log(`📋 [PREFERENCES-API] GET preferences for user: ${userId}`);
    
    return NextResponse.json(preferences);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [PREFERENCES-API] GET error:', message);
    
    return NextResponse.json(
      { error: 'Failed to retrieve preferences', details: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/template-preferences
 * 
 * Update user template preferences.
 * Body: UserTemplatePreferences object
 */
export async function POST(request: NextRequest) {
  try {
    const preferences: UserTemplatePreferences = await request.json();
    
    // Validate required fields
    if (!preferences.user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }
    
    if (!['concise', 'balanced', 'detailed'].includes(preferences.verbosity)) {
      return NextResponse.json(
        { error: 'verbosity must be one of: concise, balanced, detailed' },
        { status: 400 }
      );
    }
    
    // Ensure arrays are properly initialized
    const validatedPreferences: UserTemplatePreferences = {
      user_id: preferences.user_id,
      verbosity: preferences.verbosity,
      hidden_sections: preferences.hidden_sections || [],
      always_expanded_sections: preferences.always_expanded_sections || [],
      section_order_override: preferences.section_order_override,
    };
    
    // Store preferences (TODO: Save to database)
    preferencesStore.set(validatedPreferences.user_id, validatedPreferences);
    
    console.log(`📋 [PREFERENCES-API] POST saved preferences for user: ${validatedPreferences.user_id}`);
    console.log(`   Verbosity: ${validatedPreferences.verbosity}`);
    console.log(`   Hidden sections: ${validatedPreferences.hidden_sections.length}`);
    console.log(`   Always expanded: ${validatedPreferences.always_expanded_sections.length}`);
    
    return NextResponse.json({
      success: true,
      preferences: validatedPreferences,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [PREFERENCES-API] POST error:', message);
    
    return NextResponse.json(
      { error: 'Failed to save preferences', details: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/template-preferences
 * 
 * Reset user preferences to defaults.
 * Query params:
 *   - user_id: User identifier to reset
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'user_id query parameter is required' },
        { status: 400 }
      );
    }
    
    // Remove stored preferences
    const deleted = preferencesStore.delete(userId);
    
    console.log(`📋 [PREFERENCES-API] DELETE preferences for user: ${userId} (found: ${deleted})`);
    
    return NextResponse.json({
      success: true,
      deleted,
      message: deleted ? 'Preferences reset to defaults' : 'No preferences found to delete',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [PREFERENCES-API] DELETE error:', message);
    
    return NextResponse.json(
      { error: 'Failed to delete preferences', details: message },
      { status: 500 }
    );
  }
}
