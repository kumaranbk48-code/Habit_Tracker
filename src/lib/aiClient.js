/**
 * Client-side AI Service for Kie AI (GPT-6 Astra) & Intelligent Fallback
 */

export async function checkAiStatus() {
  try {
    const res = await fetch('/api/ai?action=status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      configured: false,
      status: 'error',
      message: err.message
    };
  }
}

export async function getAiCoaching(sessionToken, { habits = [], streak = 0, completionRate = 0, question = '' } = {}) {
  try {
    const res = await fetch('/api/ai?action=coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {})
      },
      body: JSON.stringify({ habits, streak, completionRate, question })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('[aiClient] Coach fetch error:', err);
    throw err;
  }
}

export async function generateAiRoadmap(sessionToken, { title, description = '', level = 'Beginner', targetWeeks = 6 } = {}) {
  try {
    const res = await fetch('/api/ai?action=roadmap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {})
      },
      body: JSON.stringify({ title, description, level, targetWeeks })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('[aiClient] Roadmap fetch error:', err);
    throw err;
  }
}

export async function getHabitBreakdown(sessionToken, { goalTitle, category = 'General' } = {}) {
  try {
    const res = await fetch('/api/ai?action=breakdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {})
      },
      body: JSON.stringify({ goalTitle, category })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('[aiClient] Habit breakdown fetch error:', err);
    throw err;
  }
}
