/**
 * Template Selector Unit Tests
 * 
 * Tests template selector picks correct template, stakeholder detection,
 * and format detection.
 */

import { TemplateSelector, getTemplateSelector } from '@/lib/synthesis/template-selector';
import type { RequestContext, UserProfile } from '@/lib/synthesis/template-selector';

/**
 * Run template selector tests
 */
export async function testTemplateSelector(): Promise<void> {
  console.log('\n🧪 [TEMPLATE-SELECTOR-TEST] Starting template selector tests...\n');
  
  let allPassed = true;
  const selector = getTemplateSelector();
  
  // Test 1: Template selector picks correct template
  console.log('📋 Test 1: Template selector picks correct template');
  try {
    const templateId = selector.selectTemplate('bunker_planning', 'charterer', 'text');
    
    if (templateId !== 'charterer_bunker_planning_text') {
      console.error(`❌ Test 1 FAILED: Should return 'charterer_bunker_planning_text', got '${templateId}'`);
      allPassed = false;
    } else {
      console.log('✅ Test 1 PASSED: Template selector picks correct template');
      console.log(`   - Template ID: ${templateId}`);
    }
  } catch (error: any) {
    console.error('❌ Test 1 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 2: Stakeholder detection works
  console.log('\n📋 Test 2: Stakeholder detection works');
  try {
    // Test explicit stakeholder
    const request1: RequestContext = { stakeholder: 'operator' };
    const stakeholder1 = selector.detectStakeholder(request1);
    
    if (stakeholder1 !== 'operator') {
      console.error(`❌ Test 2 FAILED: Should detect 'operator', got '${stakeholder1}'`);
      allPassed = false;
    } else {
      // Test user profile role
      const userProfile: UserProfile = { role: 'compliance_officer' };
      const stakeholder2 = selector.detectStakeholder(undefined, userProfile);
      
      if (stakeholder2 !== 'compliance') {
        console.error(`❌ Test 2 FAILED: Should detect 'compliance' from role, got '${stakeholder2}'`);
        allPassed = false;
      } else {
        // Test default
        const stakeholder3 = selector.detectStakeholder();
        
        if (stakeholder3 !== 'charterer') {
          console.error(`❌ Test 2 FAILED: Should default to 'charterer', got '${stakeholder3}'`);
          allPassed = false;
        } else {
          // Test role mappings
          const roleMappings: Array<{ role: string; expected: string }> = [
            { role: 'charterer', expected: 'charterer' },
            { role: 'operator', expected: 'operator' },
            { role: 'master', expected: 'operator' },
            { role: 'technical_manager', expected: 'technical' },
            { role: 'chief_engineer', expected: 'technical' },
            { role: 'api', expected: 'api' },
          ];
          
          let allMappingsCorrect = true;
          for (const mapping of roleMappings) {
            const detected = selector.detectStakeholder(undefined, { role: mapping.role });
            if (detected !== mapping.expected) {
              console.error(`❌ Test 2 FAILED: Role '${mapping.role}' should map to '${mapping.expected}', got '${detected}'`);
              allMappingsCorrect = false;
            }
          }
          
          if (allMappingsCorrect) {
            console.log('✅ Test 2 PASSED: Stakeholder detection works');
            console.log(`   - Explicit stakeholder: ${stakeholder1}`);
            console.log(`   - User profile role: ${stakeholder2}`);
            console.log(`   - Default: ${stakeholder3}`);
            console.log(`   - Role mappings: ${roleMappings.length} tested`);
          } else {
            allPassed = false;
          }
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 2 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 3: Format detection works
  console.log('\n📋 Test 3: Format detection works');
  try {
    // Test explicit format
    const request1: RequestContext = { format: 'html' };
    const format1 = selector.detectFormat(request1);
    
    if (format1 !== 'html') {
      console.error(`❌ Test 3 FAILED: Should detect 'html', got '${format1}'`);
      allPassed = false;
    } else {
      // Test Accept header
      const request2: RequestContext = {
        headers: { accept: 'text/html,application/json' },
      };
      const format2 = selector.detectFormat(request2);
      
      if (format2 !== 'html') {
        console.error(`❌ Test 3 FAILED: Should detect 'html' from Accept header, got '${format2}'`);
        allPassed = false;
      } else {
        // Test JSON Accept header
        const request3: RequestContext = {
          headers: { accept: 'application/json' },
        };
        const format3 = selector.detectFormat(request3);
        
        if (format3 !== 'json') {
          console.error(`❌ Test 3 FAILED: Should detect 'json' from Accept header, got '${format3}'`);
          allPassed = false;
        } else {
          // Test mobile user agent
          const request4: RequestContext = {
            headers: { 'user-agent': 'Mobile Safari' },
          };
          const format4 = selector.detectFormat(request4);
          
          if (format4 !== 'mobile') {
            console.error(`❌ Test 3 FAILED: Should detect 'mobile' from user agent, got '${format4}'`);
            allPassed = false;
          } else {
            // Test default
            const format5 = selector.detectFormat();
            
            if (format5 !== 'text') {
              console.error(`❌ Test 3 FAILED: Should default to 'text', got '${format5}'`);
              allPassed = false;
            } else {
              console.log('✅ Test 3 PASSED: Format detection works');
              console.log(`   - Explicit format: ${format1}`);
              console.log(`   - HTML Accept header: ${format2}`);
              console.log(`   - JSON Accept header: ${format3}`);
              console.log(`   - Mobile user agent: ${format4}`);
              console.log(`   - Default: ${format5}`);
            }
          }
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Test 3 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 4: Auto-selection works
  console.log('\n📋 Test 4: Auto-selection works');
  try {
    const request: RequestContext = {
      stakeholder: 'operator',
      format: 'text',
    };
    
    const templateId = selector.selectTemplateAuto('bunker_planning', request);
    
    if (templateId !== 'operator_bunker_planning_text') {
      console.error(`❌ Test 4 FAILED: Should return 'operator_bunker_planning_text', got '${templateId}'`);
      allPassed = false;
    } else {
      console.log('✅ Test 4 PASSED: Auto-selection works');
      console.log(`   - Template ID: ${templateId}`);
    }
  } catch (error: any) {
    console.error('❌ Test 4 FAILED:', error.message);
    allPassed = false;
  }
  
  // Test 5: Fallback template works
  console.log('\n📋 Test 5: Fallback template works');
  try {
    const fallback = selector.getFallbackTemplate('bunker_planning', 'json');
    
    if (!fallback || !fallback.includes('bunker_planning')) {
      console.error(`❌ Test 5 FAILED: Should return fallback template ID, got '${fallback}'`);
      allPassed = false;
    } else {
      console.log('✅ Test 5 PASSED: Fallback template works');
      console.log(`   - Fallback template: ${fallback}`);
    }
  } catch (error: any) {
    console.error('❌ Test 5 FAILED:', error.message);
    allPassed = false;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ [TEMPLATE-SELECTOR-TEST] All tests passed!');
  } else {
    console.log('❌ [TEMPLATE-SELECTOR-TEST] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
}

// Run tests if executed directly
if (require.main === module) {
  testTemplateSelector().catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}
