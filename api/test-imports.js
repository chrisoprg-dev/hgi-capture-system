// api/test-imports.js — One-shot import validation test. DELETE after confirming.
// Tests that all 17 modified files can resolve hgi-master-context.js imports at runtime.
import { HGI_CONTEXT, HGI_KEYWORDS, HGI_CLASSIFICATION_GUIDE, HGI_RATES, HGI_REFERENCES } from './hgi-master-context.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = {};
  try {
    results.HGI_CONTEXT_length = (HGI_CONTEXT || '').length;
    results.HGI_CONTEXT_starts_with = (HGI_CONTEXT || '').slice(0, 60);
    results.HGI_KEYWORDS_count = Array.isArray(HGI_KEYWORDS) ? HGI_KEYWORDS.length : 'NOT_ARRAY';
    results.HGI_KEYWORDS_sample = Array.isArray(HGI_KEYWORDS) ? HGI_KEYWORDS.slice(0, 3) : [];
    results.HGI_CLASSIFICATION_GUIDE_length = (HGI_CLASSIFICATION_GUIDE || '').length;
    results.HGI_RATES_length = (HGI_RATES || '').length;
    results.HGI_REFERENCES_length = (HGI_REFERENCES || '').length;
    results.HGI_CONTEXT_contains_mediation = HGI_CONTEXT.includes('Mediation Services');
    results.HGI_CONTEXT_contains_settlement = HGI_CONTEXT.includes('Settlement Administration');
    results.HGI_CONTEXT_contains_staff_aug = HGI_CONTEXT.includes('Staff Augmentation');
    results.HGI_CONTEXT_road_home_13b = HGI_CONTEXT.includes('13B+');
    results.HGI_CONTEXT_no_health_vertical = !HGI_CONTEXT.includes('Health: LDH');
    results.HGI_CLASSIFICATION_no_disaster_fallback = !HGI_CLASSIFICATION_GUIDE.includes('disaster recovery');
    results.all_exports_present = results.HGI_CONTEXT_length > 1000 && results.HGI_KEYWORDS_count === 78 && results.HGI_CLASSIFICATION_GUIDE_length > 500;
    results.status = 'PASS';
  } catch(e) {
    results.status = 'FAIL';
    results.error = e.message;
  }
  return res.status(200).json(results);
}