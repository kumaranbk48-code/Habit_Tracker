/**
 * Standard Learning Hub Categories
 * Bridging habit domains (Health, Fitness, Productivity, Mindfulness)
 * with common goal and skill-learning pursuits (Tech & Coding, Career & Business, Creative & Design, Languages).
 */

export const LEARNING_CATEGORIES = [
  'Tech & Coding',
  'Health & Fitness',
  'Productivity',
  'Career & Business',
  'Mindfulness & Wellness',
  'Creative & Design',
  'Languages',
  'Other'
];

export const LEARNING_FILTER_CATEGORIES = [
  'All',
  'Tech & Coding',
  'Health & Fitness',
  'Productivity',
  'Career & Business',
  'Mindfulness & Wellness',
  'Creative & Design',
  'Languages'
];

/**
 * Intelligent category matching function
 * Ensures legacy journeys (e.g. 'DSA', 'Development', 'Design')
 * and new standardized categories match reliably.
 */
export function matchesLearningCategory(journeyCategory, selectedCategory) {
  if (!selectedCategory || selectedCategory === 'All') return true;
  if (!journeyCategory) return false;

  const jCat = journeyCategory.toLowerCase().trim();
  const sCat = selectedCategory.toLowerCase().trim();

  // 1. Direct equality or inclusion
  if (jCat === sCat || jCat.includes(sCat) || sCat.includes(jCat)) return true;

  // 2. Intelligent aliases for legacy database records or shorthand tags
  const categoryAliases = {
    'tech & coding': ['tech', 'coding', 'dsa', 'development', 'programming', 'software', 'web dev', 'developer', 'python', 'java', 'react'],
    'health & fitness': ['health', 'fitness', 'workout', 'exercise', 'nutrition', 'diet', 'gym', 'marathon', 'running'],
    'productivity': ['productivity', 'focus', 'time management', 'habits', 'systems', 'deep work', 'organization'],
    'career & business': ['career', 'business', 'finance', 'work', 'leadership', 'management', 'marketing', 'sales'],
    'mindfulness & wellness': ['mindfulness', 'mindset', 'wellness', 'meditation', 'mental', 'calm', 'breathwork', 'stress'],
    'creative & design': ['creative', 'design', 'ui/ux', 'art', 'video', 'video editing', 'music', 'photography', 'guitar'],
    'languages': ['languages', 'language', 'japanese', 'spanish', 'french', 'german', 'english', 'mandarin']
  };

  const aliases = categoryAliases[sCat];
  if (aliases && aliases.some(alias => jCat.includes(alias))) {
    return true;
  }

  return false;
}
