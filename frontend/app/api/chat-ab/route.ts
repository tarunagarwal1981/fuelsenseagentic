/**
 * A/B Testing Chat Endpoint
 * 
 * Routes requests to either single-agent or multi-agent based on A/B test configuration.
 * Tracks metrics for comparison.
 */

export const runtime = 'edge';

import { getTestVariant, recordABTestResult } from '@/lib/utils/ab-testing';

export async function POST(req: Request) {
  const startTime = Date.now();
  console.log('📨 [AB-TEST-API] Received request');

  try {
    const body = await req.json();
    const { message, origin, destination, vessel_speed, departure_date, userId, sessionId } = body;

    // Determine A/B test variant
    const variant = getTestVariant(userId, sessionId);
    console.log(`🎲 [AB-TEST-API] Assigned variant: ${variant}`);

    // Route to appropriate endpoint
    let endpoint: string;
    let requestBody: any;

    if (variant === 'multi-agent') {
      endpoint = '/api/chat-multi-agent';
      requestBody = {
        message,
        origin,
        destination,
        vessel_speed,
        departure_date,
      };
    } else {
      endpoint = '/api/chat-langgraph';
      requestBody = {
        messages: [{ role: 'user', content: message }],
      };
    }

    // Make internal request to the appropriate endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const executionTime = Date.now() - startTime;
    const success = response.ok;

    // Record A/B test result
    const requestId = recordABTestResult({
      variant,
      responseTime: executionTime,
      success,
      error: success ? undefined : `HTTP ${response.status}`,
      metadata: {
        cacheHit: false,
      },
    });

    // Add A/B test metadata to response
    const responseData = await response.json();
    responseData.ab_test = {
      variant,
      request_id: requestId,
    };

    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'X-AB-Test-Variant': variant,
        'X-AB-Test-Request-Id': requestId,
      },
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error('❌ [AB-TEST-API] Error:', error);

    // Record failure
    recordABTestResult({
      variant: 'multi-agent', // Default, though we don't know which failed
      responseTime: executionTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

